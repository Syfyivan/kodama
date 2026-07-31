const statusEl = document.getElementById('workbench-status')
const attentionOnly = document.getElementById('attention-only')
const refreshButton = document.getElementById('refresh-inbox')
const searchInput = document.getElementById('message-search')
const messageCount = document.getElementById('message-count')
const messageList = document.getElementById('message-list')
const detail = document.getElementById('message-detail')
const toast = document.getElementById('workbench-toast')
const toggleAgentTasksButton = document.getElementById('toggle-agent-tasks')
const agentTaskStatus = document.getElementById('agent-task-status')
const agentTaskList = document.getElementById('agent-task-list')
const createAgentTaskButton = document.getElementById('create-agent-task')
const refreshAgentTasksButton = document.getElementById('refresh-agent-tasks')
const closeAgentTasksButton = document.getElementById('close-agent-tasks')
const agentTaskDialog = document.getElementById('agent-task-dialog')
const agentTaskDialogForm = document.getElementById('agent-task-dialog-form')
const agentTaskDialogEyebrow = document.getElementById('agent-task-dialog-eyebrow')
const agentTaskDialogTitle = document.getElementById('agent-task-dialog-title')
const agentTaskDialogDescription = document.getElementById('agent-task-dialog-description')
const agentTaskDialogField = document.getElementById('agent-task-dialog-field')
const agentTaskDialogLabel = document.getElementById('agent-task-dialog-label')
const agentTaskDialogInput = document.getElementById('agent-task-dialog-input')
const agentTaskDialogSubmit = document.getElementById('agent-task-dialog-submit')
const agentTaskDialogCancel = document.getElementById('agent-task-dialog-cancel')
const agentTaskDialogClose = document.getElementById('agent-task-dialog-close')
const toggleAgendaButton = document.getElementById('toggle-agenda')
const agendaStatus = document.getElementById('agenda-status')
const agendaList = document.getElementById('agenda-list')
const refreshAgendaButton = document.getElementById('refresh-agenda')
const closeAgendaButton = document.getElementById('close-agenda')
const toggleWorkItemsButton = document.getElementById('toggle-work-items')
const workItemStatus = document.getElementById('work-item-status')
const workItemList = document.getElementById('work-item-list')
const syncWorkItemsButton = document.getElementById('sync-work-items')
const closeWorkItemsButton = document.getElementById('close-work-items')
const toggleKnowledgeButton = document.getElementById('toggle-knowledge')
const closeKnowledgeButton = document.getElementById('close-knowledge')
const knowledgeStatus = document.getElementById('knowledge-status')
const ideaInput = document.getElementById('idea-input')
const saveIdeaButton = document.getElementById('save-idea')
const captureClipboardButton = document.getElementById('capture-clipboard')
const openXFeedButton = document.getElementById('open-x-feed')
const knowledgeQuery = document.getElementById('knowledge-query')
const knowledgeResultsSection = document.getElementById('knowledge-results-section')
const knowledgeResultMeta = document.getElementById('knowledge-result-meta')
const knowledgeResults = document.getElementById('knowledge-results')
const knowledgeLibraryCount = document.getElementById('knowledge-library-count')
const knowledgeList = document.getElementById('knowledge-list')
const workbenchTabs = Array.from(document.querySelectorAll('[data-workbench-tab]'))
const workbenchPages = Array.from(document.querySelectorAll('[data-workbench-page]'))
const validWorkbenchTabs = new Set(workbenchPages.map(page => page.dataset.workbenchPage))

const state = {
  activeTab: 'messages',
  focusedTaskId: '',
  inbox: { messages: [], chats: [], loading: false, error: '', attentionCount: 0, updatedAt: '' },
  assistant: { results: {}, pending: [] },
  selectedId: '',
  query: '',
  attentionOnly: true,
  draftEdits: new Map(),
  agenda: { events: [], count: 0, loading: false, error: '', updatedAt: '', range: {} },
  agentTasks: {
    tasks: [],
    todayTasks: [],
    counts: { total: 0, today: 0, running: 0, waiting: 0, done: 0, failed: 0 },
    updatedAt: '',
  },
  workItems: { items: [], count: 0, openCount: 0, runningCount: 0 },
  workItemBusy: new Set(),
  extractionBusy: new Set(),
  knowledge: { items: [], count: 0, summarizedCount: 0, ideaCount: 0 },
  knowledgeResults: [],
  knowledgeResultLabel: '',
  knowledgeSearching: false,
  knowledgeBusy: new Set(),
}

let toastTimer = null
let agentTaskDialogResolve = null
let agentTaskDialogRequiresInput = true

function finishAgentTaskDialog(value) {
  const resolve = agentTaskDialogResolve
  agentTaskDialogResolve = null
  if (agentTaskDialog.open) agentTaskDialog.close()
  if (resolve) resolve(value)
}

function openAgentTaskDialog({
  eyebrow = 'MY TASK',
  title = '新建任务',
  description = '',
  label = '任务名称',
  initialValue = '',
  placeholder = '例如：完成桌宠任务工作台',
  submitLabel = '确认',
  requiresInput = true,
  danger = false,
} = {}) {
  if (agentTaskDialogResolve) finishAgentTaskDialog(null)
  agentTaskDialogRequiresInput = requiresInput
  agentTaskDialogEyebrow.textContent = eyebrow
  agentTaskDialogTitle.textContent = title
  agentTaskDialogDescription.textContent = description
  agentTaskDialogDescription.hidden = !description
  agentTaskDialogField.hidden = !requiresInput
  agentTaskDialogLabel.textContent = label
  agentTaskDialogInput.value = initialValue
  agentTaskDialogInput.placeholder = placeholder
  agentTaskDialogInput.required = requiresInput
  agentTaskDialogInput.setCustomValidity('')
  agentTaskDialogSubmit.textContent = submitLabel
  agentTaskDialog.classList.toggle('danger', danger)

  return new Promise((resolve) => {
    agentTaskDialogResolve = resolve
    try {
      agentTaskDialog.showModal()
      requestAnimationFrame(() => {
        if (requiresInput) {
          agentTaskDialogInput.focus()
          agentTaskDialogInput.select()
        } else {
          agentTaskDialogSubmit.focus()
        }
      })
    } catch (error) {
      agentTaskDialogResolve = null
      showToast(`无法打开任务编辑器：${error?.message || error}`)
      resolve(null)
    }
  })
}

function setActiveWorkbenchTab(tab, { taskId = '' } = {}) {
  state.activeTab = validWorkbenchTabs.has(tab) ? tab : 'messages'
  state.focusedTaskId = state.activeTab === 'tasks' ? String(taskId || state.focusedTaskId || '') : ''
  render()
}

function renderWorkbenchNavigation() {
  workbenchTabs.forEach((button) => {
    const active = button.dataset.workbenchTab === state.activeTab
    button.classList.toggle('active', active)
    button.setAttribute('aria-selected', active ? 'true' : 'false')
  })
  workbenchPages.forEach((page) => {
    page.hidden = page.dataset.workbenchPage !== state.activeTab
  })
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function shortText(value, max = 120) {
  const text = compactText(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function fmtTime(value, withDate = false) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    ...(withDate ? { month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function showToast(text) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.textContent = text
  toast.hidden = false
  toastTimer = setTimeout(() => {
    toast.hidden = true
    toastTimer = null
  }, 3200)
}

function normalizeInbox(snapshot) {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : []
  return {
    messages,
    chats: Array.isArray(snapshot?.chats) ? snapshot.chats : [],
    loading: snapshot?.loading === true,
    error: String(snapshot?.error || ''),
    attentionCount: Number(snapshot?.attentionCount || messages.filter(item => item.needsAttention).length || 0),
    updatedAt: String(snapshot?.updatedAt || ''),
  }
}

function normalizeAssistant(value) {
  return {
    results: value?.results && typeof value.results === 'object' ? value.results : {},
    pending: Array.isArray(value?.pending) ? value.pending : [],
  }
}

function normalizeWorkItems(value) {
  const items = Array.isArray(value?.items) ? value.items : []
  return {
    items,
    count: Number(value?.count ?? items.length),
    openCount: Number(value?.openCount ?? items.filter(item => item.status === 'open').length),
    runningCount: Number(value?.runningCount ?? items.filter(item => item.status === 'running').length),
  }
}

function normalizeAgentTasks(value) {
  const tasks = Array.isArray(value?.tasks) ? value.tasks : []
  const todayTasks = Array.isArray(value?.todayTasks)
    ? value.todayTasks
    : tasks.filter(task => task.isToday !== false)
  return {
    tasks,
    todayTasks,
    counts: {
      total: Number(value?.counts?.total ?? tasks.length),
      today: Number(value?.counts?.today ?? todayTasks.length),
      running: Number(value?.counts?.running ?? todayTasks.filter(task => task.status === 'running').length),
      waiting: Number(value?.counts?.waiting ?? todayTasks.filter(task => task.status === 'waiting').length),
      done: Number(value?.counts?.done ?? todayTasks.filter(task => task.status === 'done').length),
      failed: Number(value?.counts?.failed ?? todayTasks.filter(task => task.status === 'failed').length),
    },
    updatedAt: String(value?.updatedAt || ''),
  }
}

function normalizeAgenda(value) {
  const events = Array.isArray(value?.events) ? value.events : []
  return {
    events,
    count: Number(value?.count ?? events.length),
    loading: value?.loading === true,
    error: String(value?.error || ''),
    updatedAt: String(value?.updatedAt || ''),
    range: value?.range && typeof value.range === 'object' ? value.range : {},
  }
}

function normalizeKnowledge(value) {
  const items = Array.isArray(value?.items) ? value.items : []
  return {
    items,
    count: Number(value?.count ?? items.length),
    summarizedCount: Number(value?.summarizedCount ?? items.filter(item => item.summary).length),
    ideaCount: Number(value?.ideaCount ?? items.filter(item => item.source === 'idea').length),
  }
}

function visibleMessages() {
  const query = state.query.toLowerCase()
  return state.inbox.messages
    .filter(message => !state.attentionOnly || message.needsAttention)
    .filter((message) => {
      if (!query) return true
      return [
        message.chatName,
        message.senderName,
        message.content,
      ].some(value => compactText(value).toLowerCase().includes(query))
    })
    .slice()
    .sort((a, b) => {
      const attention = Number(Boolean(b.needsAttention)) - Number(Boolean(a.needsAttention))
      if (attention) return attention
      return Date.parse(b.createdAt || b.createTime || '') - Date.parse(a.createdAt || a.createTime || '')
    })
}

function selectedMessage() {
  return state.inbox.messages.find(message => message.messageId === state.selectedId) || null
}

function attentionLabel(message) {
  if (message.attentionReason === 'p2p') return '私聊'
  if (message.attentionReason === 'mention') return '@我'
  return message.chatMode === 'p2p' ? '私聊' : '普通'
}

function renderStatus() {
  const updated = state.inbox.updatedAt ? ` · ${fmtTime(state.inbox.updatedAt, true)}` : ''
  statusEl.textContent = state.inbox.loading
    ? '正在读取飞书消息…'
    : state.inbox.error
      ? `消息读取异常：${state.inbox.error}`
      : `${state.inbox.attentionCount} 条需处理 · ${state.inbox.messages.length} 条最近消息${updated}`
  refreshButton.disabled = state.inbox.loading
  refreshButton.textContent = state.inbox.loading ? '刷新中…' : '刷新消息'
}

function renderMessageList() {
  const messages = visibleMessages()
  messageCount.textContent = `${messages.length} 条`
  if (!messages.length) {
    messageList.className = 'message-list empty'
    messageList.textContent = state.inbox.loading ? '正在读取…' : '暂无匹配消息'
    return
  }
  if (!messages.some(message => message.messageId === state.selectedId)) {
    state.selectedId = messages[0].messageId
  }
  messageList.className = 'message-list'
  messageList.innerHTML = messages.map((message) => {
    const selected = message.messageId === state.selectedId ? ' selected' : ''
    const record = state.assistant.results[message.messageId]
    const assistantState = record?.status === 'done'
      ? '已起草'
      : record?.status === 'running'
        ? '理解中'
        : record?.status === 'failed'
          ? '失败'
          : ''
    return [
      `<button class="message-row${selected}" type="button" data-message-id="${escapeHtml(message.messageId)}">`,
      '<span class="message-row-top">',
      `<strong>${escapeHtml(message.chatName || (message.chatMode === 'p2p' ? '私聊' : '飞书会话'))}</strong>`,
      `<time>${escapeHtml(fmtTime(message.createdAt || message.createTime))}</time>`,
      '</span>',
      `<p>${escapeHtml(message.content || `[${message.msgType || 'message'}]`)}</p>`,
      '<span class="message-row-meta">',
      `<span>${escapeHtml(message.senderName || '未知成员')}${assistantState ? ` · ${escapeHtml(assistantState)}` : ''}</span>`,
      `<em class="attention-badge">${escapeHtml(attentionLabel(message))}</em>`,
      '</span>',
      '</button>',
    ].join('')
  }).join('')
}

function sameChatContext(message) {
  const targetTime = Date.parse(message.createdAt || message.createTime || '')
  return state.inbox.messages
    .filter(item => (
      item.chatId === message.chatId
      && item.messageId !== message.messageId
      && (!Number.isFinite(targetTime) || Date.parse(item.createdAt || item.createTime || '') <= targetTime)
    ))
    .sort((a, b) => Date.parse(a.createdAt || a.createTime || '') - Date.parse(b.createdAt || b.createTime || ''))
    .slice(-8)
}

function listHtml(items, renderItem = item => escapeHtml(item)) {
  if (!Array.isArray(items) || !items.length) return '<p>暂无</p>'
  return `<ul>${items.map(item => `<li>${renderItem(item)}</li>`).join('')}</ul>`
}

function extractedItemHtml(message, kind, items) {
  if (!Array.isArray(items) || !items.length) return '<p>暂无</p>'
  return `<ul class="extraction-list">${items.map((raw, index) => {
    const item = kind === 'risk' ? { title: raw, priority: 'high' } : raw || {}
    const sourceKey = `${message.messageId}:${kind}:${index}`
    const captured = state.workItems.items.find(value => value.sourceKey === sourceKey)
    const busy = state.extractionBusy.has(sourceKey) || captured?.agent?.status === 'running'
    const meta = [
      item.priority,
      item.dueAt,
    ].filter(Boolean).map(value => `<small>· ${escapeHtml(value)}</small>`).join(' ')
    return [
      '<li class="extraction-row">',
      `<span>${escapeHtml(item.title || '')} ${meta}</span>`,
      '<span class="extraction-actions">',
      `<button class="mini-action" type="button" data-capture-kind="${kind}" data-capture-index="${index}" data-capture-action="local"${captured || busy ? ' disabled' : ''}>${captured ? '已收录' : '收录'}</button>`,
      `<button class="mini-action" type="button" data-capture-kind="${kind}" data-capture-index="${index}" data-capture-action="lark"${captured?.lark?.guid || busy ? ' disabled' : ''}>${captured?.lark?.guid ? '已转飞书' : '飞书任务'}</button>`,
      `<button class="mini-action" type="button" data-capture-kind="${kind}" data-capture-index="${index}" data-capture-action="plan"${busy ? ' disabled' : ''}>Agent 计划</button>`,
      `<button class="mini-action primary-mini" type="button" data-capture-kind="${kind}" data-capture-index="${index}" data-capture-action="execute"${busy ? ' disabled' : ''}>Agent 执行</button>`,
      '</span>',
      '</li>',
    ].join('')
  }).join('')}</ul>`
}

function assistantHtml(message, record) {
  if (record?.status === 'running') {
    return '<div class="assistant-loading">Agent 正在结合消息上下文和相关文档理解这条消息，完成前不会发送任何内容。</div>'
  }
  if (record?.status === 'failed') {
    return `<div class="assistant-error">理解失败：${escapeHtml(record.error || '未知错误')}</div>`
  }
  if (record?.status !== 'done' || !record.analysis) {
    return '<div class="assistant-loading">点击“理解并起草”，让 Agent 总结消息、提取待办与风险，并生成回复草稿。</div>'
  }
  const analysis = record.analysis
  const replyDraft = state.draftEdits.has(message.messageId)
    ? state.draftEdits.get(message.messageId)
    : analysis.replyDraft || ''
  const docs = listHtml(analysis.relatedDocs, (item) => {
    const title = escapeHtml(item.title || item.url || '相关文档')
    return item.url
      ? `<a href="#" data-open-doc="${escapeHtml(item.url)}">${title}</a>`
      : title
  })
  const todos = extractedItemHtml(message, 'todo', analysis.todos)
  const risks = extractedItemHtml(message, 'risk', analysis.risks)
  return [
    '<section class="assistant-card">',
    '<div class="assistant-summary">',
    `<section><h3>消息总结</h3><p>${escapeHtml(analysis.summary || '暂无')}</p></section>`,
    `<section><h3>对方意图</h3><p>${escapeHtml(analysis.intent || '暂无')}</p></section>`,
    '</div>',
    '<div class="analysis-grid">',
    `<section><h3>待办</h3>${todos}</section>`,
    `<section><h3>风险点</h3>${risks}</section>`,
    `<section><h3>相关文档</h3>${docs}</section>`,
    `<section><h3>依据 · ${escapeHtml(analysis.confidence || 'low')}</h3>${listHtml(analysis.evidence)}</section>`,
    '</div>',
    '<div class="reply-section">',
    '<h3>回复草稿</h3>',
    `<textarea id="reply-draft" aria-label="回复草稿">${escapeHtml(replyDraft)}</textarea>`,
    '<div class="draft-actions">',
    '<button class="quiet" type="button" data-action="copy-draft">复制草稿</button>',
    '<button class="secondary" type="button" data-action="open-original">打开原消息</button>',
    '<button class="primary" type="button" data-action="apply-draft">应用到飞书输入框</button>',
    '</div>',
    '</div>',
    '</section>',
  ].join('')
}

function renderDetail() {
  const message = selectedMessage()
  if (!message) {
    detail.className = 'message-detail empty'
    detail.innerHTML = '<div class="empty-state"><strong>选择一条消息</strong><p>私聊和 @ 你的消息会优先显示在左侧。</p></div>'
    return
  }
  const record = state.assistant.results[message.messageId]
  const context = sameChatContext(message)
  const running = record?.status === 'running'
  detail.className = 'message-detail'
  detail.innerHTML = [
    '<div class="detail-head">',
    '<div>',
    `<h2>${escapeHtml(message.chatName || '飞书会话')}</h2>`,
    `<p class="detail-meta">${escapeHtml(attentionLabel(message))} · ${escapeHtml(message.senderName || '未知成员')} · ${escapeHtml(fmtTime(message.createdAt || message.createTime, true))}</p>`,
    '</div>',
    '<div class="detail-actions">',
    '<button class="secondary" type="button" data-action="open-original">打开原消息</button>',
    `<button class="primary" type="button" data-action="analyze"${running ? ' disabled' : ''}>${running ? '理解中…' : record?.status === 'done' ? '重新理解' : '理解并起草'}</button>`,
    '</div>',
    '</div>',
    '<section class="message-card">',
    '<h3>原消息</h3>',
    `<p>${escapeHtml(message.content || `[${message.msgType || 'message'}]`)}</p>`,
    '</section>',
    '<section class="context-card">',
    '<h3>最近上下文</h3>',
    context.length
      ? `<div class="context-list">${context.map(item => [
          '<div class="context-line">',
          `<strong>${escapeHtml(item.senderName || '未知成员')} · ${escapeHtml(fmtTime(item.createdAt || item.createTime))}</strong>`,
          `<span>${escapeHtml(item.content || `[${item.msgType || 'message'}]`)}</span>`,
          '</div>',
        ].join('')).join('')}</div>`
      : '<p>暂无可用上下文</p>',
    '</section>',
    assistantHtml(message, record),
  ].join('')
}

function agentTaskStatusLabel(value) {
  return {
    idle: '待开始',
    running: '进行中',
    waiting: '等待你',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[value] || value || '未知'
}

function userAgentTasks() {
  return state.agentTasks.todayTasks.filter(task => task.customGroup === true)
}

function looseAgentSessions() {
  return state.agentTasks.todayTasks
    .filter(task => task.customGroup !== true)
    .flatMap(task => (task.sessions || []).map(session => ({ task, session })))
    .sort((a, b) => (
      Number(new Set(['done', 'cancelled']).has(a.session.status))
      - Number(new Set(['done', 'cancelled']).has(b.session.status))
      || Date.parse(b.session.updatedAt || '') - Date.parse(a.session.updatedAt || '')
    ))
}

function agentSessionGroupOptions(currentTaskId = '') {
  const tasks = userAgentTasks()
  const currentIsTask = tasks.some(task => task.id === currentTaskId)
  return [
    currentIsTask
      ? `<option value="${escapeHtml(currentTaskId)}">当前任务</option>`
      : '<option value="" selected disabled>加入任务…</option>',
    ...tasks
      .filter(task => task.id !== currentTaskId)
      .map(task => `<option value="${escapeHtml(task.id)}">移到：${escapeHtml(shortText(task.title, 42))}</option>`),
    currentIsTask ? '<option value="__loose__">移到待归组</option>' : '',
    '<option value="__new__">＋ 新建任务…</option>',
  ].join('')
}

function agentSessionCardHtml(session, currentTaskId = '', { steps = true } = {}) {
  const recentSteps = steps && Array.isArray(session.steps) ? session.steps.slice(-3).reverse() : []
  return [
    `<section class="agent-session-card${session.ignored ? ' ignored' : ''}">`,
    '<div class="agent-session-head">',
    '<div>',
    `<strong>${escapeHtml(session.title || session.agent || 'Session')}</strong>`,
    `<p>${escapeHtml(agentTaskStatusLabel(session.status))}${session.agent ? ` · ${escapeHtml(session.agent)}` : ''}${session.app ? ` · ${escapeHtml(session.app)}` : ''}${session.ignored ? ' · 已隐藏' : ''}</p>`,
    '</div>',
    '<div class="agent-session-actions">',
    session.target ? `<button type="button" data-agent-session-open="${escapeHtml(session.key)}">打开</button>` : '',
    `<button type="button" data-agent-session-visibility="${escapeHtml(session.key)}" data-ignored="${session.ignored === true ? 'true' : 'false'}">${session.ignored ? '显示' : '忽略'}</button>`,
    `<select data-agent-session-group="${escapeHtml(session.key)}" data-current-task="${escapeHtml(currentTaskId)}" aria-label="调整 Session 所属任务">${agentSessionGroupOptions(currentTaskId)}</select>`,
    '</div>',
    '</div>',
    session.currentStep ? `<p class="agent-session-current">${escapeHtml(session.currentStep)}</p>` : '',
    recentSteps.length
      ? `<ol class="agent-session-steps">${recentSteps.map(step => `<li><time>${escapeHtml(fmtTime(step.at))}</time><span>${escapeHtml(step.text)}</span></li>`).join('')}</ol>`
      : '',
    '</section>',
  ].join('')
}

function renderAgentTasks() {
  const tasks = userAgentTasks().slice().sort((a, b) => (
    Number(a.progress >= 100) - Number(b.progress >= 100)
    || Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
  ))
  const loose = looseAgentSessions()
  const running = tasks.filter(task => task.status === 'running').length
  const done = tasks.filter(task => task.status === 'done').length
  toggleAgentTasksButton.textContent = `我的任务 ${tasks.length}`
  agentTaskStatus.textContent = `${running} 个进行中 · ${done} 个完成 · ${loose.length} 个待归组 Session${state.agentTasks.updatedAt ? ` · ${fmtTime(state.agentTasks.updatedAt)}` : ''}`

  if (!tasks.length && !loose.length) {
    agentTaskList.className = 'agent-task-list empty'
    agentTaskList.textContent = '先新建今天要完成的任务，再把相关 Session 归入其中'
    return
  }
  agentTaskList.className = 'agent-task-list'
  const taskCards = tasks.map((task) => {
    const percent = Math.min(100, Math.max(0, Math.round(Number(task.progress || 0))))
    const sessions = Array.isArray(task.sessions) ? task.sessions.slice() : []
    const todos = Array.isArray(task.todos) ? task.todos : []
    sessions.sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
    return [
      `<article class="agent-task-card${state.focusedTaskId === task.id ? ' focused' : ''}" data-status="${escapeHtml(task.status)}" data-agent-task-id="${escapeHtml(task.id)}">`,
      '<div class="agent-task-title-row">',
      '<div>',
      `<strong>${escapeHtml(task.title || '未命名任务')}</strong>`,
      `<p>${escapeHtml(agentTaskStatusLabel(task.status))} · ${sessions.length} Session · ${task.openTodoCount || 0} Todo</p>`,
      '</div>',
      '<div class="agent-task-title-actions">',
      `<button type="button" data-agent-task-rename="${escapeHtml(task.id)}">重命名</button>`,
      `<button class="danger" type="button" data-agent-task-delete="${escapeHtml(task.id)}">删除</button>`,
      '</div>',
      '</div>',
      '<div class="agent-task-progress-row">',
      `<input type="range" min="0" max="100" step="5" value="${percent}" data-agent-task-progress="${escapeHtml(task.id)}" aria-label="任务进度 ${percent}%" />`,
      `<strong data-agent-task-progress-output="${escapeHtml(task.id)}">${percent}%</strong>`,
      '</div>',
      '<div class="agent-task-todo-block">',
      `<form data-agent-task-todo-form="${escapeHtml(task.id)}"><input name="todo" type="text" maxlength="180" placeholder="记录下一步…" /><button type="submit">添加 Todo</button></form>`,
      '<div class="agent-task-todos">',
      ...(todos.length
        ? todos.map(todo => [
          `<label class="${todo.done ? 'done' : ''}">`,
          `<input type="checkbox" data-agent-task-todo-toggle="${escapeHtml(todo.id)}" data-task-id="${escapeHtml(task.id)}"${todo.done ? ' checked' : ''} />`,
          `<span>${escapeHtml(todo.text)}</span>`,
          `<button type="button" data-agent-task-todo-delete="${escapeHtml(todo.id)}" data-task-id="${escapeHtml(task.id)}">删除</button>`,
          '</label>',
        ].join(''))
        : ['<p class="agent-task-empty-copy">暂无 Todo</p>']),
      '</div>',
      '</div>',
      '<div class="agent-session-list">',
      ...sessions.map(session => agentSessionCardHtml(session, task.id)),
      '</div>',
      '</article>',
    ].join('')
  }).join('')
  const looseSection = [
    '<section class="agent-loose-session-block">',
    `<div><strong>待归组 Session</strong><span>${loose.length}</span></div>`,
    '<p>Session 只有状态和过程，不代表你的任务进度。</p>',
    '<div class="agent-session-list">',
    ...loose.map(({ task, session }) => agentSessionCardHtml(session, task.id, { steps: false })),
    '</div>',
    '</section>',
  ].join('')
  agentTaskList.innerHTML = taskCards + looseSection
  if (state.activeTab === 'tasks' && state.focusedTaskId) {
    requestAnimationFrame(() => {
      const card = agentTaskList.querySelector(`[data-agent-task-id="${CSS.escape(state.focusedTaskId)}"]`)
      card?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }
}

function agentSessionByKey(key) {
  for (const task of state.agentTasks.tasks) {
    const session = (task.sessions || []).find(item => item.key === key)
    if (session) return session
  }
  return null
}

async function refreshAgentTasks() {
  refreshAgentTasksButton.disabled = true
  refreshAgentTasksButton.textContent = '刷新中…'
  try {
    state.agentTasks = normalizeAgentTasks(await window.pet.agentTaskBoard())
  } catch (error) {
    showToast(`读取任务进度失败：${error?.message || error}`)
  } finally {
    refreshAgentTasksButton.disabled = false
    refreshAgentTasksButton.textContent = '刷新'
    render()
  }
}

async function mutateAgentTasks(action, successText = '') {
  try {
    const result = await action()
    if (!result?.ok) {
      showToast(`任务操作失败：${result?.error || '未知错误'}`)
      return false
    }
    state.agentTasks = normalizeAgentTasks(result.state)
    if (successText) showToast(successText)
    render()
    return true
  } catch (error) {
    showToast(`任务操作失败：${error?.message || error}`)
    return false
  }
}

async function assignAgentSession(select) {
  const sessionKey = select.dataset.agentSessionGroup
  const currentTaskId = select.dataset.currentTask
  const value = select.value
  if (!sessionKey || !value || value === currentTaskId) return
  if (value === '__loose__') {
    select.disabled = true
    await mutateAgentTasks(
      () => window.pet.detachAgentSession({ sessionKey }),
      'Session 已移到待归组',
    )
    select.disabled = false
    return
  }
  let request = { sessionKey, taskId: value }
  if (value === '__new__') {
    const session = agentSessionByKey(sessionKey)
    select.disabled = true
    const title = await openAgentTaskDialog({
      title: '新建任务并归组',
      description: '创建一个属于你的任务，并把当前 Session 直接归入其中。Session 的运行进度不会覆盖任务进度。',
      initialValue: session?.title || '',
      submitLabel: '创建并归组',
    })
    if (!title) {
      select.value = currentTaskId
      select.disabled = false
      return
    }
    request = { sessionKey, title }
  }
  select.disabled = true
  try {
    const result = await window.pet.assignAgentSession(request)
    if (!result?.ok) {
      showToast(`归组失败：${result?.error || '未知错误'}`)
      select.value = currentTaskId
      return
    }
    state.agentTasks = normalizeAgentTasks(result.state)
    showToast('Session 已归入任务')
  } catch (error) {
    showToast(`归组失败：${error?.message || error}`)
    select.value = currentTaskId
  } finally {
    select.disabled = false
    render()
  }
}

async function createAgentTask({ sessionKey = '', initialTitle = '' } = {}) {
  const session = sessionKey ? agentSessionByKey(sessionKey) : null
  const title = await openAgentTaskDialog({
    title: sessionKey ? '新建任务并归组' : '新建任务',
    description: sessionKey
      ? '创建一个属于你的任务，并把选中的 Session 直接归入其中。'
      : '记录你今天真正要完成的事项，之后可以把多个 Session 归到这个任务下。',
    initialValue: initialTitle || session?.title || '',
    submitLabel: sessionKey ? '创建并归组' : '创建任务',
  })
  if (!title) return false

  createAgentTaskButton.disabled = true
  const changed = await mutateAgentTasks(
    () => sessionKey
      ? window.pet.assignAgentSession({ sessionKey, title })
      : window.pet.createAgentTaskGroup({ title }),
    sessionKey ? '已创建任务并归入 Session' : '已创建今日任务',
  )
  createAgentTaskButton.disabled = false
  if (!changed) return false

  const matchingTask = userAgentTasks()
    .filter(task => task.title === title)
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))[0]
  if (matchingTask) {
    state.focusedTaskId = matchingTask.id
    render()
  }
  return true
}

async function renameAgentTask(taskId) {
  const task = state.agentTasks.tasks.find(item => item.id === taskId)
  if (!task) return
  const title = await openAgentTaskDialog({
    eyebrow: 'EDIT MY TASK',
    title: '重命名任务',
    description: '这里只修改你定义的任务名称，不会改动关联 Session 的标题或运行状态。',
    initialValue: task.title || '',
    submitLabel: '保存名称',
  })
  if (!title || title === task.title) return
  try {
    const result = await window.pet.renameAgentTask({ taskId, title })
    if (!result?.ok) {
      showToast(`重命名失败：${result?.error || '未知错误'}`)
      return
    }
    state.agentTasks = normalizeAgentTasks(result.state)
    showToast('任务名称已更新')
    render()
  } catch (error) {
    showToast(`重命名失败：${error?.message || error}`)
  }
}

async function deleteAgentTask(taskId) {
  const task = state.agentTasks.tasks.find(item => item.id === taskId)
  if (!task) return
  const confirmed = await openAgentTaskDialog({
    eyebrow: 'DELETE MY TASK',
    title: `删除“${task.title}”？`,
    description: '关联 Session 会回到待归组，Session 记录不会丢失；这个任务下的 Todo 会被删除。',
    submitLabel: '删除任务',
    requiresInput: false,
    danger: true,
  })
  if (!confirmed) return
  const deleted = await mutateAgentTasks(
    () => window.pet.deleteAgentTaskGroup({ taskId }),
    '任务已删除，Session 已回到待归组',
  )
  if (deleted) state.focusedTaskId = ''
}

function priorityLabel(value) {
  return {
    critical: 'P0 · 紧急',
    high: 'P1 · 高',
    medium: 'P2 · 中',
    low: 'P3 · 低',
  }[value] || value
}

function statusLabel(value) {
  return {
    open: '待处理',
    running: '执行中',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[value] || value
}

function workItemAgentHtml(item) {
  const agent = item.agent || {}
  if (agent.status === 'running') {
    return '<div class="work-item-agent-result"><strong>Agent 正在处理</strong>完成后会把结果和依据保存在这里。</div>'
  }
  if (agent.status === 'failed' && agent.error) {
    return `<div class="work-item-agent-result"><strong>Agent 调度失败</strong>${escapeHtml(agent.error)}</div>`
  }
  const result = agent.result
  if (!result || typeof result !== 'object') return ''
  const plan = Array.isArray(result.plan) && result.plan.length
    ? `<ul>${result.plan.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
    : ''
  const evidence = Array.isArray(result.evidence) && result.evidence.length
    ? `<p><small>依据：${escapeHtml(result.evidence.join(' · '))}</small></p>`
    : ''
  const next = result.nextStep ? `<p><small>下一步：${escapeHtml(result.nextStep)}</small></p>` : ''
  const syncError = agent.syncError ? `<p><small>任务同步失败：${escapeHtml(agent.syncError)}</small></p>` : ''
  return [
    '<div class="work-item-agent-result">',
    `<strong>Agent · ${escapeHtml(result.outcome || agent.status || '')}</strong>`,
    escapeHtml(result.summary || '已返回结果'),
    plan,
    evidence,
    next,
    syncError,
    '</div>',
  ].join('')
}

function renderWorkItems() {
  const activeCount = state.workItems.items.filter(item => !['done', 'cancelled'].includes(item.status)).length
  toggleWorkItemsButton.textContent = `工作项 ${activeCount}`
  workItemStatus.textContent = `${activeCount} 个进行中 · ${state.workItems.items.length} 个全部`

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const statusOrder = { running: 0, open: 1, failed: 2, done: 3, cancelled: 4 }
  const items = state.workItems.items.slice().sort((a, b) => (
    (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9)
    || (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    || Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
  ))
  if (!items.length) {
    workItemList.className = 'work-item-list empty'
    workItemList.textContent = '从消息分析结果中收录待办或风险点'
    return
  }
  workItemList.className = 'work-item-list'
  workItemList.innerHTML = items.map((item) => {
    const busy = state.workItemBusy.has(item.id) || item.agent?.status === 'running'
    const linked = Boolean(item.lark?.guid)
    const larkLabel = linked ? '打开飞书任务' : item.lark?.status === 'creating' ? '创建中…' : '转为飞书任务'
    const larkError = item.lark?.error
      ? `<div class="work-item-agent-result"><strong>飞书任务同步异常</strong>${escapeHtml(item.lark.error)}</div>`
      : ''
    return [
      `<article class="work-item-card ${item.status === 'done' ? 'done' : ''}" data-priority="${escapeHtml(item.priority)}">`,
      '<div class="work-item-title-row">',
      `<strong>${escapeHtml(item.title)}</strong>`,
      `<select data-work-item-priority="${escapeHtml(item.id)}" aria-label="优先级"${busy ? ' disabled' : ''}>`,
      ['critical', 'high', 'medium', 'low'].map(priority => (
        `<option value="${priority}"${item.priority === priority ? ' selected' : ''}>${priorityLabel(priority)}</option>`
      )).join(''),
      '</select>',
      '</div>',
      '<div class="work-item-meta">',
      `<span>${item.kind === 'risk' ? '风险点' : '待办'}</span>`,
      `<span>${escapeHtml(statusLabel(item.status))}</span>`,
      item.chatName ? `<span>来自 ${escapeHtml(item.chatName)}</span>` : '',
      item.dueAt ? `<span>截止 ${escapeHtml(item.dueAt)}</span>` : '',
      linked ? '<span>已关联飞书任务</span>' : '',
      '</div>',
      '<div class="work-item-actions">',
      `<button type="button" data-work-action="${linked ? 'open-lark-task' : 'create-lark-task'}" data-work-item-id="${escapeHtml(item.id)}"${busy ? ' disabled' : ''}>${larkLabel}</button>`,
      item.sourceUrl ? `<button type="button" data-work-action="open-source" data-work-item-id="${escapeHtml(item.id)}">原消息</button>` : '',
      `<button type="button" data-work-action="agent-plan" data-work-item-id="${escapeHtml(item.id)}"${busy ? ' disabled' : ''}>Agent 出计划</button>`,
      `<button class="agent-execute" type="button" data-work-action="agent-execute" data-work-item-id="${escapeHtml(item.id)}"${busy ? ' disabled' : ''}>Agent 执行</button>`,
      `<button type="button" data-work-action="toggle-done" data-work-item-id="${escapeHtml(item.id)}"${busy ? ' disabled' : ''}>${item.status === 'done' ? '重新打开' : '完成'}</button>`,
      '</div>',
      workItemAgentHtml(item),
      larkError,
      '</article>',
    ].join('')
  }).join('')
}

function rsvpLabel(value) {
  return {
    accept: '已接受',
    decline: '已拒绝',
    tentative: '待定',
    needs_action: '待回复',
  }[value] || value
}

function renderAgenda() {
  const events = state.agenda.events.slice().sort((a, b) => Date.parse(a.startAt || '') - Date.parse(b.startAt || ''))
  toggleAgendaButton.textContent = `会议 ${events.length}`
  refreshAgendaButton.disabled = state.agenda.loading
  refreshAgendaButton.textContent = state.agenda.loading ? '刷新中…' : '刷新日程'
  agendaStatus.textContent = state.agenda.error
    ? `日程读取异常：${state.agenda.error}`
    : `${events.length} 场 · ${state.agenda.range.start || '今天'} 至 ${state.agenda.range.end || '未来 7 天'}`
  if (!events.length) {
    agendaList.className = 'work-item-list agenda-list empty'
    agendaList.textContent = state.agenda.loading ? '正在读取飞书日程…' : '近期没有日程'
    return
  }
  agendaList.className = 'work-item-list agenda-list'
  agendaList.innerHTML = events.map((event) => {
    const time = event.allDay
      ? `${fmtTime(event.startAt, true) || event.startAt} · 全天`
      : `${fmtTime(event.startAt, true)} – ${fmtTime(event.endAt)}`
    const meta = [
      time,
      event.organizer ? `组织者 ${event.organizer}` : '',
      event.rsvp ? rsvpLabel(event.rsvp) : '',
    ].filter(Boolean)
    return [
      '<article class="agenda-card">',
      `<div class="agenda-time">${escapeHtml(time)}</div>`,
      `<strong>${escapeHtml(event.title || '未命名日程')}</strong>`,
      meta.length > 1 ? `<p>${escapeHtml(meta.slice(1).join(' · '))}</p>` : '',
      '<div class="work-item-actions">',
      event.url ? `<button type="button" data-agenda-url="${escapeHtml(event.url)}">打开日程</button>` : '',
      event.meetingUrl ? `<button class="agent-execute" type="button" data-agenda-url="${escapeHtml(event.meetingUrl)}">加入会议</button>` : '',
      '</div>',
      '</article>',
    ].join('')
  }).join('')
}

function knowledgeSourceLabel(value) {
  return {
    bytetech: 'ByteTech',
    github: 'GitHub',
    lark: '飞书文档',
    x: 'X',
    idea: '想法',
    link: '链接',
  }[value] || value
}

function knowledgeSummaryHtml(item) {
  if (item.agent?.status === 'running') {
    return '<div class="knowledge-summary"><strong>Agent 正在阅读并总结…</strong></div>'
  }
  if (item.agent?.status === 'failed') {
    return `<div class="knowledge-summary"><strong>总结失败</strong><br />${escapeHtml(item.agent.error || '未知错误')}</div>`
  }
  const summary = item.summary
  if (!summary || typeof summary !== 'object') return ''
  const highlights = Array.isArray(summary.highlights) && summary.highlights.length
    ? `<ul>${summary.highlights.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`
    : ''
  const followUps = Array.isArray(summary.followUps) && summary.followUps.length
    ? `<p><small>可继续：${escapeHtml(summary.followUps.join(' · '))}</small></p>`
    : ''
  return [
    '<div class="knowledge-summary">',
    `<strong>${escapeHtml(summary.summary || '已总结')}</strong>`,
    summary.whyItMatters ? `<p>${escapeHtml(summary.whyItMatters)}</p>` : '',
    highlights,
    followUps,
    '</div>',
  ].join('')
}

function renderKnowledge() {
  toggleKnowledgeButton.textContent = `知识库 ${state.knowledge.count}`
  knowledgeStatus.textContent = `${state.knowledge.count} 条内容 · ${state.knowledge.summarizedCount} 条已总结 · ${state.knowledge.ideaCount} 个想法`
  knowledgeLibraryCount.textContent = `${state.knowledge.count} 条`

  knowledgeResultsSection.hidden = !state.knowledgeSearching && !state.knowledgeResults.length
  knowledgeResultMeta.textContent = state.knowledgeSearching
    ? '检索中…'
    : state.knowledgeResultLabel || `${state.knowledgeResults.length} 条`
  if (state.knowledgeSearching) {
    knowledgeResults.innerHTML = '<div class="knowledge-result"><p>正在读取结构化结果…</p></div>'
  } else {
    knowledgeResults.innerHTML = state.knowledgeResults.length
      ? state.knowledgeResults.map((result) => {
          const saved = result.saved || Boolean(result.url && state.knowledge.items.some(item => item.sourceKey === result.url))
          return [
            '<article class="knowledge-result">',
            '<div class="knowledge-result-top">',
            '<div>',
            `<strong>${escapeHtml(result.title || result.url || '未命名内容')}</strong>`,
            `<p><span class="knowledge-source-badge">${escapeHtml(knowledgeSourceLabel(result.source))}</span>${escapeHtml([result.author, result.meta].filter(Boolean).join(' · '))}</p>`,
            '</div>',
            `<button type="button" data-knowledge-save="${escapeHtml(result.key)}"${saved ? ' disabled' : ''}>${saved ? '已收藏' : '收藏'}</button>`,
            '</div>',
            result.snippet ? `<p>${escapeHtml(shortText(result.snippet, 260))}</p>` : '',
            '</article>',
          ].join('')
        }).join('')
      : '<div class="knowledge-result"><p>没有找到匹配内容</p></div>'
  }

  const items = state.knowledge.items.slice().sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
  if (!items.length) {
    knowledgeList.className = 'knowledge-list empty'
    knowledgeList.textContent = '搜索并收藏内容，或先记下一个想法'
    return
  }
  knowledgeList.className = 'knowledge-list'
  knowledgeList.innerHTML = items.map((item) => {
    const busy = state.knowledgeBusy.has(item.id) || item.agent?.status === 'running'
    const tags = Array.isArray(item.tags) && item.tags.length
      ? `<div class="knowledge-tags">${item.tags.map(tag => `<span>#${escapeHtml(tag)}</span>`).join('')}</div>`
      : ''
    return [
      '<article class="knowledge-card">',
      '<div class="knowledge-card-top">',
      '<div>',
      `<strong><span class="knowledge-source-badge">${escapeHtml(knowledgeSourceLabel(item.source))}</span>${escapeHtml(item.title)}</strong>`,
      `<p>${escapeHtml([item.author, item.meta, fmtTime(item.createdAt, true)].filter(Boolean).join(' · '))}</p>`,
      '</div>',
      '</div>',
      item.snippet ? `<p>${escapeHtml(shortText(item.snippet, 300))}</p>` : '',
      tags,
      '<div class="knowledge-card-actions">',
      item.url ? `<button type="button" data-knowledge-action="open" data-knowledge-id="${escapeHtml(item.id)}">打开原文</button>` : '',
      `<button type="button" data-knowledge-action="summarize" data-knowledge-id="${escapeHtml(item.id)}"${busy ? ' disabled' : ''}>${item.summary ? '重新总结' : 'Agent 总结'}</button>`,
      '</div>',
      knowledgeSummaryHtml(item),
      '</article>',
    ].join('')
  }).join('')
}

function render() {
  renderWorkbenchNavigation()
  renderStatus()
  renderMessageList()
  renderDetail()
  renderAgentTasks()
  renderAgenda()
  renderWorkItems()
  renderKnowledge()
}

async function refreshAgenda() {
  state.agenda = { ...state.agenda, loading: true, error: '' }
  render()
  try {
    state.agenda = normalizeAgenda(await window.pet.refreshLarkAgenda())
  } catch (error) {
    state.agenda = { ...state.agenda, loading: false, error: error?.message || String(error) }
  }
  render()
}

async function refreshInbox() {
  state.inbox = { ...state.inbox, loading: true, error: '' }
  render()
  try {
    state.inbox = normalizeInbox(await window.pet.refreshLarkInbox())
  } catch (error) {
    state.inbox = { ...state.inbox, loading: false, error: error?.message || String(error) }
  }
  render()
}

async function analyzeSelected() {
  const message = selectedMessage()
  if (!message) return
  state.assistant.results[message.messageId] = {
    messageId: message.messageId,
    status: 'running',
  }
  render()
  try {
    const result = await window.pet.analyzeLarkMessage({ messageId: message.messageId })
    state.assistant.results[message.messageId] = result
    if (!result?.ok) showToast(`理解失败：${result?.error || '未知错误'}`)
  } catch (error) {
    state.assistant.results[message.messageId] = {
      messageId: message.messageId,
      status: 'failed',
      error: error?.message || String(error),
    }
  }
  render()
}

async function openOriginal() {
  const message = selectedMessage()
  if (!message) return
  const result = await window.pet.openTarget({
    kind: 'lark',
    chatId: message.chatId,
    messageId: message.messageId,
    label: message.chatName || '飞书消息',
  })
  if (!result?.ok) showToast(`打开失败：${result?.error || '未知错误'}`)
}

function currentDraft() {
  return String(document.getElementById('reply-draft')?.value || '').trim()
}

async function copyDraft() {
  const draft = currentDraft()
  if (!draft) return showToast('草稿为空')
  await window.pet.copyText(draft)
  showToast('草稿已复制')
}

async function applyDraft() {
  const message = selectedMessage()
  const draft = currentDraft()
  if (!message || !draft) return showToast('草稿为空')
  const button = detail.querySelector('[data-action="apply-draft"]')
  if (button) {
    button.disabled = true
    button.textContent = '正在应用…'
  }
  try {
    const result = await window.pet.applyLarkDraft({ messageId: message.messageId, draft })
    if (!result?.ok) showToast(`应用失败：${result?.error || '未知错误'}`)
    else if (result.applied) showToast('已填入飞书输入框，请检查后手动发送')
    else showToast('草稿已复制并打开飞书；自动粘贴不可用，请手动粘贴')
  } catch (error) {
    showToast(`应用失败：${error?.message || error}`)
  }
  renderDetail()
}

async function refreshWorkItems() {
  state.workItems = normalizeWorkItems(await window.pet.workItemsState())
  render()
  return state.workItems
}

async function captureExtractedItem(kind, index, action = 'local') {
  const message = selectedMessage()
  if (!message) return
  const sourceKey = `${message.messageId}:${kind}:${index}`
  if (state.extractionBusy.has(sourceKey)) return
  state.extractionBusy.add(sourceKey)
  render()
  try {
    const result = await window.pet.createWorkItemFromAssistant({
      messageId: message.messageId,
      kind,
      index,
    })
    if (!result?.ok) {
      showToast(`收录失败：${result?.error || '未知错误'}`)
      return
    }
    const id = result.item?.id
    let followUp = null
    if (action === 'lark') {
      followUp = await window.pet.createLarkTaskFromWorkItem({ id })
    } else if (action === 'plan' || action === 'execute') {
      followUp = await window.pet.runWorkItemAgent({ id, mode: action })
    }
    await refreshWorkItems()
    state.activeTab = 'work-items'
    render()
    if (followUp && !followUp.ok) {
      showToast(`操作失败：${followUp.error || '未知错误'}`)
    } else if (action === 'lark') {
      showToast('已收录并创建飞书任务')
    } else if (action === 'plan') {
      showToast(followUp?.result?.outcome === 'planned' ? '已收录并生成 Agent 计划' : 'Agent 需要补充信息')
    } else if (action === 'execute') {
      showToast(followUp?.result?.outcome === 'completed' ? 'Agent 已执行并完成工作项' : 'Agent 已返回，请查看结果')
    } else {
      showToast(result.created ? '已收为工作项' : '这个工作项已经收录')
    }
  } catch (error) {
    showToast(`收录失败：${error?.message || error}`)
  } finally {
    state.extractionBusy.delete(sourceKey)
    render()
  }
}

async function runWorkItemAction(id, action, successText) {
  if (!id || state.workItemBusy.has(id)) return
  state.workItemBusy.add(id)
  render()
  try {
    const result = await action()
    await refreshWorkItems()
    if (!result?.ok) showToast(`操作失败：${result?.error || '未知错误'}`)
    else if (successText) showToast(typeof successText === 'function' ? successText(result) : successText)
    return result
  } catch (error) {
    showToast(`操作失败：${error?.message || error}`)
    return { ok: false, error: error?.message || String(error) }
  } finally {
    state.workItemBusy.delete(id)
    render()
  }
}

async function syncAllWorkItems() {
  syncWorkItemsButton.disabled = true
  syncWorkItemsButton.textContent = '同步中…'
  try {
    const result = await window.pet.syncWorkItems({})
    await refreshWorkItems()
    if (!result?.ok) showToast('部分飞书任务同步失败，请查看工作项详情')
    else showToast('飞书任务状态已同步')
  } catch (error) {
    showToast(`同步失败：${error?.message || error}`)
  } finally {
    syncWorkItemsButton.disabled = false
    syncWorkItemsButton.textContent = '同步飞书任务'
  }
}

async function syncWorkItemsInBackground() {
  try {
    const result = await window.pet.syncWorkItems({})
    state.workItems = normalizeWorkItems(result?.state || await window.pet.workItemsState())
    render()
  } catch {
    // Manual sync remains available with a visible error path.
  }
}

async function refreshKnowledge() {
  state.knowledge = normalizeKnowledge(await window.pet.knowledgeState())
  render()
  return state.knowledge
}

async function searchKnowledge(source) {
  const query = knowledgeQuery.value.trim()
  if (source === 'lark' && !query) return showToast('查飞书文档时请先输入主题')
  state.knowledgeSearching = true
  state.knowledgeResults = []
  state.knowledgeResultLabel = ''
  render()
  try {
    const result = await window.pet.searchKnowledge({ source, query })
    if (!result?.ok) {
      showToast(`检索失败：${result?.error || '未知错误'}`)
      state.knowledgeResults = []
      state.knowledgeResultLabel = '检索失败'
    } else {
      state.knowledgeResults = Array.isArray(result.results) ? result.results : []
      state.knowledgeResultLabel = `${knowledgeSourceLabel(result.source)} · ${result.query || '热门'} · ${state.knowledgeResults.length} 条`
    }
  } catch (error) {
    state.knowledgeResults = []
    state.knowledgeResultLabel = '检索失败'
    showToast(`检索失败：${error?.message || error}`)
  } finally {
    state.knowledgeSearching = false
    render()
  }
}

async function saveKnowledgeSearchResult(key) {
  if (!key) return
  try {
    const result = await window.pet.saveKnowledgeResult({ key })
    if (!result?.ok) {
      showToast(`收藏失败：${result?.error || '未知错误'}`)
      return
    }
    state.knowledgeResults = state.knowledgeResults.map(item => item.key === key ? { ...item, saved: true } : item)
    await refreshKnowledge()
    showToast(result.created ? '已沉淀到个人知识库' : '这条内容已经收藏')
  } catch (error) {
    showToast(`收藏失败：${error?.message || error}`)
  }
}

async function saveIdea() {
  const text = ideaInput.value.trim()
  if (!text) return showToast('先写下一条想法')
  saveIdeaButton.disabled = true
  try {
    const result = await window.pet.captureKnowledgeIdea({ text })
    if (!result?.ok) showToast(`保存失败：${result?.error || '未知错误'}`)
    else {
      ideaInput.value = ''
      await refreshKnowledge()
      showToast('想法已保存')
    }
  } catch (error) {
    showToast(`保存失败：${error?.message || error}`)
  } finally {
    saveIdeaButton.disabled = false
  }
}

async function captureClipboardKnowledge() {
  captureClipboardButton.disabled = true
  captureClipboardButton.textContent = '收集中…'
  try {
    const result = await window.pet.captureKnowledgeClipboard()
    if (!result?.ok) showToast(`收集失败：${result?.error || '未知错误'}`)
    else {
      await refreshKnowledge()
      showToast(result.created ? `已收集：${result.item?.title || '剪贴板内容'}` : '这条内容已经收藏')
    }
  } catch (error) {
    showToast(`收集失败：${error?.message || error}`)
  } finally {
    captureClipboardButton.disabled = false
    captureClipboardButton.textContent = '收集剪贴板'
  }
}

async function summarizeKnowledge(id) {
  if (!id || state.knowledgeBusy.has(id)) return
  state.knowledgeBusy.add(id)
  render()
  try {
    const result = await window.pet.summarizeKnowledgeItem({ id })
    await refreshKnowledge()
    if (!result?.ok) showToast(`总结失败：${result?.error || '未知错误'}`)
    else showToast('Agent 总结已沉淀')
  } catch (error) {
    showToast(`总结失败：${error?.message || error}`)
  } finally {
    state.knowledgeBusy.delete(id)
    render()
  }
}

messageList.addEventListener('click', (event) => {
  const row = event.target.closest('[data-message-id]')
  if (!row) return
  state.selectedId = row.dataset.messageId
  render()
})

detail.addEventListener('input', (event) => {
  if (event.target.id === 'reply-draft' && state.selectedId) {
    state.draftEdits.set(state.selectedId, event.target.value)
  }
})

detail.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action
  if (action === 'analyze') analyzeSelected()
  if (action === 'open-original') openOriginal()
  if (action === 'copy-draft') copyDraft()
  if (action === 'apply-draft') applyDraft()
  const capture = event.target.closest('[data-capture-action]')
  if (capture) {
    captureExtractedItem(
      capture.dataset.captureKind,
      Number(capture.dataset.captureIndex),
      capture.dataset.captureAction,
    )
  }
  const doc = event.target.closest('[data-open-doc]')?.dataset.openDoc
  if (doc) {
    event.preventDefault()
    window.pet.openTarget({ url: doc })
  }
})

workbenchTabs.forEach((button) => {
  button.addEventListener('click', () => setActiveWorkbenchTab(button.dataset.workbenchTab))
})

closeAgentTasksButton.addEventListener('click', () => setActiveWorkbenchTab('messages'))

refreshAgentTasksButton.addEventListener('click', refreshAgentTasks)
createAgentTaskButton.addEventListener('click', () => createAgentTask())

agentTaskDialogForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (!agentTaskDialogRequiresInput) {
    finishAgentTaskDialog(true)
    return
  }
  const title = agentTaskDialogInput.value.trim()
  if (!title) {
    agentTaskDialogInput.setCustomValidity('请输入任务名称')
    agentTaskDialogInput.reportValidity()
    return
  }
  agentTaskDialogInput.setCustomValidity('')
  finishAgentTaskDialog(title)
})

agentTaskDialogInput.addEventListener('input', () => {
  agentTaskDialogInput.setCustomValidity('')
})

agentTaskDialogCancel.addEventListener('click', () => finishAgentTaskDialog(null))
agentTaskDialogClose.addEventListener('click', () => finishAgentTaskDialog(null))
agentTaskDialog.addEventListener('cancel', (event) => {
  event.preventDefault()
  finishAgentTaskDialog(null)
})
agentTaskDialog.addEventListener('close', () => {
  if (agentTaskDialogResolve) finishAgentTaskDialog(null)
})
agentTaskDialog.addEventListener('click', (event) => {
  if (event.target === agentTaskDialog) finishAgentTaskDialog(null)
})

agentTaskList.addEventListener('click', (event) => {
  const rename = event.target.closest('[data-agent-task-rename]')
  if (rename) {
    renameAgentTask(rename.dataset.agentTaskRename)
    return
  }
  const deleteTask = event.target.closest('[data-agent-task-delete]')
  if (deleteTask) {
    deleteAgentTask(deleteTask.dataset.agentTaskDelete)
    return
  }
  const visibility = event.target.closest('[data-agent-session-visibility]')
  if (visibility) {
    mutateAgentTasks(() => window.pet.ignoreAgentSession({
      sessionKey: visibility.dataset.agentSessionVisibility,
      ignored: visibility.dataset.ignored !== 'true',
    }))
    return
  }
  const deleteTodo = event.target.closest('[data-agent-task-todo-delete]')
  if (deleteTodo) {
    mutateAgentTasks(() => window.pet.deleteAgentTaskTodo({
      taskId: deleteTodo.dataset.taskId,
      todoId: deleteTodo.dataset.agentTaskTodoDelete,
    }))
    return
  }
  const open = event.target.closest('[data-agent-session-open]')
  if (!open) return
  const session = agentSessionByKey(open.dataset.agentSessionOpen)
  if (session?.target) window.pet.openTarget(session.target)
})

agentTaskList.addEventListener('input', (event) => {
  const progress = event.target.closest('[data-agent-task-progress]')
  if (!progress) return
  const output = progress.parentElement.querySelector('[data-agent-task-progress-output]')
  if (output) output.textContent = `${Math.round(Number(progress.value || 0))}%`
})

agentTaskList.addEventListener('change', (event) => {
  const select = event.target.closest('[data-agent-session-group]')
  if (select) {
    assignAgentSession(select)
    return
  }
  const progress = event.target.closest('[data-agent-task-progress]')
  if (progress) {
    mutateAgentTasks(() => window.pet.setAgentTaskProgress({
      taskId: progress.dataset.agentTaskProgress,
      progress: Number(progress.value || 0),
    }))
    return
  }
  const todo = event.target.closest('[data-agent-task-todo-toggle]')
  if (todo) {
    mutateAgentTasks(() => window.pet.updateAgentTaskTodo({
      taskId: todo.dataset.taskId,
      todoId: todo.dataset.agentTaskTodoToggle,
      done: todo.checked,
    }))
  }
})

agentTaskList.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-agent-task-todo-form]')
  if (!form) return
  event.preventDefault()
  const input = form.elements.namedItem('todo')
  const text = String(input?.value || '').trim()
  if (!text) return
  const added = await mutateAgentTasks(() => window.pet.addAgentTaskTodo({
    taskId: form.dataset.agentTaskTodoForm,
    text,
  }))
  if (added && input) input.value = ''
})

closeWorkItemsButton.addEventListener('click', () => setActiveWorkbenchTab('messages'))

syncWorkItemsButton.addEventListener('click', syncAllWorkItems)

closeKnowledgeButton.addEventListener('click', () => setActiveWorkbenchTab('messages'))

closeAgendaButton.addEventListener('click', () => setActiveWorkbenchTab('messages'))

refreshAgendaButton.addEventListener('click', refreshAgenda)
agendaList.addEventListener('click', (event) => {
  const url = event.target.closest('[data-agenda-url]')?.dataset.agendaUrl
  if (url) window.pet.openTarget({ url })
})

saveIdeaButton.addEventListener('click', saveIdea)
captureClipboardButton.addEventListener('click', captureClipboardKnowledge)
openXFeedButton.addEventListener('click', () => {
  window.pet.openTarget({ url: 'https://x.com/home' })
})

document.querySelectorAll('[data-knowledge-source]').forEach((button) => {
  button.addEventListener('click', () => searchKnowledge(button.dataset.knowledgeSource))
})

knowledgeResults.addEventListener('click', (event) => {
  const key = event.target.closest('[data-knowledge-save]')?.dataset.knowledgeSave
  if (key) saveKnowledgeSearchResult(key)
})

knowledgeList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-knowledge-action]')
  if (!button) return
  const id = button.dataset.knowledgeId
  const item = state.knowledge.items.find(value => value.id === id)
  if (!item) return
  if (button.dataset.knowledgeAction === 'open' && item.url) {
    window.pet.openTarget({ url: item.url })
  } else if (button.dataset.knowledgeAction === 'summarize') {
    summarizeKnowledge(id)
  }
})

workItemList.addEventListener('change', (event) => {
  const id = event.target.dataset.workItemPriority
  if (!id) return
  runWorkItemAction(
    id,
    () => window.pet.setWorkItemPriority({ id, priority: event.target.value }),
    '优先级已更新',
  )
})

workItemList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-work-action]')
  if (!button) return
  const id = button.dataset.workItemId
  const item = state.workItems.items.find(value => value.id === id)
  if (!item) return
  const action = button.dataset.workAction
  if (action === 'create-lark-task') {
    runWorkItemAction(id, () => window.pet.createLarkTaskFromWorkItem({ id }), '已创建并关联飞书任务')
  } else if (action === 'open-lark-task' && item.lark?.url) {
    window.pet.openTarget({ url: item.lark.url })
  } else if (action === 'open-source' && item.sourceUrl) {
    window.pet.openTarget({ url: item.sourceUrl })
  } else if (action === 'agent-plan') {
    runWorkItemAction(
      id,
      () => window.pet.runWorkItemAgent({ id, mode: 'plan' }),
      result => result?.result?.outcome === 'planned' ? 'Agent 计划已生成' : 'Agent 需要补充信息',
    )
  } else if (action === 'agent-execute') {
    runWorkItemAction(
      id,
      () => window.pet.runWorkItemAgent({ id, mode: 'execute' }),
      result => result?.result?.outcome === 'completed' ? 'Agent 已执行并完成工作项' : 'Agent 已返回，请查看结果',
    )
  } else if (action === 'toggle-done') {
    runWorkItemAction(
      id,
      () => window.pet.completeWorkItem({ id, completed: item.status !== 'done' }),
      item.status === 'done' ? '工作项已重新打开' : '工作项已完成',
    )
  }
})

attentionOnly.addEventListener('change', () => {
  state.attentionOnly = attentionOnly.checked
  render()
})

searchInput.addEventListener('input', () => {
  state.query = searchInput.value.trim()
  render()
})

refreshButton.addEventListener('click', refreshInbox)

window.pet.onLarkInboxUpdate?.((snapshot) => {
  state.inbox = normalizeInbox(snapshot)
  render()
})

window.pet.onLarkAssistantUpdate?.((assistant) => {
  state.assistant = normalizeAssistant(assistant)
  render()
})

window.pet.onLarkAgendaUpdate?.((agenda) => {
  state.agenda = normalizeAgenda(agenda)
  render()
})

window.pet.onWorkItemsUpdate?.((workItems) => {
  state.workItems = normalizeWorkItems(workItems)
  render()
})

window.pet.onAgentTaskBoardUpdate?.((tasks) => {
  state.agentTasks = normalizeAgentTasks(tasks)
  render()
})

window.pet.onKnowledgeUpdate?.((knowledge) => {
  state.knowledge = normalizeKnowledge(knowledge)
  render()
})

window.pet.onWorkbenchNavigate?.((request = {}) => {
  setActiveWorkbenchTab(request.tab, { taskId: request.taskId })
  if (request.action === 'create-task') {
    requestAnimationFrame(() => createAgentTask({
      sessionKey: String(request.sessionKey || ''),
      initialTitle: String(request.initialTitle || ''),
    }))
  }
})

Promise.all([
  window.pet.larkInbox?.(),
  window.pet.larkAssistantState?.(),
  window.pet.larkAgenda?.(),
  window.pet.workItemsState?.(),
  window.pet.agentTaskBoard?.(),
  window.pet.knowledgeState?.(),
]).then(([inbox, assistant, agenda, workItems, agentTasks, knowledge]) => {
  state.inbox = normalizeInbox(inbox)
  state.assistant = normalizeAssistant(assistant)
  state.agenda = normalizeAgenda(agenda)
  state.workItems = normalizeWorkItems(workItems)
  state.agentTasks = normalizeAgentTasks(agentTasks)
  state.knowledge = normalizeKnowledge(knowledge)
  render()
  syncWorkItemsInBackground()
}).catch((error) => {
  state.inbox = { ...state.inbox, error: error?.message || String(error) }
  render()
})

render()
