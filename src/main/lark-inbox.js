const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  chatLimit: 8,
  perChatLimit: 4,
  pollIntervalMs: 3 * 60 * 1000,
  commandTimeoutMs: 15 * 1000,
  maxMessages: 80,
  maxSeen: 500,
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

function readOptions(input = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...input,
    enabled: input.enabled !== undefined
      ? input.enabled === true
      : envFlag('KODAMA_LARK_INBOX_ENABLED', DEFAULT_OPTIONS.enabled),
    chatLimit: clampInt(process.env.KODAMA_LARK_INBOX_CHAT_LIMIT || input.chatLimit, 1, 20, DEFAULT_OPTIONS.chatLimit),
    perChatLimit: clampInt(process.env.KODAMA_LARK_INBOX_MESSAGE_LIMIT || input.perChatLimit, 1, 20, DEFAULT_OPTIONS.perChatLimit),
    pollIntervalMs: clampInt(process.env.KODAMA_LARK_INBOX_POLL_MS || input.pollIntervalMs, 30 * 1000, 30 * 60 * 1000, DEFAULT_OPTIONS.pollIntervalMs),
    commandTimeoutMs: clampInt(input.commandTimeoutMs, 3 * 1000, 60 * 1000, DEFAULT_OPTIONS.commandTimeoutMs),
    maxMessages: clampInt(input.maxMessages, 20, 300, DEFAULT_OPTIONS.maxMessages),
    maxSeen: clampInt(input.maxSeen, 100, 2000, DEFAULT_OPTIONS.maxSeen),
  }
}

function emptySnapshot(options = DEFAULT_OPTIONS) {
  return {
    ok: true,
    enabled: options.enabled !== false,
    loading: false,
    error: '',
    chats: [],
    messages: [],
    chatCount: 0,
    messageCount: 0,
    newCount: 0,
    updatedAt: '',
    startedAt: '',
    pollIntervalMs: options.pollIntervalMs,
  }
}

function compactText(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function normalizeFeishuTime(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(text)) {
    const [date, time] = text.split(' ')
    const seconds = time.length === 5 ? `${time}:00` : time
    const parsed = new Date(`${date}T${seconds}+08:00`)
    return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString()
  }
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString()
}

function timeValue(value) {
  const t = Date.parse(value || '')
  return Number.isFinite(t) ? t : 0
}

function dataPayload(payload) {
  if (!payload || typeof payload !== 'object') return {}
  return payload.data && typeof payload.data === 'object' ? payload.data : payload
}

function chatItemsFromPayload(payload) {
  const data = dataPayload(payload)
  return Array.isArray(data.items) ? data.items : []
}

function messageItemsFromPayload(payload) {
  const data = dataPayload(payload)
  return Array.isArray(data.messages) ? data.messages : []
}

function normalizeChat(raw) {
  return {
    chatId: String(raw?.chat_id || raw?.chatId || '').trim(),
    name: compactText(raw?.name || raw?.chat_name || raw?.chatName || '未命名群', 80),
    mode: String(raw?.chat_mode || raw?.chatMode || '').trim(),
    status: String(raw?.chat_status || raw?.chatStatus || '').trim(),
    external: raw?.external === true,
    avatar: String(raw?.avatar || '').trim(),
  }
}

function normalizeMessage(raw, chat) {
  const messageId = String(raw?.message_id || raw?.messageId || '').trim()
  const createdAt = normalizeFeishuTime(raw?.create_time || raw?.createTime || raw?.create_at || raw?.createdAt)
  const sender = raw?.sender && typeof raw.sender === 'object' ? raw.sender : {}
  return {
    messageId,
    chatId: chat.chatId,
    chatName: chat.name,
    msgType: String(raw?.msg_type || raw?.msgType || raw?.type || '').trim() || 'message',
    content: compactText(raw?.content || raw?.text || raw?.summary || '', 240),
    senderName: compactText(sender.name || raw?.sender_name || raw?.senderName || sender.id || '未知成员', 80),
    senderId: String(sender.id || raw?.sender_id || '').trim(),
    createdAt,
    createTime: String(raw?.create_time || raw?.createTime || '').trim(),
    deleted: raw?.deleted === true,
    updated: raw?.updated === true,
    threadId: String(raw?.thread_id || raw?.threadId || '').trim(),
    source: raw?.source || 'poll',
  }
}

function normalizeIncomingMessage(raw) {
  const messageId = String(raw?.messageId || raw?.message_id || '').trim()
  if (!messageId) return null
  const createdAt = normalizeFeishuTime(raw?.createdAt || raw?.createTime || raw?.create_time || new Date().toISOString())
  return {
    messageId,
    chatId: String(raw?.chatId || raw?.chat_id || '').trim(),
    chatName: compactText(raw?.chatName || raw?.chat_name || '飞书群聊', 80),
    msgType: String(raw?.msgType || raw?.msg_type || raw?.type || 'message').trim(),
    content: compactText(raw?.content || raw?.text || raw?.summary || '', 240),
    senderName: compactText(raw?.senderName || raw?.sender_name || raw?.sender?.name || raw?.sender?.id || '未知成员', 80),
    senderId: String(raw?.senderId || raw?.sender_id || raw?.sender?.id || '').trim(),
    createdAt,
    createTime: String(raw?.createTime || raw?.create_time || '').trim(),
    deleted: raw?.deleted === true,
    updated: raw?.updated === true,
    threadId: String(raw?.threadId || raw?.thread_id || '').trim(),
    source: String(raw?.source || 'push').trim(),
  }
}

function mergeMessages(...lists) {
  const byId = new Map()
  for (const list of lists) {
    for (const raw of Array.isArray(list) ? list : []) {
      const message = normalizeIncomingMessage(raw)
      if (!message || message.deleted) continue
      const prev = byId.get(message.messageId)
      byId.set(message.messageId, prev ? { ...prev, ...message, content: message.content || prev.content } : message)
    }
  }
  return Array.from(byId.values()).sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
}

function rebuildChats(baseChats, messages, perChatLimit) {
  const byId = new Map()
  for (const raw of Array.isArray(baseChats) ? baseChats : []) {
    const chat = normalizeChat(raw)
    if (!chat.chatId) continue
    byId.set(chat.chatId, { ...raw, ...chat, messages: [] })
  }
  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message.chatId) continue
    const chat = byId.get(message.chatId) || {
      chatId: message.chatId,
      name: message.chatName || '飞书群聊',
      mode: 'group',
      status: '',
      messages: [],
    }
    chat.name = chat.name || message.chatName || '飞书群聊'
    chat.messages = mergeMessages([message], chat.messages || []).slice(0, perChatLimit)
    byId.set(message.chatId, chat)
  }
  return Array.from(byId.values())
    .sort((a, b) => timeValue(b.messages?.[0]?.createdAt) - timeValue(a.messages?.[0]?.createdAt))
}

function runJson(command, args, { timeout = DEFAULT_OPTIONS.commandTimeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
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
      } catch (err) {
        reject(new Error(`invalid ${command} JSON: ${err.message}`))
      }
    })
  })
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(tmp, JSON.stringify(value))
  fs.renameSync(tmp, file)
}

function readSeenState(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return data && typeof data === 'object' && data.seen && typeof data.seen === 'object'
      ? data
      : { version: 1, seen: {} }
  } catch {
    return { version: 1, seen: {} }
  }
}

function trimSeenState(seen, maxSeen) {
  const entries = Object.entries(seen || {})
    .sort((a, b) => timeValue(b[1]) - timeValue(a[1]))
    .slice(0, maxSeen)
  return Object.fromEntries(entries)
}

async function listRecentChats(options) {
  const payload = await runJson(options.larkCliBin || 'lark-cli', [
    'im',
    'chats',
    'list',
    '--as',
    'user',
    '--format',
    'json',
    '--params',
    JSON.stringify({
      page_size: options.chatLimit,
      sort_type: 'ByActiveTimeDesc',
    }),
  ], { timeout: options.commandTimeoutMs })
  return chatItemsFromPayload(payload)
    .map(normalizeChat)
    .filter(chat => chat.chatId && chat.status !== 'dissolved' && (!chat.mode || chat.mode === 'group' || chat.mode === 'topic'))
    .slice(0, options.chatLimit)
}

async function listChatMessages(chat, options) {
  const payload = await runJson(options.larkCliBin || 'lark-cli', [
    'im',
    '+chat-messages-list',
    '--as',
    'user',
    '--chat-id',
    chat.chatId,
    '--sort',
    'desc',
    '--page-size',
    String(options.perChatLimit),
    '--format',
    'json',
  ], { timeout: options.commandTimeoutMs })
  return messageItemsFromPayload(payload)
    .map(raw => normalizeMessage(raw, chat))
    .filter(message => message.messageId && !message.deleted)
}

async function fetchLarkInbox(options) {
  const chats = await listRecentChats(options)
  const enriched = []
  const errors = []
  for (const chat of chats) {
    try {
      const messages = await listChatMessages(chat, options)
      enriched.push({ ...chat, messages })
    } catch (err) {
      errors.push({ chatId: chat.chatId, name: chat.name, error: err?.message || String(err) })
      enriched.push({ ...chat, messages: [], error: err?.message || String(err) })
    }
  }
  const messages = enriched
    .flatMap(chat => chat.messages.map(message => ({ ...message, chatName: chat.name })))
    .sort((a, b) => timeValue(b.createdAt) - timeValue(a.createdAt))
    .slice(0, options.maxMessages)
  return { chats: enriched, messages, errors }
}

function publicError(err) {
  const message = String(err?.message || err || '')
  if (/ENOENT/.test(message)) return '找不到 lark-cli'
  return compactText(message, 240)
}

function createLarkInbox(input = {}) {
  const options = readOptions(input)
  let snapshot = emptySnapshot(options)
  let state = readSeenState(options.stateFile || path.join(process.cwd(), 'kodama-lark-inbox-state.json'))
  let timer = null
  let inFlight = null
  let started = false

  function persistSeen() {
    if (!options.stateFile) return
    state.seen = trimSeenState(state.seen || {}, options.maxSeen)
    writeJsonAtomic(options.stateFile, state)
  }

  function updateSnapshot(next, meta = {}) {
    snapshot = {
      ...snapshot,
      ...next,
      enabled: options.enabled !== false,
      pollIntervalMs: options.pollIntervalMs,
    }
    options.onUpdate?.(snapshot, meta)
    return snapshot
  }

  async function refresh({ reason = 'manual' } = {}) {
    if (options.enabled === false) {
      return updateSnapshot({ ...emptySnapshot(options), ok: true, enabled: false })
    }
    if (inFlight) return inFlight
    const startedAt = new Date().toISOString()
    updateSnapshot({ loading: true, startedAt, error: '' }, { reason, phase: 'start' })
    inFlight = fetchLarkInbox(options)
      .then((result) => {
        const now = new Date().toISOString()
        const seen = state.seen || {}
        const newMessages = reason === 'startup'
          ? []
          : result.messages.filter(message => !seen[message.messageId])
        for (const message of result.messages) seen[message.messageId] = message.createdAt || now
        state = { version: 1, seen, updatedAt: now }
        persistSeen()
        const messages = mergeMessages(result.messages, snapshot.messages).slice(0, options.maxMessages)
        const chats = rebuildChats(result.chats, messages, options.perChatLimit)
        return updateSnapshot({
          ok: result.errors.length === 0,
          loading: false,
          error: result.errors.length ? `${result.errors.length} 个群读取失败` : '',
          chats,
          messages,
          chatCount: chats.length,
          messageCount: messages.length,
          newCount: newMessages.length,
          updatedAt: now,
          errors: result.errors,
        }, { reason, phase: 'done', newMessages })
      })
      .catch((err) => {
        return updateSnapshot({
          ok: false,
          loading: false,
          error: publicError(err),
          updatedAt: new Date().toISOString(),
        }, { reason, phase: 'error', error: err })
      })
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  function ingestMessages(rawMessages, meta = {}) {
    if (options.enabled === false) return snapshot
    const incoming = mergeMessages(rawMessages).slice(0, options.maxMessages)
    if (!incoming.length) return snapshot
    const now = new Date().toISOString()
    const seen = state.seen || {}
    const newMessages = incoming.filter(message => !seen[message.messageId])
    for (const message of incoming) seen[message.messageId] = message.createdAt || now
    state = { version: 1, seen, updatedAt: now }
    persistSeen()
    const messages = mergeMessages(incoming, snapshot.messages).slice(0, options.maxMessages)
    const chats = rebuildChats([...(snapshot.chats || []), ...(meta.chats || [])], messages, options.perChatLimit)
    return updateSnapshot({
      ok: true,
      loading: false,
      error: snapshot.error || '',
      chats,
      messages,
      chatCount: chats.length,
      messageCount: messages.length,
      newCount: newMessages.length,
      updatedAt: now,
    }, { reason: meta.reason || meta.source || 'push', phase: 'push', newMessages })
  }

  function start() {
    if (started || options.enabled === false) return
    started = true
    refresh({ reason: 'startup' })
    timer = setInterval(() => refresh({ reason: 'poll' }), options.pollIntervalMs)
    timer.unref?.()
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    started = false
  }

  function getSnapshot() {
    return snapshot
  }

  function getSummary() {
    return {
      ok: snapshot.ok,
      enabled: snapshot.enabled,
      loading: snapshot.loading,
      error: snapshot.error,
      chatCount: snapshot.chatCount,
      messageCount: snapshot.messageCount,
      newCount: snapshot.newCount,
      updatedAt: snapshot.updatedAt,
      pollIntervalMs: snapshot.pollIntervalMs,
    }
  }

  return { start, stop, refresh, ingestMessages, getSnapshot, getSummary }
}

module.exports = {
  DEFAULT_OPTIONS,
  chatItemsFromPayload,
  createLarkInbox,
  dataPayload,
  emptySnapshot,
  fetchLarkInbox,
  messageItemsFromPayload,
  mergeMessages,
  normalizeChat,
  normalizeFeishuTime,
  normalizeIncomingMessage,
  normalizeMessage,
  rebuildChats,
  readOptions,
}
