const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { spawn } = require('child_process')

const PRIORITIES = Object.freeze(['critical', 'high', 'medium', 'low'])
const WORK_ITEM_STATUSES = Object.freeze(['open', 'running', 'done', 'failed', 'cancelled'])

function compactText(value, max = 2000) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function normalizePriority(value, fallback = 'medium') {
  const priority = String(value || '').trim().toLowerCase()
  return PRIORITIES.includes(priority) ? priority : fallback
}

function normalizeStatus(value, fallback = 'open') {
  const status = String(value || '').trim().toLowerCase()
  return WORK_ITEM_STATUSES.includes(status) ? status : fallback
}

function normalizeDueForCli(value) {
  const due = compactText(value, 80)
  if (!due) return ''
  return (
    /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.+-Z]+)?$/i.test(due)
    || /^date:\d{4}-\d{2}-\d{2}$/i.test(due)
    || /^\+\d+[dhwm]$/i.test(due)
    || /^\d{13}$/.test(due)
  ) ? due : ''
}

function readStoreFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed?.items) ? parsed.items : []
  } catch {
    return []
  }
}

function writeStoreFile(file, items) {
  const temp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify({ version: 1, items }, null, 2))
  fs.renameSync(temp, file)
}

function runJson(command, args, { timeoutMs = 20000 } = {}) {
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

function dataPayload(payload) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload || {}
}

function taskFromPayload(payload) {
  const data = dataPayload(payload)
  return data?.task && typeof data.task === 'object' ? data.task : data
}

function isCompletedLarkTask(task) {
  const completedAt = String(task?.completed_at || task?.completedAt || '').trim()
  const status = String(task?.status || '').trim().toLowerCase()
  return !['', '0'].includes(completedAt) || ['done', 'completed', 'complete'].includes(status)
}

function taskDescription(item) {
  return [
    item.description,
    `Kodama 优先级：${item.priority}`,
    item.kind === 'risk' ? '类型：风险点' : '类型：待办',
    item.chatName ? `来源会话：${item.chatName}` : '',
    item.sourceUrl ? `原消息：${item.sourceUrl}` : '',
  ].filter(Boolean).join('\n\n')
}

function createLarkTaskArgs(item) {
  const args = [
    'task',
    '+create',
    '--as',
    'user',
    '--summary',
    item.title,
    '--description',
    taskDescription(item),
    '--idempotency-key',
    `kodama-${item.id}`.slice(0, 60),
    '--format',
    'json',
  ]
  const due = normalizeDueForCli(item.dueAt)
  if (due) args.splice(args.length - 2, 0, '--due', due)
  return args
}

function normalizeLoadedItem(raw) {
  const item = raw && typeof raw === 'object' ? raw : {}
  return {
    ...item,
    id: String(item.id || '').trim(),
    title: compactText(item.title, 300),
    description: compactText(item.description, 2000),
    kind: item.kind === 'risk' ? 'risk' : 'todo',
    priority: normalizePriority(item.priority, item.kind === 'risk' ? 'high' : 'medium'),
    dueAt: compactText(item.dueAt, 80),
    status: normalizeStatus(item.status),
    lark: item.lark && typeof item.lark === 'object' ? item.lark : {},
    agent: item.agent && typeof item.agent === 'object' ? item.agent : {},
  }
}

function createWorkItemStore(input = {}) {
  const file = input.file
  if (!file) throw new Error('work item store file is required')
  const larkCliBin = input.larkCliBin || 'lark-cli'
  const run = input.runJson || runJson
  const now = input.now || (() => new Date().toISOString())
  const makeId = input.makeId || (() => `wi_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`)
  let items = readStoreFile(file).map(normalizeLoadedItem).filter(item => item.id && item.title)

  function snapshot() {
    return {
      ok: true,
      items: items.map(item => structuredClone(item)),
      count: items.length,
      openCount: items.filter(item => item.status === 'open').length,
      runningCount: items.filter(item => item.status === 'running').length,
      updatedAt: now(),
    }
  }

  function persist() {
    writeStoreFile(file, items)
    const state = snapshot()
    input.onUpdate?.(state)
    return state
  }

  function find(id) {
    return items.find(item => item.id === String(id || '').trim()) || null
  }

  function create(raw = {}) {
    const title = compactText(raw.title, 300)
    if (!title) return { ok: false, error: 'missing-title' }
    const sourceKey = compactText(raw.sourceKey, 500)
    if (sourceKey) {
      const existing = items.find(item => item.sourceKey === sourceKey)
      if (existing) return { ok: true, created: false, item: structuredClone(existing) }
    }
    const createdAt = now()
    const item = normalizeLoadedItem({
      id: makeId(),
      title,
      description: raw.description,
      kind: raw.kind,
      priority: raw.priority,
      dueAt: raw.dueAt,
      status: 'open',
      sourceKey,
      messageId: compactText(raw.messageId, 120),
      chatId: compactText(raw.chatId, 120),
      chatName: compactText(raw.chatName, 160),
      sourceUrl: compactText(raw.sourceUrl, 1000),
      createdAt,
      updatedAt: createdAt,
      lark: {},
      agent: {},
    })
    items.unshift(item)
    persist()
    return { ok: true, created: true, item: structuredClone(item) }
  }

  function patch(id, value = {}) {
    const item = find(id)
    if (!item) return { ok: false, error: 'work-item-not-found' }
    if (value.title !== undefined) item.title = compactText(value.title, 300) || item.title
    if (value.description !== undefined) item.description = compactText(value.description, 2000)
    if (value.priority !== undefined) item.priority = normalizePriority(value.priority, item.priority)
    if (value.dueAt !== undefined) item.dueAt = compactText(value.dueAt, 80)
    if (value.status !== undefined) item.status = normalizeStatus(value.status, item.status)
    if (value.lark && typeof value.lark === 'object') item.lark = { ...item.lark, ...value.lark }
    if (value.agent && typeof value.agent === 'object') item.agent = { ...item.agent, ...value.agent }
    item.updatedAt = now()
    persist()
    return { ok: true, item: structuredClone(item) }
  }

  async function createLarkTask(id) {
    const item = find(id)
    if (!item) return { ok: false, error: 'work-item-not-found' }
    if (item.lark?.guid) return { ok: true, created: false, item: structuredClone(item) }
    patch(id, { lark: { status: 'creating', error: '' } })
    try {
      const payload = await run(larkCliBin, createLarkTaskArgs(item))
      const task = taskFromPayload(payload)
      const guid = String(task?.guid || task?.task_guid || task?.taskGuid || '').trim()
      if (!guid) throw new Error('lark task creation did not return a guid')
      const result = patch(id, {
        lark: {
          guid,
          url: String(task?.url || task?.task_url || task?.taskUrl || '').trim(),
          status: String(task?.status || 'todo'),
          completedAt: String(task?.completed_at || ''),
          syncedAt: now(),
          error: '',
        },
      })
      return { ok: true, created: true, item: result.item }
    } catch (error) {
      patch(id, { lark: { status: 'failed', error: error?.message || String(error), syncedAt: now() } })
      return { ok: false, error: error?.message || String(error), item: structuredClone(find(id)) }
    }
  }

  async function syncLarkTask(id) {
    const item = find(id)
    if (!item) return { ok: false, error: 'work-item-not-found' }
    if (!item.lark?.guid) return { ok: false, error: 'lark-task-not-created' }
    try {
      const payload = await run(larkCliBin, [
        'task',
        'tasks',
        'get',
        '--as',
        'user',
        '--task-guid',
        item.lark.guid,
        '--format',
        'json',
      ])
      const task = taskFromPayload(payload)
      const completed = isCompletedLarkTask(task)
      const result = patch(id, {
        status: completed ? 'done' : item.status === 'done' ? 'open' : item.status,
        lark: {
          url: String(task?.url || item.lark.url || ''),
          status: String(task?.status || (completed ? 'done' : 'todo')),
          completedAt: String(task?.completed_at || ''),
          syncedAt: now(),
          error: '',
        },
      })
      return { ok: true, item: result.item }
    } catch (error) {
      patch(id, { lark: { error: error?.message || String(error), syncedAt: now() } })
      return { ok: false, error: error?.message || String(error), item: structuredClone(find(id)) }
    }
  }

  async function syncAll() {
    const results = []
    for (const item of items.filter(value => value.lark?.guid)) {
      results.push(await syncLarkTask(item.id))
    }
    return { ok: results.every(result => result.ok), results, state: snapshot() }
  }

  async function setCompleted(id, completed = true) {
    const item = find(id)
    if (!item) return { ok: false, error: 'work-item-not-found' }
    if (item.lark?.guid) {
      try {
        await run(larkCliBin, [
          'task',
          completed ? '+complete' : '+reopen',
          '--as',
          'user',
          '--task-id',
          item.lark.guid,
          '--format',
          'json',
        ])
      } catch (error) {
        patch(id, { lark: { error: error?.message || String(error), syncedAt: now() } })
        return { ok: false, error: error?.message || String(error), item: structuredClone(find(id)) }
      }
    }
    const result = patch(id, {
      status: completed ? 'done' : 'open',
      lark: item.lark?.guid ? {
        ...item.lark,
        status: completed ? 'done' : 'todo',
        completedAt: completed ? now() : '0',
        syncedAt: now(),
        error: '',
      } : item.lark,
    })
    return { ok: true, item: result.item }
  }

  return {
    create,
    createLarkTask,
    find: id => {
      const item = find(id)
      return item ? structuredClone(item) : null
    },
    getState: snapshot,
    patch,
    setCompleted,
    syncAll,
    syncLarkTask,
  }
}

module.exports = {
  PRIORITIES,
  WORK_ITEM_STATUSES,
  createLarkTaskArgs,
  createWorkItemStore,
  isCompletedLarkTask,
  normalizeDueForCli,
  normalizePriority,
  taskFromPayload,
}
