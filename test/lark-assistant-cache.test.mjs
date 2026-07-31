import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  loadLarkAssistantCache,
  saveLarkAssistantCache,
} = require('../src/main/lark-assistant-cache.js')

test('Lark assistant cache persists completed analyses and drops transient runs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kodama-lark-assistant-'))
  const file = join(directory, 'assistant.json')
  const records = new Map([
    ['om_done', {
      messageId: 'om_done',
      status: 'done',
      analysis: { summary: '需要回复', replyDraft: '收到，我今天处理。' },
      updatedAt: '2026-07-31T08:00:00.000Z',
    }],
    ['om_running', {
      messageId: 'om_running',
      status: 'running',
      updatedAt: '2026-07-31T08:01:00.000Z',
    }],
  ])

  saveLarkAssistantCache(file, records)
  const loaded = loadLarkAssistantCache(file)

  assert.equal(loaded.size, 1)
  assert.equal(loaded.get('om_done').analysis.replyDraft, '收到，我今天处理。')
  assert.equal(loaded.has('om_running'), false)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).records.length, 1)
})

test('Lark assistant cache keeps only the newest bounded completed records', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kodama-lark-assistant-'))
  const file = join(directory, 'assistant.json')
  const records = new Map([
    ['om_old', { messageId: 'om_old', status: 'done', analysis: { summary: '旧' }, updatedAt: '2026-07-30T08:00:00.000Z' }],
    ['om_new', { messageId: 'om_new', status: 'done', analysis: { summary: '新' }, updatedAt: '2026-07-31T08:00:00.000Z' }],
  ])

  saveLarkAssistantCache(file, records, 1)
  const loaded = loadLarkAssistantCache(file)

  assert.deepEqual(Array.from(loaded.keys()), ['om_new'])
})
