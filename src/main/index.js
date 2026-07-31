const { app, BrowserWindow, ipcMain, Tray, Menu, screen, shell, clipboard, dialog, globalShortcut, Notification } = require('electron')
const path = require('path')
const http = require('http')
const fs = require('fs')
const { spawn } = require('child_process')
const tokenUsage = require('./token-usage')
const { createPomodoro } = require('./pomodoro')
const { createCustomPetStyleStore } = require('./custom-pet-styles')
const { mapHookToEvent } = require('./hook-events')
const { createAgentEventContext } = require('./agent-event-context')
const { createAgentTaskBoard } = require('./agent-task-board')
const { larkChatUrls } = require('./lark-links')
const { larkPasteScript, selectLarkAppName } = require('./lark-draft-apply')
const { createLarkInbox } = require('./lark-inbox')
const { createLarkAgendaLoader } = require('./lark-agenda')
const { loadLarkAssistantCache, saveLarkAssistantCache } = require('./lark-assistant-cache')
const { createLarkMessageArchive } = require('./lark-message-archive')
const { createLarkBaseSink } = require('./lark-base-sink')
const { createLarkWebPush } = require('./lark-web-push')
const { createWorkItemStore } = require('./work-items')
const { buildWorkItemAgentPrompt, normalizeMode, parseWorkItemAgentResult } = require('./work-item-agent')
const { createKnowledgeHub } = require('./knowledge-hub')
const { buildKnowledgeSummaryPrompt, parseKnowledgeSummary } = require('./knowledge-agent')
const { enrichTraeEvent } = require('./trae-context')
const { HOOK_AGENTS } = require('./agents/registry')
const {
  normalizeTerminalLauncher,
  codexThreadTargetForDetectedHost,
  isCmuxAppPath,
  isOrcaAppPath,
  selectOrcaTerminal,
  shouldPreferOrca,
  shouldUseDetectedHostBeforeLauncher,
  shouldTryCmux,
  orderAgentCandidates,
} = require('./terminal-launcher')
const {
  registerAutoUpdater,
  checkForUpdates,
  installDownloadedUpdate,
  getUpdateStatus,
  disposeAutoUpdater,
} = require('./updater')
const {
  analyzeLarkMessage,
  bridgeTasks: loadBridgeTasks,
  runCodexTask,
  shareBridgeTasks: createBridgeTasksShare,
  shareSession: createSessionShare,
} = require('./bridge-client')
const { createCodexSessionTitleResolver, isCodexDesktopTranscript } = require('./codex-session-index')

// Local hook receiver port — declared early; referenced by top-level consts
// (e.g. KODAMA_HOOK_CURL) that would otherwise hit the temporal dead zone.
const LOCAL_AGENT_PORT = 7766

let win
let larkWorkbenchWin
let pendingWorkbenchNavigation = {
  tab: 'messages',
  taskId: '',
  action: '',
  sessionKey: '',
  initialTitle: '',
}
let lastUiSettings = null
let tray
let pomodoro = null
let sedentaryTimer = null
let accessoryMenuState = null
let petUiMenuState = { dndMode: false, soundEnabled: true, notificationsEnabled: true }
let localEventCount = 0
let lastLocalEvent = null
let lastHookReceipt = null
let lastIgnoredHookReceipt = null
let lastTraeHookReceipt = null
let lastIgnoredTraeHookReceipt = null
let lastOpenedTarget = null
let petHidden = false
let petOverlayMouseIgnoreRequested = true
let petOverlayInteractionSuspended = false
let topmostTimers = []
let topmostInterval = null
let larkInbox = null
let larkArchive = null
let larkBaseSink = null
let larkWebPush = null
let larkAgenda = null
let larkAgendaTimer = null
let workItemStore = null
let workItemSyncTimer = null
let workItemSyncPending = null
let knowledgeHub = null
let agentTaskBoard = null
let customPetStyleStore = null
let larkAssistantResults = new Map()
let larkAssistantResultsLoaded = false
const larkAssistantPending = new Map()
const larkAssistantAutoQueued = new Set()
let larkAssistantAutoQueue = Promise.resolve()
const workItemAgentPending = new Map()
const knowledgeAgentPending = new Map()
let larkWorkbenchStatus = { phase: 'idle', error: '', updatedAt: '' }
const resolveCodexSessionTitle = createCodexSessionTitleResolver()

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  console.error('[kodama] another instance is already running; exiting duplicate process')
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  petHidden = false
  if (win && !win.isDestroyed()) {
    win.showInactive()
    win.moveTop?.()
    scheduleTopmostReassert()
  }
})

process.on('uncaughtException', (err) => {
  console.error(`[kodama] uncaught exception: ${err?.stack || err?.message || err}`)
})
process.on('unhandledRejection', (err) => {
  console.error(`[kodama] unhandled rejection: ${err?.stack || err?.message || err}`)
})

function sendToPet(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

function sendToLarkWorkbench(channel, payload) {
  if (larkWorkbenchWin && !larkWorkbenchWin.isDestroyed()) {
    larkWorkbenchWin.webContents.send(channel, payload)
  }
}

function applyPetOverlayMousePolicy() {
  if (!win || win.isDestroyed()) return
  const ignoreMouse = petOverlayInteractionSuspended || petOverlayMouseIgnoreRequested
  win.setIgnoreMouseEvents(ignoreMouse, ignoreMouse ? { forward: true } : undefined)
}

function setPetOverlayInteractionSuspended(suspended) {
  petOverlayInteractionSuspended = Boolean(suspended)
  applyPetOverlayMousePolicy()
}

function normalizeWorkbenchNavigation(request = {}) {
  const allowedTabs = new Set([
    'messages',
    'tasks',
    'work-items',
    'bridge',
    'agenda',
    'knowledge',
    'settings',
  ])
  const tab = allowedTabs.has(request?.tab) ? request.tab : 'messages'
  const action = tab === 'tasks' && request?.action === 'create-task' ? 'create-task' : ''
  return {
    tab,
    taskId: tab === 'tasks' ? String(request?.taskId || '').trim() : '',
    action,
    sessionKey: action ? String(request?.sessionKey || '').trim().slice(0, 500) : '',
    initialTitle: action ? String(request?.initialTitle || '').trim().slice(0, 120) : '',
  }
}

function sendWorkbenchNavigation() {
  const navigation = pendingWorkbenchNavigation
  sendToLarkWorkbench('pet:workbench-navigate', navigation)
  if (navigation.action) {
    pendingWorkbenchNavigation = {
      ...navigation,
      action: '',
      sessionKey: '',
      initialTitle: '',
    }
  }
}

function larkInboxStateFile() {
  return path.join(app.getPath('userData'), 'kodama-lark-inbox-state.json')
}

function getCustomPetStyleStore() {
  if (!customPetStyleStore) {
    customPetStyleStore = createCustomPetStyleStore({
      directory: path.join(app.getPath('userData'), 'custom-pet-styles'),
    })
  }
  return customPetStyleStore
}

function larkArchiveFile() {
  return path.join(app.getPath('userData'), 'kodama-lark-messages.jsonl')
}

function larkBaseSinkStateFile() {
  return path.join(app.getPath('userData'), 'kodama-lark-base-state.json')
}

function larkBaseSinkConfigFile() {
  return path.join(app.getPath('userData'), 'kodama-lark-base-config.json')
}

function startLarkArchive() {
  if (larkArchive) return larkArchive
  larkArchive = createLarkMessageArchive({
    file: larkArchiveFile(),
    onUpdate() {
      refreshTray()
    },
  })
  return larkArchive
}

function startLarkBaseSink() {
  if (larkBaseSink) return larkBaseSink
  larkBaseSink = createLarkBaseSink({
    configFile: larkBaseSinkConfigFile(),
    stateFile: larkBaseSinkStateFile(),
    onUpdate() {
      refreshTray()
    },
  })
  seedLarkBaseSinkFromArchive()
  return larkBaseSink
}

function larkBaseBackfillLimit() {
  const n = Number(process.env.KODAMA_LARK_BASE_BACKFILL_LIMIT || 2000)
  if (!Number.isFinite(n)) return 2000
  return Math.min(5000, Math.max(0, Math.round(n)))
}

function seedLarkBaseSinkFromArchive() {
  const summary = larkBaseSink?.getSummary?.()
  if (!summary?.enabled || !summary.baseTokenConfigured) return 0
  const archive = larkArchive || startLarkArchive()
  const archived = archive.getRecent(larkBaseBackfillLimit())
  const queued = larkBaseSink.ingest(archived)
  if (queued.length) console.error(`[kodama] queued ${queued.length} archived lark messages for base sync`)
  return queued.length
}

function archiveLarkMessages(messages, meta = {}) {
  const archived = startLarkArchive().ingest(messages, meta)
  if (archived.length) startLarkBaseSink().ingest(archived)
  return archived
}

function startLarkInbox() {
  if (larkInbox) return larkInbox
  larkInbox = createLarkInbox({
    stateFile: larkInboxStateFile(),
    onUpdate(snapshot, meta = {}) {
      sendToPet('pet:lark-inbox-updated', snapshot)
      sendToLarkWorkbench('pet:lark-inbox-updated', snapshot)
      archiveLarkMessages(snapshot.messages || [], { source: meta.reason || meta.source || 'inbox' })
      const newMessages = Array.isArray(meta.newMessages) ? meta.newMessages : []
      if (!newMessages.length) return
      scheduleLarkAttentionAnalysis(newMessages)
      const chatNames = Array.from(new Set(newMessages.map(message => message.chatName).filter(Boolean))).slice(0, 3)
      const first = newMessages[0] || {}
      emitRendererAgentEvent({
        type: 'lark_message_received',
        source: 'lark',
        text: `${chatNames.length || 1} 个群有 ${newMessages.length} 条新消息${chatNames.length ? `：${chatNames.join('、')}` : ''}`,
        chatId: first.chatId || '',
        messageId: first.messageId || '',
      })
    },
  })
  larkInbox.start()
  return larkInbox
}

function startLarkWebPush() {
  if (larkWebPush) return larkWebPush
  larkWebPush = createLarkWebPush({
    BrowserWindow,
    onStatus(status) {
      sendToPet('pet:lark-web-push-updated', status)
      refreshTray()
    },
    onMessages(messages, meta = {}) {
      if (!larkInbox) startLarkInbox()
      larkInbox.ingestMessages(messages, { ...meta, reason: 'web-push' })
    },
  })
  larkWebPush.start()
  return larkWebPush
}

function broadcastLarkAgenda(state) {
  const snapshot = state || larkAgenda?.getState?.() || {
    ok: true,
    loading: false,
    error: '',
    events: [],
    count: 0,
    updatedAt: '',
  }
  sendToPet('pet:lark-agenda-updated', snapshot)
  sendToLarkWorkbench('pet:lark-agenda-updated', snapshot)
  return snapshot
}

function refreshLarkAgenda() {
  return startLarkAgenda().refresh({ days: 7 })
}

function startLarkAgenda() {
  if (larkAgenda) return larkAgenda
  larkAgenda = createLarkAgendaLoader({
    onUpdate: broadcastLarkAgenda,
  })
  larkAgendaTimer = setInterval(refreshLarkAgenda, 30 * 60 * 1000)
  larkAgendaTimer.unref?.()
  setTimeout(refreshLarkAgenda, 1200).unref?.()
  return larkAgenda
}

function larkAssistantStateFile() {
  return path.join(app.getPath('userData'), 'kodama-lark-assistant.json')
}

function ensureLarkAssistantResultsLoaded() {
  if (larkAssistantResultsLoaded) return
  larkAssistantResults = loadLarkAssistantCache(larkAssistantStateFile())
  larkAssistantResultsLoaded = true
}

function persistLarkAssistantResults() {
  if (!larkAssistantResultsLoaded) return
  try {
    saveLarkAssistantCache(larkAssistantStateFile(), larkAssistantResults)
  } catch (error) {
    console.error(`[kodama] persist Lark assistant cache failed: ${error?.message || error}`)
  }
}

function larkAssistantState() {
  ensureLarkAssistantResultsLoaded()
  return {
    ok: true,
    results: Object.fromEntries(larkAssistantResults),
    pending: Array.from(larkAssistantPending.keys()),
    updatedAt: new Date().toISOString(),
  }
}

function broadcastLarkAssistantState() {
  persistLarkAssistantResults()
  const state = larkAssistantState()
  sendToPet('pet:lark-assistant-updated', state)
  sendToLarkWorkbench('pet:lark-assistant-updated', state)
  return state
}

function larkMessageContext(messages, target, limit = 16) {
  const targetTime = Date.parse(target?.createdAt || target?.createTime || '')
  return (Array.isArray(messages) ? messages : [])
    .filter(message => (
      message?.chatId === target?.chatId
      && message?.messageId !== target?.messageId
      && (!Number.isFinite(targetTime) || Date.parse(message?.createdAt || message?.createTime || '') <= targetTime)
    ))
    .sort((a, b) => Date.parse(a?.createdAt || a?.createTime || '') - Date.parse(b?.createdAt || b?.createTime || ''))
    .slice(-limit)
}

async function analyzeLarkInboxMessage(request = {}) {
  ensureLarkAssistantResultsLoaded()
  const messageId = String(request.messageId || request.message_id || '').trim()
  if (!messageId) return { ok: false, error: 'missing-message-id' }
  if (!larkInbox) startLarkInbox()
  const snapshot = larkInbox.getSnapshot()
  const message = (snapshot.messages || []).find(item => item.messageId === messageId)
  if (!message) return { ok: false, error: 'message-not-found' }
  if (larkAssistantPending.has(messageId)) return larkAssistantPending.get(messageId)

  larkAssistantResults.set(messageId, {
    messageId,
    status: 'running',
    error: '',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  broadcastLarkAssistantState()

  const pending = analyzeLarkMessage({
    message,
    contextMessages: larkMessageContext(snapshot.messages, message),
  }, {
    homeDir: app.getPath('home'),
  }).then((result) => {
    const record = result?.ok
      ? {
          messageId,
          status: 'done',
          error: '',
          traceId: result.traceId || '',
          analysis: result.analysis,
          startedAt: larkAssistantResults.get(messageId)?.startedAt || '',
          updatedAt: new Date().toISOString(),
        }
      : {
          messageId,
          status: 'failed',
          error: result?.error || '消息理解失败',
          startedAt: larkAssistantResults.get(messageId)?.startedAt || '',
          updatedAt: new Date().toISOString(),
        }
    larkAssistantResults.set(messageId, record)
    return { ok: result?.ok === true, ...record }
  }).catch((error) => {
    const record = {
      messageId,
      status: 'failed',
      error: error?.message || String(error),
      startedAt: larkAssistantResults.get(messageId)?.startedAt || '',
      updatedAt: new Date().toISOString(),
    }
    larkAssistantResults.set(messageId, record)
    return { ok: false, ...record }
  }).finally(() => {
    larkAssistantPending.delete(messageId)
    broadcastLarkAssistantState()
  })
  larkAssistantPending.set(messageId, pending)
  return pending
}

function scheduleLarkAttentionAnalysis(messages = []) {
  ensureLarkAssistantResultsLoaded()
  const candidates = (Array.isArray(messages) ? messages : [])
    .filter(message => message?.needsAttention && message?.messageId)
    .filter(message => !larkAssistantAutoQueued.has(message.messageId))
    .filter(message => !larkAssistantPending.has(message.messageId))
    .filter(message => larkAssistantResults.get(message.messageId)?.status !== 'done')
    .sort((a, b) => Date.parse(a.createdAt || a.createTime || '') - Date.parse(b.createdAt || b.createTime || ''))
    .slice(0, 20)

  for (const message of candidates) {
    const messageId = message.messageId
    larkAssistantAutoQueued.add(messageId)
    larkAssistantAutoQueue = larkAssistantAutoQueue
      .then(() => analyzeLarkInboxMessage({ messageId }))
      .catch((error) => {
        console.error(`[kodama] automatic Lark message analysis failed: ${error?.message || error}`)
      })
      .finally(() => {
        larkAssistantAutoQueued.delete(messageId)
      })
  }
  return candidates.length
}

function scheduleCurrentLarkAttentionAnalysis() {
  const messages = larkInbox?.getSnapshot?.().messages || []
  return scheduleLarkAttentionAnalysis(messages)
}

function workItemStateFile() {
  return path.join(app.getPath('userData'), 'kodama-work-items.json')
}

function broadcastWorkItemState(snapshot) {
  const state = snapshot || workItemStore?.getState?.() || {
    ok: true,
    items: [],
    count: 0,
    openCount: 0,
    runningCount: 0,
    updatedAt: new Date().toISOString(),
  }
  sendToPet('pet:work-items-updated', state)
  sendToLarkWorkbench('pet:work-items-updated', state)
  return state
}

function startWorkItemStore() {
  if (workItemStore) return workItemStore
  workItemStore = createWorkItemStore({
    file: workItemStateFile(),
    onUpdate: broadcastWorkItemState,
  })
  workItemSyncTimer = setInterval(syncWorkItemsInBackground, 180000)
  workItemSyncTimer.unref?.()
  setTimeout(syncWorkItemsInBackground, 5000).unref?.()
  return workItemStore
}

function agentTaskBoardStateFile() {
  return path.join(app.getPath('userData'), 'kodama-agent-task-board.json')
}

function broadcastAgentTaskBoard(snapshot) {
  const state = snapshot || agentTaskBoard?.getState?.() || {
    ok: true,
    tasks: [],
    todayTasks: [],
    counts: { total: 0, today: 0, running: 0, waiting: 0, done: 0, failed: 0 },
    updatedAt: new Date().toISOString(),
  }
  sendToPet('pet:agent-task-board-updated', state)
  sendToLarkWorkbench('pet:agent-task-board-updated', state)
  return state
}

function startAgentTaskBoard() {
  if (agentTaskBoard) return agentTaskBoard
  agentTaskBoard = createAgentTaskBoard({
    file: agentTaskBoardStateFile(),
  })
  if (!agentTaskBoard.getState().tasks.length) {
    try {
      const today = new Date().toDateString()
      const receipts = fs.readFileSync(hookReceiptLogFile(), 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-600)
        .map((line) => {
          try { return JSON.parse(line) } catch { return null }
        })
        .filter(receipt => (
          receipt?.mappedType
          && receipt?.receivedAt
          && new Date(receipt.receivedAt).toDateString() === today
        ))
      for (const receipt of receipts) {
        agentTaskBoard.record({
          ...(receipt.fields || {}),
          type: receipt.mappedType,
          source: 'local',
          text: receipt.mappedText || receipt.fields?.message || '',
          sessionId: receipt.mappedSessionId || receipt.fields?.sessionId || receipt.fields?.session_id || '',
          cwd: receipt.mappedCwd || receipt.fields?.cwd || '',
          receivedAt: receipt.receivedAt,
        })
      }
      if (receipts.length) agentTaskBoard.flush()
    } catch {
      // First launch or a rotated hook log: live events will populate the board.
    }
  }
  return agentTaskBoard
}

function trackAgentTaskEvent(event) {
  const result = startAgentTaskBoard().record(event)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
}

function syncWorkItemsInBackground() {
  if (workItemSyncPending) return workItemSyncPending
  const store = workItemStore || startWorkItemStore()
  if (!store.getState().items.some(item => item.lark?.guid)) {
    return Promise.resolve({ ok: true, results: [], state: store.getState() })
  }
  workItemSyncPending = store.syncAll()
    .catch((error) => {
      console.error(`[kodama] automatic Lark task sync failed: ${error?.message || error}`)
      return { ok: false, error: error?.message || String(error), state: store.getState() }
    })
    .finally(() => {
      workItemSyncPending = null
    })
  return workItemSyncPending
}

function createWorkItemFromAssistant(request = {}) {
  ensureLarkAssistantResultsLoaded()
  const messageId = String(request.messageId || request.message_id || '').trim()
  const kind = request.kind === 'risk' ? 'risk' : 'todo'
  const index = Number(request.index)
  if (!messageId || !Number.isInteger(index) || index < 0 || index > 50) {
    return { ok: false, error: 'invalid-assistant-item' }
  }
  const record = larkAssistantResults.get(messageId)
  if (record?.status !== 'done' || !record.analysis) {
    return { ok: false, error: 'assistant-analysis-not-ready' }
  }
  const source = kind === 'risk'
    ? record.analysis.risks?.[index]
    : record.analysis.todos?.[index]
  const title = kind === 'risk' ? String(source || '').trim() : String(source?.title || '').trim()
  if (!title) return { ok: false, error: 'assistant-item-not-found' }
  if (!larkInbox) startLarkInbox()
  const message = (larkInbox.getSnapshot().messages || []).find(item => item.messageId === messageId)
  if (!message) return { ok: false, error: 'message-not-found' }
  const sourceUrl = larkChatUrls(message.chatId, message.messageId)[0] || ''
  return startWorkItemStore().create({
    title,
    description: [
      kind === 'risk' ? 'Agent 从消息中识别出的风险点。' : 'Agent 从消息中识别出的待办。',
      record.analysis.summary ? `消息总结：${record.analysis.summary}` : '',
      record.analysis.intent ? `对方意图：${record.analysis.intent}` : '',
      message.content ? `原消息：${message.content}` : '',
    ].filter(Boolean).join('\n\n'),
    kind,
    priority: kind === 'risk' ? 'high' : source?.priority,
    dueAt: kind === 'todo' ? source?.dueAt : '',
    sourceKey: `${messageId}:${kind}:${index}`,
    messageId,
    chatId: message.chatId,
    chatName: message.chatName,
    sourceUrl,
  })
}

async function runWorkItemAgent(request = {}) {
  const id = String(request.id || '').trim()
  const mode = normalizeMode(request.mode)
  if (!id) return { ok: false, error: 'missing-work-item-id' }
  const store = startWorkItemStore()
  const item = store.find(id)
  if (!item) return { ok: false, error: 'work-item-not-found' }
  if (workItemAgentPending.has(id)) return workItemAgentPending.get(id)

  const startedAt = new Date().toISOString()
  store.patch(id, {
    status: mode === 'execute' ? 'running' : item.status,
    agent: {
      mode,
      status: 'running',
      error: '',
      startedAt,
      updatedAt: startedAt,
    },
  })

  const pending = runCodexTask({
    prompt: buildWorkItemAgentPrompt(item, mode),
    source: `kodama-work-item-${mode}`,
    contextKey: `kodama:work-item:${id}`,
  }, {
    homeDir: app.getPath('home'),
  }).then(async (result) => {
    if (!result?.ok) {
      const failed = store.patch(id, {
        status: mode === 'execute' ? 'failed' : item.status,
        agent: {
          mode,
          status: 'failed',
          error: result?.error || 'Agent 调度失败',
          updatedAt: new Date().toISOString(),
        },
      })
      return { ok: false, error: result?.error || 'Agent 调度失败', item: failed.item }
    }

    const parsed = parseWorkItemAgentResult(result.answer, mode)
    const agent = {
      mode,
      status: parsed.outcome,
      error: '',
      result: parsed,
      traceId: result.traceId || '',
      sessionId: result.sessionId || '',
      taskId: result.taskId || '',
      tokens: result.tokens || 0,
      startedAt,
      updatedAt: new Date().toISOString(),
    }
    if (mode === 'execute' && parsed.outcome === 'completed') {
      const completed = await store.setCompleted(id, true)
      const finalItem = completed.ok
        ? store.patch(id, { agent }).item
        : store.patch(id, {
            status: 'done',
            agent: { ...agent, syncError: completed.error || '飞书任务状态同步失败' },
          }).item
      return { ok: true, result: parsed, item: finalItem }
    }

    const status = mode === 'execute' && parsed.outcome === 'failed'
      ? 'failed'
      : mode === 'execute'
        ? 'open'
        : item.status
    const updated = store.patch(id, { status, agent })
    return { ok: true, result: parsed, item: updated.item }
  }).catch((error) => {
    const failed = store.patch(id, {
      status: mode === 'execute' ? 'failed' : item.status,
      agent: {
        mode,
        status: 'failed',
        error: error?.message || String(error),
        updatedAt: new Date().toISOString(),
      },
    })
    return { ok: false, error: error?.message || String(error), item: failed.item }
  }).finally(() => {
    workItemAgentPending.delete(id)
  })
  workItemAgentPending.set(id, pending)
  return pending
}

function knowledgeHubStateFile() {
  return path.join(app.getPath('userData'), 'kodama-knowledge-hub.json')
}

function broadcastKnowledgeState(snapshot) {
  const state = snapshot || knowledgeHub?.getState?.() || {
    ok: true,
    items: [],
    count: 0,
    summarizedCount: 0,
    ideaCount: 0,
    updatedAt: new Date().toISOString(),
  }
  sendToPet('pet:knowledge-updated', state)
  sendToLarkWorkbench('pet:knowledge-updated', state)
  return state
}

function startKnowledgeHub() {
  if (knowledgeHub) return knowledgeHub
  knowledgeHub = createKnowledgeHub({
    file: knowledgeHubStateFile(),
    onUpdate: broadcastKnowledgeState,
  })
  return knowledgeHub
}

async function searchKnowledge(request = {}) {
  try {
    return await startKnowledgeHub().search(request.source, request.query)
  } catch (error) {
    return { ok: false, error: error?.message || String(error), results: [] }
  }
}

async function summarizeKnowledgeItem(request = {}) {
  const id = String(request.id || '').trim()
  if (!id) return { ok: false, error: 'missing-knowledge-item-id' }
  const hub = startKnowledgeHub()
  const item = hub.find(id)
  if (!item) return { ok: false, error: 'knowledge-item-not-found' }
  if (knowledgeAgentPending.has(id)) return knowledgeAgentPending.get(id)

  const startedAt = new Date().toISOString()
  hub.patch(id, {
    agent: {
      status: 'running',
      error: '',
      startedAt,
      updatedAt: startedAt,
    },
  })
  const pending = runCodexTask({
    prompt: buildKnowledgeSummaryPrompt(item),
    source: 'kodama-knowledge-summary',
    contextKey: `kodama:knowledge:${id}`,
  }, {
    homeDir: app.getPath('home'),
  }).then((result) => {
    if (!result?.ok) {
      const failed = hub.patch(id, {
        agent: {
          status: 'failed',
          error: result?.error || '知识总结失败',
          updatedAt: new Date().toISOString(),
        },
      })
      return { ok: false, error: result?.error || '知识总结失败', item: failed.item }
    }
    const summary = parseKnowledgeSummary(result.answer)
    const updated = hub.patch(id, {
      summary,
      tags: summary.tags,
      agent: {
        status: 'done',
        error: '',
        traceId: result.traceId || '',
        sessionId: result.sessionId || '',
        taskId: result.taskId || '',
        tokens: result.tokens || 0,
        startedAt,
        updatedAt: new Date().toISOString(),
      },
    })
    return { ok: true, summary, item: updated.item }
  }).catch((error) => {
    const failed = hub.patch(id, {
      agent: {
        status: 'failed',
        error: error?.message || String(error),
        updatedAt: new Date().toISOString(),
      },
    })
    return { ok: false, error: error?.message || String(error), item: failed.item }
  }).finally(() => {
    knowledgeAgentPending.delete(id)
  })
  knowledgeAgentPending.set(id, pending)
  return pending
}

function combinedWorkAreaBounds(displays = screen.getAllDisplays()) {
  const areas = displays
    .map(display => display?.workArea)
    .filter(area => area && Number.isFinite(area.x) && Number.isFinite(area.y) && area.width > 0 && area.height > 0)
  if (!areas.length) return screen.getPrimaryDisplay().workArea
  const left = Math.min(...areas.map(area => area.x))
  const top = Math.min(...areas.map(area => area.y))
  const right = Math.max(...areas.map(area => area.x + area.width))
  const bottom = Math.max(...areas.map(area => area.y + area.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// Per-display work areas (screen coords) + the overlay window's origin and
// size. The renderer positions floating elements in window coords, so it
// needs the origin to translate these work areas and pick the display the
// pet sits on. The window size matters because on mixed-DPI setups (e.g. a
// scaled Retina main display + a 2x external) Chromium's CSS px do not map
// 1:1 onto screen DIPs — the renderer derives the scale from
// innerWidth/window.width.
function displayAreaSnapshot() {
  const areas = screen.getAllDisplays()
    .map(display => display?.workArea)
    .filter(area => area && Number.isFinite(area.x) && Number.isFinite(area.y) && area.width > 0 && area.height > 0)
  let origin
  let windowSize
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds()
    origin = { x: bounds.x, y: bounds.y }
    windowSize = { width: bounds.width, height: bounds.height }
  } else {
    const workArea = combinedWorkAreaBounds()
    origin = { x: workArea.x, y: workArea.y }
    windowSize = { width: workArea.width, height: workArea.height }
  }
  return { origin, window: windowSize, areas }
}

function sendDisplayAreasToPet() {
  sendToPet('pet:display-areas-changed', displayAreaSnapshot())
}

function createWindow() {
  const workArea = combinedWorkAreaBounds()

  win = new BrowserWindow({
    // Full visible-workarea transparent overlay across every display. The pet is
    // positioned *inside* this window (renderer petX/petY), so it can travel
    // between monitors instead of being trapped inside the primary display.
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    movable: false,
    transparent: true,
    frame: false,
    hasShadow: false, // otherwise a grey rectangle shadow shows around the model
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    // macOS: a non-activating NSPanel is what reliably floats over *other apps'*
    // native fullscreen spaces (not just the desktop). 'panel' adds
    // NSWindowStyleMaskNonactivatingPanel at runtime and joins all spaces; paired
    // with app.setActivationPolicy('accessory') in whenReady. A harmless
    // "NSWindow does not support nonactivating panel styleMask" warning is
    // expected for frameless windows (electron/electron#35815, wontfix).
    // https://www.electronjs.org/docs/latest/api/base-window (type: 'panel')
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  reassertTopmost()
  // Click-through by default; the renderer flips this on when the cursor is
  // over the model (forward:true keeps mousemove events flowing for hit-testing).
  petOverlayMouseIgnoreRequested = true
  applyPetOverlayMousePolicy()
  win.loadFile(path.join(__dirname, '../renderer/index.html'))
  // macOS resets collection behavior on show; re-assert so the pet floats over
  // other apps' fullscreen spaces, not just the desktop.
  win.once('ready-to-show', scheduleTopmostReassert)
  win.on('show', scheduleTopmostReassert)
  win.on('focus', scheduleTopmostReassert)
  win.on('blur', scheduleTopmostReassert)
  // Fresh window (re)load: the renderer caches the display work areas, so push
  // a snapshot once it can receive one (it also pulls via pet:get-display-areas).
  win.webContents.once('did-finish-load', sendDisplayAreasToPet)

  // Uncomment while debugging:
  // win.webContents.openDevTools({ mode: 'detach' })
}

function createBridgeTasksWindow() {
  return createLarkWorkbenchWindow({ tab: 'bridge' })
}

function createLarkWorkbenchWindow(request = {}) {
  pendingWorkbenchNavigation = normalizeWorkbenchNavigation(request)

  function showLarkWorkbenchWindow() {
    if (!larkWorkbenchWin || larkWorkbenchWin.isDestroyed()) return
    try {
      setPetOverlayInteractionSuspended(true)
      app.focus({ steal: true })
      larkWorkbenchWin.center()
      // The desktop pet is a screen-saver-level transparent overlay. Keep the
      // focused workbench one level above it so real macOS mouse events reach
      // the controls instead of falling through to the app behind Kodama.
      larkWorkbenchWin.setAlwaysOnTop(true, 'screen-saver', 2)
      larkWorkbenchWin.show()
      larkWorkbenchWin.focus()
      larkWorkbenchWin.moveTop?.()
      sendWorkbenchNavigation()
      larkWorkbenchStatus = { phase: 'visible', error: '', updatedAt: new Date().toISOString() }
    } catch (err) {
      setPetOverlayInteractionSuspended(false)
      larkWorkbenchStatus = { phase: 'show-failed', error: err.message, updatedAt: new Date().toISOString() }
      console.error(`[kodama] show Lark workbench failed: ${err.message}`)
    }
  }

  if (larkWorkbenchWin && !larkWorkbenchWin.isDestroyed()) {
    showLarkWorkbenchWindow()
    scheduleCurrentLarkAttentionAnalysis()
    return larkWorkbenchWin
  }

  larkWorkbenchWin = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 800,
    minHeight: 620,
    title: 'Kodama 工作台',
    show: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  larkWorkbenchStatus = { phase: 'created', error: '', updatedAt: new Date().toISOString() }
  larkWorkbenchWin.loadFile(path.join(__dirname, '../renderer/lark-workbench.html'))
    .catch((error) => {
      larkWorkbenchStatus = { phase: 'load-failed', error: error.message, updatedAt: new Date().toISOString() }
      console.error(`[kodama] load Lark workbench failed: ${error.message}`)
    })
  larkWorkbenchWin.once('ready-to-show', () => {
    larkWorkbenchStatus = { phase: 'ready-to-show', error: '', updatedAt: new Date().toISOString() }
    showLarkWorkbenchWindow()
  })
  larkWorkbenchWin.webContents.once('did-finish-load', () => {
    larkWorkbenchStatus = { phase: 'loaded', error: '', updatedAt: new Date().toISOString() }
    showLarkWorkbenchWindow()
    sendToLarkWorkbench('pet:lark-inbox-updated', larkInbox?.getSnapshot?.() || {})
    sendToLarkWorkbench('pet:lark-assistant-updated', larkAssistantState())
    sendToLarkWorkbench('pet:work-items-updated', startWorkItemStore().getState())
    sendToLarkWorkbench('pet:agent-task-board-updated', startAgentTaskBoard().getState())
    sendToLarkWorkbench('pet:knowledge-updated', startKnowledgeHub().getState())
    sendToLarkWorkbench('pet:lark-agenda-updated', startLarkAgenda().getState())
    sendWorkbenchNavigation()
    scheduleCurrentLarkAttentionAnalysis()
  })
  larkWorkbenchWin.webContents.on('did-fail-load', (_event, code, description) => {
    larkWorkbenchStatus = {
      phase: 'load-failed',
      error: `${code}: ${description}`,
      updatedAt: new Date().toISOString(),
    }
  })
  larkWorkbenchWin.webContents.on('render-process-gone', (_event, details) => {
    larkWorkbenchStatus = {
      phase: 'renderer-gone',
      error: details?.reason || 'renderer process gone',
      updatedAt: new Date().toISOString(),
    }
  })
  setTimeout(showLarkWorkbenchWindow, 800).unref?.()
  larkWorkbenchWin.on('show', () => {
    setPetOverlayInteractionSuspended(true)
    larkWorkbenchStatus = { phase: 'visible', error: '', updatedAt: new Date().toISOString() }
  })
  larkWorkbenchWin.on('focus', () => {
    setPetOverlayInteractionSuspended(true)
  })
  larkWorkbenchWin.on('blur', () => {
    setPetOverlayInteractionSuspended(false)
  })
  larkWorkbenchWin.on('hide', () => {
    setPetOverlayInteractionSuspended(false)
    larkWorkbenchStatus = { phase: 'hidden', error: '', updatedAt: new Date().toISOString() }
  })
  larkWorkbenchWin.on('closed', () => {
    setPetOverlayInteractionSuspended(false)
    larkWorkbenchStatus = { phase: 'closed', error: '', updatedAt: new Date().toISOString() }
    larkWorkbenchWin = null
  })
  return larkWorkbenchWin
}

function openManageWindow() {
  return createLarkWorkbenchWindow({ tab: 'settings' })
}

// Float above everything — including other apps' fullscreen spaces — on all desktops.
function reassertTopmost() {
  if (petHidden || !win || win.isDestroyed()) return
  if (!win.isVisible()) win.showInactive()
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  win.setAlwaysOnTop(true, 'screen-saver', 1)
  if (typeof win.moveTop === 'function') win.moveTop()
}

function scheduleTopmostReassert() {
  if (petHidden) return
  topmostTimers.forEach(clearTimeout)
  topmostTimers = [20, 250, 900].map(delay => setTimeout(reassertTopmost, delay))
}

function setPetHidden(hidden) {
  petHidden = Boolean(hidden)
  if (win && !win.isDestroyed()) {
    if (petHidden) {
      win.hide()
      notifyHiddenControls()
    } else {
      win.showInactive()
      scheduleTopmostReassert()
    }
  }
  refreshTray()
}

function showPetAndMaybeTogglePanel(togglePanel = false) {
  setPetHidden(false)
  if (togglePanel) setTimeout(() => sendToPet('pet:toggle-panel'), 80)
}

function resetPetPosition() {
  sendToPet('pet:apply-ui-patch', {
    petX: null,
    petY: null,
    petScale: 0.72,
    petOpacity: 0.82,
  })
}

function showPetAndResetPosition() {
  setPetHidden(false)
  setTimeout(resetPetPosition, 80)
}

function showPetAndEnterMoveMode() {
  setPetHidden(false)
  setTimeout(() => sendToPet('pet:enter-move-mode'), 80)
}

function notifyHiddenControls() {
  try {
    if (!Notification.isSupported()) return
    new Notification({
      title: 'Kodama 已隐藏',
      body: '按 ⌘⌥K 恢复，或在 kodama 目录运行 pnpm run show。',
    }).show()
  } catch {
    /* notification is best-effort */
  }
}

function loginItemOptions(openAtLogin = false) {
  if (app.isPackaged) return { openAtLogin }
  return {
    openAtLogin,
    path: process.execPath,
    args: [app.getAppPath()],
  }
}

function isLoginItemEnabled() {
  try {
    return app.getLoginItemSettings(loginItemOptions(false)).openAtLogin === true
  } catch {
    return false
  }
}

function setLoginItemEnabled(enabled) {
  try {
    app.setLoginItemSettings(loginItemOptions(enabled === true))
  } catch (err) {
    console.error(`[kodama] set login item failed: ${err.message}`)
  }
  refreshTray()
}

const WINDOW_STATE_VERSION = 3
const DEFAULT_WINDOW = { width: 280, height: 400 }
const windowStateFile = () => path.join(app.getPath('userData'), 'kodama-window.json')

// sessionId -> { tty, surface, workspace, pane, window }, captured while a session
// is alive so we can still jump to its cmux tab after the agent process exits.
// We pin cmux's own surface id (not just the tty) because ttys get reused by new
// panes and several panes can share a cwd — keying on tty/cwd alone is why jumps
// used to drift to the wrong tab. cmux's own notifications never drift because
// they carry the surface id; pinning it here brings us to parity.
const sessionTtyFile = () => path.join(app.getPath('userData'), 'kodama-session-tty.json')
let sessionTtyCache = new Map()
const agentEventContext = createAgentEventContext()
let sessionTtySaveTimer = null
function loadSessionTtyCache() {
  try {
    const obj = JSON.parse(fs.readFileSync(sessionTtyFile(), 'utf8'))
    if (obj && typeof obj === 'object') sessionTtyCache = new Map(Object.entries(obj))
  } catch { /* first run / corrupt — start empty */ }
}
function saveSessionTtyCache() {
  if (sessionTtySaveTimer) return
  sessionTtySaveTimer = setTimeout(() => {
    sessionTtySaveTimer = null
    try { writeJsonAtomic(sessionTtyFile(), Object.fromEntries(sessionTtyCache)) } catch { /* ignore */ }
  }, 1000)
}
// Normalize a cache entry into a record. Old caches stored a bare tty string, so
// upgrade those transparently instead of forcing a re-pin.
function getSessionRecord(id) {
  const v = sessionTtyCache.get(String(id || '').trim())
  if (!v) return null
  if (typeof v === 'string') return { tty: v, surface: '', workspace: '', pane: '', window: '' }
  return { tty: '', surface: '', workspace: '', pane: '', window: '', ...v }
}
function clampWindowState(state, workArea) {
  const margin = 8
  const width = Math.min(state.width, Math.max(180, workArea.width - margin * 2))
  const height = Math.min(state.height, Math.max(240, workArea.height - margin * 2))
  const minX = workArea.x + margin
  const maxX = workArea.x + workArea.width - width - margin
  const minY = workArea.y + margin
  const maxY = workArea.y + workArea.height - height - margin
  return {
    width,
    height,
    x: Math.round(Math.min(Math.max(state.x, minX), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(state.y, minY), Math.max(minY, maxY))),
  }
}

function clampWindowByVisibleBounds(state, visibleBounds, workArea) {
  if (!visibleBounds || visibleBounds.width <= 0 || visibleBounds.height <= 0) {
    return clampWindowState(state, workArea)
  }
  const margin = 6
  const minVisibleRatio = Math.min(1, Math.max(0.25, Number(visibleBounds.minVisibleRatio) || 1))
  const bounds = {
    x: Number(visibleBounds.x) || 0,
    y: Number(visibleBounds.y) || 0,
    width: Number(visibleBounds.width) || 0,
    height: Number(visibleBounds.height) || 0,
  }
  const horizontalOverflow = bounds.width * (1 - minVisibleRatio)
  const verticalOverflow = bounds.height * (1 - minVisibleRatio)
  const minX = workArea.x + margin - bounds.x - horizontalOverflow
  const maxX = workArea.x + workArea.width - margin - bounds.x - bounds.width + horizontalOverflow
  const minY = workArea.y + margin - bounds.y - verticalOverflow
  const maxY = workArea.y + workArea.height - margin - bounds.y - bounds.height + verticalOverflow
  return {
    ...state,
    x: Math.round(Math.min(Math.max(state.x, minX), Math.max(minX, maxX))),
    y: Math.round(Math.min(Math.max(state.y, minY), Math.max(minY, maxY))),
  }
}

function defaultWindowState(workArea, width = DEFAULT_WINDOW.width, height = DEFAULT_WINDOW.height) {
  return clampWindowState({
    width,
    height,
    x: workArea.x + workArea.width - width - 24,
    y: workArea.y + workArea.height - height - 24,
  }, workArea)
}

function loadWindowState(workArea) {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'))
    if (s && s.version === WINDOW_STATE_VERSION && s.width > 0 && s.height > 0) {
      return clampWindowState({
        width: s.width,
        height: s.height,
        x: Number.isFinite(s.x) ? s.x : workArea.x + workArea.width - s.width - 24,
        y: Number.isFinite(s.y) ? s.y : workArea.y + workArea.height - s.height - 24,
      }, workArea)
    }
  } catch {
    /* fall back to default */
  }
  return defaultWindowState(workArea)
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return
  const [x, y] = win.getPosition()
  const [width, height] = win.getSize()
  try {
    writeJsonAtomic(windowStateFile(), { version: WINDOW_STATE_VERSION, width, height, x, y })
  } catch (err) {
    console.error(`[kodama] save window state failed: ${err.message}`)
  }
}

// The overlay window now spans the whole work area; "size" means scaling the
// pet inside it, which the renderer owns. Tray presets just push a scale.
function setPetScale(scale) {
  sendToPet('pet:set-scale', scale)
}

// One-click registration of the Kodama hook into local coding-agent hook files.
// SAFE: backs up first, only APPENDS the 7766 curl to events that don't already
// have it (never touches existing hooks), idempotent. Triggered manually from the
// tray — never written silently.
const KODAMA_HOOK_CURL =
  kodamaHookCurl()

function kodamaHookUrl({ path: hookPath = '/', event = '' } = {}) {
  const normalizedPath = hookPath && hookPath.startsWith('/') ? hookPath : `/${hookPath || ''}`
  const pathPart = normalizedPath === '/' ? '' : normalizedPath
  const query = event ? `?event=${encodeURIComponent(event)}` : ''
  return `http://127.0.0.1:${LOCAL_AGENT_PORT}${pathPart}${query}`
}

function kodamaHookCurl(options = {}) {
  const url = kodamaHookUrl(options)
  const command = `curl -s -m 1 --noproxy 127.0.0.1 -X POST '${url}' -H 'Content-Type: application/json' -d "$(cat)" >/dev/null 2>&1 || true`
  return options.jsonAck ? `${command}; printf '{}'` : command
}
// The canonical Claude event surface, kept for any external reference. The
// registry (src/main/agents/*) now owns per-agent event lists; this is just a
// convenience alias to the Claude descriptor's events.
const KODAMA_HOOK_EVENTS = HOOK_AGENTS.find(agent => agent.id === 'claude')?.hookConfig.events || []

function shouldSkipOptionalHookFile(file, optional) {
  return optional && !fs.existsSync(path.dirname(file))
}

// Safely merge the Kodama hook into one agent's JSON `hooks` map. `events` comes
// from the agent descriptor so this stays agent-agnostic. SAFE: backs up first,
// only APPENDS the 7766 curl to events that don't already have it (never touches
// existing hooks), idempotent, atomic write.
function registerJsonHookFile(file, label, events, { dryRun = false, allowCreate = false, optional = false, matcherForEvent = null, commandForEvent = null } = {}) {
  let json
  let created = false
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    if (err?.code === 'ENOENT' && shouldSkipOptionalHookFile(file, optional)) {
      return { ok: true, added: [], skipped: true, message: `${label} 未安装，已跳过` }
    }
    if (!allowCreate || err?.code !== 'ENOENT') {
      if (optional && err?.code === 'ENOENT') {
        return { ok: true, added: [], skipped: true, message: `${label} 未安装，已跳过` }
      }
      return { ok: false, error: `读取 ${label} 失败: ${err.message}` }
    }
    json = { version: 1, hooks: {} }
    created = true
  }
  json.hooks = json.hooks || {}
  const added = []
  const next = { ...json, hooks: { ...json.hooks } }
  for (const ev of events) {
    const list = Array.isArray(next.hooks[ev]) ? next.hooks[ev].slice() : []
    if (JSON.stringify(list).includes(`:${LOCAL_AGENT_PORT}`)) continue // already wired
    const command = typeof commandForEvent === 'function' ? commandForEvent(ev) : KODAMA_HOOK_CURL
    const entry = { hooks: [{ type: 'command', command }] }
    const matcher = typeof matcherForEvent === 'function' ? matcherForEvent(ev) : ''
    if (matcher) entry.matcher = matcher
    list.push(entry)
    next.hooks[ev] = list
    added.push(ev)
  }
  if (dryRun) return { ok: true, added, dryRun: true }
  if (!added.length) return { ok: true, added: [], message: `${label} 已是最新，无需改动` }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (!created) fs.copyFileSync(file, `${file}.bak-kodama-${Date.now()}`)
    writeJsonAtomic(file, next, { pretty: true })
  } catch (err) {
    return { ok: false, error: `写入 ${label} 失败: ${err.message}` }
  }
  return { ok: true, added }
}

function tomlEventHasKodamaHook(text, event) {
  const escaped = event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const section = new RegExp(`\\[\\[hooks\\.${escaped}(?:\\.hooks)?\\]\\]([\\s\\S]*?)(?=\\n\\[\\[hooks\\.|$)`, 'g')
  let match
  while ((match = section.exec(text))) {
    if (match[0].includes(`:${LOCAL_AGENT_PORT}`)) return true
  }
  return false
}

function registerTomlHookFile(file, label, events, { dryRun = false, optional = false } = {}) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (optional && err?.code === 'ENOENT') {
      return { ok: true, added: [], skipped: true, message: `${label} 未安装，已跳过` }
    }
    return { ok: false, error: `读取 ${label} 失败: ${err.message}` }
  }
  const added = events.filter(ev => !tomlEventHasKodamaHook(text, ev))
  if (dryRun) return { ok: true, added, dryRun: true }
  if (!added.length) return { ok: true, added: [], message: `${label} 已是最新，无需改动` }

  const chunks = []
  if (!/^\s*\[features\]\s*$/m.test(text)) {
    chunks.push('[features]\nhooks = true')
  } else if (!/^\s*hooks\s*=\s*true\s*$/m.test(text)) {
    chunks.push('hooks = true')
  }
  for (const ev of added) {
    chunks.push([
      `[[hooks.${ev}]]`,
      `[[hooks.${ev}.hooks]]`,
      'type = "command"',
      `command = ${JSON.stringify(KODAMA_HOOK_CURL)}`,
    ].join('\n'))
  }
  const next = `${text.replace(/\s*$/, '')}\n\n${chunks.join('\n\n')}\n`
  try {
    fs.copyFileSync(file, `${file}.bak-kodama-${Date.now()}`)
    writeTextAtomic(file, next)
  } catch (err) {
    return { ok: false, error: `写入 ${label} 失败: ${err.message}` }
  }
  return { ok: true, added }
}

function registerHookFile(file, label, events, options = {}) {
  if (options.configFormat === 'trae-cli-toml') {
    return registerTomlHookFile(file, label, events, options)
  }
  return registerJsonHookFile(file, label, events, options)
}

// Iterate the agent registry instead of hard-coding Claude/Codex. Each descriptor
// supplies its settings path, event list and whether the file may be created.
function registerLocalCliHooks(options = {}) {
  const home = app.getPath('home')
  const summary = {}
  let ok = true
  for (const agent of HOOK_AGENTS) {
    const cfg = agent.hookConfig
    const file = cfg.settingsPath(home)
    const result = registerHookFile(file, agent.label, cfg.events, {
      ...options,
      allowCreate: cfg.allowCreate,
      optional: cfg.optional,
      configFormat: cfg.configFormat,
      matcherForEvent: cfg.matcherForEvent,
      commandForEvent: cfg.commandForEvent || (cfg.endpointPath ? (event) => kodamaHookCurl({
        path: cfg.endpointPath,
        event,
        jsonAck: cfg.jsonAck,
      }) : null),
    })
    summary[agent.id] = result
    if (!result.ok) ok = false
  }
  return { ok, summary }
}

// Keep the overlay covering the combined visible work area across display changes.
function fitWindowToWorkArea() {
  if (!win || win.isDestroyed()) return
  const workArea = combinedWorkAreaBounds()
  win.setBounds({ x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height })
  // The renderer caches per-display work areas + the window origin; both may
  // have just changed, so keep its cache fresh.
  sendDisplayAreasToPet()
}

// renderer -> main: toggle click-through
ipcMain.on('pet:set-ignore-mouse', (e, ignore, opts) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w) return
  if (w === win) {
    petOverlayMouseIgnoreRequested = Boolean(ignore)
    applyPetOverlayMousePolicy()
    return
  }
  w.setIgnoreMouseEvents(ignore, opts)
})

// renderer -> main: drag the window by a screen-space delta
ipcMain.on('pet:move', (e, dx, dy, visibleBounds) => {
  const w = BrowserWindow.fromWebContents(e.sender)
  if (!w) return
  const [x, y] = w.getPosition()
  const [width, height] = w.getSize()
  const nextBounds = { x: Math.round(x + dx), y: Math.round(y + dy), width, height }
  const display = screen.getDisplayMatching(nextBounds)
  const next = clampWindowByVisibleBounds(nextBounds, visibleBounds, display.workArea)
  w.setPosition(next.x, next.y)
  saveWindowState()
  sendDisplayAreasToPet() // origin moved; keep the renderer's area cache fresh
})

ipcMain.on('pet:set-window-size', () => {
  // No-op: the overlay spans the full work area now; pet size is a renderer scale.
})

// Per-display work areas + overlay origin, so the renderer can place floating
// elements on the display the pet actually sits on (not just the primary one).
ipcMain.handle('pet:get-display-areas', () => displayAreaSnapshot())

// Management window <-> pet renderer ui-settings sync, brokered by main.
ipcMain.on('pet:report-ui-settings', (_e, settings) => {
  if (settings && typeof settings === 'object') lastUiSettings = settings
})
ipcMain.handle('pet:get-ui-settings', () => lastUiSettings)
ipcMain.on('pet:patch-ui-settings', (_e, patch) => {
  if (patch && typeof patch === 'object') sendToPet('pet:apply-ui-patch', patch)
})
ipcMain.handle('pet:open-manage-window', () => {
  openManageWindow()
  return { ok: true }
})

let sayProc = null
ipcMain.on('pet:speak', (_e, text) => {
  if (process.platform !== 'darwin') return // uses macOS built-in `say`
  const line = String(text || '').trim().slice(0, 80)
  if (!line) return
  try {
    if (sayProc && !sayProc.killed) sayProc.kill() // interrupt the previous line
    const proc = spawn('say', [line], { stdio: 'ignore' }) // array args = no shell injection
    sayProc = proc
    proc.on('error', () => {})
    proc.once('close', () => { if (sayProc === proc) sayProc = null }) // release the dead handle
  } catch { /* TTS is best-effort */ }
})

ipcMain.on('pet:pet-action', () => sendToPet('pet:do-pet')) // 管理窗口「摸摸」→ 桌宠
ipcMain.on('pet:feed-pet', () => sendToPet('pet:do-feed')) // 管理窗口「投喂」→ 桌宠

ipcMain.on('pet:set-hidden', (_e, hidden) => {
  setPetHidden(hidden)
})

function safeExternalUrls(target) {
  const direct = String(target?.url || '').trim()
  if (direct) {
    try {
      const parsed = new URL(direct)
      if (['codex:', 'lark:', 'feishu:', 'https:', 'http:'].includes(parsed.protocol)) return [direct]
    } catch {
      return []
    }
  }
  return larkChatUrls(target?.chatId, target?.messageId)
}

function isUnderPath(child, parent) {
  return child === parent || child.startsWith(`${parent}${path.sep}`)
}

function expandUserPath(value) {
  const text = String(value || '').trim()
  if (!text || text.includes('\0')) return ''
  if (text === '~') return app.getPath('home')
  if (text.startsWith('~/')) return path.join(app.getPath('home'), text.slice(2))
  return text
}

function resolveSafeLocalPath(target) {
  const raw = expandUserPath(target?.path || target?.filePath || target?.folderPath)
  if (!raw) return { error: 'missing-local-path' }
  if (!path.isAbsolute(raw)) return { error: 'local-path-not-absolute' }
  if (!fs.existsSync(raw)) return { error: 'local-path-not-found' }

  const real = fs.realpathSync.native(raw)
  const allowedRoots = [app.getPath('home'), app.getPath('temp'), '/tmp', '/private/tmp']
    .map(root => fs.existsSync(root) ? fs.realpathSync.native(root) : '')
    .filter(Boolean)
  if (!allowedRoots.some(root => isUnderPath(real, root))) return { error: 'local-path-not-allowed' }
  const stat = fs.statSync(real)
  return { path: real, stat }
}

const TEXT_PATH_EXTENSIONS = new Set([
  '.bash',
  '.c',
  '.cc',
  '.cpp',
  '.css',
  '.csv',
  '.go',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.json',
  '.jsonl',
  '.jsx',
  '.kt',
  '.log',
  '.mjs',
  '.md',
  '.markdown',
  '.py',
  '.rs',
  '.sh',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
  '.zsh',
])

function isLikelyTextPath(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return TEXT_PATH_EXTENSIONS.has(ext) || /(?:transcript|session|log)/i.test(path.basename(filePath))
}

function openTextPath(filePath) {
  if (process.platform !== 'darwin') return Promise.resolve(false)
  return new Promise((resolve) => {
    const child = spawn('open', ['-t', filePath], { stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
}

async function openLocalTarget(target) {
  const resolved = resolveSafeLocalPath(target)
  if (resolved.error) return { ok: false, error: resolved.error }

  if (resolved.stat.isDirectory()) {
    const openPathError = await shell.openPath(resolved.path)
    if (!openPathError) return { ok: true, path: resolved.path, method: 'shell.openPath:folder' }
    return { ok: false, error: openPathError || 'open-local-folder-failed' }
  }

  if (isLikelyTextPath(resolved.path) && await openTextPath(resolved.path)) {
    return { ok: true, path: resolved.path, method: 'open -t' }
  }

  shell.showItemInFolder(resolved.path)
  return { ok: true, path: resolved.path, method: 'shell.showItemInFolder' }
}

// All callers are short-lived local commands (lsof / ps / cmux / osascript / open).
// A hung child (cmux half-open socket, unresponsive Terminal) must never wedge a
// jump forever — every call gets a hard timeout that SIGTERMs the strays.
function runCommand(command, args, { timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer = null
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn(arg)
    }
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', (err) => finish(reject, err))
    child.once('close', (code) => {
      if (code === 0) finish(resolve, stdout)
      else finish(reject, new Error(stderr.trim() || `${command} exited ${code}`))
    })
    if (timeout > 0) {
      timer = setTimeout(() => {
        try { child.kill('SIGTERM') } catch { /* already exited */ }
        finish(reject, new Error(`${command} timed out after ${timeout}ms`))
      }, timeout)
      if (typeof timer.unref === 'function') timer.unref()
    }
  })
}

// Crash-safe JSON write: a process death mid-write must not leave a truncated file
// that the next read silently treats as corrupt and resets to defaults — that path
// loses the user's level / food / token ledger without warning. Write a sibling temp
// file, then rename (atomic on the same filesystem).
function writeJsonAtomic(file, value, { pretty = false } = {}) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, pretty ? 2 : undefined))
  fs.renameSync(tmp, file)
}

function writeTextAtomic(file, text) {
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, text)
  fs.renameSync(tmp, file)
}

function parsePs(stdout) {
  return stdout.split('\n').map((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    if (!match) return null
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      pgid: Number(match[3]),
      tty: match[4],
      command: match[5],
    }
  }).filter(Boolean)
}

function appPathFromCommand(command) {
  const match = String(command || '').match(/(\/Applications\/[^"]+?\.app)(?:\/|$)/)
  return match?.[1] || ''
}

const isAgentCommand = (command) => /(^|\/|\s)(claude|codex)(\s|$)/i.test(String(command || ''))

function terminalLauncherPreference() {
  return normalizeTerminalLauncher(lastUiSettings?.terminalLauncher)
}

// Working directory of a pid via lsof (used to locate an agent session whose id
// isn't on its argv — e.g. Claude Code, where we only know the cwd).
async function processCwd(pid) {
  try {
    const out = await runCommand('lsof', ['-a', '-d', 'cwd', '-Fn', '-p', String(pid)])
    const line = out.split('\n').find((l) => l.startsWith('n'))
    return line ? line.slice(1).trim() : ''
  } catch {
    return ''
  }
}

async function findCliSessionTarget(target) {
  const sessionId = String(target?.sessionId || '').trim()
  const cwd = String(target?.cwd || '').trim()
  const rows = parsePs(await runCommand('ps', ['-axo', 'pid,ppid,pgid,tty,args']))
  const byPid = new Map(rows.map(row => [row.pid, row]))

  // 1) Strongest signal: the agent process carries the session id on its argv.
  let hit = sessionId
    ? rows.find((row) => row.command.includes(sessionId) && isAgentCommand(row.command) && normalizeTty(row.tty))
    : null

  // 2) Fallback: match a running agent by working directory (Claude Code rarely
  //    puts the session id on argv, which is why jumps used to miss the tty).
  if (!hit && cwd) {
    // Terminal-hosted agents remain the strongest cwd match, but Codex App's
    // app-server intentionally has no tty. Keep it as a fallback so its .app
    // ancestor can override a stale explicit Orca preference.
    const agents = orderAgentCandidates(rows.filter((row) => isAgentCommand(row.command)))
    for (const row of agents) {
      if (await processCwd(row.pid) === cwd) { hit = row; break }
    }
  }
  if (!hit) return null

  let appPath = ''
  let cursor = hit
  const seen = new Set()
  while (cursor && !seen.has(cursor.pid)) {
    seen.add(cursor.pid)
    appPath = appPathFromCommand(cursor.command) || appPath
    cursor = byPid.get(cursor.ppid)
  }
  return { ...hit, appPath }
}

// ---------- cmux integration ----------
// cmux ships a socket-control CLI; we use it to focus the exact workspace/pane
// that hosts a session instead of blindly re-opening the app (which dumped the
// user into a fresh cmux). Join key between our session and cmux is the tty.
function cmuxBinPath() {
  for (const base of ['/Applications', path.join(app.getPath('home'), 'Applications')]) {
    const p = path.join(base, 'cmux.app', 'Contents', 'Resources', 'bin', 'cmux')
    if (fs.existsSync(p)) return p
  }
  return ''
}

function cmuxAppPath() {
  const bin = cmuxBinPath()
  return bin ? bin.replace(/\/Contents\/.*$/, '') : ''
}

function orcaAppPath() {
  for (const base of ['/Applications', path.join(app.getPath('home'), 'Applications')]) {
    const p = path.join(base, 'Orca.app')
    if (fs.existsSync(p)) return p
  }
  return ''
}

function orcaCliPath() {
  const appPath = orcaAppPath()
  if (!appPath) return ''
  const cli = path.join(appPath, 'Contents', 'Resources', 'bin', 'orca')
  return fs.existsSync(cli) ? cli : ''
}

function orcaAgentHookStatusFile() {
  return path.join(app.getPath('home'), 'Library', 'Application Support', 'orca', 'agent-hooks', 'last-status.json')
}

function bareTty(value) {
  return String(value || '').replace(/^\/dev\//, '').trim()
}

function readCmuxState() {
  const file = path.join(app.getPath('home'), 'Library', 'Application Support', 'cmux', 'session-com.cmuxterm.app.json')
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    return state && typeof state === 'object' ? state : null
  } catch {
    return null
  }
}

function cmuxStatePanels() {
  const state = readCmuxState()
  const windows = Array.isArray(state?.windows) ? state.windows : []
  const out = []
  for (const [windowIndex, window] of windows.entries()) {
    const workspaces = Array.isArray(window?.tabManager?.workspaces) ? window.tabManager.workspaces : []
    for (const [workspaceIndex, workspace] of workspaces.entries()) {
      const panels = Array.isArray(workspace?.panels) ? workspace.panels : []
      for (const [panelIndex, panel] of panels.entries()) {
        out.push({
          windowIndex,
          workspaceIndex,
          panelIndex,
          workspaceTitle: workspace?.customTitle || workspace?.currentDirectory || '',
          workspaceCwd: String(workspace?.currentDirectory || '').trim(),
          workspaceSelected: workspaceIndex === Number(window?.tabManager?.selectedWorkspaceIndex ?? -1),
          panelId: panel?.id || '',
          panelTitle: panel?.customTitle || panel?.title || '',
          tty: bareTty(panel?.ttyName),
          cwd: String(panel?.directory || panel?.terminal?.workingDirectory || workspace?.currentDirectory || '').trim(),
        })
      }
    }
  }
  return out
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function findCmuxPanel(rec, target) {
  const panels = cmuxStatePanels()
  const targetTty = bareTty(rec?.tty)
  const targetPanelId = [rec?.panelId, rec?.surface].find(isUuid) || ''
  const targetCwd = String(target?.cwd || '').trim()

  if (targetPanelId) {
    const hit = panels.find((panel) => panel.panelId.toLowerCase() === targetPanelId.toLowerCase())
    if (hit) return { ...hit, matchedBy: 'panel' }
  }

  if (targetTty) {
    const matches = panels.filter((panel) => panel.tty === targetTty)
    if (matches.length === 1) return { ...matches[0], matchedBy: 'tty' }
    if (matches.length > 1) {
      console.warn(`[kodama] cmux: ${matches.length} panels share tty ${targetTty}; refusing to guess`)
      return null
    }
  }

  if (targetCwd) {
    const matches = panels.filter((panel) => panel.cwd === targetCwd || panel.workspaceCwd === targetCwd)
    if (matches.length === 1) return { ...matches[0], matchedBy: 'cwd' }
    if (matches.length > 1) {
      console.warn(`[kodama] cmux: ${matches.length} panels share cwd ${targetCwd}; refusing to guess`)
      return null
    }
  }

  return null
}

// Parse `cmux tree --all` into surfaces with their enclosing window/workspace/pane.
async function listCmuxSurfaces() {
  const bin = cmuxBinPath()
  if (!bin) return []
  let out = ''
  try { out = await runCommand(bin, ['tree', '--all']) } catch (err) {
    if (isCmuxAccessError(err)) console.error(`[kodama] cmux tree refused — external process or socket policy: ${err.message}`)
    else console.error(`[kodama] cmux tree failed: ${err.message}`)
    return []
  }
  const surfaces = []
  let win = ''
  let ws = ''
  let pane = ''
  for (const line of out.split('\n')) {
    const w = line.match(/\bwindow\s+(window:\d+)/)
    if (w) win = w[1]
    const k = line.match(/\bworkspace\s+(workspace:\d+)/)
    if (k) ws = k[1]
    const p = line.match(/\bpane\s+(pane:\d+)/)
    if (p) pane = p[1]
    const s = line.match(/\bsurface\s+(surface:\d+)\b.*?\btty=(\S+)/)
    if (s) surfaces.push({ window: win, workspace: ws, pane, surface: s[1], tty: bareTty(s[2]) })
  }
  return surfaces
}

// cmux's default cmuxOnly socket policy rejects clients that were not started
// from cmux, surfacing as a broken pipe / refused handshake. Kodama is an
// external Electron process, so we flag this distinctly instead of reporting a
// missing tab.
function isCmuxAccessError(err) {
  return /broken pipe|EPIPE|ECONNREFUSED|connection refused|handshake|outside the terminal/i.test(String(err?.message || ''))
}

// Focus the exact cmux surface hosting a session. Prefers the surface id we pinned
// while the session was alive (immune to tty reuse / shared-cwd ambiguity), and
// only falls back to a live tty match when no surface was pinned. The live
// `cmux tree` listing is the source of truth, so stale/closed panes are skipped.
async function focusCmuxPanel(panel) {
  const bin = cmuxBinPath()
  if (!bin) return null
  if (!panel?.panelId || !isUuid(panel.panelId)) return null
  // A cwd-only match is too weak to drive a hard focus: another session in the same directory
  // would get jumped to. Skip it and let the caller fall back to merely opening cmux.
  if (panel.matchedBy === 'cwd') return null
  try {
    await runCommand(bin, ['rpc', 'surface.focus', JSON.stringify({ surface_id: panel.panelId })])
    return {
      workspace: '',
      pane: '',
      surface: panel.panelId,
      panelId: panel.panelId,
      tty: panel.tty || '',
      matchedBy: panel.matchedBy || 'panel',
      focusApi: 'surface.focus',
    }
  } catch (err) {
    if (isCmuxAccessError(err)) console.error(`[kodama] cmux surface.focus refused — external process or socket policy: ${err.message}`)
    else console.error(`[kodama] cmux surface.focus failed: ${err.message}`)
    return null
  }
}

async function focusCmuxForSession(rec, target) {
  const bin = cmuxBinPath()
  if (!bin) return null
  const panel = findCmuxPanel(rec, target)
  const focusedPanel = await focusCmuxPanel(panel)
  if (focusedPanel) return focusedPanel

  let surfaces
  try {
    surfaces = await listCmuxSurfaces()
  } catch (err) {
    if (isCmuxAccessError(err)) console.error(`[kodama] cmux CLI refused — external process (issue #3089): ${err.message}`)
    else console.error(`[kodama] cmux tree failed: ${err.message}`)
    return null
  }
  let hit = rec.surface ? surfaces.find((s) => s.surface === rec.surface) : null
  const matchedBy = hit ? 'surface' : 'tty'
  if (!hit && rec.tty) hit = surfaces.find((s) => s.tty === bareTty(rec.tty))
  if (!hit) return null
  try {
    if (hit.window) await runCommand(bin, ['focus-window', '--window', hit.window]).catch(() => {})
    if (hit.workspace) await runCommand(bin, ['select-workspace', '--workspace', hit.workspace])
    if (hit.pane) await runCommand(bin, ['focus-pane', '--pane', hit.pane, '--workspace', hit.workspace]).catch(() => {})
    return { workspace: hit.workspace, pane: hit.pane, surface: hit.surface, tty: hit.tty, matchedBy }
  } catch (err) {
    if (isCmuxAccessError(err)) console.error(`[kodama] cmux focus refused — external process (issue #3089): ${err.message}`)
    else console.error(`[kodama] cmux focus failed: ${err.message}`)
    return null
  }
}

// Resolve the tty of a live agent process. Strongest signal: the session id is on
// the agent's argv (Codex). Fallback: match the agent by cwd (Claude Code rarely
// puts the session id on argv). If several agents share the cwd we cannot tell
// them apart by tty, so we refuse to guess rather than pin the wrong pane.
async function resolveAgentTty(id, cwd) {
  const rows = parsePs(await runCommand('ps', ['-axo', 'pid,ppid,pgid,tty,args']))
  let hit = rows.find((row) => row.command.includes(id) && isAgentCommand(row.command) && normalizeTty(row.tty))
  if (!hit && cwd) {
    const want = String(cwd).trim()
    const agents = rows.filter((row) => isAgentCommand(row.command) && normalizeTty(row.tty))
    const matches = []
    for (const row of agents) {
      if (await processCwd(row.pid) === want) matches.push(row)
    }
    if (matches.length === 1) hit = matches[0]
    else if (matches.length > 1) console.warn(`[kodama] cmux: ${matches.length} agents share cwd ${want}; tty ambiguous for ${id}`)
  }
  return hit ? normalizeTty(hit.tty) : ''
}

// While a session is alive, pin its cmux surface so we can jump precisely later —
// even after the agent process exits and its tty gets reused. Cheap once pinned:
// returns immediately when a surface is already known; otherwise resolves the tty
// once, then keeps trying to upgrade it to a cmux surface as cmux comes/goes.
async function cacheSessionTty(sessionId, cwd) {
  const id = String(sessionId || '').trim()
  if (!id) return
  const existing = getSessionRecord(id)
  if (existing?.surface && existing?.panelId) return // fully pinned — nothing better to learn
  // Once a surface is pinned the only thing left to chase is the cmux panelId. Some cmux builds
  // never expose it, so cap the attempts — otherwise every hook event re-spawns `ps` + `cmux tree`
  // forever for such a session (a steady background spawn churn).
  const panelTries = Number(existing?.panelTries || 0)
  if (existing?.surface && panelTries >= 3) return
  try {
    const tty = existing?.tty || await resolveAgentTty(id, cwd)
    if (!tty) return
    let surfaceInfo = null
    // Skip the `cmux tree` spawn once a surface is already known — we only re-enter here for the panelId.
    if (!existing?.surface) {
      try { surfaceInfo = (await listCmuxSurfaces()).find((s) => s.tty === bareTty(tty)) || null }
      catch (err) { if (isCmuxAccessError(err)) console.error(`[kodama] cmux CLI refused while pinning (issue #3089): ${err.message}`) }
    }
    // Only pin a panelId confirmed by tty/panel identity — a cwd-derived one would later be
    // jumped to as if authoritative, reintroducing the same-directory misjump we guard against.
    const panelMatch = findCmuxPanel({ tty }, { cwd })
    const panelId = (panelMatch && panelMatch.matchedBy !== 'cwd' ? panelMatch.panelId : '') || existing?.panelId || ''
    const record = {
      tty,
      surface: surfaceInfo?.surface || existing?.surface || '',
      workspace: surfaceInfo?.workspace || existing?.workspace || '',
      pane: surfaceInfo?.pane || existing?.pane || '',
      window: surfaceInfo?.window || existing?.window || '',
      panelId,
      panelTries: panelId ? 0 : panelTries + 1,
    }
    if (JSON.stringify(record) !== JSON.stringify(existing || {})) {
      sessionTtyCache.set(id, record)
      saveSessionTtyCache()
    }
  } catch { /* best-effort */ }
}

function normalizeTty(value) {
  const tty = String(value || '').trim()
  if (!tty || tty === '??') return ''
  return tty.startsWith('/dev/') ? tty : `/dev/${tty}`
}

async function activateTerminalTty(tty) {
  if (process.platform !== 'darwin') return false
  const targetTty = normalizeTty(tty)
  if (!targetTty) return false
  const script = `
set targetTty to ${JSON.stringify(targetTty)}
tell application "Terminal"
  repeat with wi from 1 to count windows
    set w to window wi
    repeat with ti from 1 to count tabs of w
      set t to tab ti of w
      try
        if (tty of t as string) is targetTty then
          set selected of t to true
          set index of w to 1
          activate
          return "ok"
        end if
      end try
    end repeat
  end repeat
end tell
return "not-found"
`
  try {
    const result = (await runCommand('osascript', ['-e', script])).trim()
    return result === 'ok'
  } catch (err) {
    console.error(`[kodama] activate terminal failed: ${err.message}`)
    return false
  }
}

async function openAppPath(appPath) {
  if (!appPath) return false
  try {
    await runCommand('open', [appPath])
    return true
  } catch {
    return false
  }
}

async function openCmuxFallback(target, rec, reason) {
  const appPath = cmuxAppPath()
  if (!appPath) return null
  const panel = findCmuxPanel(rec, target)
  if (!await openAppPath(appPath)) return null
  const panelMatched = Boolean(panel)
  const method = 'open cmux app'
  logJump(method, {
    session: target?.sessionId || '',
    reason,
    appPath,
    panelMatched,
    panelId: panel?.panelId || '',
    tty: rec?.tty || '',
  })
  return {
    ok: true,
    method: 'open cmux app',
    appPath,
    reason,
    panelMatched,
    panel: panel || null,
  }
}

async function openOrcaFallback(target, rec, foundAppPath, reason) {
  const appPath = isOrcaAppPath(foundAppPath) ? foundAppPath : orcaAppPath()
  if (!appPath) return null
  if (!await openAppPath(appPath)) return null
  logJump('open Orca app', {
    session: target?.sessionId || '',
    reason,
    appPath,
    tty: rec?.tty || '',
  })
  return {
    ok: true,
    method: 'open Orca app',
    appPath,
    reason,
    tty: rec?.tty || '',
  }
}

function readOrcaAgentHookStatuses() {
  try {
    const data = JSON.parse(fs.readFileSync(orcaAgentHookStatusFile(), 'utf8'))
    return Object.values(data?.entries || {}).filter((entry) => entry && typeof entry === 'object')
  } catch {
    return []
  }
}

async function listOrcaTerminals() {
  const cli = orcaCliPath()
  if (!cli) return []
  const raw = await runCommand(cli, ['terminal', 'list', '--json'])
  const data = JSON.parse(raw)
  return Array.isArray(data?.result?.terminals) ? data.result.terminals : []
}

async function focusOrcaTerminal(target, rec, foundAppPath, reason) {
  const cli = orcaCliPath()
  if (!cli) return null

  let terminals = []
  try {
    terminals = await listOrcaTerminals()
  } catch (err) {
    console.error(`[kodama] orca terminal list failed: ${err.message}`)
    return null
  }

  const match = selectOrcaTerminal(target, terminals, readOrcaAgentHookStatuses())
  const handle = match?.terminal?.handle
  if (!handle) return null

  try {
    const raw = await runCommand(cli, ['terminal', 'focus', '--terminal', handle, '--json'])
    const result = JSON.parse(raw || '{}')
    if (result?.ok === false) throw new Error(result?.error?.message || result?.error || 'orca terminal focus failed')
    await openAppPath(isOrcaAppPath(foundAppPath) ? foundAppPath : orcaAppPath())
    logJump('orca terminal focus', {
      session: target?.sessionId || '',
      reason,
      matchReason: match.reason,
      handle,
      tabId: match.terminal.tabId || '',
      leafId: match.terminal.leafId || '',
      worktreePath: match.terminal.worktreePath || '',
      tty: rec?.tty || '',
    })
    return {
      ok: true,
      method: 'orca terminal focus',
      appPath: isOrcaAppPath(foundAppPath) ? foundAppPath : orcaAppPath(),
      handle,
      tabId: match.terminal.tabId || '',
      leafId: match.terminal.leafId || '',
      matchReason: match.reason,
      tty: rec?.tty || '',
    }
  } catch (err) {
    console.error(`[kodama] orca terminal focus failed: ${err.message}`)
    return null
  }
}

// Append-only, self-trimming jump log so a misfire can be diagnosed without
// knowing the internals: each line records which path won (cmux focus / Terminal
// tty / open host app / failed) and how cmux matched (surface vs tty fallback).
// Path: <userData>/kodama-jump.log  (see message printed at startup).
function logJump(method, info) {
  const line = `${new Date().toISOString()} ${method} ${JSON.stringify(info)}`
  console.log(`[kodama] jump → ${line}`)
  try {
    const file = path.join(app.getPath('userData'), 'kodama-jump.log')
    let prev = ''
    try { prev = fs.readFileSync(file, 'utf8') } catch { /* first run */ }
    const trimmed = (prev + line + '\n').split('\n').slice(-200).join('\n')
    fs.writeFileSync(file, trimmed)
  } catch { /* logging must never break a jump */ }
}

async function openTerminalSessionTarget(target) {
  const found = await findCliSessionTarget(target)
  const liveTty = normalizeTty(target?.tty) || normalizeTty(found?.tty)
  // Surface pinned while the session was alive — survives process exit and tty reuse.
  const cached = target?.sessionId ? getSessionRecord(String(target.sessionId).trim()) : null
  const rec = {
    tty: liveTty || cached?.tty || '',
    surface: cached?.surface || '',
    workspace: cached?.workspace || '',
    pane: cached?.pane || '',
    window: cached?.window || '',
    panelId: cached?.panelId || '',
  }
  const foundAppPath = String(found?.appPath || '')
  const launcher = terminalLauncherPreference()

  const transcriptPath = String(
    target?.transcriptPath || target?.agentTranscriptPath || target?.fallbackPath || '',
  ).trim()
  const isDesktopTranscript = !foundAppPath && isCodexDesktopTranscript(transcriptPath, {
    sessionId: target?.sessionId || target?.threadId,
  })
  const codexThreadTarget = codexThreadTargetForDetectedHost(target, foundAppPath, {
    isDesktopTranscript,
  })
  if (codexThreadTarget) {
    try {
      const opened = await openExternalTarget(codexThreadTarget.url)
      logJump('Codex thread', {
        session: target?.sessionId || '',
        threadId: codexThreadTarget.threadId,
        appPath: foundAppPath,
        method: opened.method,
      })
      return {
        ok: true,
        method: opened.method,
        url: codexThreadTarget.url,
        threadId: codexThreadTarget.threadId,
        appPath: foundAppPath,
        pid: found?.pid || null,
      }
    } catch (err) {
      logJump('Codex thread failed', {
        session: target?.sessionId || '',
        threadId: codexThreadTarget.threadId,
        appPath: foundAppPath,
        error: err?.message || String(err),
      })
    }
  }

  if (shouldUseDetectedHostBeforeLauncher(launcher, foundAppPath)) {
    if (rec.tty && await activateTerminalTty(rec.tty)) {
      logJump('Terminal tty', {
        session: target?.sessionId || '',
        tty: rec.tty,
        reason: 'detected-host-before-launcher',
        preference: launcher,
        appPath: foundAppPath,
      })
      return { ok: true, method: 'Terminal tty', tty: rec.tty, pid: found?.pid || null }
    }
    if (await openAppPath(foundAppPath)) {
      logJump('open host app', {
        session: target?.sessionId || '',
        appPath: foundAppPath,
        reason: 'detected-host-before-launcher',
        preference: launcher,
      })
      return { ok: true, method: 'open host app', appPath: foundAppPath, tty: rec.tty, pid: found.pid }
    }
  }

  // If Claude is running inside Orca, opening Orca is more faithful than cmux.
  // Explicit cmux preference still wins for users who want cmux as the launcher.
  if (shouldPreferOrca(launcher, foundAppPath)) {
    const reason = launcher === 'orca' ? 'preference' : 'detected-host-app'
    const orca = await focusOrcaTerminal(target, rec, foundAppPath, reason) ||
      await openOrcaFallback(target, rec, foundAppPath, reason)
    if (orca) return { ...orca, pid: found?.pid || null }
    if (launcher === 'orca') {
      const error = found ? 'orca-unavailable' : 'agent-process-not-found'
      logJump('failed', { session: target?.sessionId || '', error, preference: 'orca' })
      return { ok: false, error }
    }
  }

  // Prefer cmux: focus the exact surface/pane rather than re-opening the app
  // (which used to spawn a stray cmux instead of jumping).
  if (shouldTryCmux(launcher) && (rec.surface || rec.tty || rec.panelId || target?.cwd) && cmuxBinPath()) {
    const cmux = await focusCmuxForSession(rec, target)
    if (cmux) {
      await openAppPath(isCmuxAppPath(foundAppPath) ? foundAppPath : cmuxAppPath())
      logJump('cmux focus', { session: target?.sessionId || '', ...cmux })
      return { ok: true, method: 'cmux focus', tty: rec.tty, pid: found?.pid || null, ...cmux }
    }
  }

  if (rec.tty && await activateTerminalTty(rec.tty)) {
    logJump('Terminal tty', { session: target?.sessionId || '', tty: rec.tty })
    return { ok: true, method: 'Terminal tty', tty: rec.tty, pid: found?.pid || null }
  }

  if (foundAppPath && !isCmuxAppPath(foundAppPath) && await openAppPath(foundAppPath)) {
    logJump('open host app', { session: target?.sessionId || '', appPath: found.appPath })
    return { ok: true, method: 'open host app', appPath: found.appPath, tty: rec.tty, pid: found.pid }
  }

  if (shouldTryCmux(launcher)) {
    const cmux = await openCmuxFallback(target, rec, rec.tty ? 'focus-unavailable' : 'session-not-live')
    if (cmux) {
      return cmux
    }
  }

  if (foundAppPath && await openAppPath(foundAppPath)) {
    logJump('open host app', { session: target?.sessionId || '', appPath: foundAppPath })
    return { ok: true, method: 'open host app', appPath: foundAppPath, tty: rec.tty, pid: found.pid }
  }

  const error = found ? 'terminal-target-unavailable' : 'agent-process-not-found'
  logJump('failed', { session: target?.sessionId || '', error })
  return { ok: false, error }
}

function appExists(name) {
  return fs.existsSync(`/Applications/${name}.app`) || fs.existsSync(path.join(app.getPath('home'), 'Applications', `${name}.app`))
}

function openUrlWithApp(appName, url) {
  return new Promise((resolve) => {
    const child = spawn('open', ['-a', appName, url], { stdio: 'ignore' })
    child.once('error', () => resolve(false))
    child.once('close', (code) => resolve(code === 0))
  })
}

async function openExternalTarget(url) {
  const parsed = new URL(url)
  const shouldUseLark = ['lark:', 'feishu:'].includes(parsed.protocol) || /(^|\.)applink\.(feishu\.cn|larksuite\.com)$/i.test(parsed.hostname)
  const shouldUseCodex = parsed.protocol === 'codex:'
  if (shouldUseCodex && process.platform === 'darwin' && appExists('Codex')) {
    if (await openUrlWithApp('Codex', url)) return { ok: true, method: 'open -a Codex', appName: 'Codex' }
  }
  if (shouldUseLark && process.platform === 'darwin') {
    for (const appName of ['Lark', 'Feishu', '飞书']) {
      if (appExists(appName) && await openUrlWithApp(appName, url)) {
        return { ok: true, method: `open -a ${appName}`, appName }
      }
    }
  }
  await shell.openExternal(url)
  return { ok: true, method: 'shell.openExternal' }
}

async function openTargetPayload(target) {
  if (target?.kind === 'terminal-session') {
    const result = await openTerminalSessionTarget(target)
    if (result.ok) {
      lastOpenedTarget = { ...result, at: new Date().toISOString(), target }
      return result
    }
    if (target?.allowRecordFallback && target?.fallbackPath) {
      const fallback = await openLocalTarget({ path: target.fallbackPath })
      if (fallback.ok) {
        const next = {
          ...fallback,
          method: `fallback ${fallback.method}`,
          terminalError: result.error,
        }
        lastOpenedTarget = { ...next, at: new Date().toISOString(), target }
        return next
      }
    }
    return result
  }

  if (target?.kind === 'local-path' || target?.path || target?.filePath || target?.folderPath) {
    const result = await openLocalTarget(target)
    if (result.ok) {
      lastOpenedTarget = { path: result.path, method: result.method, at: new Date().toISOString(), target }
    }
    return result
  }

  const urls = safeExternalUrls(target)
  if (!urls.length) return { ok: false, error: 'missing-target-url' }
  let lastError = ''
  for (const url of urls) {
    try {
      const result = await openExternalTarget(url)
      lastOpenedTarget = { url, method: result.method, at: new Date().toISOString(), target }
      return { ok: true, url, method: result.method, appName: result.appName || '' }
    } catch (err) {
      lastError = String(err?.message || err)
    }
  }
  clipboard.writeText(urls[0])
  return { ok: false, error: lastError || 'open-target-failed', copiedUrl: urls[0] }
}

async function applyLarkDraft(request = {}) {
  const messageId = String(request.messageId || request.message_id || '').trim()
  const draft = String(request.draft || request.text || '').trim().slice(0, 8000)
  if (!messageId) return { ok: false, error: 'missing-message-id' }
  if (!draft) return { ok: false, error: 'missing-draft' }
  if (!larkInbox) startLarkInbox()
  const message = (larkInbox.getSnapshot().messages || []).find(item => item.messageId === messageId)
  if (!message?.chatId) return { ok: false, error: 'message-not-found' }

  clipboard.writeText(draft)
  const opened = await openTargetPayload({
    kind: 'lark',
    chatId: message.chatId,
    messageId: message.messageId,
    label: message.chatName || '飞书消息',
  })
  if (!opened.ok) {
    return { ok: true, copied: true, opened: false, applied: false, error: opened.error || 'open-target-failed' }
  }
  if (process.platform !== 'darwin') {
    return { ok: true, copied: true, opened: true, applied: false, reason: 'paste-automation-unavailable' }
  }

  const appName = opened.appName || selectLarkAppName(appExists)
  if (!appName) {
    return { ok: true, copied: true, opened: true, applied: false, reason: 'lark-app-not-found' }
  }
  try {
    await runCommand('osascript', ['-e', larkPasteScript(appName)], { timeout: 6000 })
    return { ok: true, copied: true, opened: true, applied: true, appName }
  } catch (error) {
    return {
      ok: true,
      copied: true,
      opened: true,
      applied: false,
      appName,
      error: error?.message || String(error),
    }
  }
}

ipcMain.handle('pet:open-target', async (_e, target) => {
  return openTargetPayload(target)
})

ipcMain.handle('pet:get-last-opened-target', () => lastOpenedTarget?.target || null)

function shortSessionIdFromPath(value) {
  const file = String(value || '').split(path.sep).pop() || ''
  const match = file.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match?.[0] || ''
}

function readTextWindow(filePath, stat) {
  const maxBytes = 640 * 1024
  if (stat.size <= maxBytes) return fs.readFileSync(filePath, 'utf8')

  const headBytes = 128 * 1024
  const tailBytes = maxBytes - headBytes
  const fd = fs.openSync(filePath, 'r')
  try {
    const head = Buffer.alloc(headBytes)
    const tail = Buffer.alloc(tailBytes)
    const headRead = fs.readSync(fd, head, 0, headBytes, 0)
    const tailRead = fs.readSync(fd, tail, 0, tailBytes, Math.max(0, stat.size - tailBytes))
    return `${head.slice(0, headRead).toString('utf8')}\n${tail.slice(0, tailRead).toString('utf8')}`
  } finally {
    fs.closeSync(fd)
  }
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function extractVisibleText(value, depth = 0) {
  if (depth > 6 || value == null) return ''
  if (typeof value === 'string') return compactText(value)
  if (Array.isArray(value)) return compactText(value.map(item => extractVisibleText(item, depth + 1)).filter(Boolean).join(' '))
  if (typeof value !== 'object') return ''
  if (typeof value.text === 'string') return compactText(value.text)
  if (typeof value.content === 'string') return compactText(value.content)
  if (value.message && typeof value.message === 'object') return extractVisibleText(value.message, depth + 1)
  if (value.content) return extractVisibleText(value.content, depth + 1)
  return ''
}

function pushPreviewLine(lines, role, text) {
  const normalized = compactText(text)
  if (!normalized) return
  const prefix = role === 'user' ? '你' : role === 'assistant' ? 'Agent' : role || '消息'
  const line = `${prefix}: ${normalized}`
  if (lines[lines.length - 1] !== line) lines.push(line)
}

function parseCodexPreview(text, fallback = {}) {
  const lines = []
  const meta = { id: fallback.sessionId || '', cwd: fallback.cwd || '', updatedAt: '' }
  let lastUser = ''
  for (const raw of text.split('\n')) {
    if (!raw.trim().startsWith('{')) continue
    let item
    try {
      item = JSON.parse(raw)
    } catch {
      continue
    }
    if (item.timestamp) meta.updatedAt = item.timestamp
    if (item.type === 'session_meta' && item.payload) {
      meta.id = meta.id || item.payload.id || ''
      meta.cwd = meta.cwd || item.payload.cwd || ''
      meta.updatedAt = meta.updatedAt || item.payload.timestamp || ''
      continue
    }
    if (item.type === 'response_item' && item.payload?.role) {
      if (item.payload.role !== 'user' && item.payload.role !== 'assistant') continue
      const role = item.payload.role
      const visible = extractVisibleText(item.payload.content)
      if (role === 'user' && visible) lastUser = visible
      pushPreviewLine(lines, role, visible)
      continue
    }
    if (item.type === 'event_msg' && item.payload?.message) {
      pushPreviewLine(lines, 'Agent', item.payload.message)
    }
  }
  const cwdName = meta.cwd ? path.basename(meta.cwd) : ''
  const title = lastUser ? compactText(lastUser).slice(0, 48) : cwdName || `Codex ${String(meta.id || '').slice(0, 8)}`
  return { title, cwd: meta.cwd, updatedAt: meta.updatedAt, lines: lines.slice(-4) }
}

function parseClaudePreview(text, fallback = {}) {
  const lines = []
  const meta = { id: fallback.sessionId || '', cwd: fallback.cwd || '', updatedAt: '' }
  let lastUser = ''
  for (const raw of text.split('\n')) {
    if (!raw.trim().startsWith('{')) continue
    let item
    try {
      item = JSON.parse(raw)
    } catch {
      continue
    }
    if (item.timestamp) meta.updatedAt = item.timestamp
    meta.id = meta.id || item.sessionId || ''
    meta.cwd = meta.cwd || item.cwd || ''
    if (item.type !== 'user' && item.type !== 'assistant') continue
    const role = item.type === 'user' ? 'user' : 'assistant'
    const visible = extractVisibleText(item.message?.content)
    if (role === 'user' && visible) lastUser = visible
    pushPreviewLine(lines, role, visible)
  }
  const cwdName = meta.cwd ? path.basename(meta.cwd) : ''
  const title = lastUser ? compactText(lastUser).slice(0, 48) : cwdName || `Claude ${String(meta.id || '').slice(0, 8)}`
  return { title, cwd: meta.cwd, updatedAt: meta.updatedAt, lines: lines.slice(-4) }
}

function resolvePreviewPath(request) {
  const preferred = request?.transcriptPath || request?.agentTranscriptPath || ''
  if (!preferred) return { error: 'missing-transcript-path' }
  const resolved = resolveSafeLocalPath({ path: preferred })
  if (resolved.error) return resolved
  if (!resolved.stat.isFile()) return { error: 'transcript-not-file' }
  return resolved
}

ipcMain.handle('pet:session-preview', async (_e, request) => {
  try {
    const resolved = resolvePreviewPath(request)
    if (resolved.error) return { ok: false, error: resolved.error }
    const text = readTextWindow(resolved.path, resolved.stat)
    const provider = request?.provider === 'claude' ? 'claude' : 'codex'
    const sessionId = request?.sessionId || shortSessionIdFromPath(resolved.path)
    const parser = provider === 'claude' ? parseClaudePreview : parseCodexPreview
    const preview = parser(text, { sessionId, cwd: request?.cwd || '' })
    return {
      ok: true,
      provider,
      sessionId,
      transcriptPath: resolved.path,
      ...preview,
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})

ipcMain.handle('pet:share-session', async (_e, request) => {
  const result = await createSessionShare(request, { homeDir: app.getPath('home') })
  if (result?.ok && result.url) clipboard.writeText(result.url)
  return result?.ok ? { ...result, copied: Boolean(result.url) } : result
})

ipcMain.handle('pet:bridge-tasks', async (_e, request) => {
  return loadBridgeTasks(request, { homeDir: app.getPath('home') })
})

ipcMain.handle('pet:share-bridge-tasks', async (_e, request) => {
  const result = await createBridgeTasksShare(request, { homeDir: app.getPath('home') })
  if (result?.ok && result.url) clipboard.writeText(result.url)
  return result?.ok ? { ...result, copied: Boolean(result.url) } : result
})

ipcMain.handle('pet:open-bridge-tasks-window', () => {
  createBridgeTasksWindow()
  return { ok: true }
})

ipcMain.handle('pet:copy-text', (_e, text) => {
  clipboard.writeText(String(text || ''))
  return { ok: true }
})

ipcMain.handle('pet:read-text', () => {
  return { ok: true, text: clipboard.readText() }
})

ipcMain.handle('pet:lark-inbox', () => {
  return larkInbox?.getSnapshot?.() || { ok: false, enabled: false, error: 'lark inbox not started', chats: [], messages: [] }
})

ipcMain.handle('pet:lark-inbox-refresh', async () => {
  if (!larkInbox) startLarkInbox()
  return larkInbox.refresh({ reason: 'manual' })
})

ipcMain.handle('pet:open-lark-workbench', (_event, request = {}) => {
  if (!larkInbox) startLarkInbox()
  createLarkWorkbenchWindow(request)
  return { ok: true }
})

ipcMain.handle('pet:lark-assistant-state', () => {
  return larkAssistantState()
})

ipcMain.handle('pet:lark-assistant-analyze', async (_e, request) => {
  return analyzeLarkInboxMessage(request)
})

ipcMain.handle('pet:lark-agenda', () => {
  return startLarkAgenda().getState()
})

ipcMain.handle('pet:lark-agenda-refresh', async () => {
  return refreshLarkAgenda()
})

ipcMain.handle('pet:work-items-state', () => {
  return startWorkItemStore().getState()
})

ipcMain.handle('pet:agent-task-board', () => {
  return startAgentTaskBoard().getState()
})

ipcMain.handle('pet:agent-task-event', (_e, event) => {
  return trackAgentTaskEvent(event)
})

ipcMain.handle('pet:agent-task-assign-session', (_e, request) => {
  const result = startAgentTaskBoard().assignSession(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-rename', (_e, request) => {
  const result = startAgentTaskBoard().renameTask(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-create-group', (_e, request) => {
  const result = startAgentTaskBoard().createGroup(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-set-progress', (_e, request) => {
  const result = startAgentTaskBoard().setTaskProgress(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-delete-group', (_e, request) => {
  const result = startAgentTaskBoard().deleteGroup(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-detach-session', (_e, request) => {
  const result = startAgentTaskBoard().detachSession(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-ignore-session', (_e, request) => {
  const result = startAgentTaskBoard().setSessionIgnored(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-add-todo', (_e, request) => {
  const result = startAgentTaskBoard().addTodo(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-update-todo', (_e, request) => {
  const result = startAgentTaskBoard().updateTodo(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:agent-task-delete-todo', (_e, request) => {
  const result = startAgentTaskBoard().deleteTodo(request)
  if (result?.ok) broadcastAgentTaskBoard(result.state)
  return result
})

ipcMain.handle('pet:work-item-create-from-assistant', (_e, request) => {
  return createWorkItemFromAssistant(request)
})

ipcMain.handle('pet:work-item-create-lark', async (_e, request) => {
  return startWorkItemStore().createLarkTask(String(request?.id || ''))
})

ipcMain.handle('pet:work-items-sync', async (_e, request) => {
  const id = String(request?.id || '').trim()
  return id
    ? startWorkItemStore().syncLarkTask(id)
    : startWorkItemStore().syncAll()
})

ipcMain.handle('pet:work-item-complete', async (_e, request) => {
  return startWorkItemStore().setCompleted(String(request?.id || ''), request?.completed !== false)
})

ipcMain.handle('pet:work-item-priority', (_e, request) => {
  return startWorkItemStore().patch(String(request?.id || ''), { priority: request?.priority })
})

ipcMain.handle('pet:work-item-agent', async (_e, request) => {
  return runWorkItemAgent(request)
})

ipcMain.handle('pet:knowledge-state', () => {
  return startKnowledgeHub().getState()
})

ipcMain.handle('pet:knowledge-search', async (_e, request) => {
  return searchKnowledge(request)
})

ipcMain.handle('pet:knowledge-save-result', (_e, request) => {
  return startKnowledgeHub().saveSearchResult(String(request?.key || ''))
})

ipcMain.handle('pet:knowledge-capture-idea', (_e, request) => {
  return startKnowledgeHub().captureIdea(request?.text)
})

ipcMain.handle('pet:knowledge-capture-clipboard', async () => {
  try {
    return await startKnowledgeHub().captureClipboard(clipboard.readText())
  } catch (error) {
    return { ok: false, error: error?.message || String(error) }
  }
})

ipcMain.handle('pet:knowledge-summarize', async (_e, request) => {
  return summarizeKnowledgeItem(request)
})

ipcMain.handle('pet:lark-draft-apply', async (_e, request) => {
  return applyLarkDraft(request)
})

ipcMain.handle('pet:lark-base-sink', () => {
  return startLarkBaseSink().getSummary()
})

ipcMain.handle('pet:lark-base-open', async () => {
  const summary = startLarkBaseSink().getSummary()
  if (!summary.url) return { ok: false, error: 'lark base is not configured' }
  await shell.openExternal(summary.url)
  return { ok: true, url: summary.url }
})

ipcMain.handle('pet:lark-web-push-status', () => {
  return larkWebPush?.getStatus?.() || { ok: false, enabled: false, running: false, error: 'lark web push not started' }
})

ipcMain.handle('pet:lark-web-push-open', () => {
  if (!larkWebPush) startLarkWebPush()
  return larkWebPush.showWindow()
})

ipcMain.handle('pet:lark-web-push-reload', () => {
  if (!larkWebPush) startLarkWebPush()
  return larkWebPush.reload({ show: true })
})

ipcMain.on('pet:lark-web-push-raw', (_event, data) => {
  if (!larkWebPush) startLarkWebPush()
  larkWebPush.handlePush(data)
})

// Growth state (level/exp/food) persisted in userData. (P4)
const stateFile = () => path.join(app.getPath('userData'), 'kodama-state.json')
ipcMain.handle('pet:get-state', () => {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    return null
  }
})
ipcMain.on('pet:save-state', (_e, state) => {
  try {
    writeJsonAtomic(stateFile(), state)
  } catch (err) {
    console.error(`[kodama] save state failed: ${err.message}`)
  }
})

ipcMain.handle('pet:custom-styles', () => getCustomPetStyleStore().getSnapshot())
ipcMain.handle('pet:custom-style-import', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择桌宠形象',
    buttonLabel: '使用这个形象',
    properties: ['openFile'],
    filters: [
      { name: '桌宠图片', extensions: ['png', 'gif', 'webp', 'jpg', 'jpeg'] },
    ],
  })
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true }
  try {
    const imported = getCustomPetStyleStore().importFile(result.filePaths[0])
    return { ...imported, snapshot: getCustomPetStyleStore().getSnapshot() }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
})
ipcMain.handle('pet:custom-style-activate', (_event, id) => {
  const result = getCustomPetStyleStore().activate(id)
  return { ...result, snapshot: getCustomPetStyleStore().getSnapshot() }
})
ipcMain.handle('pet:custom-style-delete', (_event, id) => {
  const result = getCustomPetStyleStore().remove(id)
  return { ...result, snapshot: getCustomPetStyleStore().getSnapshot() }
})

ipcMain.on('pet:accessory-menu', (_e, state) => {
  accessoryMenuState = state && typeof state === 'object' ? state : null
  refreshTray()
})
// 管理中心「配饰商店」:读缓存的配饰目录,以及佩戴/购买命令转发给桌宠渲染端。
ipcMain.handle('pet:get-accessory-catalog', () => accessoryMenuState)
ipcMain.on('pet:equip-accessory-cmd', (_e, payload) => sendToPet('pet:equip-accessory', payload))
ipcMain.on('pet:unlock-accessory-cmd', (_e, payload) => sendToPet('pet:unlock-accessory', payload))

// 管理中心「进化图鉴」:桌宠渲染端上报当前皮肤的进化阶段 + 等级,管理窗读取。
let evolutionState = null
ipcMain.on('pet:evolution-state', (_e, state) => {
  evolutionState = state && typeof state === 'object' ? state : null
})
ipcMain.handle('pet:get-evolution', () => evolutionState)

ipcMain.on('pet:ui-menu-state', (_e, state) => {
  if (state && typeof state === 'object') {
    petUiMenuState = {
      dndMode: state.dndMode === true,
      soundEnabled: state.soundEnabled !== false,
      notificationsEnabled: state.notificationsEnabled !== false,
    }
    refreshTray()
  }
})

const DEFAULT_POMODORO_SETTINGS = Object.freeze({
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  sedentaryMinutes: 45,
})
const pomodoroSettingsFile = () => path.join(app.getPath('userData'), 'kodama-pomodoro.json')

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizePomodoroSettings(input = {}) {
  return {
    focusMinutes: clampInt(input.focusMinutes, 1, 180, DEFAULT_POMODORO_SETTINGS.focusMinutes),
    shortBreakMinutes: clampInt(input.shortBreakMinutes, 1, 60, DEFAULT_POMODORO_SETTINGS.shortBreakMinutes),
    longBreakMinutes: clampInt(input.longBreakMinutes, 1, 120, DEFAULT_POMODORO_SETTINGS.longBreakMinutes),
    longBreakEvery: clampInt(input.longBreakEvery, 1, 12, DEFAULT_POMODORO_SETTINGS.longBreakEvery),
    sedentaryMinutes: clampInt(input.sedentaryMinutes, 0, 240, DEFAULT_POMODORO_SETTINGS.sedentaryMinutes),
  }
}

function loadPomodoroSettings() {
  try {
    return normalizePomodoroSettings(JSON.parse(fs.readFileSync(pomodoroSettingsFile(), 'utf8')))
  } catch {
    return { ...DEFAULT_POMODORO_SETTINGS }
  }
}

function savePomodoroSettings(settings) {
  try {
    writeJsonAtomic(pomodoroSettingsFile(), settings)
  } catch (err) {
    console.error(`[kodama] save pomodoro settings failed: ${err.message}`)
  }
}

function configurePomodoro(settings) {
  const next = normalizePomodoroSettings(settings)
  savePomodoroSettings(next)
  pomodoro?.configure({
    focus: next.focusMinutes * 60,
    short: next.shortBreakMinutes * 60,
    long: next.longBreakMinutes * 60,
    longEvery: next.longBreakEvery,
  })
  resetSedentaryTimer(next)
  refreshTray()
  return next
}

function resetSedentaryTimer(settings = loadPomodoroSettings()) {
  if (sedentaryTimer) {
    clearInterval(sedentaryTimer)
    sedentaryTimer = null
  }
  const minutes = Number(settings.sedentaryMinutes || 0)
  if (!Number.isFinite(minutes) || minutes <= 0) return
  sedentaryTimer = setInterval(() => {
    const phase = pomodoro?.state().phase
    if (phase === 'short_break' || phase === 'long_break') return
    sendToPet('pet-notify', { text: '🪑 久坐啦，起来走两步~', status: 'looking' })
  }, minutes * 60 * 1000)
  sedentaryTimer.unref?.()
}

ipcMain.handle('pet:pomodoro-settings', () => loadPomodoroSettings())
ipcMain.on('pet:pomodoro-settings', (_e, settings) => {
  configurePomodoro(settings)
})

// Feishu (lark) token ledger — accumulated from bridge events (source-tagged).
// Kept in its own file so the renderer's growth-state writes don't clobber it.
// Safe to add on the same machine without double-counting: the bridge runs Codex
// with --ephemeral, so those sessions are NOT in local ~/.codex.
const larkTokensFile = () => path.join(app.getPath('userData'), 'kodama-lark-tokens.json')
function loadLarkLedger() {
  try {
    return JSON.parse(fs.readFileSync(larkTokensFile(), 'utf8'))
  } catch {
    return {}
  }
}

const EMPTY_TOKEN_STATS = Object.freeze({
  today: 0,
  last7: 0,
  total: 0,
  local: Object.freeze({ today: 0, last7: 0, total: 0 }),
  lark: Object.freeze({ today: 0, last7: 0, total: 0 }),
})
let tokenStatsCache = { ...EMPTY_TOKEN_STATS, local: { ...EMPTY_TOKEN_STATS.local }, lark: { ...EMPTY_TOKEN_STATS.lark } }
let tokenStatsUpdatedAt = 0
let tokenStatsRefreshPromise = null
let localTokenStatsReady = false

function mergeTokenStats(local, lark) {
  return {
    today: local.today + lark.today,
    last7: local.last7 + lark.last7,
    total: local.total + lark.total,
    local,
    lark,
  }
}

function computeLarkTokenStats(now = new Date()) {
  return tokenUsage.summarizeByDay(loadLarkLedger(), now)
}

function updateLarkTokenStatsCache() {
  const lark = computeLarkTokenStats()
  const local = tokenStatsCache.local || EMPTY_TOKEN_STATS.local
  tokenStatsCache = mergeTokenStats(local, lark)
  tokenStatsUpdatedAt = Date.now()
}

function runTokenStatsWorker() {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, 'token-stats-worker.js')
    const env = { ...process.env }
    if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1'
    const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('token stats worker timed out'))
    }, 5 * 60 * 1000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || `token stats worker exited ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch (err) {
        reject(err)
      }
    })
  })
}

async function computeMergedTokenStatsOffMainThread() {
  const local = await runTokenStatsWorker()
  const lark = computeLarkTokenStats()
  return {
    today: local.today + lark.today,
    last7: local.last7 + lark.last7,
    total: local.total + lark.total,
    local,
    lark,
  }
}

function refreshTokenStats({ force = false } = {}) {
  const maxAgeMs = 5 * 60 * 1000
  if (!force && localTokenStatsReady && tokenStatsUpdatedAt && Date.now() - tokenStatsUpdatedAt < maxAgeMs) {
    return Promise.resolve(tokenStatsCache)
  }
  if (tokenStatsRefreshPromise) return tokenStatsRefreshPromise

  tokenStatsRefreshPromise = computeMergedTokenStatsOffMainThread()
    .then((stats) => {
      tokenStatsCache = stats
      tokenStatsUpdatedAt = Date.now()
      localTokenStatsReady = true
      return tokenStatsCache
    })
    .catch((err) => {
      console.error(`[kodama] token stats refresh failed: ${err.message}`)
      return tokenStatsCache
    })
    .finally(() => {
      tokenStatsRefreshPromise = null
      refreshTray()
    })
  return tokenStatsRefreshPromise
}

function getCachedTokenStats() {
  refreshTokenStats()
  return tokenStatsCache
}

ipcMain.on('pet:add-lark-tokens', (_e, tokens) => {
  const n = Number(tokens)
  if (!Number.isFinite(n) || n <= 0) return
  const day = new Date().toISOString().slice(0, 10)
  const led = loadLarkLedger()
  led[day] = (led[day] || 0) + n
  try {
    writeJsonAtomic(larkTokensFile(), led)
    updateLarkTokenStatsCache()
    refreshTray()
    refreshTokenStats({ force: true })
  } catch (err) {
    console.error(`[kodama] save lark tokens failed: ${err.message}`)
  }
})

// Cross-source token stats: local JSONL (direct) + lark ledger (Feishu), merged.
// Local Codex history can be gigabytes; keep the UI/hook server responsive by
// returning the last cache immediately and refreshing the expensive scan later.
ipcMain.handle('pet:token-stats', async () => {
  try {
    if (!localTokenStatsReady) await refreshTokenStats({ force: true })
    else refreshTokenStats()
    return { ...tokenStatsCache, ready: localTokenStatsReady }
  } catch (err) {
    console.error(`[kodama] token stats failed: ${err.message}`)
    return { ...tokenStatsCache, ready: false }
  }
})

// Local receiver for Claude Code / Codex / Trae hooks. They POST lifecycle events here;
// we map them to pet events (source:'local') and forward to the renderer, so
// local sessions and the Feishu bot share one pet.
const HOOK_TOKEN = process.env.KODAMA_HOOK_TOKEN || '' // optional shared secret
const MAX_BODY_BYTES = 64 * 1024
const HOOK_RECEIPT_LOG_MAX_BYTES = 256 * 1024

function tokenOk(req) {
  if (!HOOK_TOKEN) return true // no token configured -> accept (loopback only)
  const header = req.headers['x-kodama-token'] || ''
  const bearer = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '')
  return header === HOOK_TOKEN || bearer === HOOK_TOKEN
}

// A browser on any site can hit our loopback port (<img src>, fetch no-cors) and
// trigger side-effecting control endpoints. Native callers (curl, the tray, our
// CLI) send neither Sec-Fetch-Site nor a cross-origin Origin, so reject anything
// that looks like a cross-site browser request.
function isCrossSiteBrowserRequest(req) {
  const site = String(req.headers['sec-fetch-site'] || '')
  if (site && site !== 'same-origin' && site !== 'none') return true
  const origin = String(req.headers['origin'] || '')
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return true
  return false
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function clampEventText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function hookReceiptLogFile() {
  return path.join(app.getPath('userData'), 'kodama-hook-events.jsonl')
}

function hookSummaryValue(value, max = 160) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 8).map(item => hookSummaryValue(item, 80)).filter(item => item !== undefined)
  if (typeof value === 'object') return undefined
  return clampEventText(value, max)
}

function hookSummaryFields(data) {
  if (!data || typeof data !== 'object') return {}
  const out = {}
  const names = [
    'hook_event_name',
    'hookEventName',
    'event_name',
    'eventName',
    'hook_event',
    'hookEvent',
    'event_type',
    'eventType',
    'event',
    'type',
    'status',
    'state',
    'phase',
    'result',
    'notification_type',
    'notificationType',
    'message_type',
    'messageType',
    'kodama_agent',
    'kodamaAgent',
    'agent_app',
    'agentApp',
    'session_id',
    'sessionId',
    'conversation_id',
    'conversationId',
    'operation_id',
    'operationId',
    'cwd',
    'current_dir',
    'currentDir',
    'project_dir',
    'projectDir',
    'repo_working_dir',
    'repoWorkingDir',
    'workspace',
    'workspace_path',
    'workspacePath',
    'root',
    'root_dir',
    'rootDir',
    'project_name',
    'projectName',
    'repo_name',
    'repoName',
    'title',
    'task_title',
    'taskTitle',
    'session_title',
    'sessionTitle',
    'summary_title',
    'summaryTitle',
    'prompt',
    'user_prompt',
    'userPrompt',
    'summary',
    'result_summary',
    'resultSummary',
    'last_assistant_message',
    'lastAssistantMessage',
    'client',
    'originator',
    'source_app',
    'sourceApp',
    'app',
    'appName',
    'agent',
    'agent_action_name',
    'agentActionName',
    'agent_name',
    'agentName',
    'tool_name',
    'toolName',
    'message',
    'reason',
    'error',
    'success',
  ]
  for (const name of names) {
    const value = hookSummaryValue(data[name])
    if (value !== undefined && value !== '') out[name] = value
  }
  const toolInfo = data.tool_info && typeof data.tool_info === 'object' ? data.tool_info : {}
  const camelToolInfo = data.toolInfo && typeof data.toolInfo === 'object' ? data.toolInfo : {}
  const commandLine = hookSummaryValue(toolInfo.command_line || toolInfo.commandLine || camelToolInfo.command_line || camelToolInfo.commandLine)
  const toolCwd = hookSummaryValue(toolInfo.cwd || camelToolInfo.cwd)
  if (commandLine !== undefined && commandLine !== '') out.tool_command = commandLine
  if (toolCwd !== undefined && toolCwd !== '') out.tool_cwd = toolCwd
  return out
}

const HOOK_ENDPOINT_CLIENTS = new Map([
  ['gemini', 'Gemini CLI'],
  ['qwen', 'Qwen Code'],
  ['cursor', 'Cursor'],
  ['windsurf', 'Windsurf'],
  ['cascade', 'Windsurf'],
  ['opencode', 'OpenCode'],
  ['goose', 'Goose'],
  ['amp', 'Amp'],
  ['aider', 'Aider'],
  ['zed', 'Zed'],
  ['roo', 'Roo Code'],
  ['cline', 'Cline'],
  ['continue', 'Continue'],
  ['copilot', 'GitHub Copilot'],
  ['devin', 'Devin'],
  ['antigravity', 'Antigravity'],
  ['kiro', 'Kiro'],
])

function hasAnyHookField(data, names) {
  return names.some(name => data[name] !== undefined && data[name] !== null && String(data[name]).trim() !== '')
}

function hookClientForPath(pathname) {
  const match = String(pathname || '').match(/^\/hooks\/([^/?#]+)/)
  if (!match) return ''
  return HOOK_ENDPOINT_CLIENTS.get(match[1].toLowerCase()) || ''
}

function decorateHookPayloadForEndpoint(data, url) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data
  const client = hookClientForPath(url.pathname)
  const event = url.searchParams.get('event') || ''
  if (!client && !event) return data
  const next = { ...data }
  if (client && !hasAnyHookField(next, ['kodama_agent', 'kodamaAgent', 'agent_app', 'agentApp', 'client', 'originator', 'source_app', 'sourceApp', 'app', 'appName'])) {
    next.client = client
  }
  if (event && !hasAnyHookField(next, ['hook_event_name', 'hookEventName', 'event_name', 'eventName', 'hook_event', 'hookEvent', 'event_type', 'eventType', 'event', 'agent_action_name', 'agentActionName'])) {
    next.hook_event_name = event
  }
  return next
}

function isTraeHookReceipt(receipt) {
  const fields = receipt?.fields || {}
  const source = [
    fields.client,
    fields.originator,
    fields.source_app,
    fields.sourceApp,
    fields.app,
    fields.appName,
    fields.agent,
    fields.agent_name,
    fields.agentName,
  ].map(value => String(value || '').toLowerCase()).join(' ')
  if (/(^|\W)(trae|coco)(\W|$)/i.test(source)) return true

  const paths = [
    fields.cwd,
    fields.current_dir,
    fields.currentDir,
    fields.project_dir,
    fields.projectDir,
    fields.repo_working_dir,
    fields.repoWorkingDir,
    fields.workspace,
    fields.workspace_path,
    fields.workspacePath,
    receipt?.mappedCwd,
  ].map(value => String(value || '').replace(/\\/g, '/')).join(' ')
  return /(^|\/)\.trae(?:-cn)?(\/|$)/i.test(paths) || /(^|\/)TRAE SOLO(?: CN)?(\/|$)/i.test(paths)
}

function recordHookReceipt(data, event, urlPath) {
  const object = data && typeof data === 'object' ? data : {}
  const receipt = {
    receivedAt: new Date().toISOString(),
    path: urlPath || '/',
    keys: Object.keys(object).slice(0, 80),
    fields: hookSummaryFields(object),
    mappedType: event?.type || '',
    mappedText: hookSummaryValue(event?.text, 120) || '',
    mappedSessionId: event?.sessionId || event?.session_id || '',
    mappedCwd: event?.cwd || '',
    ignored: !event,
  }
  lastHookReceipt = receipt
  if (!event) lastIgnoredHookReceipt = receipt
  if (isTraeHookReceipt(receipt)) {
    lastTraeHookReceipt = receipt
    if (!event) lastIgnoredTraeHookReceipt = receipt
  }

  try {
    const file = hookReceiptLogFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (fs.existsSync(file) && fs.statSync(file).size > HOOK_RECEIPT_LOG_MAX_BYTES) {
      fs.copyFileSync(file, `${file}.1`)
      fs.truncateSync(file, 0)
    }
    fs.appendFileSync(file, `${JSON.stringify(receipt)}\n`)
  } catch (err) {
    console.error(`[kodama] hook receipt log failed: ${err.message}`)
  }
  return receipt
}

function emitRendererAgentEvent(event) {
  if (!event || !win || win.isDestroyed()) return false
  const enrichedEvent = enrichCodexSessionTitle(event)
  const tracked = trackAgentTaskEvent(enrichedEvent)
  const deliveredEvent = tracked?.ok ? tracked.event : enrichedEvent
  localEventCount += 1
  lastLocalEvent = { ...deliveredEvent, receivedAt: new Date().toISOString() }
  if (petHidden && shouldWakeHiddenPet(deliveredEvent)) setPetHidden(false)
  win.webContents.send('agent-event', deliveredEvent)
  return true
}

function enrichCodexSessionTitle(event) {
  if (!event || event.sessionTitle || event.session_title) return event
  const sid = event.sessionId || event.session_id || event.session
  const title = resolveCodexSessionTitle(sid)
  return title ? { ...event, sessionTitle: title } : event
}

function controlPet(action) {
  if (action === 'show') {
    showPetAndResetPosition()
  } else if (action === 'hide') {
    setPetHidden(true)
  } else if (action === 'toggle') {
    setPetHidden(!petHidden)
  } else if (action === 'panel') {
    showPetAndMaybeTogglePanel(true)
  } else if (action === 'reset-position') {
    showPetAndResetPosition()
  } else if (action === 'bridge-tasks') {
    createBridgeTasksWindow()
  } else if (action === 'lark-workbench') {
    if (!larkInbox) startLarkInbox()
    createLarkWorkbenchWindow()
  } else if (action === 'manage') {
    openManageWindow()
  } else {
    return { ok: false, error: 'unknown-control-action' }
  }
  return {
    ok: true,
    action,
    petHidden,
    windowReady: Boolean(win && !win.isDestroyed()),
  }
}

function shouldWakeHiddenPet(event) {
  return event && ['task_waiting', 'task_failed'].includes(event.type)
}

function startLocalAgentServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (req.method === 'GET' && url.pathname === '/healthz') {
      writeJson(res, 200, {
        ok: true,
        port: LOCAL_AGENT_PORT,
        windowReady: Boolean(win && !win.isDestroyed()),
        petHidden,
        localEventCount,
        lastLocalEvent,
        lastHookReceipt,
        lastIgnoredHookReceipt,
        lastTraeHookReceipt,
        lastIgnoredTraeHookReceipt,
        hookReceiptLogFile: hookReceiptLogFile(),
        lastOpenedTarget,
        uiSettings: {
          ...(lastUiSettings || {}),
          reported: Boolean(lastUiSettings),
          terminalLauncher: terminalLauncherPreference(),
          dndMode: Boolean(petUiMenuState.dndMode),
          soundEnabled: petUiMenuState.soundEnabled !== false,
          notificationsEnabled: petUiMenuState.notificationsEnabled !== false,
        },
        supportedAgentApps: {
          autoHooks: HOOK_AGENTS.map(agent => ({ id: agent.id, label: agent.label })),
          hookEndpoints: Array.from(HOOK_ENDPOINT_CLIENTS.entries()).map(([id, label]) => ({ id, label, path: `/hooks/${id}` })),
        },
        updateStatus: getUpdateStatus(),
        tokenStats: tokenStatsCache,
        larkInbox: larkInbox?.getSummary?.() || null,
        larkArchive: larkArchive?.getSummary?.() || null,
        larkBaseSink: larkBaseSink?.getSummary?.() || null,
        larkWebPush: larkWebPush?.getStatus?.() || null,
        larkAgenda: larkAgenda?.getState?.() || null,
        larkAssistant: {
          resultCount: larkAssistantResults.size,
          pendingCount: larkAssistantPending.size,
          autoQueueCount: larkAssistantAutoQueued.size,
          workbenchVisible: Boolean(larkWorkbenchWin && !larkWorkbenchWin.isDestroyed() && larkWorkbenchWin.isVisible()),
          workbenchStatus: larkWorkbenchStatus,
        },
        workItems: workItemStore?.getState?.() || null,
        agentTaskBoard: agentTaskBoard?.getState?.() || null,
        knowledgeHub: knowledgeHub?.getState?.() || null,
        loginItemEnabled: isLoginItemEnabled(),
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/pet/token-stats') {
      writeJson(res, 200, { ok: true, ...getCachedTokenStats() })
      return
    }
    if (req.method === 'GET' && url.pathname === '/pet/lark-inbox') {
      writeJson(res, 200, larkInbox?.getSnapshot?.() || { ok: false, enabled: false, error: 'lark inbox not started', chats: [], messages: [] })
      return
    }
    if (req.method === 'GET' && url.pathname === '/pet/lark-archive') {
      const archive = startLarkArchive()
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 100)))
      writeJson(res, 200, { ...archive.getSummary(), messages: archive.getRecent(limit) })
      return
    }
    if (req.method === 'GET' && url.pathname === '/pet/lark-base-sink') {
      writeJson(res, 200, startLarkBaseSink().getSummary())
      return
    }
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/pet/lark-base-open') {
      if (isCrossSiteBrowserRequest(req)) {
        res.writeHead(403)
        res.end()
        return
      }
      const summary = startLarkBaseSink().getSummary()
      if (!summary.url) {
        writeJson(res, 404, { ok: false, error: 'lark base is not configured' })
        return
      }
      shell.openExternal(summary.url)
        .then(() => writeJson(res, 200, { ok: true, url: summary.url }))
        .catch(err => writeJson(res, 500, { ok: false, error: err?.message || String(err) }))
      return
    }
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/pet/lark-inbox-refresh') {
      if (isCrossSiteBrowserRequest(req)) {
        res.writeHead(403)
        res.end()
        return
      }
      if (!larkInbox) startLarkInbox()
      larkInbox.refresh({ reason: 'manual' })
        .then(snapshot => writeJson(res, 200, snapshot))
        .catch(err => writeJson(res, 500, { ok: false, error: err?.message || String(err) }))
      return
    }
    if (req.method === 'GET' && url.pathname === '/pet/lark-web-push') {
      writeJson(res, 200, larkWebPush?.getStatus?.() || { ok: false, enabled: false, running: false, error: 'lark web push not started' })
      return
    }
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/pet/lark-web-push-open') {
      if (isCrossSiteBrowserRequest(req)) {
        res.writeHead(403)
        res.end()
        return
      }
      if (!larkWebPush) startLarkWebPush()
      writeJson(res, 200, larkWebPush.showWindow())
      return
    }
    if ((req.method === 'GET' || req.method === 'POST') && url.pathname === '/pet/lark-web-push-reload') {
      if (isCrossSiteBrowserRequest(req)) {
        res.writeHead(403)
        res.end()
        return
      }
      if (!larkWebPush) startLarkWebPush()
      writeJson(res, 200, larkWebPush.reload({ show: true }))
      return
    }
    const controlMatch = url.pathname.match(/^\/pet\/(show|hide|toggle|panel|reset-position|bridge-tasks|lark-workbench|manage)$/)
    if (controlMatch && (req.method === 'GET' || req.method === 'POST')) {
      if (isCrossSiteBrowserRequest(req)) {
        res.writeHead(403)
        res.end()
        return
      }
      writeJson(res, 200, controlPet(controlMatch[1]))
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    if (url.pathname === '/pet/open-target' && isCrossSiteBrowserRequest(req)) {
      res.writeHead(403)
      res.end()
      return
    }
    if (!(req.headers['content-type'] || '').includes('application/json')) {
      res.writeHead(415)
      res.end()
      return
    }
    if (!tokenOk(req)) {
      res.writeHead(401)
      res.end()
      return
    }
    let body = ''
    let aborted = false
    req.on('data', (c) => {
      if (aborted) return
      body += c
      if (body.length > MAX_BODY_BYTES) {
        aborted = true
        res.writeHead(413)
        res.end()
        req.destroy()
      }
    })
    req.on('end', () => {
      if (aborted) return
      let data = {}
      try {
        data = JSON.parse(body || '{}')
      } catch {
        /* ignore malformed body */
      }
      if (url.pathname === '/pet/lark-token-test') {
        const tokens = Number(data.tokens || data.usage || data.total_tokens || 0)
        const larkEvent = {
          type: 'task_done',
          source: 'lark',
          text: clampEventText(data.text || `Feishu token test +${tokens}`),
          tokens: Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0,
          chatId: data.chatId || data.chat_id || '',
          messageId: data.messageId || data.message_id || '',
        }
        emitRendererAgentEvent(larkEvent)
        writeJson(res, 200, { ok: true, event: larkEvent })
        return
      }
      if (url.pathname === '/pet/mcp-state') {
        // MCP set_state tool (src/mcp/) → drive an arbitrary pet status from an
        // agent. Maps the five lifecycle states to local reaction events.
        const STATE_EVENTS = {
          thinking: { type: 'task_progress', text: 'Agent 思考中…' },
          working: { type: 'task_progress', text: 'Agent 工作中…' },
          done: { type: 'task_done', text: '' },
          waiting: { type: 'task_waiting', text: '需要你确认' },
          failed: { type: 'task_failed', text: 'Agent 出错了' },
        }
        const def = STATE_EVENTS[String(data.state || '').trim()]
        if (!def) {
          writeJson(res, 400, { ok: false, error: 'unknown state' })
          return
        }
        const mcpEvent = { type: def.type, source: 'local', text: clampEventText(data.text || def.text) }
        emitRendererAgentEvent(mcpEvent)
        writeJson(res, 200, { ok: true, event: mcpEvent })
        return
      }
      if (url.pathname === '/pet/open-target') {
        openTargetPayload(data)
          .then(result => writeJson(res, result?.ok ? 200 : 500, result))
          .catch(err => writeJson(res, 500, { ok: false, error: err?.message || String(err) }))
        return
      }
      const hookData = decorateHookPayloadForEndpoint(data, url)
      const event = agentEventContext.enrich(enrichTraeEvent(mapHookToEvent(hookData), hookData))
      const receipt = recordHookReceipt(hookData, event, url.pathname)
      if (event) {
        const sid = event.sessionId || event.session_id
        if (sid) cacheSessionTty(sid, event.cwd) // pin tty + cmux surface while alive
        emitRendererAgentEvent(event)
      }
      writeJson(res, 200, { ok: true, event: event || null, receipt })
    })
  })
  server.on('error', (e) => console.error(`[kodama] local agent receiver error: ${e.message}`))
  server.listen(LOCAL_AGENT_PORT, '127.0.0.1', () => {
    console.error(`[kodama] local agent receiver on http://127.0.0.1:${LOCAL_AGENT_PORT}`)
  })
  return server
}

function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

function fmtClock(s) {
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// Live countdown in the menu-bar title (cheap, called every tick).
function updateTrayClock(st) {
  if (!tray || process.platform !== 'darwin') return
  if (!st || st.phase === 'idle') {
    tray.setTitle('Kodama')
    return
  }
  const emoji = st.phase === 'focus' ? '🍅' : '☕'
  tray.setTitle(`Kodama ${emoji} ${fmtClock(st.remaining)}${st.paused ? ' ⏸' : ''}`)
}

function buildAccessoryMenu() {
  if (!accessoryMenuState) return [{ label: '载入中', enabled: false }]
  const slots = Array.isArray(accessoryMenuState.slots) ? accessoryMenuState.slots : []
  const accessories = Array.isArray(accessoryMenuState.accessories) ? accessoryMenuState.accessories : []
  const unlocked = new Set(Array.isArray(accessoryMenuState.unlocked) ? accessoryMenuState.unlocked : [])
  const equipped = accessoryMenuState.equipped && typeof accessoryMenuState.equipped === 'object' ? accessoryMenuState.equipped : {}

  return slots.map((slot) => {
    const slotAccessories = accessories.filter((acc) => acc.slot === slot.id)
    const submenu = [
      {
        label: '不佩戴',
        type: 'radio',
        checked: !equipped[slot.id],
        click: () => sendToPet('pet:equip-accessory', { slot: slot.id, id: null }),
      },
      ...slotAccessories.map((acc) => {
        const isUnlocked = unlocked.has(acc.id)
        const name = acc.icon ? `${acc.icon} ${acc.label}` : acc.label
        // 锁定项:商店件提示售价(去管理中心购买),等级件提示所需等级。
        const lockedLabel = acc.cost ? `🔒 ${name}（${acc.cost}⭐·商店）` : `🔒 Lv.${acc.unlockLevel} ${name}`
        return {
          label: isUnlocked ? name : lockedLabel,
          type: isUnlocked ? 'radio' : 'normal',
          checked: equipped[slot.id] === acc.id,
          enabled: isUnlocked,
          click: () => sendToPet('pet:equip-accessory', { slot: slot.id, id: acc.id }),
        }
      }),
    ]
    return { label: slot.label, submenu }
  })
}

function refreshTray() {
  if (!tray) return
  let stats = tokenStatsCache
  try {
    stats = getCachedTokenStats()
  } catch {
    /* keep cached stats */
  }
  const ps = pomodoro ? pomodoro.state() : { phase: 'idle', paused: false }
  const items = [{ label: 'Kodama 桌宠', enabled: false }, { type: 'separator' }]
  items.push({
    label: petHidden ? '显示桌宠  ⌘⌥K' : '隐藏桌宠  ⌘⌥K',
    click: () => setPetHidden(!petHidden),
  })
  items.push({ label: '事件 / 配置面板  ⌘⌥P', click: () => showPetAndMaybeTogglePanel(true) })
  items.push({ label: '移动桌宠  ⌘⌥M', click: () => showPetAndEnterMoveMode() })
  items.push({ label: '重置桌宠位置', click: () => showPetAndResetPosition() })
  items.push({ label: '管理 / 设置中心…', click: () => openManageWindow() })
  items.push({
    label: '补齐 Agent Hooks → Kodama',
    click: () => {
      const result = registerLocalCliHooks()
      const parts = []
      for (const [key, value] of Object.entries(result.summary || {})) {
        if (!value?.ok) {
          parts.push(`${key} 失败：${value?.error || '未知错误'}`)
          continue
        }
        if (value.added?.length) parts.push(`${key} 已补齐：${value.added.join(', ')}`)
        else if (value.skipped) parts.push(`${key} 已跳过：${value.message || '未安装'}`)
        else parts.push(`${key} 已是最新`)
      }
      const body = `${parts.join('\n')}\n重启对应的 Agent 会话后生效`
      try { new Notification({ title: 'Kodama · Local Hooks', body }).show() } catch { /* ignore */ }
      console.error(`[kodama] register local hooks: ${JSON.stringify(result)}`)
    },
  })
  items.push({ label: 'Bridge 任务详情', click: () => createBridgeTasksWindow() })
  items.push({
    label: '刷新飞书群消息',
    click: () => {
      if (!larkInbox) startLarkInbox()
      larkInbox.refresh({ reason: 'manual' })
        .then((snapshot) => {
          sendToPet('pet:lark-inbox-updated', snapshot)
          try {
            new Notification({
              title: 'Kodama · 飞书群消息',
              body: snapshot.ok
                ? `已读取 ${snapshot.chatCount || 0} 个群，${snapshot.messageCount || 0} 条最近消息`
                : `读取失败：${snapshot.error || '未知错误'}`,
            }).show()
          } catch { /* notification is best-effort */ }
        })
        .catch((err) => {
          try { new Notification({ title: 'Kodama · 飞书群消息', body: `读取失败：${err?.message || err}` }).show() } catch { /* ignore */ }
        })
    },
  })
  items.push({
    label: '打开飞书实时窗口',
    click: () => {
      if (!larkWebPush) startLarkWebPush()
      larkWebPush.showWindow()
    },
  })
  items.push({
    label: '重载飞书实时窗口',
    click: () => {
      if (!larkWebPush) startLarkWebPush()
      larkWebPush.reload({ show: true })
    },
  })
  items.push({
    label: petUiMenuState.dndMode ? '退出勿扰模式' : '进入勿扰模式',
    click: () => sendToPet('pet:set-dnd-mode', !petUiMenuState.dndMode),
  })
  items.push({
    label: '开机自启',
    type: 'checkbox',
    checked: isLoginItemEnabled(),
    click: menuItem => setLoginItemEnabled(menuItem.checked),
  })
  if (ps.phase === 'idle') {
    items.push({ label: '🍅 开始番茄钟', click: () => pomodoro?.start() })
  } else {
    items.push({ label: ps.paused ? '▶ 继续' : '⏸ 暂停', click: () => pomodoro?.pauseResume() })
    items.push({ label: '✕ 放弃', click: () => pomodoro?.abandon() })
  }
  items.push({
    label: '大小',
    submenu: [
      { label: '很小', click: () => setPetScale(0.5) },
      { label: '小', click: () => setPetScale(0.72) },
      { label: '中（默认）', click: () => setPetScale(0.95) },
      { label: '大', click: () => setPetScale(1.2) },
    ],
  })
  items.push({ label: '配饰', submenu: buildAccessoryMenu() })
  const updateMenuItems = buildUpdateMenuItems()
  if (updateMenuItems.length) {
    items.push({ type: 'separator' }, ...updateMenuItems)
  }
  const larkToday = stats.lark?.today || 0
  const inboxSummary = larkInbox?.getSummary?.()
  const webPushSummary = larkWebPush?.getStatus?.()
  items.push(
    { type: 'separator' },
    { label: `飞书群消息：${inboxSummary?.messageCount || 0} 条 / ${inboxSummary?.chatCount || 0} 群`, enabled: false },
    { label: inboxSummary?.updatedAt ? `　更新：${new Date(inboxSummary.updatedAt).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })}` : '　尚未读取', enabled: false },
    { label: `飞书实时：${webPushSummary?.enabled === false ? '关闭' : webPushSummary?.running ? (webPushSummary.injected ? '已注入' : '运行中') : '未运行'}`, enabled: false },
    { label: `今日 token：${fmtTokens(stats.today)}`, enabled: false },
    { label: `　飞书：${fmtTokens(larkToday)} / 本地：${fmtTokens(stats.today - larkToday)}`, enabled: false },
    { label: `近 7 天：${fmtTokens(stats.last7)}`, enabled: false },
    { type: 'separator' },
    { label: '退出 Quit', click: () => app.quit() },
  )
  tray.setContextMenu(Menu.buildFromTemplate(items))
}

function createTray() {
  // Text title is more reliable than emoji-only titles in crowded macOS menu bars.
  const { nativeImage } = require('electron')
  tray = new Tray(nativeImage.createEmpty())
  if (process.platform === 'darwin') tray.setTitle('Kodama')
  tray.setToolTip('Kodama')
  refreshTray()
  setInterval(refreshTray, 5 * 60 * 1000)
}

function registerGlobalShortcuts() {
  const shortcuts = [
    ['CommandOrControl+Option+K', () => setPetHidden(!petHidden)],
    ['CommandOrControl+Option+P', () => showPetAndMaybeTogglePanel(true)],
    ['CommandOrControl+Option+M', () => showPetAndEnterMoveMode()],
  ]
  shortcuts.forEach(([accelerator, handler]) => {
    if (!globalShortcut.register(accelerator, handler)) {
      console.error(`[kodama] global shortcut unavailable: ${accelerator}`)
    }
  })
}

function shortMenuText(text, max = 36) {
  const raw = String(text || '')
  return raw.length > max ? `${raw.slice(0, max - 1)}...` : raw
}

function buildUpdateMenuItems() {
  const update = getUpdateStatus()
  if (!update.supported) return []
  const version = update.version ? ` ${update.version}` : ''
  if (update.downloaded) {
    return [{ label: `安装更新${version}`, click: () => installDownloadedUpdate() }]
  }
  if (update.available) {
    const percent = Number.isFinite(update.progress?.percent) ? `（${Math.round(update.progress.percent)}%）` : ''
    return [{ label: `正在下载更新${version}${percent}`, enabled: false }]
  }
  if (update.checking) return [{ label: '正在检查更新...', enabled: false }]

  const items = [{ label: '检查更新', click: () => checkForUpdates({ manual: true }) }]
  if (update.error) items.push({ label: `更新失败：${shortMenuText(update.error)}`, enabled: false })
  return items
}

app.whenReady().then(() => {
  console.error('[kodama] app ready')
  loadSessionTtyCache()
  // macOS: become an accessory (agent) app — no Dock icon, never grabs a Space.
  // The other half (with the pet window's type:'panel') of reliably floating
  // over other apps' native fullscreen spaces.
  if (process.platform === 'darwin') app.setActivationPolicy('accessory')
  startLocalAgentServer()
  createWindow()
  createTray()
  registerAutoUpdater({
    onStatusChange: () => refreshTray(),
    notifyPet: (payload) => sendToPet('pet-notify', payload),
  })
  startLarkArchive()
  startLarkBaseSink()
  startLarkInbox()
  startLarkWebPush()
  startLarkAgenda()
  startWorkItemStore()
  startAgentTaskBoard()
  startKnowledgeHub()
  registerGlobalShortcuts()
  refreshTokenStats({ force: true })
  topmostInterval = setInterval(reassertTopmost, 15 * 1000)
  topmostInterval.unref?.()
  const onDisplayChange = () => { fitWindowToWorkArea(); scheduleTopmostReassert() }
  screen.on('display-added', onDisplayChange)
  screen.on('display-removed', onDisplayChange)
  screen.on('display-metrics-changed', onDisplayChange)
  app.on('browser-window-focus', scheduleTopmostReassert)
  app.on('browser-window-blur', scheduleTopmostReassert)

  // Pomodoro: main owns the timer + tray controls; the renderer just animates.
  const pomodoroSettings = loadPomodoroSettings()
  pomodoro = createPomodoro({
    focus: pomodoroSettings.focusMinutes * 60,
    short: pomodoroSettings.shortBreakMinutes * 60,
    long: pomodoroSettings.longBreakMinutes * 60,
    longEvery: pomodoroSettings.longBreakEvery,
    onNotify: (n) => {
      sendToPet('pet-notify', n) // bubble + status/motion in renderer
      refreshTray() // menu reflects the new phase
    },
    onReward: () => sendToPet('agent-event', { type: 'pomodoro_completed', source: 'local' }),
    onTick: (st) => updateTrayClock(st),
  })
  setInterval(() => pomodoro.tick(), 1000)
  resetSedentaryTimer(pomodoroSettings)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else scheduleTopmostReassert()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  larkInbox?.stop?.()
  larkBaseSink?.stop?.()
  larkWebPush?.stop?.()
  if (larkAgendaTimer) clearInterval(larkAgendaTimer)
  if (workItemSyncTimer) clearInterval(workItemSyncTimer)
  agentTaskBoard?.flush?.()
  disposeAutoUpdater()
  globalShortcut.unregisterAll()
})
