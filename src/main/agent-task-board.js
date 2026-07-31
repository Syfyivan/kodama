const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const TRACKED_EVENT_TYPES = new Set([
  'session_title',
  'task_started',
  'task_progress',
  'task_waiting',
  'task_done',
  'task_failed',
  'agent_done',
])
const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled'])
const MAX_TASKS = 90
const MAX_SESSIONS_PER_TASK = 24
const MAX_STEPS_PER_SESSION = 12

function compactText(value, max = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function redactSensitiveText(value, max = 240) {
  return compactText(value, max)
    .replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|password|passwd|secret)\s*(?:=|:)\s*)[^\s,;&]+/gi, '$1•••')
    .replace(/((?:--api-key|--token|--password|--secret)\s+)[^\s,;&]+/gi, '$1•••')
    .replace(/([?&](?:access_token|refresh_token|token|key)=)[^&#\s]+/gi, '$1•••')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{8,}|xox[baprs]-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g, '•••')
}

function firstText(...values) {
  for (const value of values) {
    const text = compactText(value)
    if (text) return text
  }
  return ''
}

function normalizedSource(event = {}) {
  return compactText(event.source || event.provider || 'local', 24).toLowerCase() || 'local'
}

function sessionKeyForEvent(event = {}) {
  const source = normalizedSource(event)
  const agentTranscriptPath = firstText(event.agentTranscriptPath, event.agent_transcript_path)
  if (agentTranscriptPath) return `${source}:agent:${agentTranscriptPath}`
  const sessionId = firstText(event.sessionId, event.session_id, event.session, event.conversationId, event.conversation_id)
  if (sessionId) return `${source}:session:${sessionId}`
  const threadId = firstText(event.threadId, event.thread_id)
  if (threadId) return `${source}:thread:${threadId}`
  const taskId = firstText(event.bridgeTaskId, event.bridge_task_id, event.taskId, event.task_id, event.traceId, event.trace_id)
  if (taskId) return `${source}:run:${taskId}`
  const chatId = firstText(event.chatId, event.chat_id)
  const messageId = firstText(event.messageId, event.message_id)
  if (chatId) return `${source}:chat:${chatId}:${messageId}`
  const cwd = firstText(event.cwd, event.projectDir, event.project_dir, event.workspacePath, event.workspace_path)
  const label = firstText(event.sessionTitle, event.session_title, event.title, event.prompt, event.text, 'activity')
    .toLowerCase()
    .slice(0, 80)
  return `${source}:activity:${cwd || 'unknown'}:${label}`
}

function parentSessionKeyForEvent(event = {}) {
  if (!firstText(event.agentTranscriptPath, event.agent_transcript_path)) return ''
  const parent = firstText(event.sessionId, event.session_id, event.session, event.conversationId, event.conversation_id)
  return parent ? `${normalizedSource(event)}:session:${parent}` : ''
}

function sessionAliasKeys(event = {}) {
  const source = normalizedSource(event)
  return [
    firstText(event.threadId, event.thread_id, event['thread-id'])
      ? `${source}:thread:${firstText(event.threadId, event.thread_id, event['thread-id'])}`
      : '',
    firstText(event.sessionId, event.session_id, event.session, event.conversationId, event.conversation_id)
      ? `${source}:session:${firstText(event.sessionId, event.session_id, event.session, event.conversationId, event.conversation_id)}`
      : '',
  ].filter(Boolean)
}

function explicitGroupKey(event = {}) {
  const id = firstText(
    event.taskGroupId,
    event.task_group_id,
    event.workItemId,
    event.work_item_id,
    event.goalId,
    event.goal_id,
    event.contextKey,
    event.context_key,
  )
  return id ? `explicit:${normalizedSource(event)}:${id}` : ''
}

function hasStableSessionIdentity(event = {}) {
  return Boolean(firstText(
    event.agentTranscriptPath,
    event.agent_transcript_path,
    event.threadId,
    event.thread_id,
    event.sessionId,
    event.session_id,
    event.session,
    event.conversationId,
    event.conversation_id,
    event.taskId,
    event.task_id,
  ))
}

function sessionTitleForEvent(event = {}) {
  const explicit = firstText(
    event.sessionTitle,
    event.session_title,
    event.title,
    event.agent,
    event.agentName,
    event.agent_name,
    event.projectName,
    event.project_name,
  )
  if (explicit) return redactSensitiveText(explicit, 120)
  const prompt = firstText(event.prompt)
  if (event.larkBridge === true || /通过飞书机器人被调用/.test(prompt)) return '飞书机器人 Session'
  return redactSensitiveText(prompt || '未命名 Session', 120)
}

function taskTitleForEvent(event = {}) {
  const explicit = firstText(
    event.taskGroupTitle,
    event.task_group_title,
    event.workItemTitle,
    event.work_item_title,
    event.goalTitle,
    event.goal_title,
    event.sessionTitle,
    event.session_title,
    event.title,
    event.projectName,
    event.project_name,
  )
  if (explicit) return redactSensitiveText(explicit, 120)
  const prompt = firstText(event.prompt)
  if (event.larkBridge === true || /通过飞书机器人被调用/.test(prompt)) return '飞书消息处理'
  return redactSensitiveText(firstText(
    prompt,
    path.basename(firstText(event.cwd, event.projectDir, event.project_dir) || ''),
    '未命名任务',
  ), 120)
}

function meaningfulTaskTitleForEvent(event = {}) {
  const explicit = firstText(
    event.taskGroupTitle,
    event.task_group_title,
    event.workItemTitle,
    event.work_item_title,
    event.goalTitle,
    event.goal_title,
    event.sessionTitle,
    event.session_title,
    event.title,
  )
  if (explicit) return redactSensitiveText(explicit, 120)
  const prompt = firstText(event.prompt)
  if (event.larkBridge === true || /通过飞书机器人被调用/.test(prompt)) return '飞书消息处理'
  return redactSensitiveText(prompt, 120)
}

function statusForEvent(type, fallback = 'running') {
  if (type === 'task_waiting') return 'waiting'
  if (type === 'task_done' || type === 'agent_done') return 'done'
  if (type === 'task_failed') return 'failed'
  if (type === 'task_started' || type === 'task_progress') return 'running'
  return fallback
}

function explicitPercent(event = {}) {
  const candidates = [
    event.percent,
    event.progressPercent,
    event.progress_percent,
    event.progress?.percent,
    event.progress?.value,
  ]
  for (const candidate of candidates) {
    const value = Number(candidate)
    if (Number.isFinite(value)) return Math.min(100, Math.max(0, Math.round(value)))
  }
  const completed = Number(event.completedSteps ?? event.completed_steps)
  const total = Number(event.totalSteps ?? event.total_steps)
  if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
    return Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
  }
  const textPercent = firstText(event.text, event.message).match(/(?:^|\s)(\d{1,3})\s*%/)
  if (textPercent) return Math.min(100, Number(textPercent[1]))
  return null
}

function inferredProgress(event = {}, previous = 0) {
  const explicit = explicitPercent(event)
  if (explicit !== null) return explicit
  if (event.type === 'task_done' || event.type === 'agent_done') return 100
  if (event.type === 'task_started') return Math.max(previous, 5)
  if (event.type === 'task_waiting' || event.type === 'task_failed' || event.type === 'session_title') {
    return previous
  }

  const text = firstText(event.text, event.message).toLowerCase()
  const milestone = [
    [/(提交|push|发布|部署|合并|git 操作)/iu, 90],
    [/(测试|校验|验证|检查|构建|build|test|lint|typecheck)/iu, 75],
    [/(修改|实现|编码|写代码|编辑|修复|生成|落盘)/iu, 55],
    [/(读取|检索|搜索|调研|上下文|分析|梳理|定位)/iu, 30],
    [/(计划|拆解|规划|准备)/iu, 20],
  ].find(([pattern]) => pattern.test(text))?.[1]
  if (milestone) return Math.max(previous, milestone)
  return Math.min(92, Math.max(previous + 7, 12))
}

function safeTarget(event = {}) {
  const target = event.target && typeof event.target === 'object' ? event.target : null
  if (target) return {
    kind: compactText(target.kind, 40),
    label: redactSensitiveText(target.label, 100),
    url: redactSensitiveText(target.url, 1200),
    path: compactText(target.path, 1200),
    threadId: compactText(target.threadId, 160),
    sessionId: compactText(target.sessionId, 160),
    transcriptPath: compactText(target.transcriptPath, 1200),
    cwd: compactText(target.cwd, 1200),
    tty: compactText(target.tty, 120),
    chatId: compactText(target.chatId, 160),
    messageId: compactText(target.messageId, 160),
  }
  const url = firstText(event.url, event.link, event.deepLink, event.deep_link)
  if (url) return { kind: 'url', url: redactSensitiveText(url, 1200), label: '打开链接' }
  const chatId = firstText(event.chatId, event.chat_id)
  if (chatId) {
    const messageId = firstText(event.messageId, event.message_id)
    return {
      kind: 'lark',
      chatId,
      messageId,
      label: messageId ? '打开飞书原消息' : '打开飞书群聊',
    }
  }
  const threadId = firstText(event.threadId, event.thread_id, event['thread-id'])
  const sessionId = firstText(event.sessionId, event.session_id, event.session)
  const transcriptPath = firstText(event.transcriptPath, event.transcript_path)
  const cwd = firstText(event.cwd, event.projectDir, event.project_dir)
  const client = firstText(event.client, event.app, event.appName, event.app_name).toLowerCase()
  if (threadId && /codex\s+(desktop|app)/i.test(client)) {
    return {
      kind: 'codex-thread',
      threadId,
      url: `codex://threads/${encodeURIComponent(threadId)}`,
      label: '打开 Codex 会话',
      fallbackPath: transcriptPath,
    }
  }
  const provider = /claude/i.test(client) || /(^|\/)\.claude\/projects\//.test(transcriptPath)
    ? 'claude'
    : /codex/i.test(client) || /(^|\/)\.codex\/sessions\//.test(transcriptPath)
      ? 'codex'
      : ''
  if (provider && sessionId && transcriptPath) {
    return {
      kind: 'terminal-session',
      provider,
      sessionId: threadId || sessionId,
      threadId,
      tty: firstText(event.tty),
      cwd,
      label: provider === 'claude' ? '打开 Claude Code 终端' : '打开 Codex 终端',
      fallbackPath: transcriptPath,
      allowRecordFallback: provider === 'codex',
    }
  }
  return null
}

function dateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return {
      version: 1,
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks : [],
      assignments: parsed?.assignments && typeof parsed.assignments === 'object' ? parsed.assignments : {},
      explicitGroups: parsed?.explicitGroups && typeof parsed.explicitGroups === 'object' ? parsed.explicitGroups : {},
    }
  } catch {
    return { version: 1, tasks: [], assignments: {}, explicitGroups: {} }
  }
}

function writeState(file, state) {
  const temp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify(state, null, 2))
  fs.renameSync(temp, file)
}

function aggregateTask(task) {
  const sessions = (Array.isArray(task.sessions) ? task.sessions : []).map((session) => {
    const progress = Number(session.progress || 0)
    if (session.status === 'done' || progress < 100) return session
    return {
      ...session,
      progress: session.status === 'failed' ? 99 : 92,
    }
  })
  const doneSessions = sessions.filter(session => session.status === 'done').length
  const runningSessions = sessions.filter(session => session.status === 'running').length
  const waitingSessions = sessions.filter(session => session.status === 'waiting').length
  const failedSessions = sessions.filter(session => session.status === 'failed').length
  const status = waitingSessions
    ? 'waiting'
    : runningSessions
      ? 'running'
      : failedSessions
        ? 'failed'
        : sessions.length && doneSessions === sessions.length
          ? 'done'
          : 'idle'
  const progress = sessions.length
    ? Math.round(sessions.reduce((total, session) => total + Number(session.progress || 0), 0) / sessions.length)
    : 0
  const latest = sessions.slice().sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))[0]
  return {
    ...task,
    sessions,
    status,
    progress: status === 'done' ? 100 : progress,
    currentStep: latest?.currentStep || '',
    sessionCount: sessions.length,
    doneSessions,
    runningSessions,
    waitingSessions,
    failedSessions,
    updatedAt: latest?.updatedAt || task.updatedAt,
  }
}

function createAgentTaskBoard(options = {}) {
  const file = options.file
  if (!file) throw new Error('agent task board file is required')
  const now = options.now || (() => new Date().toISOString())
  const makeId = options.makeId || (() => `at_${randomUUID()}`)
  const persistDelayMs = Number.isFinite(options.persistDelayMs) ? options.persistDelayMs : 160
  let state = readState(file)
  let persistTimer = null

  function persist() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    writeState(file, state)
  }

  function schedulePersist() {
    if (persistDelayMs <= 0) {
      persist()
      return
    }
    if (persistTimer) return
    persistTimer = setTimeout(persist, persistDelayMs)
    persistTimer.unref?.()
  }

  function findTask(id) {
    return state.tasks.find(task => task.id === id) || null
  }

  function findSession(key) {
    for (const task of state.tasks) {
      const session = task.sessions?.find(item => item.key === key)
      if (session) return { task, session }
    }
    return null
  }

  function createTask(title, timestamp, id = '', manualTitle = false) {
    const task = {
      id: id || makeId(),
      title: compactText(title, 120) || '未命名任务',
      manualTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
      sessions: [],
    }
    state.tasks.unshift(task)
    return task
  }

  function recompute() {
    state.tasks = state.tasks
      .filter(task => Array.isArray(task.sessions) && task.sessions.length)
      .map(aggregateTask)
      .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
      .slice(0, MAX_TASKS)
    const validTaskIds = new Set(state.tasks.map(task => task.id))
    for (const [key, taskId] of Object.entries(state.assignments)) {
      if (!validTaskIds.has(taskId)) delete state.assignments[key]
    }
    for (const [key, taskId] of Object.entries(state.explicitGroups)) {
      if (!validTaskIds.has(taskId)) delete state.explicitGroups[key]
    }
  }

  function snapshot() {
    recompute()
    const timestamp = now()
    const today = dateKey(timestamp)
    const tasks = state.tasks.map(task => ({
      ...task,
      isToday: dateKey(task.updatedAt) === today,
    }))
    const todayTasks = tasks.filter(task => task.isToday)
    return {
      ok: true,
      version: 1,
      updatedAt: timestamp,
      tasks,
      todayTasks,
      counts: {
        total: tasks.length,
        today: todayTasks.length,
        running: todayTasks.filter(task => task.status === 'running').length,
        waiting: todayTasks.filter(task => task.status === 'waiting').length,
        done: todayTasks.filter(task => task.status === 'done').length,
        failed: todayTasks.filter(task => task.status === 'failed').length,
      },
    }
  }

  function progressPayload(task, session) {
    const aggregate = aggregateTask(task)
    return {
      taskId: aggregate.id,
      taskTitle: aggregate.title,
      status: aggregate.status,
      percent: aggregate.progress,
      currentStep: aggregate.currentStep,
      sessionKey: session.key,
      sessionTitle: session.title,
      sessionStatus: session.status,
      sessionPercent: session.progress,
      sessionCount: aggregate.sessionCount,
      doneSessions: aggregate.doneSessions,
      runningSessions: aggregate.runningSessions,
      waitingSessions: aggregate.waitingSessions,
      failedSessions: aggregate.failedSessions,
    }
  }

  function record(event = {}) {
    if (!event?.type || !TRACKED_EVENT_TYPES.has(event.type)) {
      return { ok: false, ignored: true, event, state: snapshot() }
    }
    if (event.type === 'session_title' && !hasStableSessionIdentity(event)) {
      return { ok: false, ignored: true, event, state: snapshot() }
    }
    const receivedAt = new Date(event.receivedAt || '')
    const timestamp = Number.isNaN(receivedAt.getTime()) ? now() : receivedAt.toISOString()
    let key = sessionKeyForEvent(event)
    const parentKey = parentSessionKeyForEvent(event)
    const explicitKey = explicitGroupKey(event)
    let existing = findSession(key)
    if (
      !hasStableSessionIdentity(event)
      && !existing
      && new Set(['task_done', 'task_failed', 'agent_done']).has(event.type)
    ) {
      const source = normalizedSource(event)
      const cwd = firstText(event.cwd, event.projectDir, event.project_dir)
      const candidates = state.tasks.flatMap(task => (task.sessions || []).map(session => ({ task, session })))
        .filter(({ session }) => (
          session.source === source
          && session.cwd === cwd
          && new Set(['running', 'waiting']).has(session.status)
          && Math.abs(Date.parse(timestamp) - Date.parse(session.updatedAt || '')) <= 15 * 60 * 1000
        ))
      if (candidates.length !== 1) {
        return { ok: false, ignored: true, event, state: snapshot() }
      }
      existing = candidates[0]
      key = existing.session.key
    }
    const parent = parentKey ? findSession(parentKey) : null
    let task = existing?.task || null

    if (!task && state.assignments[key]) task = findTask(state.assignments[key])
    if (!task && parent?.task) task = parent.task
    if (!task && parentKey && state.assignments[parentKey]) task = findTask(state.assignments[parentKey])
    if (!task && explicitKey && state.explicitGroups[explicitKey]) {
      task = findTask(state.explicitGroups[explicitKey])
    }
    if (!task) {
      task = createTask(taskTitleForEvent(event), timestamp)
      if (explicitKey) state.explicitGroups[explicitKey] = task.id
    }

    let session = existing?.session
    if (!session) {
      session = {
        key,
        id: firstText(
          event.threadId,
          event.thread_id,
          event.sessionId,
          event.session_id,
          event.session,
          event.taskId,
          event.task_id,
          key,
        ),
        title: sessionTitleForEvent(event),
        source: normalizedSource(event),
        agent: redactSensitiveText(firstText(event.agent, event.agentName, event.agent_name), 80),
        app: redactSensitiveText(firstText(event.client, event.app, event.appName, event.app_name), 80),
        cwd: compactText(firstText(event.cwd, event.projectDir, event.project_dir), 1200),
        status: 'running',
        progress: 0,
        currentStep: '',
        startedAt: timestamp,
        updatedAt: timestamp,
        finishedAt: '',
        target: safeTarget(event),
        steps: [],
      }
      task.sessions.push(session)
    }

    const nextTitle = sessionTitleForEvent(event)
    if (nextTitle && nextTitle !== '未命名 Session') session.title = nextTitle
    session.agent = redactSensitiveText(firstText(event.agent, event.agentName, event.agent_name, session.agent), 80)
    session.app = redactSensitiveText(firstText(event.client, event.app, event.appName, event.app_name, session.app), 80)
    session.cwd = compactText(firstText(event.cwd, event.projectDir, event.project_dir, session.cwd), 1200)
    session.target = safeTarget(event) || session.target || null
    if (event.type === 'task_started' && TERMINAL_STATUSES.has(session.status)) {
      session.progress = 0
      session.finishedAt = ''
    }
    session.status = statusForEvent(event.type, session.status)
    session.progress = inferredProgress(event, Number(session.progress || 0))
    session.updatedAt = timestamp
    if (TERMINAL_STATUSES.has(session.status)) session.finishedAt = timestamp

    const terminalStep = event.type === 'task_done' || event.type === 'agent_done'
      ? '已完成'
      : event.type === 'task_failed'
        ? '执行失败'
        : ''
    const stepText = redactSensitiveText(firstText(event.text, event.message, terminalStep), 220)
    if (stepText && event.type !== 'session_title') {
      session.currentStep = stepText
      const last = session.steps[session.steps.length - 1]
      if (!last || last.text !== stepText || last.type !== event.type) {
        session.steps.push({
          type: event.type,
          text: stepText,
          at: timestamp,
          progress: session.progress,
        })
        if (session.steps.length > MAX_STEPS_PER_SESSION) {
          session.steps = session.steps.slice(-MAX_STEPS_PER_SESSION)
        }
      }
    }
    if (task.sessions.length > MAX_SESSIONS_PER_TASK) {
      task.sessions = task.sessions
        .slice()
        .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
        .slice(0, MAX_SESSIONS_PER_TASK)
    }
    task.updatedAt = timestamp
    const meaningfulTitle = meaningfulTaskTitleForEvent(event)
    if (!task.manualTitle && meaningfulTitle) task.title = meaningfulTitle
    else if (task.title === '未命名任务') task.title = taskTitleForEvent(event)
    state.assignments[key] = task.id
    for (const alias of sessionAliasKeys(event)) state.assignments[alias] = task.id
    recompute()
    task = findTask(task.id)
    session = task?.sessions.find(item => item.key === key) || session
    schedulePersist()
    const taskProgress = progressPayload(task, session)
    return {
      ok: true,
      event: { ...event, taskProgress },
      taskProgress,
      state: snapshot(),
    }
  }

  function assignSession(request = {}) {
    const key = compactText(request.sessionKey, 1400)
    if (!key) return { ok: false, error: 'missing-session-key', state: snapshot() }
    const found = findSession(key)
    if (!found) return { ok: false, error: 'session-not-found', state: snapshot() }
    const timestamp = now()
    let target = request.taskId ? findTask(compactText(request.taskId, 160)) : null
    if (!target && request.title) target = createTask(redactSensitiveText(request.title, 120), timestamp, '', true)
    if (!target) return { ok: false, error: 'task-not-found', state: snapshot() }
    if (found.task.id !== target.id) {
      found.task.sessions = found.task.sessions.filter(session => session.key !== key)
      target.sessions.push(found.session)
      target.updatedAt = timestamp
      found.task.updatedAt = timestamp
    }
    target.manualTitle = true
    state.assignments[key] = target.id
    recompute()
    schedulePersist()
    return { ok: true, taskId: target.id, state: snapshot() }
  }

  function renameTask(request = {}) {
    const task = findTask(compactText(request.taskId, 160))
    const title = redactSensitiveText(request.title, 120)
    if (!task) return { ok: false, error: 'task-not-found', state: snapshot() }
    if (!title) return { ok: false, error: 'missing-task-title', state: snapshot() }
    task.title = title
    task.manualTitle = true
    task.updatedAt = now()
    recompute()
    schedulePersist()
    return { ok: true, taskId: task.id, state: snapshot() }
  }

  return {
    assignSession,
    flush: persist,
    getState: snapshot,
    record,
    renameTask,
  }
}

module.exports = {
  createAgentTaskBoard,
  sessionKeyForEvent,
}
