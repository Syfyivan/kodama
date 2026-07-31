const fs = require('fs')
const path = require('path')

function completedRecords(records, limit = 200) {
  const source = records instanceof Map
    ? Array.from(records.values())
    : Array.isArray(records)
      ? records
      : []
  return source
    .filter(record => (
      record
      && String(record.messageId || '').trim()
      && record.status === 'done'
      && record.analysis
      && typeof record.analysis === 'object'
    ))
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
    .slice(0, Math.max(1, Number(limit) || 200))
}

function loadLarkAssistantCache(file) {
  try {
    const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
    return new Map(completedRecords(payload?.records).map(record => [
      String(record.messageId).trim(),
      record,
    ]))
  } catch {
    return new Map()
  }
}

function saveLarkAssistantCache(file, records, limit = 200) {
  const temp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify({
    version: 1,
    records: completedRecords(records, limit),
  }, null, 2))
  fs.renameSync(temp, file)
}

module.exports = {
  completedRecords,
  loadLarkAssistantCache,
  saveLarkAssistantCache,
}
