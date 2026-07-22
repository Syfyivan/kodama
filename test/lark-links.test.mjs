import assert from 'node:assert/strict'
import { test } from 'node:test'

import { larkChatUrls } from '../src/main/lark-links.js'

test('Feishu chat links include the original message when available', () => {
  const urls = larkChatUrls('oc_5224ef9ac280e85bdb2f19e4888b304a', 'om_x100b6a7d7779b090b346f190f4daabb')
  assert.equal(urls.length, 3)
  for (const url of urls) {
    const parsed = new URL(url)
    assert.equal(parsed.searchParams.get('openChatId'), 'oc_5224ef9ac280e85bdb2f19e4888b304a')
    assert.equal(parsed.searchParams.get('openMessageId'), 'om_x100b6a7d7779b090b346f190f4daabb')
  }
})

test('Feishu chat links reject malformed identifiers', () => {
  assert.deepEqual(larkChatUrls('not-a-chat', 'om_message'), [])
  assert.deepEqual(larkChatUrls('oc_chat', 'not-a-message'), [])
})
