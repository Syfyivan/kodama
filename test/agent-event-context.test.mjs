import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAgentEventContext } from '../src/main/agent-event-context.js'

test('completion events inherit the Feishu route from the same agent session', () => {
  const context = createAgentEventContext()
  context.enrich({
    type: 'task_started',
    source: 'lark',
    larkBridge: true,
    sessionId: 'session-1',
    cwd: '/var/folders/demo/T/lark-codex-non-owner-abc',
    chatId: 'oc_chat1',
    messageId: 'om_message1',
  })

  assert.deepEqual(context.enrich({
    type: 'task_done',
    source: 'lark',
    larkBridge: true,
    sessionId: 'session-1',
    cwd: '/var/folders/demo/T/lark-codex-non-owner-abc',
  }), {
    type: 'task_done',
    source: 'lark',
    larkBridge: true,
    sessionId: 'session-1',
    cwd: '/var/folders/demo/T/lark-codex-non-owner-abc',
    chatId: 'oc_chat1',
    messageId: 'om_message1',
  })
})

test('Feishu routes never leak into unrelated agent sessions', () => {
  const context = createAgentEventContext()
  context.enrich({
    type: 'task_started', source: 'lark', larkBridge: true,
    sessionId: 'session-1', cwd: '/tmp/lark-codex-non-owner-one',
    chatId: 'oc_chat1', messageId: 'om_message1',
  })

  assert.deepEqual(context.enrich({
    type: 'task_done', source: 'local', sessionId: 'session-2', cwd: '/Users/bytedance/code/kodama',
  }), {
    type: 'task_done', source: 'local', sessionId: 'session-2', cwd: '/Users/bytedance/code/kodama',
  })
})
