const { spawn } = require('child_process')
const { verifiedLarkUserFromPayload } = require('./work-items')

function compactText(value, max = 1000) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function runJson(command, args, { timeoutMs = 30000 } = {}) {
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
      try { child.kill('SIGTERM') } catch { /* already exited */ }
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    timer.unref?.()
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
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
      } catch (error) {
        reject(new Error(`invalid ${command} JSON: ${error.message}`))
      }
    })
  })
}

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateRange(nowValue = new Date(), daysValue = 7) {
  const startDate = new Date(nowValue)
  const days = Math.max(1, Math.min(40, Math.round(Number(daysValue) || 7)))
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + days)
  return {
    start: localDateKey(startDate),
    end: localDateKey(endDate),
  }
}

function agendaPayloadEvents(payload) {
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.events)) return payload.data.events
  if (Array.isArray(payload?.events)) return payload.events
  return []
}

function eventDateTime(value) {
  return compactText(value?.datetime || value?.date || value?.timestamp, 100)
}

function normalizeAgendaEvent(raw = {}) {
  return {
    id: compactText(raw.event_id || raw.eventId || raw.id, 240),
    title: compactText(raw.summary || raw.title || '未命名日程', 400),
    startAt: eventDateTime(raw.start_time || raw.start),
    endAt: eventDateTime(raw.end_time || raw.end),
    timezone: compactText(raw.start_time?.timezone || raw.start?.timezone, 100),
    organizer: compactText(raw.event_organizer?.display_name || raw.organizer?.display_name || raw.organizer?.name, 200),
    rsvp: compactText(raw.self_rsvp_status || raw.rsvp_status, 40),
    status: compactText(raw.free_busy_status || 'busy', 40),
    allDay: Boolean(raw.start_time?.date || raw.start?.date || raw.is_all_day),
    url: compactText(raw.app_link || raw.url, 1200),
    meetingUrl: compactText(raw.vchat?.meeting_url || raw.meeting_url, 1200),
  }
}

function createLarkAgendaLoader(input = {}) {
  const larkCliBin = input.larkCliBin || 'lark-cli'
  const run = input.runJson || runJson
  const now = input.now || (() => new Date())
  let state = {
    ok: true,
    loading: false,
    error: '',
    events: [],
    count: 0,
    updatedAt: '',
    range: dateRange(now(), 7),
  }

  function snapshot() {
    return structuredClone(state)
  }

  async function refresh({ days = 7 } = {}) {
    const range = dateRange(now(), days)
    state = { ...state, loading: true, error: '', range }
    input.onUpdate?.(snapshot())
    try {
      const identityPayload = await run(larkCliBin, [
        'auth', 'status', '--json', '--verify',
      ], { timeoutMs: 20000 })
      verifiedLarkUserFromPayload(identityPayload)
      const payload = await run(larkCliBin, [
        'calendar', '+agenda', '--as', 'user',
        '--start', range.start, '--end', range.end,
        '--format', 'json',
      ], { timeoutMs: 30000 })
      const events = agendaPayloadEvents(payload)
        .map(normalizeAgendaEvent)
        .filter(event => event.id && event.startAt)
        .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
      state = {
        ok: true,
        loading: false,
        error: '',
        events,
        count: events.length,
        updatedAt: new Date().toISOString(),
        range,
      }
    } catch (error) {
      state = {
        ...state,
        ok: false,
        loading: false,
        error: error?.message || String(error),
        updatedAt: new Date().toISOString(),
        range,
      }
    }
    input.onUpdate?.(snapshot())
    return snapshot()
  }

  return {
    getState: snapshot,
    refresh,
  }
}

module.exports = {
  agendaPayloadEvents,
  createLarkAgendaLoader,
  dateRange,
  normalizeAgendaEvent,
}
