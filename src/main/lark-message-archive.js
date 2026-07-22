const fs = require('fs')
const path = require('path')

const DEFAULT_ARCHIVE_OPTIONS = Object.freeze({
  enabled: true,
  retentionDays: 7,
  maxMessages: 5000,
})

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function envFlag(name, fallback) {
  const value = String(process.env[name] || '').trim().toLowerCase()
  if (!value) return fallback
  if (['0', 'false', 'off', 'no'].includes(value)) return false
  if (['1', 'true', 'on', 'yes'].includes(value)) return true
  return fallback
}

function readArchiveOptions(input = {}) {
  return {
    ...DEFAULT_ARCHIVE_OPTIONS,
    ...input,
    enabled: input.enabled !== undefined
      ? input.enabled === true
      : envFlag('KODAMA_LARK_ARCHIVE_ENABLED', DEFAULT_ARCHIVE_OPTIONS.enabled),
    retentionDays: clampInt(process.env.KODAMA_LARK_ARCHIVE_DAYS || input.retentionDays, 1, 90, DEFAULT_ARCHIVE_OPTIONS.retentionDays),
    maxMessages: clampInt(process.env.KODAMA_LARK_ARCHIVE_MAX || input.maxMessages, 100, 50000, DEFAULT_ARCHIVE_OPTIONS.maxMessages),
  }
}

function compactText(value, max = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function timeValue(value) {
  const t = Date.parse(value || '')
  return Number.isFinite(t) ? t : 0
}

function normalizeArchiveMessage(raw, archivedAt = new Date().toISOString()) {
  const messageId = String(raw?.messageId || raw?.message_id || '').trim()
  if (!messageId) return null
  const createdAt = raw?.createdAt && !Number.isNaN(Date.parse(raw.createdAt))
    ? raw.createdAt
    : new Date().toISOString()
  return {
    version: 1,
    messageId,
    chatId: String(raw?.chatId || raw?.chat_id || '').trim(),
    chatName: compactText(raw?.chatName || raw?.chat_name || '飞书群聊', 120),
    senderId: String(raw?.senderId || raw?.sender_id || '').trim(),
    senderName: compactText(raw?.senderName || raw?.sender_name || '未知成员', 120),
    msgType: String(raw?.msgType || raw?.msg_type || raw?.type || 'message').trim(),
    content: compactText(raw?.content || raw?.text || '', 1000),
    source: String(raw?.source || 'unknown').trim(),
    threadId: String(raw?.threadId || raw?.thread_id || '').trim(),
    createdAt,
    archivedAt,
  }
}

function parseJsonl(file) {
  try {
    return fs.readFileSync(file, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line))
  } catch {
    return []
  }
}

function writeJsonlAtomic(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, records.map(record => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''))
  fs.renameSync(tmp, file)
}

function pruneRecords(records, options, now = Date.now()) {
  const cutoff = now - options.retentionDays * 24 * 60 * 60 * 1000
  const byId = new Map()
  for (const raw of Array.isArray(records) ? records : []) {
    const record = normalizeArchiveMessage(raw, raw?.archivedAt || new Date(now).toISOString())
    if (!record) continue
    const t = timeValue(record.createdAt) || timeValue(record.archivedAt)
    if (t && t < cutoff) continue
    const previous = byId.get(record.messageId)
    if (!previous || (timeValue(record.archivedAt) >= timeValue(previous.archivedAt))) byId.set(record.messageId, record)
  }
  return Array.from(byId.values())
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
    .slice(0, options.maxMessages)
}

function createLarkMessageArchive(input = {}) {
  const options = readArchiveOptions(input)
  const file = options.file
  let records = file ? pruneRecords(parseJsonl(file), options) : []
  let byId = new Map(records.map(record => [record.messageId, record]))
  let lastPrunedAt = 0

  function persist(force = false) {
    if (!file || options.enabled === false) return
    const now = Date.now()
    if (force || now - lastPrunedAt > 60 * 1000) {
      records = pruneRecords(records, options, now)
      byId = new Map(records.map(record => [record.messageId, record]))
      lastPrunedAt = now
    }
    writeJsonlAtomic(file, records)
  }

  function ingest(messages, meta = {}) {
    if (options.enabled === false) return []
    const archivedAt = new Date().toISOString()
    const nextRecords = []
    for (const raw of Array.isArray(messages) ? messages : []) {
      const record = normalizeArchiveMessage({ ...raw, source: raw?.source || meta.source }, archivedAt)
      if (!record || byId.has(record.messageId)) continue
      byId.set(record.messageId, record)
      nextRecords.push(record)
      records.unshift(record)
    }
    if (nextRecords.length) {
      persist(records.length > options.maxMessages)
      options.onUpdate?.(getSummary(), nextRecords)
    }
    return nextRecords
  }

  function getRecent(limit = 100) {
    return records.slice(0, clampInt(limit, 1, options.maxMessages, 100))
  }

  function getSummary() {
    return {
      ok: true,
      enabled: options.enabled !== false,
      file,
      retentionDays: options.retentionDays,
      maxMessages: options.maxMessages,
      messageCount: records.length,
      latestAt: records[0]?.createdAt || '',
    }
  }

  return { ingest, getRecent, getSummary }
}

module.exports = {
  DEFAULT_ARCHIVE_OPTIONS,
  createLarkMessageArchive,
  normalizeArchiveMessage,
  pruneRecords,
  readArchiveOptions,
}
