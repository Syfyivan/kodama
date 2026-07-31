const path = require('path')
const { normalizeChatMode, normalizeMentions } = require('./lark-inbox')

const DEFAULT_WEB_PUSH_OPTIONS = Object.freeze({
  enabled: true,
  url: 'https://relient.feishu.cn/next/messenger',
  partition: 'persist:kodama-lark-web-push',
  showOnStart: false,
  reloadIntervalMs: 12 * 60 * 60 * 1000,
  requestTimeoutMs: 15 * 1000,
})

const CLIENT_CHANNEL_PUSH_RE = /this\.emitter\.emit\("ClientChannelPush"\s*,\s*([A-Za-z_$][\w$]*)\)/g

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

function readWebPushOptions(input = {}) {
  return {
    ...DEFAULT_WEB_PUSH_OPTIONS,
    ...input,
    enabled: input.enabled !== undefined
      ? input.enabled === true
      : envFlag('KODAMA_LARK_WEB_PUSH_ENABLED', DEFAULT_WEB_PUSH_OPTIONS.enabled),
    url: String(process.env.KODAMA_LARK_WEB_PUSH_URL || input.url || DEFAULT_WEB_PUSH_OPTIONS.url),
    partition: String(process.env.KODAMA_LARK_WEB_PUSH_PARTITION || input.partition || DEFAULT_WEB_PUSH_OPTIONS.partition),
    showOnStart: input.showOnStart !== undefined
      ? input.showOnStart === true
      : envFlag('KODAMA_LARK_WEB_PUSH_SHOW', DEFAULT_WEB_PUSH_OPTIONS.showOnStart),
    reloadIntervalMs: clampInt(process.env.KODAMA_LARK_WEB_PUSH_RELOAD_MS || input.reloadIntervalMs, 10 * 60 * 1000, 24 * 60 * 60 * 1000, DEFAULT_WEB_PUSH_OPTIONS.reloadIntervalMs),
    requestTimeoutMs: clampInt(input.requestTimeoutMs, 3 * 1000, 60 * 1000, DEFAULT_WEB_PUSH_OPTIONS.requestTimeoutMs),
  }
}

function emptyWebPushStatus(options = DEFAULT_WEB_PUSH_OPTIONS) {
  return {
    ok: true,
    enabled: options.enabled !== false,
    running: false,
    windowVisible: false,
    injected: false,
    error: '',
    url: options.url,
    lastPushAt: '',
    lastMessageAt: '',
    pushCount: 0,
    messageCount: 0,
    updatedAt: '',
  }
}

function compactText(value, max = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}...` : text
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function safeJson(value) {
  if (!value || typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function normalizeCreateTime(value) {
  const raw = String(value || '').trim()
  const n = Number(raw)
  if (Number.isFinite(n) && n > 0) {
    const millis = n > 1e12 ? n : n * 1000
    const parsed = new Date(millis)
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString()
}

function richTextElementText(element) {
  if (!element || typeof element !== 'object') return ''
  const property = element.property || element.properties || {}
  const values = [
    property?.text?.content,
    property?.anchor?.content,
    property?.at?.name,
    property?.mention?.name,
    property?.emoji?.name,
    property?.img?.alt,
    property?.image?.alt,
    element.text,
    element.content,
  ]
  for (const value of values) {
    if (String(value || '').trim()) return String(value)
  }
  return ''
}

function extractRichText(content) {
  const richText = content?.richText || content?.rich_text || content?.richtext
  if (!richText || typeof richText !== 'object') return ''
  const elements = richText.elements && typeof richText.elements === 'object' ? richText.elements : {}
  const ids = Array.isArray(richText.elementIds)
    ? richText.elementIds
    : Array.isArray(richText.element_ids)
      ? richText.element_ids
      : Object.keys(elements)
  return compactText(ids.map(id => richTextElementText(elements[id])).join(''), 240)
}

function extractRichTextMentions(content) {
  const richText = content?.richText || content?.rich_text || content?.richtext
  if (!richText || typeof richText !== 'object') return []
  const elements = richText.elements && typeof richText.elements === 'object' ? richText.elements : {}
  const ids = Array.isArray(richText.elementIds)
    ? richText.elementIds
    : Array.isArray(richText.element_ids)
      ? richText.element_ids
      : Object.keys(elements)
  const mentions = ids.flatMap((id) => {
    const property = elements[id]?.property || elements[id]?.properties || {}
    const target = property.at || property.mention
    return target && typeof target === 'object' ? [target] : []
  })
  return normalizeMentions(mentions)
}

function webMessageTypeName(type) {
  const value = Number(type)
  if (value === 4) return 'text'
  if (value === 5) return 'image'
  if (Number.isFinite(value)) return `web-${value}`
  return 'message'
}

function contentText(rawMessage) {
  const content = safeJson(rawMessage?.content)
  if (!content || typeof content !== 'object') return compactText(content || '', 240)
  const type = Number(rawMessage?.type)
  if (type === 4) {
    return extractRichText(content) || compactText(content.text || content.content || '', 240)
  }
  if (type === 5) return '[图片]'
  return compactText(
    firstString(content.text, content.content, content.title, content.name) || `msg.type: ${rawMessage?.type}`,
    240,
  )
}

function normalizeWebChat(raw, fallbackId = '') {
  const chatId = firstString(raw?.id, raw?.chatId, raw?.chat_id, fallbackId)
  return {
    chatId,
    name: compactText(firstString(raw?.name, raw?.chatName, raw?.chat_name, raw?.topicName, '未命名群'), 80),
    mode: normalizeChatMode(firstString(raw?.chatMode, raw?.chat_mode, raw?.type)),
    status: firstString(raw?.chatStatus, raw?.chat_status),
    source: 'web-push',
  }
}

function normalizeWebMessage(raw, chat, users = {}) {
  const senderId = firstString(
    raw?.senderId,
    raw?.sender_id,
    raw?.fromId,
    raw?.from_id,
    raw?.sender?.id,
    raw?.from?.id,
  )
  const sender = senderId && users[senderId] && typeof users[senderId] === 'object' ? users[senderId] : {}
  const createdAt = normalizeCreateTime(firstString(raw?.createTime, raw?.create_time, raw?.createdAt, raw?.create_at))
  const content = safeJson(raw?.content)
  const mentions = normalizeMentions([
    ...normalizeMentions(raw),
    ...extractRichTextMentions(content),
  ])
  return {
    messageId: firstString(raw?.id, raw?.messageId, raw?.message_id),
    chatId: chat.chatId,
    chatName: chat.name,
    chatMode: chat.mode,
    msgType: webMessageTypeName(raw?.type),
    content: contentText(raw),
    senderName: compactText(firstString(sender.name, sender.localizedName, raw?.senderName, raw?.sender_name, senderId, '未知成员'), 80),
    senderId,
    createdAt,
    createTime: firstString(raw?.createTime, raw?.create_time),
    threadId: firstString(raw?.threadId, raw?.thread_id),
    source: 'web-push',
    mentions,
  }
}

function parseLarkWebPushPayload(data) {
  if (!data || typeof data !== 'object' || Number(data.command) !== 5065) {
    return { chats: [], messages: [] }
  }
  const entity = data?.payload?.entity || data?.entity || {}
  const messagesEntity = entity.messages && typeof entity.messages === 'object' ? entity.messages : {}
  const chatsEntity = entity.chats && typeof entity.chats === 'object' ? entity.chats : {}
  const usersEntity = entity.users && typeof entity.users === 'object' ? entity.users : {}
  const chats = Object.entries(chatsEntity)
    .map(([id, raw]) => normalizeWebChat(raw, id))
    .filter(chat => chat.chatId)
  const chatById = new Map(chats.map(chat => [chat.chatId, chat]))
  const messages = Object.values(messagesEntity)
    .map((raw) => {
      const chatId = firstString(raw?.chatId, raw?.chat_id)
      const chat = chatById.get(chatId) || normalizeWebChat(chatsEntity[chatId], chatId)
      return normalizeWebMessage(raw, chat, usersEntity)
    })
    .filter(message => message.messageId && message.chatId)
  return { chats, messages }
}

function injectClientChannelPush(scriptText) {
  const text = String(scriptText || '')
  let count = 0
  const body = text.replace(CLIENT_CHANNEL_PUSH_RE, (_match, argName) => {
    count += 1
    return `(()=>{try{window.__kodamaLarkPush?.(${argName})}catch(e){console.warn("[kodama] lark push failed",e)}})(),this.emitter.emit("ClientChannelPush",${argName})`
  })
  return { body, count, modified: count > 0 }
}

function filterRequestHeaders(headers = {}) {
  const skip = new Set(['accept-encoding', 'connection', 'content-length', 'host', 'origin', 'referer'])
  const out = {}
  for (const [name, value] of Object.entries(headers || {})) {
    if (!name || skip.has(String(name).toLowerCase())) continue
    if (value === undefined || value === null) continue
    out[name] = String(value)
  }
  return out
}

function responseHeaders(response) {
  const skip = new Set(['content-encoding', 'content-length', 'transfer-encoding'])
  const headers = []
  for (const [name, value] of response.headers.entries()) {
    if (skip.has(String(name).toLowerCase())) continue
    headers.push({ name, value })
  }
  if (!headers.some(header => header.name.toLowerCase() === 'content-type')) {
    headers.push({ name: 'content-type', value: 'text/javascript; charset=utf-8' })
  }
  return headers
}

async function fetchText(url, headers, timeout, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetchImpl(url, {
      headers: filterRequestHeaders(headers),
      redirect: 'follow',
      signal: controller.signal,
    })
    const text = await response.text()
    return { response, text }
  } finally {
    clearTimeout(timer)
  }
}

function createLarkWebPush(input = {}) {
  const options = readWebPushOptions(input)
  let win = null
  let timer = null
  let status = emptyWebPushStatus(options)
  let started = false
  let allowClose = false

  function updateStatus(next = {}) {
    status = {
      ...status,
      ...next,
      enabled: options.enabled !== false,
      url: options.url,
      updatedAt: new Date().toISOString(),
    }
    options.onStatus?.(status)
    return status
  }

  async function continueRequest(debuggerApi, requestId) {
    try {
      await debuggerApi.sendCommand('Fetch.continueRequest', { requestId })
    } catch {
      // The request may already be gone when the page is navigating.
    }
  }

  async function handlePausedRequest(debuggerApi, params) {
    const requestId = params?.requestId
    const url = String(params?.request?.url || '')
    if (!requestId || !/^https?:\/\//.test(url)) return
    try {
      const { response, text } = await fetchText(url, params?.request?.headers || {}, options.requestTimeoutMs, options.fetch)
      const injected = injectClientChannelPush(text)
      if (!injected.modified) {
        await continueRequest(debuggerApi, requestId)
        return
      }
      await debuggerApi.sendCommand('Fetch.fulfillRequest', {
        requestId,
        responseCode: response.status || 200,
        responsePhrase: response.statusText || 'OK',
        responseHeaders: responseHeaders(response),
        body: Buffer.from(injected.body, 'utf8').toString('base64'),
      })
      updateStatus({ injected: true, error: '' })
    } catch (err) {
      updateStatus({ ok: false, error: compactText(err?.message || err, 160) })
      await continueRequest(debuggerApi, requestId)
    }
  }

  function attachDebugger(contents) {
    const debuggerApi = contents.debugger
    try {
      if (!debuggerApi.isAttached()) debuggerApi.attach('1.3')
      debuggerApi.sendCommand('Fetch.enable', {
        patterns: [{ urlPattern: '*', resourceType: 'Script', requestStage: 'Request' }],
      }).catch(err => updateStatus({ ok: false, error: compactText(err?.message || err, 160) }))
      debuggerApi.on('message', (_event, method, params) => {
        if (method === 'Fetch.requestPaused') handlePausedRequest(debuggerApi, params)
      })
      contents.once('destroyed', () => {
        try {
          if (debuggerApi.isAttached()) debuggerApi.detach()
        } catch {
          // Window teardown.
        }
      })
    } catch (err) {
      updateStatus({ ok: false, error: compactText(err?.message || err, 160) })
    }
  }

  function createWindow({ show = false } = {}) {
    if (options.enabled === false) return null
    const BrowserWindow = options.BrowserWindow
    if (!BrowserWindow) throw new Error('BrowserWindow is required')
    const nextWin = new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 900,
      minHeight: 560,
      show: Boolean(show),
      title: 'Kodama 飞书实时消息',
      webPreferences: {
        preload: path.join(__dirname, 'lark-web-preload.js'),
        partition: options.partition,
        nodeIntegration: false,
        contextIsolation: false,
        sandbox: false,
      },
    })
    win = nextWin
    allowClose = false
    attachDebugger(nextWin.webContents)
    nextWin.webContents.on('did-start-loading', () => updateStatus({ running: true, error: '' }))
    nextWin.webContents.on('did-finish-load', () => updateStatus({ running: true, windowVisible: nextWin.isVisible(), error: '' }))
    nextWin.webContents.on('did-fail-load', (_event, _code, description) => updateStatus({ ok: false, running: true, error: compactText(description, 160) }))
    nextWin.on('show', () => updateStatus({ windowVisible: true }))
    nextWin.on('hide', () => updateStatus({ windowVisible: false }))
    nextWin.on('close', (event) => {
      if (allowClose) return
      event.preventDefault()
      nextWin.hide()
      updateStatus({ running: true, windowVisible: false })
    })
    nextWin.on('closed', () => {
      if (win === nextWin) win = null
      updateStatus({ running: false, windowVisible: false })
    })
    nextWin.loadURL(options.url).catch(err => updateStatus({ ok: false, error: compactText(err?.message || err, 160) }))
    updateStatus({ ok: true, running: true, windowVisible: nextWin.isVisible(), error: '' })
    return nextWin
  }

  function start({ show = options.showOnStart } = {}) {
    if (started || options.enabled === false) return status
    started = true
    createWindow({ show })
    timer = setInterval(() => reload(), options.reloadIntervalMs)
    timer.unref?.()
    return status
  }

  function showWindow() {
    if (options.enabled === false) return updateStatus({ enabled: false })
    if (!win || win.isDestroyed()) createWindow({ show: true })
    win.show()
    win.focus()
    return status
  }

  function reload({ show = false } = {}) {
    if (options.enabled === false) return updateStatus({ enabled: false })
    if (!win || win.isDestroyed()) createWindow({ show })
    else {
      if (show) {
        win.show()
        win.focus()
      }
      win.webContents.reloadIgnoringCache()
      updateStatus({ running: true, windowVisible: win.isVisible(), error: '' })
    }
    return status
  }

  function handlePush(data) {
    const parsed = parseLarkWebPushPayload(data)
    if (!parsed.messages.length) {
      updateStatus({ lastPushAt: new Date().toISOString(), pushCount: status.pushCount + 1 })
      return parsed
    }
    options.onMessages?.(parsed.messages, { chats: parsed.chats, source: 'web-push', raw: data })
    updateStatus({
      ok: true,
      error: '',
      lastPushAt: new Date().toISOString(),
      lastMessageAt: parsed.messages[0]?.createdAt || new Date().toISOString(),
      pushCount: status.pushCount + 1,
      messageCount: status.messageCount + parsed.messages.length,
    })
    return parsed
  }

  function stop() {
    if (timer) clearInterval(timer)
    timer = null
    started = false
    allowClose = true
    if (win && !win.isDestroyed()) win.close()
    win = null
  }

  function getStatus() {
    return {
      ...status,
      running: Boolean(win && !win.isDestroyed()),
      windowVisible: Boolean(win && !win.isDestroyed() && win.isVisible()),
    }
  }

  return { start, stop, showWindow, reload, handlePush, getStatus }
}

module.exports = {
  DEFAULT_WEB_PUSH_OPTIONS,
  contentText,
  createLarkWebPush,
  emptyWebPushStatus,
  extractRichTextMentions,
  injectClientChannelPush,
  normalizeCreateTime,
  normalizeWebChat,
  normalizeWebMessage,
  parseLarkWebPushPayload,
  readWebPushOptions,
}
