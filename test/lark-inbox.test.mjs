import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  chatItemsFromPayload,
  createLarkInbox,
  messageItemsFromPayload,
  normalizeChat,
  normalizeFeishuTime,
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

test('lark inbox normalizes Feishu local minute timestamps', () => {
  assert.equal(normalizeFeishuTime('2026-07-07 13:07'), '2026-07-07T05:07:00.000Z')
  assert.equal(normalizeFeishuTime('2026-07-07 13:07:11'), '2026-07-07T05:07:11.000Z')
})

test('lark inbox ingests web push messages into the shared snapshot', () => {
  const inbox = createLarkInbox({
    stateFile: join(mkdtempSync(join(tmpdir(), 'kodama-lark-inbox-')), 'seen.json'),
    enabled: true,
  })
  const snapshot = inbox.ingestMessages([
    {
      messageId: 'om_push',
      chatId: 'oc_demo',
      chatName: '工程群',
      senderName: '一凡',
      content: '实时消息',
      createdAt: '2026-07-07T05:07:00.000Z',
      source: 'web-push',
    },
    {
      messageId: 'om_push',
      chatId: 'oc_demo',
      chatName: '工程群',
      senderName: '一凡',
      content: '实时消息',
      createdAt: '2026-07-07T05:07:00.000Z',
      source: 'web-push',
    },
  ], { reason: 'web-push' })
  assert.equal(snapshot.messageCount, 1)
  assert.equal(snapshot.chatCount, 1)
  assert.equal(snapshot.newCount, 1)
  assert.equal(snapshot.messages[0].source, 'web-push')
})
