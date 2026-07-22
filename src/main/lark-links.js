function validChatId(value) {
  const id = String(value || '').trim()
  return /^oc_[A-Za-z0-9]+$/.test(id) ? id : ''
}

function validMessageId(value) {
  const id = String(value || '').trim()
  return !id || /^om_[A-Za-z0-9]+$/.test(id) ? id : null
}

function larkChatUrls(chatId, messageId = '') {
  const chat = validChatId(chatId)
  const message = validMessageId(messageId)
  if (!chat || message === null) return []

  const query = new URLSearchParams({ openChatId: chat })
  if (message) query.set('openMessageId', message)
  const suffix = query.toString()
  return [
    `https://applink.feishu.cn/client/chat/open?${suffix}`,
    `https://applink.larksuite.com/client/chat/open?${suffix}`,
    `lark://applink.feishu.cn/client/chat/open?${suffix}`,
  ]
}

module.exports = { larkChatUrls }
