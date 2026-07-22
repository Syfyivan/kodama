const fs = require('fs')
const os = require('os')
const path = require('path')

function cleanTitle(value, max = 80) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function defaultIndexPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.codex', 'session_index.jsonl')
}

function readFirstLine(filePath, deps = {}) {
  const openSync = deps.openSync || fs.openSync
  const readSync = deps.readSync || fs.readSync
  const closeSync = deps.closeSync || fs.closeSync
  const maxBytes = Math.max(1, Number(deps.maxBytes) || 1024 * 1024)
  let fd
  try {
    fd = openSync(filePath, 'r')
    const chunks = []
    let total = 0
    while (total < maxBytes) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes - total))
      const bytesRead = readSync(fd, buffer, 0, buffer.length, null)
      if (!bytesRead) break
      const chunk = buffer.subarray(0, bytesRead)
      const newline = chunk.indexOf(10)
      if (newline >= 0) {
        chunks.push(chunk.subarray(0, newline))
        break
      }
      chunks.push(chunk)
      total += bytesRead
    }
    return Buffer.concat(chunks).toString('utf8').replace(/\r$/, '')
  } catch {
    return ''
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd) } catch { /* ignore close errors */ }
    }
  }
}

function isCodexDesktopTranscript(transcriptPath, deps = {}) {
  const filePath = String(transcriptPath || '').trim()
  if (!filePath) return false
  const getFirstLine = deps.readFirstLine || readFirstLine
  try {
    const item = JSON.parse(getFirstLine(filePath, deps))
    if (item?.type !== 'session_meta') return false
    const payload = item?.payload || {}
    const expectedSessionId = cleanTitle(deps.sessionId, 120)
    const actualSessionId = cleanTitle(payload.id || payload.session_id || payload.sessionId, 120)
    if (expectedSessionId && expectedSessionId !== actualSessionId) return false
    return /^codex desktop$/i.test(String(payload.originator || '').trim())
  } catch {
    return false
  }
}

function readCodexSessionTitles(indexPath, deps = {}) {
  const readFileSync = deps.readFileSync || fs.readFileSync
  const titles = new Map()
  let text = ''
  try {
    text = readFileSync(indexPath, 'utf8')
  } catch {
    return titles
  }
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const item = JSON.parse(trimmed)
      const id = cleanTitle(item?.id || item?.session_id || item?.sessionId, 120)
      const title = cleanTitle(item?.thread_name || item?.threadName || item?.title)
      if (id && title) titles.set(id, title)
    } catch {
      /* ignore malformed jsonl rows */
    }
  }
  return titles
}

function createCodexSessionTitleResolver(options = {}) {
  const indexPath = options.indexPath || defaultIndexPath(options.homeDir)
  const statSync = options.statSync || fs.statSync
  let stamp = ''
  let cache = new Map()

  function refreshIfNeeded() {
    let nextStamp = 'missing'
    try {
      const stat = statSync(indexPath)
      nextStamp = `${stat.mtimeMs}:${stat.size}`
    } catch {
      nextStamp = 'missing'
    }
    if (nextStamp === stamp) return
    stamp = nextStamp
    cache = readCodexSessionTitles(indexPath, options)
  }

  return function resolveCodexSessionTitle(sessionId) {
    const id = cleanTitle(sessionId, 120)
    if (!id) return ''
    refreshIfNeeded()
    return cache.get(id) || ''
  }
}

module.exports = {
  cleanTitle,
  createCodexSessionTitleResolver,
  defaultIndexPath,
  isCodexDesktopTranscript,
  readFirstLine,
  readCodexSessionTitles,
}
