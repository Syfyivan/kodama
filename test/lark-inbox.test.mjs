import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  chatItemsFromPayload,
  classifyAttentionMessage,
  createLarkInbox,
  listRecentChatArgs,
  mergeMessages,
  messageItemsFromPayload,
  normalizeChat,
  normalizeFeishuTime,
  normalizeMentions,
  normalizeMessage,
} = require('../src/main/lark-inbox.js')

test('lark inbox parses chat list shortcut payloads', () => {
  const payload = {
    code: 0,
    data: {
      items: [
        {
          chat_id: 'oc_demo',
          chat_mode: 'group',
          chat_status: 'normal',
          external: false,
          name: '工程群',
        },
      ],
    },
  }
  const chats = chatItemsFromPayload(payload).map(normalizeChat)
  assert.deepEqual(chats, [
    {
      chatId: 'oc_demo',
      name: '工程群',
      mode: 'group',
      status: 'normal',
      external: false,
      avatar: '',
    },
  ])
})

test('lark inbox parses the current +chat-list payload and requests p2p chats', () => {
  const payload = {
    ok: true,
    data: {
      chats: [
        {
          chat_id: 'oc_p2p',
          chat_mode: 'p2p',
          chat_status: 'normal',
          name: '一凡',
        },
      ],
    },
  }
  assert.equal(chatItemsFromPayload(payload)[0].chat_id, 'oc_p2p')
  assert.deepEqual(listRecentChatArgs({ chatLimit: 12 }), [
    'im',
    '+chat-list',
    '--as',
    'user',
    '--types',
    'p2p,group',
    '--page-size',
    '12',
    '--sort',
    'active_time',
    '--format',
    'json',
  ])
})

test('lark inbox parses message list shortcut payloads', () => {
  const chat = { chatId: 'oc_demo', name: '工程群' }
  const payload = {
    ok: true,
    data: {
      messages: [
        {
          message_id: 'om_demo',
          msg_type: 'text',
          content: '这是一条测试消息',
          create_time: '2026-07-07 13:07',
          sender: { id: 'ou_sender', name: '一凡' },
          updated: true,
        },
      ],
    },
  }
  const messages = messageItemsFromPayload(payload).map(raw => normalizeMessage(raw, chat))
  assert.equal(messages[0].messageId, 'om_demo')
  assert.equal(messages[0].chatId, 'oc_demo')
  assert.equal(messages[0].chatName, '工程群')
  assert.equal(messages[0].senderName, '一凡')
  assert.equal(messages[0].content, '这是一条测试消息')
  assert.equal(messages[0].createdAt, '2026-07-07T05:07:00.000Z')
  assert.equal(messages[0].updated, true)
})

test('lark inbox classifies inbound p2p and structured group mentions', () => {
  const currentUserId = 'ou_me'
  assert.deepEqual(classifyAttentionMessage({
    chatMode: 'p2p',
    senderId: 'ou_other',
    mentions: [],
  }, { currentUserId }), {
    mentionsMe: false,
    isOwnMessage: false,
    needsAttention: true,
    attentionReason: 'p2p',
  })
  assert.deepEqual(classifyAttentionMessage({
    chatMode: 'group',
    senderId: 'ou_other',
    mentions: [{ id: currentUserId, name: '我', type: 'user' }],
  }, { currentUserId }), {
    mentionsMe: true,
    isOwnMessage: false,
    needsAttention: true,
    attentionReason: 'mention',
  })
})

test('lark inbox ignores ordinary group messages and messages sent by the current user', () => {
  const currentUserId = 'ou_me'
  assert.equal(classifyAttentionMessage({
    chatMode: 'group',
    senderId: 'ou_other',
    mentions: [],
  }, { currentUserId }).needsAttention, false)
  assert.deepEqual(classifyAttentionMessage({
    chatMode: 'group',
    senderId: currentUserId,
    mentions: [{ id: currentUserId, name: '我', type: 'user' }],
  }, { currentUserId }), {
    mentionsMe: true,
    isOwnMessage: true,
    needsAttention: false,
    attentionReason: '',
  })
})

test('lark inbox does not infer group mentions from display text', () => {
  const result = classifyAttentionMessage({
    chatMode: 'group',
    senderId: 'ou_other',
    content: '@宋一凡 看一下',
    mentions: [],
  }, { currentUserId: 'ou_me' })
  assert.equal(result.mentionsMe, false)
  assert.equal(result.needsAttention, false)
})

test('lark inbox normalizes mention payload variants', () => {
  assert.deepEqual(normalizeMentions({
    mention_list: [
      { open_id: 'ou_a', name: 'A' },
      { user: { userId: 'u_b', displayName: 'B' }, type: 'user' },
    ],
  }), [
    { id: 'ou_a', name: 'A', type: 'user' },
    { id: 'u_b', name: 'B', type: 'user' },
  ])
})

test('lark inbox message merges keep the meaningful chat mode', () => {
  const messages = mergeMessages([
    {
      messageId: 'om_demo',
      chatId: 'oc_demo',
      chatMode: 'p2p',
      content: '轮询消息',
    },
  ], [
    {
      messageId: 'om_demo',
      chatId: 'oc_demo',
      chatMode: '',
      content: '实时消息',
    },
  ])
  assert.equal(messages[0].chatMode, 'p2p')
  assert.equal(messages[0].content, '实时消息')
})

test('lark inbox normalizes Feishu local minute timestamps', () => {
  assert.equal(normalizeFeishuTime('2026-07-07 13:07'), '2026-07-07T05:07:00.000Z')
  assert.equal(normalizeFeishuTime('2026-07-07 13:07:11'), '2026-07-07T05:07:11.000Z')
})

test('lark inbox ingests web push messages into the shared snapshot', () => {
  const inbox = createLarkInbox({
    stateFile: join(mkdtempSync(join(tmpdir(), 'kodama-lark-inbox-')), 'seen.json'),
    enabled: true,
    currentUserId: 'ou_me',
  })
  const snapshot = inbox.ingestMessages([
    {
      messageId: 'om_push',
      chatId: 'oc_demo',
      chatName: '工程群',
      chatMode: 'group',
      senderName: '一凡',
      senderId: 'ou_sender',
      content: '实时消息',
      createdAt: '2026-07-07T05:07:00.000Z',
      source: 'web-push',
    },
    {
      messageId: 'om_push',
      chatId: 'oc_demo',
      chatName: '工程群',
      chatMode: 'group',
      senderName: '一凡',
      senderId: 'ou_sender',
      content: '实时消息',
      createdAt: '2026-07-07T05:07:00.000Z',
      source: 'web-push',
    },
  ], { reason: 'web-push' })
  assert.equal(snapshot.messageCount, 1)
  assert.equal(snapshot.chatCount, 1)
  assert.equal(snapshot.newCount, 1)
  assert.equal(snapshot.messages[0].source, 'web-push')
  assert.equal(snapshot.messages[0].needsAttention, false)
})

test('lark inbox can change its polling interval without rebuilding message state', () => {
  const inbox = createLarkInbox({ enabled: false, pollIntervalMs: 3 * 60 * 1000 })
  assert.equal(inbox.getSummary().pollIntervalMs, 3 * 60 * 1000)
  inbox.setPollIntervalMs(10 * 60 * 1000)
  assert.equal(inbox.getSummary().pollIntervalMs, 10 * 60 * 1000)
})
