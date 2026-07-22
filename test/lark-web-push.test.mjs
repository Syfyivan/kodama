import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  injectClientChannelPush,
  normalizeCreateTime,
  parseLarkWebPushPayload,
} = require('../src/main/lark-web-push.js')

test('lark web push parses Feishu channel push messages', () => {
  const result = parseLarkWebPushPayload({
    command: 5065,
    payload: {
      entity: {
        chats: {
          oc_demo: { id: 'oc_demo', name: '工程群' },
        },
        users: {
          ou_sender: { name: '一凡' },
        },
        messages: {
          om_demo: {
            id: 'om_demo',
            chatId: 'oc_demo',
            senderId: 'ou_sender',
            type: 4,
            createTime: '1783400820',
            content: {
              richText: {
                elementIds: ['e1', 'e2'],
                elements: {
                  e1: { property: { text: { content: 'hello ' } } },
                  e2: { property: { anchor: { content: 'world' } } },
                },
              },
            },
          },
        },
      },
    },
  })
  assert.equal(result.chats[0].chatId, 'oc_demo')
  assert.equal(result.messages[0].messageId, 'om_demo')
  assert.equal(result.messages[0].chatName, '工程群')
  assert.equal(result.messages[0].senderName, '一凡')
  assert.equal(result.messages[0].msgType, 'text')
  assert.equal(result.messages[0].content, 'hello world')
  assert.equal(result.messages[0].source, 'web-push')
})

test('lark web push parses image messages compactly', () => {
  const result = parseLarkWebPushPayload({
    command: 5065,
    payload: {
      entity: {
        chats: { oc_demo: { name: '图片群' } },
        messages: {
          om_img: {
            id: 'om_img',
            chatId: 'oc_demo',
            type: 5,
            createTime: '1783400820',
            content: { image: { origin: { key: 'img-key' } } },
          },
        },
      },
    },
  })
  assert.equal(result.messages[0].msgType, 'image')
  assert.equal(result.messages[0].content, '[图片]')
})

test('lark web push injection wraps ClientChannelPush regardless of argument name', () => {
  const source = 'function f(payload){return this.emitter.emit("ClientChannelPush",payload)}'
  const result = injectClientChannelPush(source)
  assert.equal(result.modified, true)
  assert.equal(result.count, 1)
  assert.match(result.body, /__kodamaLarkPush\?\.\(payload\)/)
  assert.match(result.body, /this\.emitter\.emit\("ClientChannelPush",payload\)/)
})

test('lark web push normalizes second and millisecond timestamps', () => {
  assert.equal(normalizeCreateTime('1783400820'), '2026-07-07T05:07:00.000Z')
  assert.equal(normalizeCreateTime('1783400820000'), '2026-07-07T05:07:00.000Z')
})
