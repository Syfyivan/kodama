const fs = require('fs')
const path = require('path')
const { createHash } = require('crypto')
const { spawn } = require('child_process')

const DEFAULT_BASE_SINK_OPTIONS = Object.freeze({
  enabled: false,
  tableId: '最近群消息',
  domain: 'https://bytedance.larkoffice.com',
  larkCliBin: 'lark-cli',
  commandTimeoutMs: 20 * 1000,
  flushIntervalMs: 5 * 1000,
  minWriteIntervalMs: 750,
  maxQueue: 2000,
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

function readConfig(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function readBaseSinkOptions(input = {}) {
  const config = input.configFile ? readConfig(input.configFile) : {}
  const baseToken = String(process.env.KODAMA_LARK_BASE_TOKEN || input.baseToken || config.baseToken || '').trim()
  const configuredEnabled = input.enabled !== undefined
    ? input.enabled === true
    : envFlag('KODAMA_LARK_BASE_ENABLED', config.enabled !== false && Boolean(baseToken))
  return {
    ...DEFAULT_BASE_SINK_OPTIONS,
    ...input,
    enabled: configuredEnabled && Boolean(baseToken),
    baseToken,
    tableId: String(process.env.KODAMA_LARK_BASE_TABLE || input.tableId || config.tableId || DEFAULT_BASE_SINK_OPTIONS.tableId),
    syncTargetId: String(input.syncTargetId || config.syncTargetId || '').trim(),
    url: String(process.env.KODAMA_LARK_BASE_URL || input.url || config.url || ''),
    domain: String(process.env.KODAMA_LARK_BASE_DOMAIN || input.domain || config.domain || DEFAULT_BASE_SINK_OPTIONS.domain),
    larkCliBin: String(input.larkCliBin || DEFAULT_BASE_SINK_OPTIONS.larkCliBin),
    commandTimeoutMs: clampInt(input.commandTimeoutMs, 5 * 1000, 120 * 1000, DEFAULT_BASE_SINK_OPTIONS.commandTimeoutMs),
    flushIntervalMs: clampInt(input.flushIntervalMs, 1 * 1000, 60 * 1000, DEFAULT_BASE_SINK_OPTIONS.flushIntervalMs),
    minWriteIntervalMs: clampInt(input.minWriteIntervalMs, 0, 5 * 1000, DEFAULT_BASE_SINK_OPTIONS.minWriteIntervalMs),
    maxQueue: clampInt(input.maxQueue, 100, 10000, DEFAULT_BASE_SINK_OPTIONS.maxQueue),
  }
}

function baseSinkTargetId(options = {}) {
  const baseToken = String(options.baseToken || '').trim()
  const tableId = String(options.tableId || '').trim()
  if (!baseToken) return ''
  return createHash('sha256')
    .update(`${baseToken}\u0000${tableId}`)
    .digest('hex')
    .slice(0, 24)
}

function baseUrlFor(options) {
  if (options?.url) return withTableParam(options.url, options.tableId)
  if (!options?.baseToken) return ''
  const domain = String(options.domain || DEFAULT_BASE_SINK_OPTIONS.domain).replace(/\/+$/, '')
  const table = options.tableId ? `?table=${encodeURIComponent(options.tableId)}` : ''
  return `${domain}/base/${encodeURIComponent(options.baseToken)}${table}`
}

function withTableParam(url, tableId) {
  const raw = String(url || '')
  const table = String(tableId || '')
  if (!raw || !table || /[?&]table=/.test(raw)) return raw
  return `${raw}${raw.includes('?') ? '&' : '?'}table=${encodeURIComponent(table)}`
}

function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : { version: 1, synced: {} }
  } catch {
    return { version: 1, synced: {} }
  }
}

function writeStateAtomic(file, state) {
  if (!file) return
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state))
  fs.renameSync(tmp, file)
}

function dateMillis(value) {
  const t = Date.parse(value || '')
  return Number.isFinite(t) ? t : Date.now()
}

function baseRecordFields(message) {
  return {
    消息ID: String(message.messageId || ''),
    时间: dateMillis(message.createdAt),
    群名: String(message.chatName || ''),
    chat_id: String(message.chatId || ''),
    发送人: String(message.senderName || ''),
    sender_id: String(message.senderId || ''),
    类型: String(message.msgType || ''),
    内容: String(message.content || ''),
    来源: message.source === 'web-push' ? '实时' : message.source === 'poll' ? '轮询' : String(message.source || ''),
    thread_id: String(message.threadId || ''),
    归档时间: dateMillis(message.archivedAt),
  }
}

function runJson(command, args, { timeout = DEFAULT_BASE_SINK_OPTIONS.commandTimeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGTERM') } catch { /* already gone */ }
      reject(new Error(`${command} timed out after ${timeout}ms`))
    }, timeout)
    timer.unref?.()
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch {
        resolve({ ok: true, raw: stdout.trim() })
      }
    })
  })
}

function createLarkBaseSink(input = {}) {
  const options = readBaseSinkOptions(input)
  let state = readState(options.stateFile || '')
  const targetId = baseSinkTargetId(options)
  const stateTargetId = String(state.targetId || '')
  const explicitlyScoped = Boolean(targetId && options.syncTargetId === targetId)
  const targetChanged = Boolean(stateTargetId && targetId && stateTargetId !== targetId)
  const legacyStateMustReset = Boolean(!stateTargetId && targetId && explicitlyScoped)
  if (targetChanged || legacyStateMustReset) {
    state = { version: 2, targetId, synced: {} }
    writeStateAtomic(options.stateFile, state)
  } else if (targetId && stateTargetId !== targetId) {
    // Adopt an unscoped legacy state when no setup marker says the Base was
    // replaced. This avoids replaying an existing archive on ordinary upgrades.
    state.version = 2
    state.targetId = targetId
    writeStateAtomic(options.stateFile, state)
  }
  if (!state.synced || typeof state.synced !== 'object') state.synced = {}
  let queue = []
  let timer = null
  let flushing = false
  let lastError = ''
  let lastWriteStartedAt = 0
  let syncedCount = Object.keys(state.synced).length

  function persist() {
    writeStateAtomic(options.stateFile, state)
  }

  function schedule() {
    if (options.enabled === false || timer) return
    timer = setTimeout(() => {
      timer = null
      flush()
    }, options.flushIntervalMs)
    timer.unref?.()
  }

  async function writeOne(message) {
    const waitMs = options.minWriteIntervalMs - (Date.now() - lastWriteStartedAt)
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs))
    lastWriteStartedAt = Date.now()
    const result = await runJson(options.larkCliBin, [
      'base',
      '+record-upsert',
      '--as',
      'user',
      '--base-token',
      options.baseToken,
      '--table-id',
      options.tableId,
      '--json',
      JSON.stringify(baseRecordFields(message)),
    ], { timeout: options.commandTimeoutMs })
    state.synced[message.messageId] = {
      at: new Date().toISOString(),
      recordId: result?.data?.record?.record_id || result?.record?.record_id || result?.record_id || '',
    }
    syncedCount += 1
    lastError = ''
    persist()
    return result
  }

  async function flush() {
    if (options.enabled === false || flushing || !queue.length) return getSummary()
    flushing = true
    let current = null
    try {
      while (queue.length) {
        current = queue.shift()
        if (!current?.messageId || state.synced[current.messageId]) {
          current = null
          continue
        }
        await writeOne(current)
        current = null
      }
      lastError = ''
    } catch (err) {
      lastError = err?.message || String(err)
      if (current?.messageId && !state.synced[current.messageId] && !queue.some(item => item.messageId === current.messageId)) {
        queue.unshift(current)
      }
      if (queue.length > options.maxQueue) queue = queue.slice(-options.maxQueue)
    } finally {
      flushing = false
      if (queue.length) schedule()
      options.onUpdate?.(getSummary())
    }
    return getSummary()
  }

  function ingest(messages) {
    if (options.enabled === false) return []
    const added = []
    for (const message of Array.isArray(messages) ? messages : []) {
      if (!message?.messageId || state.synced[message.messageId]) continue
      if (queue.some(item => item.messageId === message.messageId)) continue
      queue.push(message)
      added.push(message)
    }
    if (queue.length > options.maxQueue) queue = queue.slice(-options.maxQueue)
    if (added.length) schedule()
    return added
  }

  function stop() {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function getSummary() {
    return {
      ok: !lastError,
      enabled: options.enabled !== false,
      baseTokenConfigured: Boolean(options.baseToken),
      configFile: options.configFile || '',
      tableId: options.tableId,
      minWriteIntervalMs: options.minWriteIntervalMs,
      url: baseUrlFor(options),
      queueLength: queue.length,
      flushing,
      syncedCount,
      error: lastError,
    }
  }

  return { ingest, flush, stop, getSummary }
}

module.exports = {
  DEFAULT_BASE_SINK_OPTIONS,
  baseSinkTargetId,
  baseUrlFor,
  baseRecordFields,
  createLarkBaseSink,
  readConfig,
  readBaseSinkOptions,
  withTableParam,
}
