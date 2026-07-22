function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim()
}

function eventKeys(event) {
  const keys = []
  const sessionId = String(event?.sessionId || event?.session_id || event?.session || '').trim()
  const cwd = normalizePath(event?.cwd || event?.projectDir || event?.project_dir || '')
  if (sessionId) keys.push(`session:${sessionId}`)
  if (cwd) keys.push(`cwd:${cwd}`)
  return keys
}

function createAgentEventContext(options = {}) {
  const routes = new Map()
  const maxEntries = Math.max(20, Number(options.maxEntries) || 200)

  function trim() {
    while (routes.size > maxEntries) routes.delete(routes.keys().next().value)
  }

  function remember(keys, route) {
    for (const key of keys) {
      routes.delete(key)
      routes.set(key, route)
    }
    trim()
  }

  function enrich(event) {
    if (!event) return event
    const keys = eventKeys(event)
    let cached = null
    for (const key of keys) {
      if (routes.has(key)) {
        cached = routes.get(key)
        break
      }
    }

    const directChatId = String(event.chatId || event.chat_id || '').trim()
    const directMessageId = String(event.messageId || event.message_id || '').trim()
    const bridgeEvent = event.larkBridge === true || Boolean(directChatId || directMessageId)
    const route = bridgeEvent
      ? {
          ...(cached || {}),
          source: 'lark',
          larkBridge: true,
          ...(directChatId ? { chatId: directChatId } : {}),
          ...(directMessageId ? { messageId: directMessageId } : {}),
        }
      : cached

    if (!route) return event
    const enriched = { ...event, ...route }
    if (directChatId) enriched.chatId = directChatId
    if (directMessageId) enriched.messageId = directMessageId
    remember(keys, {
      source: 'lark',
      larkBridge: true,
      ...(enriched.chatId ? { chatId: enriched.chatId } : {}),
      ...(enriched.messageId ? { messageId: enriched.messageId } : {}),
    })
    return enriched
  }

  return { enrich }
}

module.exports = { createAgentEventContext }
