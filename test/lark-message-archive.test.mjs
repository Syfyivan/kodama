import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  createLarkMessageArchive,
  normalizeArchiveMessage,
} = require('../src/main/lark-message-archive.js')
const {
  baseSinkTargetId,
  baseUrlFor,
  baseRecordFields,
  createLarkBaseSink,
  readBaseSinkOptions,
  withTableParam,
} = require('../src/main/lark-base-sink.js')

test('lark message archive persists full messages and dedupes by message id', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'kodama-lark-archive-')), 'messages.jsonl')
  const archive = createLarkMessageArchive({ file, retentionDays: 7, maxMessages: 10 })
  // Keep the timestamp inside the 7-day retention window — a hard-coded date
  // silently ages out and ingest() prunes it, making the test time-bomb itself.
  const createdAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const added = archive.ingest([
    {
      messageId: 'om_1',
      chatId: 'oc_1',
      chatName: '工程群',
      senderName: '一凡',
      content: '第一条消息',
      createdAt,
      source: 'web-push',
    },
    {
      messageId: 'om_1',
      chatId: 'oc_1',
      chatName: '工程群',
      senderName: '一凡',
      content: '重复消息',
      createdAt,
      source: 'web-push',
    },
  ])
  assert.equal(added.length, 1)
  assert.equal(archive.getSummary().messageCount, 1)
  assert.match(readFileSync(file, 'utf8'), /第一条消息/)
})

test('archive messages normalize compact searchable fields', () => {
  const record = normalizeArchiveMessage({
    messageId: 'om_1',
    chatName: ' 工程群 ',
    senderName: ' 一凡 ',
    content: ' hello   world ',
    createdAt: '2026-07-07T05:07:00.000Z',
  }, '2026-07-07T05:08:00.000Z')
  assert.equal(record.chatName, '工程群')
  assert.equal(record.senderName, '一凡')
  assert.equal(record.content, 'hello world')
  assert.equal(record.archivedAt, '2026-07-07T05:08:00.000Z')
})

test('base sink maps archive records to Bitable fields', () => {
  const fields = baseRecordFields({
    messageId: 'om_1',
    chatId: 'oc_1',
    chatName: '工程群',
    senderName: '一凡',
    msgType: 'text',
    content: 'hello',
    source: 'web-push',
    createdAt: '2026-07-07T05:07:00.000Z',
    archivedAt: '2026-07-07T05:08:00.000Z',
  })
  assert.equal(fields.消息ID, 'om_1')
  assert.equal(fields.群名, '工程群')
  assert.equal(fields.来源, '实时')
  assert.equal(fields.时间, 1783400820000)
  assert.equal(fields.归档时间, 1783400880000)
})

test('base sink stays disabled without a configured base token', () => {
  const previous = process.env.KODAMA_LARK_BASE_TOKEN
  delete process.env.KODAMA_LARK_BASE_TOKEN
  try {
    const options = readBaseSinkOptions({})
    assert.equal(options.enabled, false)
  } finally {
    if (previous === undefined) delete process.env.KODAMA_LARK_BASE_TOKEN
    else process.env.KODAMA_LARK_BASE_TOKEN = previous
  }
})

test('base sink exposes an openable Base URL', () => {
  assert.equal(
    baseUrlFor({ baseToken: 'bascn123', tableId: '消息', domain: 'https://bytedance.larkoffice.com/' }),
    'https://bytedance.larkoffice.com/base/bascn123?table=%E6%B6%88%E6%81%AF',
  )
  assert.equal(baseUrlFor({ url: 'https://example.test/base/custom' }), 'https://example.test/base/custom')
  assert.equal(
    withTableParam('https://example.test/base/custom', 'tbl_1'),
    'https://example.test/base/custom?table=tbl_1',
  )
})

test('base sink preserves an unscoped legacy state on an ordinary upgrade', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kodama-lark-base-state-'))
  const stateFile = join(dir, 'state.json')
  writeFileSync(stateFile, JSON.stringify({
    version: 1,
    synced: { om_existing: { at: '2026-07-31T00:00:00.000Z' } },
  }))
  const sink = createLarkBaseSink({
    enabled: true,
    baseToken: 'base_1',
    tableId: 'tbl_1',
    stateFile,
    flushIntervalMs: 60 * 1000,
  })
  assert.equal(sink.getSummary().syncedCount, 1)
  assert.equal(sink.ingest([{ messageId: 'om_existing' }]).length, 0)
  const persisted = JSON.parse(readFileSync(stateFile, 'utf8'))
  assert.equal(persisted.version, 2)
  assert.equal(persisted.targetId, baseSinkTargetId({ baseToken: 'base_1', tableId: 'tbl_1' }))
  sink.stop()
})

test('base sink resets legacy dedupe state when setup binds a replacement Base', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kodama-lark-base-state-'))
  const stateFile = join(dir, 'state.json')
  writeFileSync(stateFile, JSON.stringify({
    version: 1,
    synced: { om_existing: { at: '2026-07-31T00:00:00.000Z' } },
  }))
  const target = { baseToken: 'base_2', tableId: 'tbl_2' }
  const sink = createLarkBaseSink({
    enabled: true,
    ...target,
    syncTargetId: baseSinkTargetId(target),
    stateFile,
    flushIntervalMs: 60 * 1000,
  })
  assert.equal(sink.getSummary().syncedCount, 0)
  assert.equal(sink.ingest([{ messageId: 'om_existing' }]).length, 1)
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).targetId, baseSinkTargetId(target))
  sink.stop()
})

test('base sink keeps a failed record queued for retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kodama-lark-base-'))
  const marker = join(dir, 'count.txt')
  const fakeCli = join(dir, 'fake-lark-cli.mjs')
  writeFileSync(fakeCli, [
    '#!/usr/bin/env node',
    "import { existsSync, readFileSync, writeFileSync } from 'node:fs'",
    'const marker = process.env.FAKE_LARK_COUNT_FILE',
    "const count = existsSync(marker) ? Number(readFileSync(marker, 'utf8')) : 0",
    'if (!count) {',
    "  writeFileSync(marker, '1')",
    "  console.error(JSON.stringify({ ok: false, error: { message: 'temporary failure' } }))",
    '  process.exit(1)',
    '}',
    "console.log(JSON.stringify({ data: { record: { record_id: 'rec_1' } } }))",
    '',
  ].join('\n'))
  chmodSync(fakeCli, 0o755)
  const previous = process.env.FAKE_LARK_COUNT_FILE
  process.env.FAKE_LARK_COUNT_FILE = marker
  try {
    const sink = createLarkBaseSink({
      enabled: true,
      baseToken: 'base_1',
      tableId: 'tbl_1',
      stateFile: join(dir, 'state.json'),
      larkCliBin: fakeCli,
      flushIntervalMs: 60 * 1000,
      minWriteIntervalMs: 0,
    })
    sink.ingest([{
      messageId: 'om_retry',
      chatName: '工程群',
      senderName: '一凡',
      msgType: 'text',
      content: 'retry me',
      source: 'web-push',
      createdAt: '2026-07-07T05:07:00.000Z',
      archivedAt: '2026-07-07T05:08:00.000Z',
    }])
    const first = await sink.flush()
    assert.equal(first.ok, false)
    assert.equal(first.queueLength, 1)
    const second = await sink.flush()
    assert.equal(second.ok, true)
    assert.equal(second.queueLength, 0)
    assert.equal(second.syncedCount, 1)
  } finally {
    if (previous === undefined) delete process.env.FAKE_LARK_COUNT_FILE
    else process.env.FAKE_LARK_COUNT_FILE = previous
  }
})
