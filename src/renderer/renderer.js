/* global PIXI */
import { connectAgentSync, DEFAULT_BRIDGE_URL } from './agent-sync.js'
import { reactToEvent } from './reactions.js'
import { PET_CONFIG } from './config/pet-config.js'
import { initAccessoryLayer } from './accessories.js'
import { welcomeCopyForGrowth } from './onboarding.js'
import { tokenTotalWhenReady } from './token-feed.js'
import { scaledHitboxSize } from './pet-hitbox.js'
import {
  areasToWindowRects,
  clampFloatingHeight,
  pickDisplayArea,
} from './display-area.js'
import { anchoredConfirmRect } from './appearance-confirm.js'
import { ACCESSORIES, ACCESSORY_SLOTS } from './config/accessories.js'
import {
  DEFAULT_PET_FAMILY_ID,
  DEFAULT_PET_RENDER,
  PET_FAMILIES,
  petFamilyById,
} from './config/appearance.js'
import {
  clampPetScale,
  UI_SETTINGS_VERSION,
  uiSettingsSourceForVersion,
} from './config/ui-settings.js'
import {
  companionDelayMs,
  companionMomentAt,
  isActiveCompanionMode,
} from './companion-mode.js'
import {
  appearanceState,
  configureAccessories,
  equipAccessory,
  feedManually,
  feedTokens,
  getState as getGrowthState,
  growthScale,
  initGrowth,
  resetGrowth,
  selectGrowthStage,
  selectSkin,
  statusText,
  unequipAccessory,
  unlockWithExp,
} from './growth.js'
import {
  bridgeTaskShareRequestForEvent as buildBridgeTaskShareRequestForEvent,
  eventActorLabel,
  eventAgentLabel,
  eventAppLabel,
  eventBubbleContext,
  eventCurrentText,
  eventExplicitProjectLabel,
  eventLarkReplyMergeKey,
  eventSessionCacheKeys,
  eventSessionTitle,
  eventTaskLabel,
  eventWorkdirLabel,
  eventWorkId,
  inferSessionIdFromTranscriptPath,
  isLarkBridgeAgentEvent,
  sessionRequestForEvent as buildSessionRequestForEvent,
  targetForEvent as buildTargetForEvent,
} from './event-labels.js'

// Live2D model is chosen by `pnpm run setup <name>` (writes ./models/current-model.js).
const FALLBACK_MODEL_URL = './models/wanko/Wanko.model3.json'

const canvas = document.getElementById('pet-canvas')
const bubble = document.getElementById('bubble')
const petDialogue = document.getElementById('pet-dialogue')
const eventPanel = document.getElementById('event-panel')
const panelStatus = document.getElementById('panel-status')
const waitingEvents = document.getElementById('waiting-events')
const doneEvents = document.getElementById('done-events')
const sessionEvents = document.getElementById('session-events')
const agentTaskBoardSummary = document.getElementById('agent-task-board-summary')
const agentTaskBoardRunning = document.getElementById('agent-task-board-running')
const agentTaskBoardList = document.getElementById('agent-task-board-list')
const agentTaskAdd = document.getElementById('agent-task-add')
const larkInboxEvents = document.getElementById('lark-inbox-events')
const larkInboxRefresh = document.getElementById('lark-inbox-refresh')
const larkInboxSummary = document.getElementById('lark-inbox-summary')
const larkWorkbenchOpen = document.getElementById('lark-workbench-open')
const larkWebPushOpen = document.getElementById('lark-web-push-open')
const larkWebPushReload = document.getElementById('lark-web-push-reload')
const larkBaseOpen = document.getElementById('lark-base-open')
const recentEvents = document.getElementById('recent-events')
const configEvents = document.getElementById('config-events')
const panelTabs = document.getElementById('panel-tabs')
const appearancePanel = document.getElementById('appearance-panel')
const appearanceStageName = document.getElementById('appearance-stage-name')
const appearanceStageCopy = document.getElementById('appearance-stage-copy')
const appearanceLevel = document.getElementById('appearance-level')
const appearanceProgressBar = document.getElementById('appearance-progress-bar')
const appearanceProgressLabel = document.getElementById('appearance-progress-label')
const growthJourneyCard = document.getElementById('growth-journey-card')
const growthJourneyBadge = document.getElementById('growth-journey-badge')
const growthJourneyTitle = document.getElementById('growth-journey-title')
const growthJourneyCopy = document.getElementById('growth-journey-copy')
const growthJourneyBar = document.getElementById('growth-journey-bar')
const growthJourneyProgress = document.getElementById('growth-journey-progress')
const growthTokenProgress = document.getElementById('growth-token-progress')
const appearanceConfirm = document.getElementById('appearance-confirm')
const appearanceConfirmCard = document.getElementById('appearance-confirm-card')
const appearanceConfirmTitle = document.getElementById('appearance-confirm-title')
const appearanceConfirmCopy = document.getElementById('appearance-confirm-copy')
const appearanceConfirmCancel = document.getElementById('appearance-confirm-cancel')
const appearanceConfirmAccept = document.getElementById('appearance-confirm-accept')
const petFamilyOptions = document.getElementById('pet-family-options')
const growthStageOptions = document.getElementById('growth-stage-options')
const customStyleOptions = document.getElementById('custom-style-options')
const customStyleUpload = document.getElementById('custom-style-upload')
const skinOptions = document.getElementById('skin-options')
const outfitOptions = document.getElementById('outfit-options')
const appearanceFeed = document.getElementById('appearance-feed')
const panelHeader = document.querySelector('.panel-header')
const panelClose = document.getElementById('event-panel-close')
const bridgeTasksOpen = document.getElementById('bridge-tasks-open')
const manageOpen = document.getElementById('manage-open')
const bridgeTasksRefresh = document.getElementById('bridge-tasks-refresh')
const bridgeTasksShare = document.getElementById('bridge-tasks-share')
const bridgeTasksWindow = document.getElementById('bridge-tasks-window')
const bridgeTasksSummary = document.getElementById('bridge-tasks-summary')
const bridgeTasksList = document.getElementById('bridge-tasks-list')
const metricWaiting = document.getElementById('metric-waiting')
const metricDone = document.getElementById('metric-done')
const metricInbox = document.getElementById('metric-inbox')
const metricTotal = document.getElementById('metric-total')
const metricTasks = document.getElementById('metric-tasks')
const settingPetScale = document.getElementById('setting-pet-scale')
const settingPetScaleValue = document.getElementById('setting-pet-scale-value')
const settingPetOpacity = document.getElementById('setting-pet-opacity')
const settingPetOpacityValue = document.getElementById('setting-pet-opacity-value')
const settingHitboxScale = document.getElementById('setting-hitbox-scale')
const settingHitboxScaleValue = document.getElementById('setting-hitbox-scale-value')
const settingTriggerMode = document.getElementById('setting-trigger-mode')
const settingTerminalLauncher = document.getElementById('setting-terminal-launcher')
const settingEdgeMode = document.getElementById('setting-edge-mode')
const settingPettingEnabled = document.getElementById('setting-petting-enabled')
const settingWanderEnabled = document.getElementById('setting-wander-enabled')
const settingDndMode = document.getElementById('setting-dnd-mode')
const settingSoundEnabled = document.getElementById('setting-sound-enabled')
const settingNotificationsEnabled = document.getElementById('setting-notifications-enabled')
const settingFocusMinutes = document.getElementById('setting-focus-minutes')
const settingShortBreakMinutes = document.getElementById('setting-short-break-minutes')
const settingLongBreakMinutes = document.getElementById('setting-long-break-minutes')
const settingSedentaryMinutes = document.getElementById('setting-sedentary-minutes')
const settingLongBreakEvery = document.getElementById('setting-long-break-every')
const settingLongBreakEveryValue = document.getElementById('setting-long-break-every-value')
const settingBubbleCorner = document.getElementById('setting-bubble-corner')
const settingPanelCorner = document.getElementById('setting-panel-corner')
const settingBubbleAnchor = document.getElementById('setting-bubble-anchor')
const settingBubbleAnchorValue = document.getElementById('setting-bubble-anchor-value')
const settingBubbleGap = document.getElementById('setting-bubble-gap')
const settingBubbleGapValue = document.getElementById('setting-bubble-gap-value')
const settingTaskBubblesVisible = document.getElementById('setting-task-bubbles-visible')
const settingExportConfig = document.getElementById('setting-export-config')
const settingImportConfig = document.getElementById('setting-import-config')
const settingUpdateStatus = document.getElementById('setting-update-status')
const settingCheckUpdate = document.getElementById('setting-check-update')
const settingInstallUpdate = document.getElementById('setting-install-update')
const settingMovePet = document.getElementById('setting-move-pet')
const settingHidePet = document.getElementById('setting-hide-pet')
const bubbleHoverTip = document.createElement('div')
bubbleHoverTip.id = 'bubble-hover-tip'
bubbleHoverTip.className = 'hidden'
document.body.appendChild(bubbleHoverTip)

// Active rendering backend: { getBounds(), playMotion(pref), setStatus(status) }.
let backend = null
let activeGifConfig = null // set when the gif backend is active (for evolution图鉴)
let accessoryLayer = null
let panelVisible = false
let agentSyncStatus = 'offline'
let activeAgentConfig = { bridgeUrl: DEFAULT_BRIDGE_URL }
let disposeAgentSync = null
let activeAccessorySlots = ACCESSORY_SLOTS
let activeAccessories = ACCESSORIES
let customStyleState = { activeId: '', styles: [] }
let selectedPetFamilyId = petFamilyById(localStorage.getItem('kodama-pet-family') || DEFAULT_PET_FAMILY_ID).id
let builtInFamilySelectionEnabled = true
let activeAppearanceConfirm = null
let activeBubbleEvent = null
// The first surface should explain the pet itself: egg, token feeding and the
// next evolution. Settings remain one click away but no longer dominate day one.
let activePanelTab = 'tasks'
let eventSeq = 0
let bubbleSeq = 0
const eventLog = []
const bubbleLog = []
const sessionPreviewCache = new Map()
const sessionTitleCache = new Map()
const pendingBubbleShares = new Set()
const pendingSubagentShares = new Set()
const MAX_EVENT_LOG = 40
const MAX_SESSION_TITLE_CACHE = 200
const MAX_TRANSIENT_BUBBLES = 6
const MAX_PERSISTENT_BUBBLES = 120
const PANEL_TABS = new Set(['tasks', 'appearance', 'settings', 'waiting', 'done', 'sessions', 'lark-inbox', 'bridge', 'recent', 'config'])
const BUBBLE_ACTION_DEBOUNCE_MS = 600
const ACTIVE_TARGET_TTL_MS = 10 * 60 * 1000
const TRACKED_TASK_EVENT_TYPES = new Set(['session_title', 'task_started', 'task_progress', 'task_waiting', 'task_done', 'task_failed', 'agent_done'])
const FLOATING_PADDING = 8
const BUBBLE_WIDTH = 292
const PANEL_WIDTH = 340
const BUBBLE_MAX_HEIGHT = 280
const PANEL_MAX_HEIGHT = 440
const PET_DIALOGUE_WIDTH = 172
const PET_DIALOGUE_MAX_HEIGHT = 72
const BUBBLE_TASK_SESSION_LIMIT = 3
const BUBBLE_LOOSE_SESSION_LIMIT = 4
let bridgeTasksSharePending = false
let bridgeTasksState = {
  loading: false,
  loaded: false,
  error: '',
  tasks: [],
  updatedAt: '',
}
let agentTaskBoardState = {
  ok: true,
  tasks: [],
  todayTasks: [],
  counts: { total: 0, today: 0, running: 0, waiting: 0, done: 0, failed: 0 },
  updatedAt: '',
}
let larkInboxState = {
  ok: true,
  enabled: true,
  loading: false,
  loaded: false,
  error: '',
  chats: [],
  messages: [],
  chatCount: 0,
  messageCount: 0,
  attentionCount: 0,
  newCount: 0,
  currentUserReady: false,
  updatedAt: '',
}
let larkWebPushState = {
  ok: true,
  enabled: true,
  running: false,
  windowVisible: false,
  injected: false,
  error: '',
  lastPushAt: '',
  lastMessageAt: '',
  pushCount: 0,
  messageCount: 0,
}
let larkBaseSinkState = {
  ok: true,
  enabled: false,
  baseTokenConfigured: false,
  url: '',
  tableId: '消息',
  queueLength: 0,
  syncedCount: 0,
  error: '',
}
const CORNERS = new Set(['auto', 'near', 'top-left', 'top-right', 'bottom-left', 'bottom-right'])
const TERMINAL_LAUNCHERS = new Set(['auto', 'cmux', 'orca'])
const MOVE_MODE_MS = 15000
const DEFAULT_UI_SETTINGS = {
  version: UI_SETTINGS_VERSION,
  petScale: 0.72,
  petOpacity: 0.82,
  hitboxScale: 0.35,
  triggerMode: 'right',
  terminalLauncher: 'auto',
  edgeMode: 'half',
  pettingEnabled: true,
  wanderEnabled: false,
  dndMode: false,
  soundEnabled: true,
  notificationsEnabled: true,
  taskBubblesVisible: true,
  bubbleCorner: 'near',
  panelCorner: 'near',
  bubbleAnchor: 58,
  bubbleGap: 4,
  petX: null, // pet position inside the full-workarea overlay (null = auto bottom-right)
  petY: null,
  ttsEnabled: false, // speak important events via macOS `say`
}
let uiSettings = loadUiSettings()
let pomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  sedentaryMinutes: 45,
}
let activeHoverBubbleId = ''
let wanderTimer = null
let companionTimer = null
let petDialogueTimer = null
let companionModeActive = null
let companionMomentIndex = 0
let floatingLayoutFrame = 0
let moveModeUntil = 0
let moveModeTimer = 0
let refreshMouseInteractivity = () => {}
let bubbleActionCooldownUntil = 0
let bubbleActionCooldownTimer = 0
let activeViewedTarget = { key: '', at: 0 }
let updateStatus = null
let agentEventQueue = Promise.resolve()
let draggedAgentSessionKey = ''

function clampNumber(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeUiSettings(source = {}) {
  return {
    version: UI_SETTINGS_VERSION,
    petScale: clampPetScale(source.petScale, DEFAULT_UI_SETTINGS.petScale),
    petOpacity: clampNumber(source.petOpacity, 0.25, 1, DEFAULT_UI_SETTINGS.petOpacity),
    hitboxScale: clampNumber(source.hitboxScale, 0.25, 1, DEFAULT_UI_SETTINGS.hitboxScale),
    triggerMode: source.triggerMode === 'left' ? 'left' : 'right',
    terminalLauncher: TERMINAL_LAUNCHERS.has(source.terminalLauncher) ? source.terminalLauncher : DEFAULT_UI_SETTINGS.terminalLauncher,
    edgeMode: source.edgeMode === 'inside' ? 'inside' : DEFAULT_UI_SETTINGS.edgeMode,
    pettingEnabled: source.pettingEnabled !== false,
    wanderEnabled: source.wanderEnabled === true,
    dndMode: source.dndMode === true,
    soundEnabled: source.soundEnabled !== false,
    notificationsEnabled: source.notificationsEnabled !== false,
    taskBubblesVisible: source.taskBubblesVisible !== false,
    bubbleCorner: CORNERS.has(source.bubbleCorner) ? source.bubbleCorner : DEFAULT_UI_SETTINGS.bubbleCorner,
    panelCorner: CORNERS.has(source.panelCorner)
      ? source.panelCorner
      : DEFAULT_UI_SETTINGS.panelCorner,
    bubbleAnchor: clampNumber(source.bubbleAnchor, 35, 80, DEFAULT_UI_SETTINGS.bubbleAnchor),
    bubbleGap: clampNumber(source.bubbleGap, 0, 48, DEFAULT_UI_SETTINGS.bubbleGap),
    petX: Number.isFinite(source.petX) ? source.petX : null,
    petY: Number.isFinite(source.petY) ? source.petY : null,
    ttsEnabled: source.ttsEnabled === true,
  }
}

function loadUiSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('kodama-ui-settings') || '{}')
    // Older settings used a 100% pet and full transparent model bounds. Reset
    // once so running installs pick up the compact, low-misclick defaults.
    const source = uiSettingsSourceForVersion(raw)
    return normalizeUiSettings(source)
  } catch {
    return { ...DEFAULT_UI_SETTINGS }
  }
}

function saveUiSettings() {
  localStorage.setItem('kodama-ui-settings', JSON.stringify(uiSettings))
}

let savePetPosTimer = 0
function scheduleSavePetPos() {
  if (savePetPosTimer) return
  savePetPosTimer = setTimeout(() => {
    savePetPosTimer = 0
    saveUiSettings()
  }, 400)
}

function applyUiSettings() {
  document.documentElement.style.setProperty('--pet-scale', String(uiSettings.petScale))
  document.documentElement.style.setProperty('--pet-opacity', String(uiSettings.petOpacity))
  backend?.applySettings?.()
  syncAccessories()
  window.pet.updateUiMenuState?.({
    dndMode: uiSettings.dndMode,
    soundEnabled: uiSettings.soundEnabled,
    notificationsEnabled: uiSettings.notificationsEnabled,
    taskBubblesVisible: uiSettings.taskBubblesVisible,
  })
  positionBubble()
  positionPanel()
  configureWander()
  configureCompanionMode()
  syncSettingControls()
  window.pet.reportUiSettings?.(uiSettings) // keep the management window in sync
}

function setDndMode(enabled, announce = true) {
  uiSettings.dndMode = enabled === true
  saveUiSettings()
  applyUiSettings()
  if (announce) {
    say(uiSettings.dndMode ? '已进入勿扰模式，事件会静默记录' : '已退出勿扰模式', 2600)
  }
}

function setBooleanSetting(key, value) {
  uiSettings[key] = value === true
  saveUiSettings()
  applyUiSettings()
  if (key === 'taskBubblesVisible') renderBubbles()
}

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizePomodoroSettings(next = {}) {
  return {
    focusMinutes: clampInt(next.focusMinutes, 1, 180, pomodoroSettings.focusMinutes),
    shortBreakMinutes: clampInt(next.shortBreakMinutes, 1, 60, pomodoroSettings.shortBreakMinutes),
    longBreakMinutes: clampInt(next.longBreakMinutes, 1, 120, pomodoroSettings.longBreakMinutes),
    longBreakEvery: clampInt(next.longBreakEvery, 1, 12, pomodoroSettings.longBreakEvery),
    sedentaryMinutes: clampInt(next.sedentaryMinutes, 0, 240, pomodoroSettings.sedentaryMinutes),
  }
}

async function loadPomodoroSettings() {
  try {
    const settings = await window.pet.getPomodoroSettings?.()
    if (settings) pomodoroSettings = normalizePomodoroSettings(settings)
  } catch {
    /* defaults are usable */
  }
  syncSettingControls()
}

function updatePomodoroSettings(patch) {
  pomodoroSettings = normalizePomodoroSettings({ ...pomodoroSettings, ...patch })
  window.pet.updatePomodoroSettings?.(pomodoroSettings)
  syncSettingControls()
}

// Import an optional gitignored local config. Returns null if the file simply
// doesn't exist; surfaces real errors (syntax/path) instead of hiding them.
async function importLocal(path) {
  try {
    return await import(path)
  } catch (e) {
    const msg = String(e?.message || e)
    if (/not found|failed to fetch|cannot find|err_module_not_found/i.test(msg)) return null
    say(`⚠️ ${path} 出错：${msg}`, 6000)
    console.error(`[kodama] local config error: ${path}`, e)
    return null
  }
}

async function loadAccessoryPack() {
  const local = await importLocal('./config/accessories.local.js')
  const overrides = new Map(Array.isArray(local?.ACCESSORIES) ? local.ACCESSORIES.map(item => [item.id, item]) : [])
  activeAccessorySlots = Array.isArray(local?.ACCESSORY_SLOTS) && local.ACCESSORY_SLOTS.length
    ? local.ACCESSORY_SLOTS
    : ACCESSORY_SLOTS
  activeAccessories = ACCESSORIES.map(item => overrides.has(item.id) ? { ...item, ...overrides.get(item.id) } : item)
  for (const [id, item] of overrides) {
    if (!activeAccessories.some(acc => acc.id === id)) activeAccessories.push(item)
  }
}

async function init() {
  try {
    // Ask for OS notification permission up front (Electron usually grants it).
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    // A gitignored config/render.local.js opts into the PRIVATE gif backend;
    // without it we use the public Live2D backend.
    const local = await importLocal('./config/render.local.js')

    const selectedFamily = petFamilyById(selectedPetFamilyId)
    const localRender = local?.RENDER
    const localUsesBuiltInFamily = localRender?.backend === 'gif' && PET_FAMILIES.some((family) => family.set === localRender.gif?.set)
    builtInFamilySelectionEnabled = !localRender || localUsesBuiltInFamily
    const renderConfig = builtInFamilySelectionEnabled ? {
      ...DEFAULT_PET_RENDER,
      gif: {
        ...DEFAULT_PET_RENDER.gif,
        set: selectedFamily.set,
        stages: selectedFamily.stages,
      },
    } : localRender
    if (renderConfig.backend === 'gif') {
      const { initGifBackend } = await import('./backends/gif.js')
      canvas.style.display = 'none'
      activeGifConfig = renderConfig.gif || DEFAULT_PET_RENDER.gif
      backend = initGifBackend(activeGifConfig)
      // The gif backend is a plain <img>; give it the same petX/petY positioning
      // Live2D gets via layout(), or it can't be dragged (drag updates petX/petY
      // then calls applySettings, which was a no-op for gif before).
      backend.applySettings = gifLayout
      backend.el.addEventListener('load', gifLayout)
      window.addEventListener('resize', gifLayout)
      gifLayout()
    } else {
      backend = await initLive2D()
    }

    await refreshCustomStyles({ quiet: true })

    await loadAccessoryPack()
    configureAccessories({ accessories: activeAccessories, slots: activeAccessorySlots })
    setupInteraction()
    // Tray "size" presets push a pet scale into the renderer (the overlay window
    // itself is fixed to the work area now).
    window.pet.onSetScale?.((scale) => {
      uiSettings.petScale = clampPetScale(scale, uiSettings.petScale)
      saveUiSettings()
      applyUiSettings()
    })
    // 管理窗口的「摸摸」按钮
    window.pet.onDoPet?.(() => {
      backend?.playMotion('Tap', 'force') // user-initiated: interrupt whatever is playing
      say('摸摸~ 🐾', 1600)
    })
    // 管理窗口的「投喂」按钮:食物→经验,升级可能变大 → 重排
    window.pet.onDoFeed?.(() => {
      feedManually()
      syncAccessories()
      backend?.applySettings?.()
    })
    // Settings changed from the management window arrive as a patch.
    window.pet.onApplyUiPatch?.((patch) => {
      if (!patch || typeof patch !== 'object') return
      const taskBubbleVisibilityChanged = patch.taskBubblesVisible !== undefined
        && patch.taskBubblesVisible !== uiSettings.taskBubblesVisible
      uiSettings = normalizeUiSettings({ ...uiSettings, ...patch })
      saveUiSettings()
      applyUiSettings()
      if (taskBubbleVisibilityChanged) renderBubbles()
    })
    // Multi-monitor bubble placement: fetch the per-display work areas once,
    // then keep the cache fresh from main's push (display/window changes).
    window.pet.displayAreas?.().then(applyDisplayAreaSnapshot).catch(() => {})
    window.pet.onDisplayAreasChanged?.(applyDisplayAreaSnapshot)
    accessoryLayer = initAccessoryLayer(() => backend?.getBounds?.(), { accessories: activeAccessories })
    applyUiSettings()
    loadPomodoroSettings()
    // One pet, two sources — both flow through the same handler (reaction + growth).
    const hooks = {
      say,
      playMotion: (g, p) => backend?.playMotion?.(g, p),
      onStatus: (s) => {
        agentSyncStatus = s
        console.log('[kodama] status:', s)
        backend?.setStatus?.(s)
        syncEventPanel()
      },
      onChange: syncAccessories,
    }
    await initGrowth(hooks)
    syncAccessories()
    say(welcomeCopyForGrowth(getGrowthState()), 4200)
    const lastTarget = await window.pet.getLastOpenedTarget?.()
    if (lastTarget) noteActiveTarget(lastTarget)
    // initGrowth loads the real level after the first applyUiSettings() already
    // sized the pet at level 1; re-layout once so the pet reflects its actual
    // growth size (growthScale) instead of rendering ~30% too small until the
    // first feed/setting change. Same idempotent layout used on resize/feed.
    backend?.applySettings?.()
    const handleAgentEvent = (incomingEvent) => {
      agentEventQueue = agentEventQueue.then(async () => {
        let event = incomingEvent
        if (
          event
          && !event.taskProgress
          && TRACKED_TASK_EVENT_TYPES.has(event.type)
          && window.pet.trackAgentTaskEvent
        ) {
          try {
            const tracked = await window.pet.trackAgentTaskEvent(event)
            if (tracked?.ok && tracked.event) event = tracked.event
          } catch (error) {
            console.error('[kodama] agent task progress tracking failed:', error)
          }
        }
        recordAgentEvent(event)
        if (event?.type === 'session_title') return
        // 子 Agent / team-worker 事件只进详情统计和 session 列表,不冒泡/不 TTS。
        const isSubagent = event?.subagent === true
          || Boolean(event?.agentTranscriptPath || event?.agent_transcript_path || event?.agentId || event?.agent_id)
        const suppressForegroundBubble = shouldSuppressForegroundBubble(event)
        if (suppressForegroundBubble) clearSupersededTaskBubbles(event)
        if (!uiSettings.dndMode && !isSubagent && !suppressForegroundBubble) {
          reactToEvent(event, hooks, {
            sound: uiSettings.soundEnabled,
            notifications: uiSettings.notificationsEnabled,
          })
          speakEvent(event) // optional macOS TTS for important events
        }
        // Cross-source token ledger: bridge (source 'lark') events may carry tokens.
        if (event.source === 'lark' && event.tokens) window.pet.addLarkTokens?.(event.tokens)
      }).catch((error) => {
        console.error('[kodama] agent event queue failed:', error)
      })
    }

    // source 'lark' arrives via the configured bridge SSE adapter.
    const agentCfg = (await importLocal('./config/agent.local.js'))?.AGENT || {}
    activeAgentConfig = { bridgeUrl: agentCfg.bridgeUrl || DEFAULT_BRIDGE_URL, token: agentCfg.token || '' }
    disposeAgentSync?.() // tear down a prior SSE connection + probe timer if init re-runs
    disposeAgentSync = connectAgentSync(handleAgentEvent, { ...agentCfg, onStatus: hooks.onStatus })
    window.pet.onAgentEvent?.(handleAgentEvent) // source 'local'
    window.pet.onAgentTaskBoardUpdate?.((state) => {
      applyAgentTaskState(state)
      syncEventPanel()
    })
    window.pet.agentTaskBoard?.()
      .then((state) => {
        applyAgentTaskState(state)
        syncEventPanel()
      })
      .catch((error) => {
        console.error('[kodama] agent task board load failed:', error)
      })
    window.pet.onTogglePanel?.(() => togglePanel())
    window.pet.onEnterMoveMode?.(() => enterMoveMode())
    window.pet.onSetDndMode?.((enabled) => setDndMode(enabled === true))
    setupEventPanel()
    setupLarkInbox()
    setupUpdateStatus()
    window.pet.onEquipAccessory?.((request) => {
      const result = equipAccessory(request)
      if (!result.ok) {
        say(`🔒 ${result.reason}`, 2600)
        return
      }
      syncAccessories()
      if (result.action === 'equip') say(`已佩戴 ${result.accessory.label}`, 2200)
      if (result.action === 'unequip') say('已摘下配饰', 1800)
    })
    // 配饰商店购买:用经验解锁,解锁后顺手佩戴。
    window.pet.onUnlockAccessory?.((request) => {
      const result = unlockWithExp(request)
      if (!result.ok) {
        say(`🛒 ${result.reason}`, 2800)
        syncAccessories()
        return
      }
      if (!result.already) {
        backend?.playMotion?.('Tap', 'force') // user-initiated purchase: celebrate now
        say(`🛒 解锁 ${result.accessory.label} ${result.accessory.icon || ''} -${result.cost}⭐`, 2800)
      }
      equipAccessory({ slot: result.accessory.slot, id: result.accessory.id })
      syncAccessories()
    })

    // P4: poll local token usage and feed the pet by token delta.
    refreshTokens()
    setInterval(refreshTokens, 5 * 60 * 1000)

    // P4: pomodoro / sedentary bubbles from the main process.
    window.pet.onNotify?.(({ text, status, motion }) => {
      if (status) backend?.setStatus?.(status)
      if (motion) backend?.playMotion?.(motion)
      if (text) say(text, 3500)
    })
  } catch (err) {
    console.error('[kodama] init failed:', err)
    say('启动失败：' + (err?.message || err), 6000)
  }
}

// Report the slime's evolution stages + current level to the management window
// (via main cache), so it can show an evolution图鉴 — useful since a high-level
// pet only ever shows its final form. No-op for Live2D / stage-less configs.
function syncEvolution(level) {
  if (!activeGifConfig?.stages?.length) {
    window.pet.reportEvolution?.(null)
    return
  }
  window.pet.reportEvolution?.({
    set: activeGifConfig.set || 'default',
    level,
    stages: activeGifConfig.stages.map((s) => ({
      file: s.file,
      minLevel: Number(s.minLevel) || 1,
      label: s.label || '',
    })),
  })
}

function syncAccessories() {
  const state = getGrowthState()
  const look = appearanceState()
  // A user may wear an older unlocked form; local GIF packs follow that form's
  // level threshold while automatic mode continues to track the real level.
  backend?.setLevel?.(look.selectedStage === 'auto' ? state.level : look.stage.minLevel)
  syncEvolution(state.level)
  accessoryLayer?.setEquipped(state.equippedAccessories || {})
  accessoryLayer?.setAppearance({ skinId: look.skin.id, stageId: look.stage.id })
  renderAppearancePanel()
  window.pet.updateAccessoryMenu?.({
    slots: activeAccessorySlots,
    accessories: activeAccessories.map(({ id, slot, label, unlockLevel, icon, cost }) => ({ id, slot, label, unlockLevel, icon, cost })),
    unlocked: state.unlockedAccessories || [],
    equipped: state.equippedAccessories || {},
    exp: state.exp,
    level: state.level,
  })
}

function renderAppearancePanel() {
  if (!appearancePanel) return
  const state = getGrowthState()
  const look = appearanceState()
  const selectedFamily = petFamilyById(selectedPetFamilyId)
  const familyStage = selectedFamily.stages.find(stage => stage.minLevel === look.stage.minLevel) || selectedFamily.stages[0]
  const activeCustomStyle = customStyleState.styles.find(style => style.id === customStyleState.activeId)
  appearanceStageName.textContent = activeCustomStyle?.label || selectedFamily.label
  appearanceStageCopy.textContent = activeCustomStyle
    ? '我的自定义形象 · Agent 状态动画仍然生效'
    : `${familyStage.label} · ${look.stage.description}`
  appearanceLevel.textContent = `Lv.${state.level}`
  appearanceProgressBar.style.width = `${Math.round(look.progress.ratio * 100)}%`
  appearanceProgressLabel.textContent = `${look.progress.value} / ${look.progress.required} 经验`

  const journey = look.journey
  const tokenProgress = look.tokenProgress
  const familyCurrentStage = selectedFamily.stages.find(stage => stage.minLevel === journey.currentStage.minLevel) || journey.currentStage
  const familyNextStage = journey.nextStage
    ? selectedFamily.stages.find(stage => stage.minLevel === journey.nextStage.minLevel) || journey.nextStage
    : null
  growthJourneyCard.dataset.stage = journey.currentStage.id
  growthJourneyBadge.textContent = journey.nextStage
    ? (journey.currentStage.id === 'egg' ? '孵化中' : '进化中')
    : '已完全体'
  growthJourneyTitle.textContent = familyNextStage
    ? `下一站 · ${familyNextStage.label}`
    : `${selectedFamily.label} · 完全体`
  growthJourneyCopy.textContent = journey.nextStage
    ? `当前是 ${familyCurrentStage.label}，还差 ${journey.levelsRemaining} 级；继续使用 Agent 喂养它`
    : `${familyCurrentStage.label}已经长成最终形态，仍会继续积累陪伴记录`
  growthJourneyBar.style.width = `${Math.round(journey.progress.ratio * 100)}%`
  growthJourneyProgress.textContent = journey.nextStage
    ? `${journey.progress.value} / ${journey.progress.required} 成长经验`
    : '最终形态已解锁'
  growthTokenProgress.textContent = `${tokenProgress.value} / ${tokenProgress.required} token`

  petFamilyOptions.innerHTML = PET_FAMILIES.map((family) => [
    `<button type="button" data-pet-family-id="${escapeHtml(family.id)}" class="pet-family-choice${selectedPetFamilyId === family.id ? ' active' : ''}" aria-pressed="${selectedPetFamilyId === family.id}" ${builtInFamilySelectionEnabled ? '' : 'disabled'} title="${escapeHtml(family.description)}">`,
    `<span class="pet-family-preview" style="--family-a:${escapeHtml(family.palette[0])};--family-b:${escapeHtml(family.palette[1])}"><img src="./pets/${escapeHtml(family.set)}/${escapeHtml(family.preview)}" alt="" /></span>`,
    `<strong>${escapeHtml(family.shortLabel)}</strong><small>${escapeHtml(family.symbol)} 从蛋开始</small></button>`,
  ].join('')).join('')

  if (customStyleUpload) {
    customStyleUpload.disabled = typeof backend?.setCustomSource !== 'function'
    customStyleUpload.title = customStyleUpload.disabled ? '当前渲染模式暂不支持图片形象' : '上传 PNG、GIF、WebP 或 JPG'
  }
  customStyleOptions.innerHTML = [
    '<div class="custom-style-card">',
    `<button type="button" data-custom-style-id="" class="custom-style-choice${customStyleState.activeId ? '' : ' active'}" aria-pressed="${!customStyleState.activeId}" title="恢复 Kodama 内置成长形象">`,
    '<span class="custom-style-built-in">✦</span><small>内置精灵</small></button></div>',
    ...customStyleState.styles.map(style => [
      '<div class="custom-style-card">',
      `<button type="button" data-custom-style-id="${escapeHtml(style.id)}" class="custom-style-choice${customStyleState.activeId === style.id ? ' active' : ''}" aria-pressed="${customStyleState.activeId === style.id}" title="使用 ${escapeHtml(style.label)}">`,
      `<img src="${escapeHtml(style.url)}" alt="" /><small>${escapeHtml(style.label)}</small></button>`,
      `<button type="button" data-custom-style-delete="${escapeHtml(style.id)}" class="custom-style-delete" title="删除 ${escapeHtml(style.label)}">×</button>`,
      '</div>',
    ].join('')),
  ].join('')

  growthStageOptions.innerHTML = [
    `<button type="button" data-growth-stage="auto" class="growth-stage-choice${look.selectedStage === 'auto' ? ' active' : ''}" aria-pressed="${look.selectedStage === 'auto'}">`,
    '<span class="stage-symbol">↻</span><strong>自然成长</strong><small>随等级进化</small></button>',
    ...look.stages.map((stage) => [
      `<button type="button" data-growth-stage="${escapeHtml(stage.id)}" class="growth-stage-choice${look.selectedStage === stage.id ? ' active' : ''}${stage.unlocked ? '' : ' locked'}" aria-pressed="${look.selectedStage === stage.id}" ${stage.unlocked ? '' : 'disabled'}>`,
      `<span class="stage-symbol">${escapeHtml(stage.symbol)}</span><strong>${escapeHtml(selectedFamily.stages.find(item => item.minLevel === stage.minLevel)?.label || stage.shortLabel)}</strong>`,
      `<small>${stage.unlocked ? `Lv.${stage.minLevel} 已解锁` : `Lv.${stage.minLevel} 解锁`}</small></button>`,
    ].join('')),
  ].join('')

  skinOptions.innerHTML = look.skins.map((skin) => [
    `<button type="button" data-skin-id="${escapeHtml(skin.id)}" class="skin-choice${look.skin.id === skin.id ? ' active' : ''}" aria-pressed="${look.skin.id === skin.id}" title="${escapeHtml(skin.description)}">`,
    `<span class="skin-swatch" style="--skin-a:${escapeHtml(skin.swatch[0])};--skin-b:${escapeHtml(skin.swatch[1])}"></span>`,
    `<strong>${escapeHtml(skin.label)}</strong></button>`,
  ].join('')).join('')

  const unlocked = new Set(state.unlockedAccessories || [])
  const equipped = state.equippedAccessories || {}
  outfitOptions.innerHTML = activeAccessories.map((accessory) => {
    const isUnlocked = unlocked.has(accessory.id)
    const isEquipped = equipped[accessory.slot] === accessory.id
    const visual = accessory.icon || accessoryPreview(accessory.id)
    const hint = isUnlocked ? (isEquipped ? '已佩戴' : '点击佩戴') : accessory.cost ? `${accessory.cost}经验` : `Lv.${accessory.unlockLevel}`
    return [
      `<button type="button" data-accessory-id="${escapeHtml(accessory.id)}" data-accessory-slot="${escapeHtml(accessory.slot)}" class="outfit-choice${isEquipped ? ' active' : ''}${isUnlocked ? '' : ' locked'}" aria-pressed="${isEquipped}" ${isUnlocked ? '' : 'disabled'} title="${escapeHtml(accessory.label)} · ${escapeHtml(hint)}">`,
      `<span>${escapeHtml(visual)}</span><small>${escapeHtml(accessory.label)}</small></button>`,
    ].join('')
  }).join('')
}

function accessoryPreview(id) {
  if (id === 'sprout') return '🌱'
  if (id === 'round_glasses') return '◎'
  if (id === 'agent_badge') return 'AI'
  if (id === 'focus_halo') return '◌'
  return '✦'
}

function normalizeCustomStyleSnapshot(snapshot) {
  const styles = Array.isArray(snapshot?.styles)
    ? snapshot.styles.filter(style => style?.id && style?.url).map(style => ({
      id: String(style.id),
      label: String(style.label || '我的桌宠'),
      url: String(style.url),
      format: String(style.format || ''),
    }))
    : []
  const activeId = styles.some(style => style.id === snapshot?.activeId) ? String(snapshot.activeId) : ''
  return { activeId, styles }
}

function applyCustomStyleSnapshot(snapshot) {
  customStyleState = normalizeCustomStyleSnapshot(snapshot)
  const active = customStyleState.styles.find(style => style.id === customStyleState.activeId)
  backend?.setCustomSource?.(active?.url || '')
  renderAppearancePanel()
  backend?.applySettings?.()
}

async function refreshCustomStyles({ quiet = false } = {}) {
  if (!window.pet.customStyles) return
  try {
    applyCustomStyleSnapshot(await window.pet.customStyles())
  } catch (error) {
    if (!quiet) say(`读取自定义形象失败：${error?.message || error}`, 3200)
  }
}

function customStyleErrorText(result) {
  if (result?.error === 'unsupported-format') return '仅支持 PNG、GIF、WebP 和 JPG'
  if (result?.error === 'file-too-large') return '图片太大，请选择 25MB 以内的文件'
  if (result?.error === 'file-not-found') return '找不到这个图片文件'
  return result?.error || '操作失败'
}

function positionAppearanceConfirm() {
  if (!activeAppearanceConfirm || !appearanceConfirmCard || !eventPanel) return
  const cardHeight = Math.max(160, appearanceConfirmCard.getBoundingClientRect().height || 176)
  const rect = anchoredConfirmRect({
    panelRect: eventPanel.getBoundingClientRect(),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    cardHeight,
  })
  appearanceConfirmCard.style.left = `${rect.left}px`
  appearanceConfirmCard.style.top = `${rect.top}px`
  appearanceConfirmCard.style.width = `${rect.width}px`
}

function finishAppearanceConfirm(accepted = false) {
  if (!activeAppearanceConfirm) return
  const pending = activeAppearanceConfirm
  activeAppearanceConfirm = null
  appearanceConfirm?.classList.add('hidden')
  appearanceConfirm?.setAttribute('aria-hidden', 'true')
  if (pending.restoreFocus?.isConnected && panelVisible) pending.restoreFocus.focus?.()
  pending.resolve(accepted === true)
}

function requestAppearanceConfirm({ title, copy, confirmLabel = '确认领养' }) {
  if (!appearanceConfirm || !appearanceConfirmCard) return Promise.resolve(false)
  if (activeAppearanceConfirm) finishAppearanceConfirm(false)
  if (appearanceConfirmTitle) appearanceConfirmTitle.textContent = title
  if (appearanceConfirmCopy) appearanceConfirmCopy.textContent = copy
  if (appearanceConfirmAccept) appearanceConfirmAccept.textContent = confirmLabel

  return new Promise((resolve) => {
    activeAppearanceConfirm = { resolve, restoreFocus: document.activeElement }
    appearanceConfirm.classList.remove('hidden')
    appearanceConfirm.setAttribute('aria-hidden', 'false')
    positionAppearanceConfirm()
    requestAnimationFrame(() => appearanceConfirmAccept?.focus())
  })
}

function setupAppearanceConfirm() {
  appearanceConfirm?.addEventListener('click', (event) => {
    event.stopPropagation()
    if (event.target.closest?.('#appearance-confirm-accept')) finishAppearanceConfirm(true)
    else if (event.target.closest?.('[data-appearance-confirm-cancel]')) finishAppearanceConfirm(false)
  })
  window.addEventListener('keydown', (event) => {
    if (!activeAppearanceConfirm) return
    if (event.key === 'Escape') {
      event.preventDefault()
      finishAppearanceConfirm(false)
      return
    }
    if (event.key !== 'Tab' || !appearanceConfirmCancel || !appearanceConfirmAccept) return
    const first = appearanceConfirmCancel
    const last = appearanceConfirmAccept
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  })
}

async function chooseAppearance(target) {
  const restartButton = target.closest?.('#growth-restart')
  if (restartButton) {
    const accepted = await requestAppearanceConfirm({
      title: '重新孵化一颗蛋？',
      copy: '会清空当前等级、经验、食物和已解锁装扮，并恢复为当前伙伴的蛋形态。',
      confirmLabel: '确认重新孵化',
    })
    if (!accepted) return
    if (customStyleState.activeId) {
      const customResult = await window.pet.activateCustomStyle?.('')
      if (!customResult?.ok) {
        say(`暂时无法恢复蛋形象：${customStyleErrorText(customResult)}`, 3200)
        return
      }
      applyCustomStyleSnapshot(customResult.snapshot)
    }
    resetGrowthFromCurrentTokens()
    syncAccessories()
    say(`🥚 新的 ${petFamilyById(selectedPetFamilyId).label} 蛋正在等待 token 能量`, 3600)
    return
  }
  const familyButton = target.closest?.('[data-pet-family-id]')
  if (familyButton) {
    if (!builtInFamilySelectionEnabled) {
      say('本地高级素材包启用时不能切换内置伙伴', 2600)
      return
    }
    const family = petFamilyById(familyButton.dataset.petFamilyId)
    const isNewFamily = family.id !== selectedPetFamilyId
    const currentGrowth = getGrowthState()
    const hasGrowth = currentGrowth.level > 1 || currentGrowth.exp > 0 || currentGrowth.food > 0 || currentGrowth.totalFed > 0
    if (isNewFamily && hasGrowth) {
      const accepted = await requestAppearanceConfirm({
        title: `领养 ${family.label}？`,
        copy: '新伙伴会从一颗蛋开始，并清空当前等级、经验、食物和已解锁装扮。',
        confirmLabel: `领养 ${family.shortLabel}`,
      })
      if (!accepted) return
    }
    if (customStyleState.activeId) {
      const customResult = await window.pet.activateCustomStyle?.('')
      if (!customResult?.ok) {
        say(`暂时无法恢复蛋形象：${customStyleErrorText(customResult)}`, 3200)
        return
      }
      applyCustomStyleSnapshot(customResult.snapshot)
    }
    if (isNewFamily) resetGrowthFromCurrentTokens()
    selectedPetFamilyId = family.id
    localStorage.setItem('kodama-pet-family', family.id)
    activeGifConfig = {
      ...DEFAULT_PET_RENDER.gif,
      set: family.set,
      stages: family.stages,
    }
    backend?.setPetPack?.(activeGifConfig)
    syncAccessories()
    say(isNewFamily ? `🥚 领养了 ${family.label}，从蛋开始陪你成长` : `已换回 ${family.label}`, 2800)
    return
  }
  const uploadButton = target.closest?.('#custom-style-upload')
  if (uploadButton) {
    if (typeof backend?.setCustomSource !== 'function') {
      say('当前渲染模式暂不支持图片形象', 2600)
      return
    }
    const result = await window.pet.importCustomStyle?.()
    if (!result || result.canceled) return
    if (!result.ok) {
      say(`上传失败：${customStyleErrorText(result)}`, 3200)
      return
    }
    applyCustomStyleSnapshot(result.snapshot)
    say(`已换上 ${result.style?.label || '新的桌宠形象'}`, 2200)
    return
  }
  const deleteButton = target.closest?.('[data-custom-style-delete]')
  if (deleteButton) {
    const result = await window.pet.deleteCustomStyle?.(deleteButton.dataset.customStyleDelete)
    if (!result?.ok) say(`删除失败：${customStyleErrorText(result)}`, 2800)
    else {
      applyCustomStyleSnapshot(result.snapshot)
      say('已删除这个自定义形象', 1800)
    }
    return
  }
  const customButton = target.closest?.('[data-custom-style-id]')
  if (customButton) {
    const id = customButton.dataset.customStyleId || ''
    const result = await window.pet.activateCustomStyle?.(id)
    if (!result?.ok) say(`切换失败：${customStyleErrorText(result)}`, 2800)
    else {
      applyCustomStyleSnapshot(result.snapshot)
      const active = customStyleState.styles.find(style => style.id === id)
      say(active ? `已换上 ${active.label}` : '已恢复内置成长形象', 2000)
    }
    return
  }
  const skinButton = target.closest?.('[data-skin-id]')
  if (skinButton) {
    const result = selectSkin(skinButton.dataset.skinId)
    if (result.ok) say(`换上 ${result.skin.label} 皮肤`, 1800)
    syncAccessories()
    return
  }
  const stageButton = target.closest?.('[data-growth-stage]')
  if (stageButton) {
    const result = selectGrowthStage(stageButton.dataset.growthStage)
    if (!result.ok) say(`🔒 ${result.reason}`, 2200)
    else say(stageButton.dataset.growthStage === 'auto' ? '已恢复自然成长' : `换上 ${result.stage.label} 形态`, 2000)
    syncAccessories()
    backend?.applySettings?.()
    return
  }
  const accessoryButton = target.closest?.('[data-accessory-id]')
  if (!accessoryButton) return
  const state = getGrowthState()
  const slot = accessoryButton.dataset.accessorySlot
  const id = accessoryButton.dataset.accessoryId
  const result = state.equippedAccessories?.[slot] === id
    ? unequipAccessory(slot)
    : equipAccessory({ id })
  if (!result.ok) say(`🔒 ${result.reason}`, 2200)
  else say(result.action === 'equip' ? `已佩戴 ${result.accessory.label}` : '已收起这件装扮', 1800)
  syncAccessories()
}

// ---------- Live2D backend ----------
async function initLive2D() {
  const { Live2DModel, MotionPriority } = PIXI.live2d
  const app = new PIXI.Application({
    view: canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  })

  let modelUrl = FALLBACK_MODEL_URL
  try {
    modelUrl = (await import('./models/current-model.js')).CURRENT_MODEL
  } catch (_) {
    /* setup not run yet */
  }

  const model = await Live2DModel.from(modelUrl, { autoInteract: false })
  app.stage.addChild(model)

  const s = model.internalModel?.settings
  const motionGroups = Object.keys(s?.motions ?? s?.json?.FileReferences?.Motions ?? {})

  function layout() {
    const { originalWidth, originalHeight } = model.internalModel
    // The window now spans the whole work area, so scale against a nominal pet
    // box (not the window) and place the model at the persisted petX/petY.
    const PET_BOX_W = 280
    const PET_BOX_H = 400
    const baseScale = Math.min(PET_BOX_W / originalWidth, PET_BOX_H / originalHeight)
    // 等级越高桌宠越大(幼崽→成年),再乘用户的大小偏好。
    const scale = baseScale * uiSettings.petScale * growthScale()
    model.alpha = uiSettings.petOpacity
    model.scale.set(scale)
    const pw = model.width
    const ph = model.height
    const margin = 24
    const defaultArea = viewportVisibleArea()
    const autoX = defaultArea.right - pw - margin
    const autoY = defaultArea.bottom - ph - margin
    // Honor edge mode. Live2D models carry a lot of transparent padding, so
    // clamping fully-inside leaves a big visible gap. 'half' lets the pet hang
    // partway off-screen so its visible body can truly hug/reach the edge.
    const minVisible = uiSettings.edgeMode === 'half' ? 0.42 : 1
    const overflowX = pw * (1 - minVisible)
    const overflowY = ph * (1 - minVisible)
    const px = clampPoint(Number.isFinite(uiSettings.petX) ? uiSettings.petX : autoX, -overflowX, window.innerWidth - pw + overflowX)
    const py = clampPoint(Number.isFinite(uiSettings.petY) ? uiSettings.petY : autoY, -overflowY, window.innerHeight - ph + overflowY)
    model.x = px
    model.y = py
    uiSettings.petX = px
    uiSettings.petY = py
    positionBubble()
    positionPanel()
  }
  layout()
  window.addEventListener('resize', layout)

  // Different models name groups differently (Haru: Tap, Wanko: TapBody).
  function resolveGroup(pref) {
    if (motionGroups.includes(pref)) return pref
    if (/tap|touch/i.test(pref)) {
      const t = motionGroups.find((g) => /tap|touch/i.test(g))
      if (t) return t
    }
    return motionGroups.find((g) => !/idle/i.test(g)) || motionGroups[0] || 'Idle'
  }

  // Map a reaction/group hint to a Cubism MotionPriority so motions queue through
  // the library's MotionManager instead of cutting each other off. Idle motions
  // ride at IDLE (the same lane the built-in idle loop uses, so they never fight a
  // reaction); everything else defaults to NORMAL (reactions wait their turn).
  function priorityForGroup(pref) {
    return /idle/i.test(pref) ? MotionPriority.IDLE : MotionPriority.NORMAL
  }

  // Translate a caller hint into a MotionPriority. Callers stay decoupled from the
  // PIXI enum: pass 'force' for user-initiated taps (interrupts the current motion),
  // 'idle'/'normal' to be explicit, a raw number, or nothing to derive from the group.
  function resolvePriority(hint, pref) {
    if (typeof hint === 'number') return hint
    if (hint === 'force') return MotionPriority.FORCE
    if (hint === 'normal') return MotionPriority.NORMAL
    if (hint === 'idle') return MotionPriority.IDLE
    return priorityForGroup(pref)
  }

  return {
    getBounds: () => model.getBounds(),
    playMotion(pref, priority) {
      try {
        // Omit the index so MotionManager picks a random motion in the group and
        // honors the priority for queueing (vs. a bare model.motion() that cut in).
        model.motion(resolveGroup(pref), undefined, resolvePriority(priority, pref))
      } catch (_) {
        /* ignore */
      }
    },
    setStatus() {
      /* Live2D reacts through playMotion; no per-status sprite swap */
    },
    applySettings: layout,
  }
}

// ---------- window interaction (backend-agnostic) ----------
function clampPoint(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function petBounds() {
  if (!backend?.getBounds) return null
  const b = backend.getBounds()
  if (!b || b.width <= 0 || b.height <= 0) return null
  return b
}

function isMoveModeActive() {
  return moveModeUntil > Date.now()
}

function interactivePetBounds() {
  const b = petBounds()
  if (!b) return null
  if (isMoveModeActive()) return b
  const { width, height } = scaledHitboxSize({
    width: b.width,
    height: b.height,
    scale: uiSettings.hitboxScale,
  })
  const centerX = b.x + b.width / 2
  const centerY = b.y + b.height * 0.66
  return {
    x: clampPoint(centerX - width / 2, b.x, b.x + b.width - width),
    y: clampPoint(centerY - height / 2, b.y, b.y + b.height - height),
    width,
    height,
  }
}

function dragVisibleBounds() {
  const floating = floatingVisibleBounds()
  if (floating) return floating
  const b = petBounds()
  if (!b) return null
  return {
    ...b,
    minVisibleRatio: uiSettings.edgeMode === 'half' ? 0.42 : 1,
  }
}

// Position the gif backend's <img> by petX/petY, mirroring Live2D's layout() so
// the slime can be dragged and hugs edges. Scale/opacity also ride here (baked
// into width/height) instead of the CSS transform, so getBounds stays truthful.
function gifLayout() {
  const img = backend?.el
  if (!img) return
  const natW = Number(activeGifConfig?.displayWidth) || img.naturalWidth || 212
  const natH = Number(activeGifConfig?.displayHeight) || img.naturalHeight || 159
  const scale = uiSettings.petScale * growthScale()
  const pw = natW * scale
  const ph = natH * scale
  img.style.maxWidth = 'none'
  img.style.maxHeight = 'none'
  img.style.transform = 'none'
  img.style.bottom = 'auto'
  img.style.width = `${pw}px`
  img.style.height = `${ph}px`
  img.style.opacity = String(uiSettings.petOpacity)
  const margin = 24
  const defaultArea = viewportVisibleArea()
  const autoX = defaultArea.right - pw - margin
  const autoY = defaultArea.bottom - ph - margin
  // gif sprites are tight (little transparent padding), so 'half' is gentler here
  // than for Live2D (whose models carry big padding) — otherwise the body gets cut.
  const minVisible = uiSettings.edgeMode === 'half' ? 0.7 : 1
  const overflowX = pw * (1 - minVisible)
  const overflowY = ph * (1 - minVisible)
  const px = clampPoint(Number.isFinite(uiSettings.petX) ? uiSettings.petX : autoX, -overflowX, window.innerWidth - pw + overflowX)
  const py = clampPoint(Number.isFinite(uiSettings.petY) ? uiSettings.petY : autoY, -overflowY, window.innerHeight - ph + overflowY)
  img.style.left = `${px}px`
  img.style.top = `${py}px`
  uiSettings.petX = px
  uiSettings.petY = py
  positionBubble()
  positionPanel()
}

function overPet(x, y) {
  const b = interactivePetBounds()
  if (!b) return false
  return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height
}

function overElement(el, x, y) {
  if (!el || el.classList.contains('hidden')) return false
  const r = el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function overInteractiveSurface(x, y) {
  return panelVisible
    || overElement(bubble, x, y)
    || overPet(x, y)
}

function areBubbleActionsCoolingDown() {
  return bubbleActionCooldownUntil > Date.now()
}

function debounceBubbleActions(ms = BUBBLE_ACTION_DEBOUNCE_MS) {
  bubbleActionCooldownUntil = Date.now() + ms
  if (bubbleActionCooldownTimer) clearTimeout(bubbleActionCooldownTimer)
  bubbleActionCooldownTimer = setTimeout(() => {
    bubbleActionCooldownTimer = 0
    bubbleActionCooldownUntil = 0
    renderBubbles()
  }, ms + 20)
  renderBubbles()
}

function syncMoveModeUi() {
  const active = isMoveModeActive()
  document.body.classList.toggle('move-mode', active)
  if (settingMovePet) {
    settingMovePet.textContent = active ? '拖动模式中…' : '移动桌宠'
    settingMovePet.classList.toggle('active', active)
  }
}

function exitMoveMode({ announce = false } = {}) {
  moveModeUntil = 0
  if (moveModeTimer) {
    clearTimeout(moveModeTimer)
    moveModeTimer = 0
  }
  syncMoveModeUi()
  refreshMouseInteractivity()
  if (announce) say('已退出移动模式', 1600)
}

function enterMoveMode(ms = MOVE_MODE_MS) {
  if (panelVisible) togglePanel(false)
  moveModeUntil = Date.now() + ms
  if (moveModeTimer) clearTimeout(moveModeTimer)
  moveModeTimer = setTimeout(() => {
    moveModeTimer = 0
    exitMoveMode()
  }, ms + 20)
  syncMoveModeUi()
  refreshMouseInteractivity()
  say('移动模式已开启：按住左键拖动桌宠，Esc 退出', 2600)
}

function setupInteraction() {
  let ignoring = true
  let dragging = false
  let lastX = 0
  let lastY = 0
  let lastClientX = -1
  let lastClientY = -1
  let suppressOutsidePanelClick = false

  function startDrag(e, { tap = false } = {}) {
    dragging = true
    lastX = e.screenX
    lastY = e.screenY
    if (tap) onTap()
  }

  function syncIgnoringState() {
    if (dragging) return
    const over = overInteractiveSurface(lastClientX, lastClientY)
    if (over && ignoring) {
      ignoring = false
      window.pet.setIgnoreMouse(false)
    } else if (!over && !ignoring) {
      ignoring = true
      window.pet.setIgnoreMouse(true, { forward: true })
    }
  }

  refreshMouseInteractivity = syncIgnoringState

  function targetInsidePanel(target) {
    return Boolean(target?.nodeType && (
      eventPanel?.contains(target)
      || appearanceConfirm?.contains(target)
    ))
  }

  window.addEventListener('mousedown', (e) => {
    if (!panelVisible || targetInsidePanel(e.target)) return
    suppressOutsidePanelClick = true
    e.preventDefault()
    e.stopPropagation()
    togglePanel(false)
  }, true)

  window.addEventListener('click', (e) => {
    if (!suppressOutsidePanelClick) return
    suppressOutsidePanelClick = false
    e.preventDefault()
    e.stopPropagation()
  }, true)

  window.addEventListener('blur', () => {
    if (panelVisible) togglePanel(false)
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMoveModeActive()) {
      e.preventDefault()
      exitMoveMode({ announce: true })
    }
  })

  window.addEventListener('mousemove', (e) => {
    lastClientX = e.clientX
    lastClientY = e.clientY
    if (dragging) {
      // Move the pet *within* the full-workarea overlay; layout() re-clamps so
      // it can hug any edge, and repositions the bubble adaptively.
      const baseX = Number.isFinite(uiSettings.petX) ? uiSettings.petX : 0
      const baseY = Number.isFinite(uiSettings.petY) ? uiSettings.petY : 0
      uiSettings.petX = baseX + (e.screenX - lastX)
      uiSettings.petY = baseY + (e.screenY - lastY)
      lastX = e.screenX
      lastY = e.screenY
      backend?.applySettings?.()
      scheduleSavePetPos()
      return
    }
    syncIgnoringState()
  })

  window.addEventListener('mousedown', (e) => {
    if (
      panelVisible
      || e.button !== 0
      || overElement(bubble, e.clientX, e.clientY)
    ) return
    if (!overPet(e.clientX, e.clientY)) return
    // 左键直接按在桌宠身上即可拖动(抓住就拖,符合直觉);静止点击不会移动它,
    // 左键触发模式下静止点击=摸摸。右键仍打开面板。
    startDrag(e, { tap: uiSettings.triggerMode === 'left' && !isMoveModeActive() })
  })

  window.addEventListener('mouseup', () => {
    if (dragging) saveUiSettings()
    dragging = false
    syncIgnoringState()
  })

  window.addEventListener('contextmenu', (e) => {
    if (!overInteractiveSurface(e.clientX, e.clientY)) return
    e.preventDefault()
    togglePanel(true)
  })

  window.addEventListener('dblclick', (e) => {
    if (!uiSettings.pettingEnabled || panelVisible || !overPet(e.clientX, e.clientY)) return
    e.preventDefault()
    backend?.playMotion('Tap', 'force') // double-click petting is a user tap: interrupt
    say('摸摸~', 1600)
  })

  bubble.addEventListener('click', (e) => {
    e.stopPropagation()
    if (e.target.closest?.('[data-agent-session-drag-handle]')) return
    if (e.target.closest?.('[data-dismiss-all-bubbles]')) {
      if (areBubbleActionsCoolingDown()) return
      debounceBubbleActions()
      const sessionKeys = [...new Set(bubbleLog
        .filter(item => item?.event?.taskProgress?.customGroup !== true)
        .map(item => item?.event?.taskProgress?.sessionKey)
        .filter(Boolean))]
      sessionKeys.forEach((sessionKey) => {
        window.pet.ignoreAgentSession?.({ sessionKey, ignored: true }).catch?.(() => {})
      })
      bubbleLog.length = 0
      hideBubbleHover()
      renderBubbles()
      return
    }
    if (e.target.closest?.('[data-hide-task-bubbles]')) {
      setBooleanSetting('taskBubblesVisible', false)
      return
    }
    const sessionVisibility = e.target.closest?.('[data-bubble-session-visibility]')
    if (sessionVisibility) {
      if (areBubbleActionsCoolingDown()) return
      debounceBubbleActions()
      const sessionKey = sessionVisibility.dataset.bubbleSessionVisibility || ''
      const ignored = sessionVisibility.dataset.ignored !== 'true'
      if (sessionKey) {
        runAgentTaskMutation(() => window.pet.ignoreAgentSession?.({ sessionKey, ignored }))
      }
      return
    }
    const sessionOpen = e.target.closest?.('[data-bubble-session-open]')
    if (sessionOpen) {
      const session = agentSessionByKey(sessionOpen.dataset.bubbleSessionOpen)
      if (session?.target) openTarget(session.target)
      return
    }
    const dismiss = e.target.closest?.('[data-dismiss-bubble]')
    if (dismiss) {
      if (areBubbleActionsCoolingDown()) return
      debounceBubbleActions()
      hideBubbleHover()
      const item = bubbleLog.find(record => record.id === dismiss.dataset.dismissBubble)
      const sessionKey = item?.event?.taskProgress?.sessionKey
      if (sessionKey) {
        runAgentTaskMutation(() => window.pet.ignoreAgentSession?.({
          sessionKey,
          ignored: true,
        }))
      }
      removeBubble(dismiss.dataset.dismissBubble)
      return
    }
    const share = e.target.closest?.('[data-share-bubble]')
    if (share) {
      if (areBubbleActionsCoolingDown()) return
      debounceBubbleActions()
      hideBubbleHover()
      shareBubbleSession(share.dataset.shareBubble)
      return
    }
    const userTask = e.target.closest?.('[data-open-user-task], [data-user-task-id]')
    if (userTask) {
      hideBubbleHover()
      openUnifiedWorkbench('tasks', userTask.dataset.openUserTask || userTask.dataset.userTaskId)
      return
    }
    const card = e.target.closest?.('[data-bubble-id]')
    const item = bubbleLog.find(record => record.id === card?.dataset.bubbleId)
    if (item) {
      const target = targetForEvent(item.event)
      if (target) {
        openTarget(target).then((ok) => {
          if (ok) removeBubble(item.id)
        })
      }
      return
    }
    openBubbleTarget(item?.event || activeBubbleEvent, item?.id || '')
  })

  bubble.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('[data-agent-session-drag]')
    if (!card) return
    draggedAgentSessionKey = card.dataset.agentSessionDrag || ''
    if (!draggedAgentSessionKey) {
      e.preventDefault()
      return
    }
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', draggedAgentSessionKey)
    }
    card.setAttribute('aria-grabbed', 'true')
    bubble.classList.add('is-session-dragging')
    requestAnimationFrame(() => card.classList.add('dragging'))
  })

  bubble.addEventListener('dragover', (e) => {
    const task = e.target.closest?.('[data-agent-task-drop]')
    if (!task || !draggedAgentSessionKey) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    bubble.querySelectorAll('.drop-active').forEach(item => item.classList.remove('drop-active'))
    task.classList.add('drop-active')
  })

  bubble.addEventListener('dragleave', (e) => {
    const task = e.target.closest?.('[data-agent-task-drop]')
    if (task && !task.contains(e.relatedTarget)) task.classList.remove('drop-active')
  })

  bubble.addEventListener('drop', async (e) => {
    const task = e.target.closest?.('[data-agent-task-drop]')
    const sessionKey = e.dataTransfer?.getData('text/plain') || draggedAgentSessionKey
    const taskId = task?.dataset.agentTaskDrop || ''
    clearAgentSessionDragUi()
    if (!task || !sessionKey) return
    e.preventDefault()
    await runAgentTaskMutation(
      () => window.pet.assignAgentSession?.({
        sessionKey,
        taskId,
      }),
      'Session 已归入任务',
    )
  })

  bubble.addEventListener('dragend', clearAgentSessionDragUi)

  bubble.addEventListener('mousemove', (e) => {
    const card = e.target.closest?.('[data-bubble-id]')
    if (!card) {
      hideBubbleHover()
      return
    }
    const item = bubbleLog.find(record => record.id === card.dataset.bubbleId)
    if (!item) {
      hideBubbleHover()
      return
    }
    showBubbleHover(item, e, card)
  })

  bubble.addEventListener('mouseleave', hideBubbleHover)

  panelHeader?.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.target.closest?.('button')) return
    e.preventDefault()
    startDrag(e)
  })
}

function onTap() {
  backend?.playMotion('Tap', 'force') // user tap: interrupt the current motion
  const lark = tokenStats.lark?.today || 0
  const larkPart = lark > 0 ? `（飞书 ${fmtTokens(lark)}）` : ''
  say(`🐾 ${statusText()} · 今日 ${fmtTokens(tokenStats.today)} tok${larkPart}`, 3000)
}

function clearAgentSessionDragUi() {
  draggedAgentSessionKey = ''
  bubble.classList.remove('is-session-dragging')
  bubble.querySelectorAll('.dragging, .drop-active').forEach(item => {
    item.classList.remove('dragging', 'drop-active')
    item.removeAttribute('aria-grabbed')
  })
}

function configureWander() {
  if (wanderTimer) {
    clearInterval(wanderTimer)
    wanderTimer = null
  }
  if (!uiSettings.wanderEnabled) return
  wanderTimer = setInterval(() => {
    if (panelVisible || document.hidden) return
    const b = petBounds()
    if (!b) return
    const dx = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.round(Math.random() * 20))
    const dy = Math.round((Math.random() - 0.5) * 10)
    window.pet.move(dx, dy, dragVisibleBounds())
    scheduleFloatingLayout()
    backend?.playMotion?.('Idle')
  }, 18000)
}

function hidePetDialogue() {
  if (petDialogueTimer) {
    clearTimeout(petDialogueTimer)
    petDialogueTimer = null
  }
  if (!petDialogue) return
  petDialogue.classList.add('hidden')
  petDialogue.textContent = ''
}

function positionPetDialogue() {
  if (!petDialogue || petDialogue.classList.contains('hidden')) return
  positionNearPet(petDialogue, PET_DIALOGUE_WIDTH, 46, PET_DIALOGUE_MAX_HEIGHT)
  const pet = petBounds()
  const dialogue = petDialogue.getBoundingClientRect()
  if (!pet || !dialogue.width || !dialogue.height) return
  const petCenterX = pet.x + pet.width / 2
  const petCenterY = pet.y + pet.height / 2
  petDialogue.dataset.petSide = dialogue.top + dialogue.height / 2 < petCenterY ? 'above' : 'below'
  petDialogue.dataset.petHorizontal = dialogue.left + dialogue.width / 2 < petCenterX ? 'left' : 'right'
}

function showPetDialogue(text, ms = 4400) {
  if (!petDialogue || !companionModeActive || uiSettings.dndMode) return
  if (petDialogueTimer) clearTimeout(petDialogueTimer)
  petDialogue.textContent = String(text || '')
  petDialogue.classList.remove('hidden')
  positionPetDialogue()
  petDialogueTimer = setTimeout(() => {
    petDialogueTimer = null
    petDialogue.classList.add('hidden')
    petDialogue.textContent = ''
  }, ms)
}

function scheduleCompanionMoment(delay = companionDelayMs()) {
  if (companionTimer) clearTimeout(companionTimer)
  if (!companionModeActive) {
    companionTimer = null
    return
  }
  companionTimer = setTimeout(playCompanionMoment, delay)
}

function playCompanionMoment() {
  companionTimer = null
  if (!companionModeActive) return
  if (document.hidden || panelVisible || !bubble.classList.contains('hidden')) {
    scheduleCompanionMoment(8000)
    return
  }
  const moment = companionMomentAt(companionMomentIndex)
  companionMomentIndex += 1
  backend?.playMotion?.(moment.motion, 'normal')
  showPetDialogue(moment.text)
  scheduleCompanionMoment()
}

function configureCompanionMode() {
  const nextActive = isActiveCompanionMode(uiSettings)
  const changed = nextActive !== companionModeActive
  companionModeActive = nextActive
  document.body.dataset.companionActive = String(nextActive)
  if (!nextActive) {
    if (companionTimer) clearTimeout(companionTimer)
    companionTimer = null
    hidePetDialogue()
    return
  }
  if (!changed && companionTimer) {
    positionPetDialogue()
    return
  }
  if (companionTimer) clearTimeout(companionTimer)
  hidePetDialogue()
  scheduleCompanionMoment(changed ? 650 : companionDelayMs())
}

let tokenStats = { today: 0, last7: 0, total: 0, local: {}, lark: {} }

function resetGrowthFromCurrentTokens() {
  const tokenTotal = tokenTotalWhenReady(tokenStats)
  resetGrowth({ tokenTotal })
  if (tokenTotal == null) refreshTokens()
}

function fmtTokens(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(n)
}

async function refreshTokens() {
  try {
    const s = await window.pet.tokenStats?.()
    if (s) {
      tokenStats = s
      const total = tokenTotalWhenReady(s)
      if (total == null) {
        setTimeout(refreshTokens, 10000)
        return
      }
      feedTokens(total)
    }
  } catch (_) {
    /* main not ready */
  }
}

// ---------- bubble ----------
function visibleRectFor(el, fallbackWidth = 240, fallbackHeight = 64) {
  const rect = el?.getBoundingClientRect?.()
  return {
    width: Math.ceil(rect?.width || el?.offsetWidth || fallbackWidth),
    height: Math.ceil(Math.max(el?.scrollHeight || 0, rect?.height || el?.offsetHeight || 0, fallbackHeight)),
  }
}

function viewportVisibleArea() {
  const screenLeft = Number.isFinite(window.screen?.availLeft) ? window.screen.availLeft : 0
  const screenTop = Number.isFinite(window.screen?.availTop) ? window.screen.availTop : 0
  const screenWidth = Number.isFinite(window.screen?.availWidth) ? window.screen.availWidth : window.screen?.width || window.innerWidth
  const screenHeight = Number.isFinite(window.screen?.availHeight) ? window.screen.availHeight : window.screen?.height || window.innerHeight
  const winX = Number.isFinite(window.screenX) ? window.screenX : 0
  const winY = Number.isFinite(window.screenY) ? window.screenY : 0
  const area = {
    left: Math.max(0, screenLeft - winX),
    top: Math.max(0, screenTop - winY),
    right: Math.min(window.innerWidth, screenLeft + screenWidth - winX),
    bottom: Math.min(window.innerHeight, screenTop + screenHeight - winY),
  }
  if (area.right - area.left < 24 || area.bottom - area.top < 24) {
    return {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    }
  }
  return area
}

// Per-display work areas + the overlay window's origin, pushed by the main
// process (fetched once at startup, then kept fresh via pet:display-areas-changed).
// viewportVisibleArea() only describes ONE display, so near-pet elements use
// this to follow the pet across monitors.
let displayAreaSnapshot = null

function applyDisplayAreaSnapshot(snapshot) {
  if (!snapshot || !snapshot.origin || !Array.isArray(snapshot.areas)) return
  displayAreaSnapshot = snapshot
  scheduleFloatingLayout() // the picked display may have changed
}

// Convert the cached screen-coord work areas into window coords (via the
// origin main provided, not window.screenX/screenY, which can lag a move) and
// pick the one containing/nearest the pet's anchor point. Null until the
// first snapshot arrives — callers fall back to viewportVisibleArea().
// areasToWindowRects also corrects the CSS-px/DIP scale drift that mixed-DPI
// display sets cause (a scaled main display skews the overlay's CSS units).
function displayAreaForPoint(point) {
  if (!point || !displayAreaSnapshot) return null
  const { origin, window: windowSize, areas } = displayAreaSnapshot
  const local = areasToWindowRects(areas, origin, windowSize, {
    width: window.innerWidth,
    height: window.innerHeight,
  })
  return pickDisplayArea(local, point, null)
}

function clampElementToVisibleArea(left, top, width, height, padding = FLOATING_PADDING, area = viewportVisibleArea()) {
  const minLeft = area.left + padding
  const maxLeft = area.right - width - padding
  const minTop = area.top + padding
  const maxTop = area.bottom - height - padding
  return {
    left: clampPoint(left, minLeft, Math.max(minLeft, maxLeft)),
    top: clampPoint(top, minTop, Math.max(minTop, maxTop)),
  }
}

function prepareFloatingElement(
  el,
  preferredWidth,
  fallbackHeight,
  padding = FLOATING_PADDING,
  area = viewportVisibleArea(),
  heightCap = Number.POSITIVE_INFINITY,
) {
  const availableWidth = Math.max(44, Math.floor(area.right - area.left - padding * 2))
  const availableHeight = Math.max(44, Math.floor(area.bottom - area.top - padding * 2))
  const width = Math.min(preferredWidth, availableWidth)
  if (el) {
    el.style.width = `${width}px`
    el.style.maxWidth = `${availableWidth}px`
  }
  const rect = visibleRectFor(el, width, fallbackHeight)
  const contentHeight = rect.height
  const maxHeight = clampFloatingHeight(availableHeight, availableHeight, heightCap)
  const height = clampFloatingHeight(contentHeight, availableHeight, heightCap)
  setElementMaxHeight(el, maxHeight)
  return { area, padding, width, height, contentHeight, maxHeight }
}

function setElementMaxHeight(el, maxHeight) {
  if (!el) return
  const height = Math.max(44, Math.floor(maxHeight))
  el.style.maxHeight = `${height}px`
}

function rectIntersection(a, b) {
  if (!a || !b) return null
  const left = Math.max(a.left ?? a.x, b.left ?? b.x)
  const top = Math.max(a.top ?? a.y, b.top ?? b.y)
  const right = Math.min(a.right ?? (a.x + a.width), b.right ?? (b.x + b.width))
  const bottom = Math.min(a.bottom ?? (a.y + a.height), b.bottom ?? (b.y + b.height))
  if (right <= left || bottom <= top) return null
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function rectArea(rect) {
  return rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0
}

function elementDragBounds(el) {
  if (!el || el.classList.contains('hidden')) return null
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  }
}

function floatingVisibleBounds() {
  const rects = [
    panelVisible ? elementDragBounds(eventPanel) : null,
    elementDragBounds(bubble),
  ].filter(Boolean)
  if (!rects.length) return null
  const left = Math.min(...rects.map(rect => rect.left))
  const top = Math.min(...rects.map(rect => rect.top))
  const right = Math.max(...rects.map(rect => rect.right))
  const bottom = Math.max(...rects.map(rect => rect.bottom))
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    minVisibleRatio: 1,
  }
}

function scheduleFloatingLayout() {
  if (floatingLayoutFrame) return
  floatingLayoutFrame = requestAnimationFrame(() => {
    floatingLayoutFrame = 0
    positionBubble()
    positionPanel()
  })
}

function chooseCorner(width, height) {
  const padding = 10
  const area = viewportVisibleArea()
  const pet = petBounds()
  const petCenter = pet
    ? { x: pet.x + pet.width / 2, y: pet.y + pet.height / 2 }
    : { x: (area.left + area.right) / 2, y: area.bottom }
  const candidates = [
    { id: 'top-left', x: area.left + padding, y: area.top + padding },
    { id: 'top-right', x: area.right - width - padding, y: area.top + padding },
    { id: 'bottom-left', x: area.left + padding, y: area.bottom - height - padding },
    { id: 'bottom-right', x: area.right - width - padding, y: area.bottom - height - padding },
  ]
  return candidates
    .map((candidate) => {
      const { left: x, top: y } = clampElementToVisibleArea(candidate.x, candidate.y, width, height, padding)
      const cx = x + width / 2
      const cy = y + height / 2
      const distance = (cx - petCenter.x) ** 2 + (cy - petCenter.y) ** 2
      return { ...candidate, x, y, distance }
    })
    .sort((a, b) => b.distance - a.distance)[0]
}

function setElementCorner(el, corner, fallbackWidth, fallbackHeight, heightCap = Number.POSITIVE_INFINITY) {
  if (!el) return
  if (corner === 'near') {
    positionNearPet(el, fallbackWidth, fallbackHeight, heightCap)
    return
  }
  const { width, height, area, padding, maxHeight } = prepareFloatingElement(
    el, fallbackWidth, fallbackHeight, 10, viewportVisibleArea(), heightCap,
  )
  const chosen = corner === 'auto' ? chooseCorner(width, height).id : corner
  const displayHeight = height
  const top = chosen.includes('top') ? area.top + padding : area.bottom - displayHeight - padding
  const left = chosen.includes('left') ? area.left + padding : area.right - width - padding
  const next = clampElementToVisibleArea(left, top, width, displayHeight, padding)
  setElementMaxHeight(el, maxHeight)
  el.style.transform = 'none'
  el.style.left = `${next.left}px`
  el.style.top = `${next.top}px`
}

function positionNearPet(el, fallbackWidth, fallbackHeight, heightCap = Number.POSITIVE_INFINITY) {
  const pet = petBounds()
  if (!pet) {
    setElementCorner(el, 'top-right', fallbackWidth, fallbackHeight, heightCap)
    return
  }
  // The overlay spans every display, but viewportVisibleArea() describes just
  // one — so a pet on a second monitor would leave the bubble stranded on the
  // primary display. Anchor to the work area of the display the pet is
  // actually on (falling back to the viewport area until main's snapshot arrives).
  const petAnchor = {
    x: pet.x + pet.width / 2,
    y: pet.y + pet.height * (uiSettings.bubbleAnchor / 100),
  }
  const petDisplayArea = displayAreaForPoint(petAnchor)
  const { width, height, maxHeight, area, padding } = prepareFloatingElement(
    el,
    fallbackWidth,
    fallbackHeight,
    FLOATING_PADDING,
    petDisplayArea || viewportVisibleArea(),
    heightCap,
  )
  // Live2D bounds carry a lot of transparent padding, so snuggling against the
  // raw bounds leaves a big visible gap. Anchor the bubble to a centered visible
  // core instead, and keep the gap well under half the pet width.
  const CORE = 0.58
  const coreW = pet.width * CORE
  const coreH = pet.height * CORE
  const gap = Math.min(Math.max(6, uiSettings.bubbleGap), coreW * 0.5)
  const petRect = {
    left: pet.x + (pet.width - coreW) / 2,
    top: pet.y + (pet.height - coreH) / 2,
    right: pet.x + (pet.width + coreW) / 2,
    bottom: pet.y + (pet.height + coreH) / 2,
    width: coreW,
    height: coreH,
  }
  const visiblePet = rectIntersection(petRect, area)
  const anchorX = clampPoint(pet.x + pet.width / 2, area.left + padding, area.right - padding)
  const anchorY = clampPoint(
    pet.y + pet.height * (uiSettings.bubbleAnchor / 100),
    area.top + padding,
    area.bottom - padding,
  )
  const petOffRight = pet.x + pet.width > area.right - padding
  const petOffLeft = pet.x < area.left + padding
  const petOffBottom = pet.y + pet.height > area.bottom - padding
  const petOffTop = pet.y < area.top + padding

  if (visiblePet) {
    const minLeft = area.left + padding
    const maxRight = area.right - padding
    const minTop = area.top + padding
    const maxBottom = area.bottom - padding
    const zones = [
      {
        id: 'above',
        side: anchorX < visiblePet.left + visiblePet.width / 2 ? 'left' : 'right',
        vertical: 'top',
        left: minLeft,
        top: minTop,
        right: maxRight,
        bottom: Math.max(minTop, visiblePet.top - gap),
        preferredLeft: anchorX - width / 2,
        preferredTop: visiblePet.top - gap - Math.min(height, Math.max(44, visiblePet.top - gap - minTop)),
      },
      {
        id: 'below',
        side: anchorX < visiblePet.left + visiblePet.width / 2 ? 'left' : 'right',
        vertical: 'bottom',
        left: minLeft,
        top: Math.min(maxBottom, visiblePet.bottom + gap),
        right: maxRight,
        bottom: maxBottom,
        preferredLeft: anchorX - width / 2,
        preferredTop: visiblePet.bottom + gap,
      },
      {
        id: 'left',
        side: 'left',
        vertical: anchorY < visiblePet.top + visiblePet.height / 2 ? 'top' : 'bottom',
        left: minLeft,
        top: minTop,
        right: Math.max(minLeft, visiblePet.left - gap),
        bottom: maxBottom,
        preferredLeft: visiblePet.left - gap - width,
        preferredTop: anchorY - height / 2,
      },
      {
        id: 'right',
        side: 'right',
        vertical: anchorY < visiblePet.top + visiblePet.height / 2 ? 'top' : 'bottom',
        left: Math.min(maxRight, visiblePet.right + gap),
        top: minTop,
        right: maxRight,
        bottom: maxBottom,
        preferredLeft: visiblePet.right + gap,
        preferredTop: anchorY - height / 2,
      },
    ].map(zone => ({
      ...zone,
      zoneWidth: zone.right - zone.left,
      zoneHeight: zone.bottom - zone.top,
    })).filter(zone => zone.zoneWidth >= width && zone.zoneHeight >= 44)

    const chosen = zones.map((zone) => {
      const displayHeight = Math.min(height, zone.zoneHeight)
      const left = clampPoint(zone.preferredLeft, zone.left, Math.max(zone.left, zone.right - width))
      const top = clampPoint(zone.preferredTop, zone.top, Math.max(zone.top, zone.bottom - displayHeight))
      const edgeBonus =
        (petOffRight && zone.side === 'left' ? 5000 : 0) +
        (petOffLeft && zone.side === 'right' ? 5000 : 0) +
        (petOffBottom && zone.vertical === 'top' ? 2200 : 0) +
        (petOffTop && zone.vertical === 'bottom' ? 2200 : 0)
      const fitsVisibleHeight = zone.zoneHeight >= height ? 100000 : 0
      const centerDistance = (left + width / 2 - anchorX) ** 2 + (top + displayHeight / 2 - anchorY) ** 2
      return {
        ...zone,
        left,
        top,
        displayHeight,
        score: fitsVisibleHeight + edgeBonus + displayHeight * 12 + zone.zoneWidth - centerDistance * 0.01,
      }
    }).sort((a, b) => b.score - a.score)[0]

    if (chosen) {
      setElementMaxHeight(el, Math.min(maxHeight, chosen.zoneHeight))
      el.style.transform = 'none'
      el.style.left = `${chosen.left}px`
      el.style.top = `${chosen.top}px`
      return
    }
  }

  const fallbackCandidates = [
    { left: anchorX - width, top: pet.y - gap - height, side: 'left', vertical: 'top' },
    { left: anchorX, top: pet.y - gap - height, side: 'right', vertical: 'top' },
    { left: anchorX - width, top: pet.y + pet.height + gap, side: 'left', vertical: 'bottom' },
    { left: anchorX, top: pet.y + pet.height + gap, side: 'right', vertical: 'bottom' },
  ].map((candidate) => {
    const next = clampElementToVisibleArea(candidate.left, candidate.top, width, height, padding, area)
    const placed = { left: next.left, top: next.top, right: next.left + width, bottom: next.top + height, width, height }
    const overlap = rectArea(rectIntersection(placed, visiblePet))
    return {
      ...next,
      score: -overlap * 20 - ((next.left - candidate.left) ** 2 + (next.top - candidate.top) ** 2) * 0.02,
    }
  }).sort((a, b) => b.score - a.score)
  const next = fallbackCandidates[0] || clampElementToVisibleArea(area.right - width - padding, area.bottom - height - padding, width, height, padding, area)
  el.style.transform = 'none'
  el.style.left = `${next.left}px`
  el.style.top = `${next.top}px`
}

function positionBubble() {
  if (uiSettings.bubbleCorner !== 'near') {
    setElementCorner(bubble, uiSettings.bubbleCorner, BUBBLE_WIDTH, 54, BUBBLE_MAX_HEIGHT)
  } else {
    positionNearPet(bubble, BUBBLE_WIDTH, 80, BUBBLE_MAX_HEIGHT)
  }
  positionPetDialogue()
}

function positionPanel() {
  if (!eventPanel || eventPanel.classList.contains('hidden')) return
  setElementCorner(eventPanel, uiSettings.panelCorner, PANEL_WIDTH, 260, PANEL_MAX_HEIGHT)
  positionAppearanceConfirm()
}

function bubbleKind(event) {
  if (!event) return 'system'
  if (isWaiting(event)) return 'waiting'
  if (event.source === 'lark') return 'lark'
  if (event.source === 'local') return 'agent'
  if (isDone(event)) return 'done'
  return 'system'
}

// A per-task headline so stacked bubbles are distinguishable at a glance, instead
// of every card reading the same "本地 · 完成". Prefer readable app/project
// context and explicitly skip internal work ids such as Trae's `.trae-cn/work/*`.
function taskName(event) {
  const groupedTask = String(event?.taskProgress?.taskTitle || '').trim()
  if (groupedTask) return groupedTask
  const context = eventBubbleContext(event)
  if (context) return context
  const prompt = eventTaskLabel(event)
  if (prompt) return prompt
  return sourceLabel(event.source)
}

function trimSessionTitleCache() {
  while (sessionTitleCache.size > MAX_SESSION_TITLE_CACHE) {
    const oldest = sessionTitleCache.keys().next().value
    if (!oldest) break
    sessionTitleCache.delete(oldest)
  }
}

function rememberSessionTitle(event) {
  const title = eventSessionTitle(event)
  if (!title) return
  for (const key of eventSessionCacheKeys(event)) {
    sessionTitleCache.delete(key)
    sessionTitleCache.set(key, title)
  }
  trimSessionTitleCache()
}

function cachedSessionTitle(event) {
  const direct = eventSessionTitle(event)
  if (direct) return direct
  for (const key of eventSessionCacheKeys(event)) {
    const title = sessionTitleCache.get(key)
    if (title) return title
  }
  return ''
}

function titleContains(base, title) {
  const left = String(base || '').replace(/\s+/g, ' ').toLowerCase()
  const right = String(title || '').replace(/\s+/g, ' ').toLowerCase()
  return Boolean(right && left.includes(right))
}

function bubbleTitle(event) {
  if (!event) return 'Kodama'
  const actor = eventActorLabel(event)
  const task = taskName(event)
  const suffix = event?.taskProgress?.status
    ? agentTaskStatusLabel(event.taskProgress.status)
    : typeLabel(event.type)
  const base = actor && task && actor !== task
    ? `${actor} / ${task} · ${suffix}`
    : actor
      ? `${actor} · ${suffix}`
      : `${task} · ${suffix}`
  const sessionTitle = cachedSessionTitle(event)
  return sessionTitle && !titleContains(base, sessionTitle) ? `${base}（${sessionTitle}）` : base
}

function sessionRequestForEvent(event) {
  return buildSessionRequestForEvent(event, {
    bridgeUrl: activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL,
    token: activeAgentConfig.token || '',
  })
}

function bridgeTaskShareRequestForEvent(event) {
  return buildBridgeTaskShareRequestForEvent(event, {
    bridgeUrl: activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL,
    token: activeAgentConfig.token || '',
  })
}

function bubbleShareTargetForEvent(event) {
  const sessionRequest = sessionRequestForEvent(event)
  if (sessionRequest) return { kind: 'session', request: sessionRequest }
  const bridgeRequest = bridgeTaskShareRequestForEvent(event)
  if (bridgeRequest) return { kind: 'bridge-task', request: bridgeRequest }
  return null
}

function shouldPersistBubble(event) {
  return Boolean(event?.type)
}

function bubbleMergeKey(event) {
  if (!event?.type) return ''
  const larkReplyKey = eventLarkReplyMergeKey(event)
  if (larkReplyKey) return larkReplyKey
  const taskId = String(event?.taskProgress?.taskId || '').trim()
  if (taskId) return `task:${taskId}`
  if (!new Set(['task_started', 'task_progress', 'task_waiting', 'task_done', 'task_failed']).has(event.type)) {
    return ''
  }
  const session = sessionRequestForEvent(event)
  if (session) {
    return `session:${session.provider}:${session.threadId || session.sessionId}`
  }
  const chatId = String(event.chatId || event.chat_id || '').trim()
  const messageId = String(event.messageId || event.message_id || '').trim()
  if (chatId) return `chat:${chatId}:${messageId}`
  const url = String(event.url || event.link || event.deepLink || event.deep_link || '').trim()
  if (url) return `url:${url}`
  const cwd = String(event.cwd || event.projectDir || event.project_dir || event.workspacePath || event.workspace_path || '').trim()
  if (cwd) return `cwd:${event.source || 'local'}:${cwd}`
  return ''
}

function userTaskBubbleTasks() {
  return (agentTaskBoardState.todayTasks || [])
    .filter(task => task.customGroup === true)
    .slice()
    .sort((a, b) => (
      Number(a.progress >= 100) - Number(b.progress >= 100)
      || Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
    ))
}

function userTaskBubbleHtml(task, index = 0) {
  const percent = Math.min(100, Math.max(0, Math.round(Number(task.progress || 0))))
  const sessions = (Array.isArray(task.sessions) ? task.sessions : [])
    .filter(session => session.ignored !== true)
    .slice()
    .sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''))
  const visibleSessions = sessions.slice(0, BUBBLE_TASK_SESSION_LIMIT)
  const nextTodo = (task.todos || []).find(todo => todo.done !== true)
  const moreSessions = Math.max(0, sessions.length - visibleSessions.length)
  return [
    `<article class="bubble-card bubble-user-task" data-status="${escapeHtml(task.status)}" data-user-task-id="${escapeHtml(task.id)}" data-agent-task-drop="${escapeHtml(task.id)}">`,
    '<div class="bubble-task-group-head">',
    '<div class="bubble-task-title">',
    '<span aria-hidden="true"></span>',
    `<strong>${escapeHtml(task.title || '未命名任务')}</strong>`,
    '</div>',
    '<div class="bubble-task-group-actions">',
    `<button type="button" data-open-user-task="${escapeHtml(task.id)}">编辑</button>`,
    index === 0 ? '<button type="button" data-hide-task-bubbles="1" title="隐藏桌面任务气泡">隐藏</button>' : '',
    '</div>',
    '</div>',
    '<div class="bubble-task-summary">',
    `<span>${escapeHtml(agentTaskStatusLabel(task.status))} · ${sessions.length} Session · ${task.openTodoCount || 0} Todo</span>`,
    `<strong>${percent}%</strong>`,
    '</div>',
    `<progress class="bubble-user-task-progress" max="100" value="${percent}" aria-label="任务进度 ${percent}%"></progress>`,
    nextTodo ? `<div class="bubble-user-task-next">下一步：${escapeHtml(shortText(nextTodo.text, 42))}</div>` : '',
    '<div class="bubble-task-session-list">',
    ...(visibleSessions.length
      ? visibleSessions.map(session => bubbleTaskSessionHtml(session))
      : ['<div class="bubble-task-session-empty">暂无 Session，可把待归组卡片拖到这里</div>']),
    moreSessions ? `<button class="bubble-task-more" type="button" data-open-user-task="${escapeHtml(task.id)}">另有 ${moreSessions} 个 Session</button>` : '',
    '</div>',
    '</article>',
  ].join('')
}

function bubbleTaskSessionHtml(session, { loose = false } = {}) {
  const sessionKey = String(session?.key || '')
  const source = agentSessionSourceLabel(session)
  const title = shortText(session?.title || session?.agent || 'Session', 32)
  const current = shortText(session?.currentStep || (session?.status === 'done' ? '已完成' : '准备执行'), 44)
  const status = agentTaskStatusLabel(session?.status)
  return [
    `<article class="bubble-task-session" data-status="${escapeHtml(session?.status || '')}" data-loose="${loose}"${sessionKey ? ` draggable="true" data-agent-session-drag="${escapeHtml(sessionKey)}" aria-grabbed="false"` : ''}>`,
    `<span class="bubble-task-session-drag-handle" data-agent-session-drag-handle="1" title="按住拖到任意任务中" aria-hidden="true">⠿</span>`,
    `<button class="bubble-task-session-main" type="button" data-bubble-session-open="${escapeHtml(sessionKey)}"${session?.target ? '' : ' disabled'} title="${escapeHtml(session?.currentStep || title)}">`,
    `<strong>${escapeHtml(source)} · ${escapeHtml(title)}</strong>`,
    `<span>${escapeHtml(status)}${current ? ` · ${escapeHtml(current)}` : ''}</span>`,
    '</button>',
    `<button class="bubble-task-session-ignore" type="button" data-bubble-session-visibility="${escapeHtml(sessionKey)}" data-ignored="false">忽略</button>`,
    '</article>',
  ].join('')
}

function looseSessionBubbleHtml(sessions) {
  const visibleSessions = sessions.slice(0, BUBBLE_LOOSE_SESSION_LIMIT)
  const moreSessions = Math.max(0, sessions.length - visibleSessions.length)
  if (!visibleSessions.length) return ''
  return [
    '<section class="bubble-card bubble-loose-session-group">',
    '<div class="bubble-loose-session-head">',
    '<div><strong>待归组 Session</strong><span>拖到上面的任务中</span></div>',
    '<button type="button" data-open-user-task="">整理</button>',
    '</div>',
    '<div class="bubble-task-session-list">',
    ...visibleSessions.map(session => bubbleTaskSessionHtml(session, { loose: true })),
    moreSessions ? `<button class="bubble-task-more" type="button" data-open-user-task="">另有 ${moreSessions} 个 Session</button>` : '',
    '</div>',
    '</section>',
  ].join('')
}

function clearSupersededTaskBubbles(event) {
  if (!event || !new Set(['task_done', 'task_failed', 'agent_done']).has(event.type)) return
  const supersededTypes = event.type === 'task_failed'
    ? new Set(['task_started', 'task_progress'])
    : new Set(['task_started', 'task_progress', 'task_failed'])
  const eventMergeKey = bubbleMergeKey(event)
  const cwd = String(event.cwd || event.projectDir || event.project_dir || event.workspacePath || event.workspace_path || '').trim()
  if (!eventMergeKey && !cwd) return
  for (let i = bubbleLog.length - 1; i >= 0; i -= 1) {
    const item = bubbleLog[i]
    if (!supersededTypes.has(item?.event?.type)) continue
    if (eventMergeKey && item?.mergeKey === eventMergeKey) {
      bubbleLog.splice(i, 1)
      continue
    }
    if (!cwd) continue
    const itemCwd = String(
      item?.event?.cwd
      || item?.event?.projectDir
      || item?.event?.project_dir
      || item?.event?.workspacePath
      || item?.event?.workspace_path
      || '',
    ).trim()
    if (itemCwd !== cwd) continue
    bubbleLog.splice(i, 1)
  }
}

function removeBubble(id) {
  const index = bubbleLog.findIndex(item => item.id === String(id))
  if (index >= 0) bubbleLog.splice(index, 1)
  renderBubbles()
}

function trimBubbles() {
  const transientIds = bubbleLog.filter(item => !item.persistent).map(item => item.id)
  while (transientIds.length > MAX_TRANSIENT_BUBBLES) {
    const id = transientIds.pop()
    const index = bubbleLog.findIndex(item => item.id === id)
    if (index >= 0) bubbleLog.splice(index, 1)
  }
  const persistentIds = bubbleLog.filter(item => item.persistent).map(item => item.id)
  while (persistentIds.length > MAX_PERSISTENT_BUBBLES) {
    const id = persistentIds.pop()
    const index = bubbleLog.findIndex(item => item.id === id)
    if (index >= 0) bubbleLog.splice(index, 1)
  }
}

function renderBubbles() {
  const taskBubbles = uiSettings.taskBubblesVisible ? userTaskBubbleTasks() : []
  const boardSessionKeys = new Set((agentTaskBoardState.todayTasks || [])
    .flatMap(task => task.sessions || [])
    .map(session => session.key)
    .filter(Boolean))
  const looseSessions = uiSettings.taskBubblesVisible
    ? agentLooseSessions()
      .map(({ session }) => session)
      .filter(session => session.ignored !== true)
    : []
  const sessionBubbles = bubbleLog.filter(item => (
    item?.event?.taskProgress?.customGroup !== true
    && item?.event?.taskProgress?.ignored !== true
    && !boardSessionKeys.has(item?.event?.taskProgress?.sessionKey)
  ))
  if (!taskBubbles.length && !looseSessions.length && !sessionBubbles.length) {
    bubble.classList.add('hidden')
    bubble.innerHTML = ''
    activeBubbleEvent = null
    hideBubbleHover()
    return
  }
  if (companionModeActive) hidePetDialogue()
  activeBubbleEvent = sessionBubbles[0]?.event || null
  const actionsCoolingDown = areBubbleActionsCoolingDown()
  const stackTools = sessionBubbles.length > 1
    ? `<div class="bubble-stack-tools"><button type="button" data-dismiss-all-bubbles="1"${actionsCoolingDown ? ' disabled' : ''}>全部忽略</button></div>`
    : ''
  const taskCards = taskBubbles.map(userTaskBubbleHtml).join('')
  const looseSessionCard = looseSessionBubbleHtml(looseSessions)
  const sessionCards = sessionBubbles.map((item) => {
    const target = targetForEvent(item.event)
    const targetText = target ? `<div class="bubble-target">${escapeHtml(target.label || '打开会话')}</div>` : ''
    const shareButton = bubbleShareButtonHtml(item, actionsCoolingDown)
    const sessionKey = String(item?.event?.taskProgress?.sessionKey || '')
    return [
      `<article class="bubble-card bubble-session-event bubble-${escapeHtml(item.kind)}${target ? ' clickable' : ''}" data-bubble-id="${escapeHtml(item.id)}"${sessionKey ? ` draggable="true" data-agent-session-drag="${escapeHtml(sessionKey)}"` : ''}>`,
      '<div class="bubble-head">',
      `<strong>${escapeHtml(item.title)}</strong>`,
      '<div class="bubble-actions">',
      shareButton,
      `<button type="button" data-dismiss-bubble="${escapeHtml(item.id)}" title="忽略"${actionsCoolingDown ? ' disabled' : ''}>忽略</button>`,
      '</div>',
      '</div>',
      `<div class="bubble-text">${escapeHtml(item.text)}</div>`,
      targetText,
      '</article>',
    ].join('')
  }).join('')
  bubble.innerHTML = stackTools + taskCards + looseSessionCard + sessionCards
  bubble.classList.remove('hidden')
  positionBubble()
}

function bubbleShareButtonHtml(item, actionsCoolingDown = false) {
  const target = bubbleShareTargetForEvent(item.event)
  if (!target) return ''
  const pending = pendingBubbleShares.has(item.id)
  const title = target.kind === 'bridge-task'
    ? '生成机器人过程分享链接'
    : '生成会话分享链接'
  return [
    `<button type="button" data-share-bubble="${escapeHtml(item.id)}"`,
    ` title="${pending ? '正在生成分享链接' : title}"`,
    pending || actionsCoolingDown ? ' disabled aria-busy="true"' : '',
    `>${pending ? '分享中...' : '分享'}</button>`,
  ].join('')
}

function say(text, ms = 2500, event = null) {
  const persistent = shouldPersistBubble(event)
  const mergeKey = persistent ? bubbleMergeKey(event) : ''
  const existingIndex = mergeKey ? bubbleLog.findIndex(item => item.mergeKey === mergeKey) : -1
  const current = existingIndex >= 0 ? bubbleLog.splice(existingIndex, 1)[0] : null
  const id = current?.id || String(++bubbleSeq)
  bubbleLog.unshift({
    id,
    text,
    event,
    persistent,
    kind: bubbleKind(event),
    title: bubbleTitle(event),
    createdAt: current?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mergeKey,
  })
  clearSupersededTaskBubbles(event)
  trimBubbles()
  renderBubbles()
  if (!persistent) {
    setTimeout(() => removeBubble(id), ms)
  }
}

function shortText(text, max = 82) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized
}

function normalizedHoverKey(text) {
  return String(text || '')
    .replace(/^(?:最新|当前|任务|会话|你|Agent|机器人|Assistant|User)\s*[:：]\s*/iu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function pushHoverText(rows, seen, text, options = {}) {
  const line = shortText(text, options.max || 82)
  const key = normalizedHoverKey(line)
  if (!key || seen.has(key)) return false
  seen.add(key)
  rows.push(`<div class="bubble-hover-text">${escapeHtml(line)}</div>`)
  return true
}

function stalePromptPreviewLine(line, event, currentText) {
  if (!currentText || !event?.prompt) return false
  const text = String(line || '').trim()
  if (!/^(?:你|User)\s*[:：]/iu.test(text)) return false
  const prompt = normalizedHoverKey(event.prompt)
  if (!prompt) return false
  const current = normalizedHoverKey(currentText)
  if (current && current.includes(prompt)) return false
  return normalizedHoverKey(text).includes(prompt)
}

function addPreviewHoverLines(rows, seen, item, currentText, maxLines) {
  let added = 0
  for (const line of [...(item.preview?.lines || [])].reverse()) {
    if (stalePromptPreviewLine(line, item.event, currentText)) continue
    if (pushHoverText(rows, seen, line, { max: 82 })) added += 1
    if (added >= maxLines) break
  }
}

function eventSessionId(event) {
  return String(event?.sessionId || event?.session_id || event?.session || '').trim()
}

function friendlyPreviewError(error) {
  const code = String(error || '').trim()
  if (code === 'local-path-not-found') return '会话文件不在本机或已被清理'
  if (code === 'missing-transcript-path') return '这条事件没有带会话文件路径'
  if (code === 'transcript-not-file') return '会话路径不是文件'
  if (code === 'local-path-not-absolute') return '会话路径不是绝对路径'
  if (code === 'local-path-not-allowed') return '会话路径不在允许读取范围内'
  return code || '没有可见摘要'
}

function bubbleHoverHtml(item) {
  const currentText = eventCurrentText(item.event, item.text, 96)
  const seen = new Set()
  const preview = item.preview
  if (isLarkBridgeAgentEvent(item.event)) {
    const rows = [`<div class="bubble-hover-title">${escapeHtml(item.title)}</div>`]
    pushHoverText(rows, seen, currentText ? `最新：${currentText}` : '', { max: 96 })
    rows.push('<div class="bubble-hover-meta">来源：飞书机器人</div>')
    const target = buildTargetForEvent(item.event)
    if (target?.kind === 'lark') {
      rows.push(`<div class="bubble-hover-meta">${escapeHtml(target.label)}</div>`)
    }
    return rows.join('')
  }
  if (preview?.ok) {
    const rows = [
      `<div class="bubble-hover-title">${escapeHtml(item.title || preview.title)}</div>`,
    ]
    pushHoverText(rows, seen, currentText ? `最新：${currentText}` : '', { max: 96 })
    addPreviewHoverLines(rows, seen, item, currentText, preview?.degraded ? 4 : currentText ? 1 : 2)
    return rows.join('')
  }
  if (preview?.loading) {
    return [
      `<div class="bubble-hover-title">${escapeHtml(item.title)}</div>`,
      '<div class="bubble-hover-text">正在读取会话摘要...</div>',
    ].join('')
  }
  if (preview?.error) {
    return [
      `<div class="bubble-hover-title">${escapeHtml(item.title)}</div>`,
      `<div class="bubble-hover-text">摘要读取失败：${escapeHtml(preview.error)}</div>`,
    ].join('')
  }
  const rows = [
    `<div class="bubble-hover-title">${escapeHtml(item.title)}</div>`,
  ]
  pushHoverText(rows, seen, currentText ? `最新：${currentText}` : '', { max: 96 })
  if (!currentText && item.event?.title) {
    pushHoverText(rows, seen, `任务：${item.event.title}`, { max: 82 })
  }
  if (!currentText && item.event?.prompt && item.event.prompt !== item.event?.title) {
    pushHoverText(rows, seen, `会话：${item.event.prompt}`, { max: 82 })
  }
  const actorLabel = eventActorLabel(item.event)
  const appLabel = eventAppLabel(item.event)
  const agentLabel = eventAgentLabel(item.event)
  const projectLabel = eventExplicitProjectLabel(item.event)
  const workdirLabel = eventWorkdirLabel(item.event)
  const workId = eventWorkId(item.event)
  const sessionId = eventSessionId(item.event)
  if (actorLabel) rows.push(`<div class="bubble-hover-meta">来源：${escapeHtml(actorLabel)}</div>`)
  if (appLabel) rows.push(`<div class="bubble-hover-meta">App：${escapeHtml(appLabel)}</div>`)
  if (agentLabel && agentLabel !== appLabel) rows.push(`<div class="bubble-hover-meta">Agent：${escapeHtml(agentLabel)}</div>`)
  if (projectLabel) rows.push(`<div class="bubble-hover-meta">项目：${escapeHtml(projectLabel)}</div>`)
  if (workdirLabel && workdirLabel !== projectLabel) rows.push(`<div class="bubble-hover-meta">工作目录：${escapeHtml(workdirLabel)}</div>`)
  if (workId) rows.push(`<div class="bubble-hover-meta">Work ID：${escapeHtml(shortText(workId, 18))}</div>`)
  if (sessionId) rows.push(`<div class="bubble-hover-meta">Session：${escapeHtml(shortText(sessionId, 18))}</div>`)
  return rows.join('')
}

function showBubbleHover(item, event, anchor) {
  activeHoverBubbleId = item.id
  ensureBubblePreview(item, event, anchor)
  bubbleHoverTip.innerHTML = bubbleHoverHtml(item)
  bubbleHoverTip.classList.remove('hidden')
  positionBubbleHover(anchor, event)
}

function positionBubbleHover(anchor, event) {
  const { width, height } = visibleRectFor(bubbleHoverTip, 220, 72)
  const padding = 8
  const area = viewportVisibleArea()
  const rect = anchor?.getBoundingClientRect?.()
  const anchorLeft = rect ? rect.left + rect.width / 2 - width / 2 : event.clientX + 10
  const belowTop = rect ? rect.top + rect.height + 6 : event.clientY + 10
  const aboveTop = rect ? rect.top - height - 6 : event.clientY - height - 10
  const top = belowTop + height <= area.bottom - padding ? belowTop : aboveTop
  const next = clampElementToVisibleArea(anchorLeft, top, width, height, padding)
  bubbleHoverTip.style.left = `${next.left}px`
  bubbleHoverTip.style.top = `${next.top}px`
}

function hideBubbleHover() {
  activeHoverBubbleId = ''
  bubbleHoverTip.classList.add('hidden')
}

function previewKey(request) {
  return [
    request.provider,
    request.sessionId,
    request.transcriptPath || request.agentTranscriptPath || '',
  ].join(':')
}

// Build a hover summary from the event alone — used when no transcript file is
// available (Codex `agent-turn-complete` notify carries the prompt + result but
// no transcript path, so the file-read preview always failed before).
function localPreviewFromEvent(event, fallbackText = '') {
  if (isLarkBridgeAgentEvent(event)) {
    const currentText = eventCurrentText(event, fallbackText, 96)
    const target = buildTargetForEvent(event)
    return {
      ok: true,
      title: bubbleTitle(event),
      lines: [
        ...(currentText ? [`最新: ${currentText}`] : []),
        '来源: 飞书机器人',
        ...(target?.kind === 'lark' ? [target.label] : []),
      ],
    }
  }
  const lines = []
  const currentText = eventCurrentText(event, fallbackText, 96)
  const actorLabel = eventActorLabel(event)
  const appLabel = eventAppLabel(event)
  const agentLabel = eventAgentLabel(event)
  const projectLabel = eventExplicitProjectLabel(event)
  const workdirLabel = eventWorkdirLabel(event)
  const workId = eventWorkId(event)
  const sessionId = eventSessionId(event)
  if (currentText) lines.push(`最新: ${currentText}`)
  if (actorLabel) lines.push(`来源: ${actorLabel}`)
  if (appLabel) lines.push(`App: ${appLabel}`)
  if (agentLabel && agentLabel !== appLabel) lines.push(`Agent: ${agentLabel}`)
  if (projectLabel) lines.push(`项目: ${projectLabel}`)
  if (workdirLabel && workdirLabel !== projectLabel) lines.push(`工作目录: ${workdirLabel}`)
  if (workId) lines.push(`Work ID: ${shortText(workId, 18)}`)
  if (sessionId) lines.push(`Session: ${shortText(sessionId, 18)}`)
  if (!currentText && event?.prompt) lines.push(`会话: ${shortText(event.prompt, 74)}`)
  if (!lines.length) return { ok: false, error: '这条事件没有可显示的摘要' }
  return { ok: true, title: bubbleTitle(event), lines }
}

function degradedPreviewFromEvent(event, fallbackText, error) {
  const preview = localPreviewFromEvent(event, fallbackText)
  if (!preview.ok) return { ok: false, error: friendlyPreviewError(error) }
  return {
    ...preview,
    degraded: true,
    lines: [
      ...preview.lines,
      `会话摘要: ${friendlyPreviewError(error)}`,
    ],
  }
}

async function ensureBubblePreview(item, event, anchor) {
  const request = sessionRequestForEvent(item.event)
  if (!request || item.preview?.ok || item.preview?.loading) return
  // No transcript on disk → synthesize from the event (avoids missing-transcript-path).
  if (!request.transcriptPath && !request.agentTranscriptPath) {
    item.preview = localPreviewFromEvent(item.event, item.text)
    return
  }
  const key = previewKey(request)
  if (sessionPreviewCache.has(key)) {
    item.preview = sessionPreviewCache.get(key)
    return
  }
  item.preview = { loading: true }
  try {
    const result = await window.pet.sessionPreview?.(request)
    item.preview = result?.ok ? result : degradedPreviewFromEvent(item.event, item.text, result?.error || '没有可见摘要')
  } catch (error) {
    item.preview = degradedPreviewFromEvent(item.event, item.text, String(error?.message || error))
  }
  sessionPreviewCache.set(key, item.preview)
  if (activeHoverBubbleId === item.id) {
    bubbleHoverTip.innerHTML = bubbleHoverHtml(item)
    positionBubbleHover(anchor, event)
  }
}

init()

function setupLarkInbox() {
  window.pet.onLarkInboxUpdate?.((snapshot) => {
    larkInboxState = normalizeLarkInboxState(snapshot, true)
    renderLarkInbox()
    syncEventPanel()
  })
  window.pet.onLarkWebPushUpdate?.((status) => {
    larkWebPushState = normalizeLarkWebPushState(status)
    renderLarkInbox()
    syncEventPanel()
  })
  window.pet.larkInbox?.()
    .then((snapshot) => {
      if (!snapshot) return
      larkInboxState = normalizeLarkInboxState(snapshot, Boolean(snapshot.updatedAt || snapshot.messages?.length))
      renderLarkInbox()
      syncEventPanel()
    })
    .catch((error) => {
      larkInboxState = {
        ...larkInboxState,
        ok: false,
        loaded: true,
        error: error?.message || String(error),
      }
      renderLarkInbox()
    })
  window.pet.larkWebPushStatus?.()
    .then((status) => {
      larkWebPushState = normalizeLarkWebPushState(status)
      renderLarkInbox()
      syncEventPanel()
    })
    .catch((error) => {
      larkWebPushState = {
        ...larkWebPushState,
        ok: false,
        error: error?.message || String(error),
      }
      renderLarkInbox()
    })
  window.pet.larkBaseSink?.()
    .then((summary) => {
      larkBaseSinkState = normalizeLarkBaseSinkState(summary)
      renderLarkInbox()
      syncEventPanel()
    })
    .catch((error) => {
      larkBaseSinkState = {
        ...larkBaseSinkState,
        ok: false,
        error: error?.message || String(error),
      }
      renderLarkInbox()
    })
}

function setupEventPanel() {
  setupAppearanceConfirm()
  panelClose?.addEventListener('click', () => togglePanel(false))
  appearancePanel?.addEventListener('click', (event) => chooseAppearance(event.target))
  appearanceFeed?.addEventListener('click', (event) => {
    event.stopPropagation()
    feedManually()
    syncAccessories()
    backend?.applySettings?.()
  })
  bridgeTasksOpen?.addEventListener('click', () => openUnifiedWorkbench('bridge'))
  manageOpen?.addEventListener('click', () => openUnifiedWorkbench('settings'))
  bridgeTasksRefresh?.addEventListener('click', () => refreshBridgeTasks({ force: true }))
  bridgeTasksShare?.addEventListener('click', () => shareBridgeTaskViewer())
  bridgeTasksWindow?.addEventListener('click', () => openBridgeTasksWindow())
  larkInboxRefresh?.addEventListener('click', () => refreshLarkInbox({ force: true }))
  larkWorkbenchOpen?.addEventListener('click', () => openUnifiedWorkbench('messages'))
  larkWebPushOpen?.addEventListener('click', () => openLarkWebPushWindow())
  larkWebPushReload?.addEventListener('click', () => reloadLarkWebPushWindow())
  larkBaseOpen?.addEventListener('click', () => openLarkBaseTable())
  larkInboxEvents?.addEventListener('click', (e) => {
    const item = e.target.closest?.('[data-lark-message-id]')
    if (item) openLarkMessageById(item.dataset.larkMessageId)
  })
  syncBridgeTasksShareButton()
  settingPetScale?.addEventListener('input', () => {
    uiSettings.petScale = clampPetScale(Number(settingPetScale.value) / 100, DEFAULT_UI_SETTINGS.petScale)
    saveUiSettings()
    applyUiSettings()
  })
  settingPetOpacity?.addEventListener('input', () => {
    uiSettings.petOpacity = clampNumber(Number(settingPetOpacity.value) / 100, 0.25, 1, DEFAULT_UI_SETTINGS.petOpacity)
    saveUiSettings()
    applyUiSettings()
  })
  settingHitboxScale?.addEventListener('input', () => {
    uiSettings.hitboxScale = clampNumber(Number(settingHitboxScale.value) / 100, 0.25, 1, DEFAULT_UI_SETTINGS.hitboxScale)
    saveUiSettings()
    applyUiSettings()
  })
  settingBubbleCorner?.addEventListener('change', () => {
    uiSettings.bubbleCorner = CORNERS.has(settingBubbleCorner.value) ? settingBubbleCorner.value : DEFAULT_UI_SETTINGS.bubbleCorner
    saveUiSettings()
    applyUiSettings()
  })
  settingPanelCorner?.addEventListener('change', () => {
    uiSettings.panelCorner = CORNERS.has(settingPanelCorner.value)
      ? settingPanelCorner.value
      : DEFAULT_UI_SETTINGS.panelCorner
    saveUiSettings()
    applyUiSettings()
  })
  settingTriggerMode?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-trigger-mode]')
    if (!button) return
    uiSettings.triggerMode = button.dataset.triggerMode === 'left' ? 'left' : 'right'
    saveUiSettings()
    applyUiSettings()
  })
  settingTerminalLauncher?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-terminal-launcher]')
    if (!button) return
    uiSettings.terminalLauncher = TERMINAL_LAUNCHERS.has(button.dataset.terminalLauncher)
      ? button.dataset.terminalLauncher
      : DEFAULT_UI_SETTINGS.terminalLauncher
    saveUiSettings()
    applyUiSettings()
    const label = uiSettings.terminalLauncher === 'orca'
      ? 'Orca'
      : uiSettings.terminalLauncher === 'cmux'
        ? 'cmux'
        : '自动'
    say(`终端跳转：${label}`, 1800)
  })
  settingEdgeMode?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-edge-mode]')
    if (!button) return
    uiSettings.edgeMode = button.dataset.edgeMode === 'inside' ? 'inside' : 'half'
    saveUiSettings()
    applyUiSettings()
  })
  settingPettingEnabled?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-petting-enabled]')
    if (!button) return
    setBooleanSetting('pettingEnabled', button.dataset.pettingEnabled === 'true')
  })
  settingWanderEnabled?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-wander-enabled]')
    if (!button) return
    setBooleanSetting('wanderEnabled', button.dataset.wanderEnabled === 'true')
  })
  settingDndMode?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-dnd-mode]')
    if (!button) return
    setDndMode(button.dataset.dndMode === 'true')
  })
  settingSoundEnabled?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-sound-enabled]')
    if (!button) return
    setBooleanSetting('soundEnabled', button.dataset.soundEnabled === 'true')
  })
  settingNotificationsEnabled?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-notifications-enabled]')
    if (!button) return
    setBooleanSetting('notificationsEnabled', button.dataset.notificationsEnabled === 'true')
  })
  settingFocusMinutes?.addEventListener('change', () => {
    updatePomodoroSettings({ focusMinutes: settingFocusMinutes.value })
  })
  settingShortBreakMinutes?.addEventListener('change', () => {
    updatePomodoroSettings({ shortBreakMinutes: settingShortBreakMinutes.value })
  })
  settingLongBreakMinutes?.addEventListener('change', () => {
    updatePomodoroSettings({ longBreakMinutes: settingLongBreakMinutes.value })
  })
  settingSedentaryMinutes?.addEventListener('change', () => {
    updatePomodoroSettings({ sedentaryMinutes: settingSedentaryMinutes.value })
  })
  settingLongBreakEvery?.addEventListener('input', () => {
    updatePomodoroSettings({ longBreakEvery: settingLongBreakEvery.value })
  })
  settingBubbleAnchor?.addEventListener('input', () => {
    uiSettings.bubbleAnchor = clampNumber(settingBubbleAnchor.value, 35, 80, DEFAULT_UI_SETTINGS.bubbleAnchor)
    saveUiSettings()
    applyUiSettings()
  })
  settingBubbleGap?.addEventListener('input', () => {
    uiSettings.bubbleGap = clampNumber(settingBubbleGap.value, 0, 48, DEFAULT_UI_SETTINGS.bubbleGap)
    saveUiSettings()
    applyUiSettings()
  })
  settingTaskBubblesVisible?.addEventListener('click', (e) => {
    const button = e.target.closest?.('[data-task-bubbles-visible]')
    if (!button) return
    setBooleanSetting('taskBubblesVisible', button.dataset.taskBubblesVisible === 'true')
  })
  settingExportConfig?.addEventListener('click', exportConfigToClipboard)
  settingImportConfig?.addEventListener('click', importConfigFromClipboard)
  settingCheckUpdate?.addEventListener('click', checkUpdatesFromSettings)
  settingInstallUpdate?.addEventListener('click', installUpdateFromSettings)
  settingMovePet?.addEventListener('click', () => enterMoveMode())
  settingHidePet?.addEventListener('click', () => window.pet.setHidden?.(true))
  agentTaskAdd?.addEventListener('click', createAgentTask)
  eventPanel?.addEventListener('click', (e) => {
    const tabButton = e.target.closest?.('[data-tab]')
    if (tabButton) {
      setActivePanelTab(tabButton.dataset.tab)
      return
    }
    const sizeButton = e.target.closest?.('[data-window-size]')
    if (sizeButton) {
      const [width, height] = String(sizeButton.dataset.windowSize || '').split('x').map(Number)
      window.pet.setWindowSize?.({ width, height })
      return
    }
    const shareSub = e.target.closest?.('[data-share-subagent]')
    if (shareSub) {
      e.stopPropagation()
      shareSubagentTranscript(shareSub.dataset.shareSubagent)
      return
    }
    const editTask = e.target.closest?.('[data-agent-task-edit]')
    if (editTask) {
      e.stopPropagation()
      openUnifiedWorkbench('tasks', editTask.dataset.agentTaskEdit)
      return
    }
    const openSession = e.target.closest?.('[data-agent-session-open]')
    if (openSession) {
      e.stopPropagation()
      const session = agentSessionByKey(openSession.dataset.agentSessionOpen)
      if (session?.target) openTarget(session.target)
      return
    }
    const visibility = e.target.closest?.('[data-agent-session-visibility]')
    if (visibility) {
      e.stopPropagation()
      runAgentTaskMutation(() => window.pet.ignoreAgentSession?.({
        sessionKey: visibility.dataset.agentSessionVisibility,
        ignored: visibility.dataset.ignored !== 'true',
      }))
      return
    }
    const item = e.target.closest?.('[data-event-id]')
    if (item) {
      openEventById(item.dataset.eventId)
      return
    }
    const bridgeItem = e.target.closest?.('[data-bridge-task-id]')
    if (bridgeItem) openBridgeTasksWindow()
  })
  eventPanel?.addEventListener('change', (e) => {
    const select = e.target.closest?.('[data-agent-session-group]')
    if (select) assignAgentSession(select)
  })
  syncEventPanel()
}

function setupUpdateStatus() {
  syncUpdateControls()
  window.pet.onUpdateStatus?.((status) => {
    updateStatus = status || null
    syncUpdateControls()
  })
  window.pet.getUpdateStatus?.()
    .then((status) => {
      updateStatus = status || null
      syncUpdateControls()
    })
    .catch((error) => {
      updateStatus = { error: error?.message || String(error) }
      syncUpdateControls()
    })
}

function updateProgressText(status) {
  const percent = status?.progress && Number.isFinite(status.progress.percent)
    ? `${Math.round(status.progress.percent)}%`
    : ''
  return percent ? `下载中 ${percent}` : '正在下载'
}

function formatUpdateStatus(status) {
  if (!status) return '正在读取更新状态...'
  const current = status.currentVersion ? `当前 ${status.currentVersion}` : '当前版本未知'
  if (status.checking) return `${current} · 正在检查更新...`
  if (status.downloaded) {
    const version = status.version ? ` ${status.version}` : ''
    return `已下载${version} · 点击安装会重启`
  }
  if (status.available) {
    const version = status.version ? ` ${status.version}` : ''
    return `发现更新${version} · ${updateProgressText(status)}`
  }
  if (status.error) return `${current} · 更新失败：${shortText(status.error, 42)}`
  if (!status.supported) {
    return status.disabledReason === 'development mode'
      ? `${current} · 开发模式不支持自动更新`
      : `${current} · 更新不可用`
  }
  return status.lastCheckedAt ? `${current} · 已是最新` : `${current} · 可手动检查`
}

function syncUpdateControls() {
  if (settingUpdateStatus) settingUpdateStatus.textContent = formatUpdateStatus(updateStatus)
  const checking = updateStatus?.checking === true
  const downloading = updateStatus?.available === true && updateStatus?.downloaded !== true && Boolean(updateStatus?.progress)
  const downloaded = updateStatus?.downloaded === true
  if (settingCheckUpdate) {
    settingCheckUpdate.disabled = checking || downloading || downloaded
    settingCheckUpdate.textContent = checking ? '检查中...' : downloaded ? '已下载' : '检查更新'
    settingCheckUpdate.title = updateStatus?.supported === false
      ? '本地 dev 版不能用安装版更新器；打包安装版可检查 GitHub Releases'
      : '检查 GitHub Releases 更新'
  }
  if (settingInstallUpdate) {
    settingInstallUpdate.hidden = !downloaded
    settingInstallUpdate.disabled = !downloaded
  }
}

async function checkUpdatesFromSettings() {
  try {
    updateStatus = await window.pet.checkForUpdates?.()
    syncUpdateControls()
    if (updateStatus?.supported === false) {
      say('开发模式不会检查安装版更新；打包安装版可在这里手动检查', 3200)
    } else if (updateStatus?.downloaded) {
      say('更新已下载，可以安装', 2200)
    } else if (updateStatus?.available) {
      say('发现新版本，正在下载', 2200)
    } else if (updateStatus?.lastCheckedAt) {
      say('已经是最新版本', 1800)
    }
  } catch (error) {
    updateStatus = { ...(updateStatus || {}), checking: false, error: error?.message || String(error) }
    syncUpdateControls()
    say(`检查更新失败：${error?.message || error}`, 3200)
  }
}

async function installUpdateFromSettings() {
  try {
    const result = await window.pet.installUpdate?.()
    if (!result?.ok) {
      say(`安装更新失败：${result?.error || '还没有下载完成'}`, 3200)
      return
    }
    say('正在安装更新，Kodama 会重启', 2200)
  } catch (error) {
    say(`安装更新失败：${error?.message || error}`, 3200)
  }
}

async function exportConfigToClipboard() {
  const payload = {
    version: 1,
    ui: uiSettings,
    pomodoro: pomodoroSettings,
  }
  await window.pet.copyText?.(JSON.stringify(payload, null, 2))
  say('配置已复制', 1800)
}

async function importConfigFromClipboard() {
  try {
    const result = await window.pet.readText?.()
    const payload = JSON.parse(result?.text || '{}')
    if (!payload || typeof payload !== 'object') throw new Error('配置格式不对')
    if (payload.ui && typeof payload.ui === 'object') {
      uiSettings = normalizeUiSettings({ ...uiSettings, ...payload.ui })
      saveUiSettings()
    }
    if (payload.pomodoro && typeof payload.pomodoro === 'object') {
      updatePomodoroSettings(payload.pomodoro)
    }
    applyUiSettings()
    say('配置已导入', 1800)
  } catch (error) {
    say(`导入失败：${error?.message || error}`, 3200)
  }
}

function setActivePanelTab(tab) {
  activePanelTab = PANEL_TABS.has(tab) ? tab : 'settings'
  eventPanel?.setAttribute('data-active-tab', activePanelTab)
  eventPanel?.querySelectorAll('[data-tab]').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === activePanelTab)
  })
  eventPanel?.querySelectorAll('[data-tab-panel]').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tabPanel === activePanelTab)
  })
  if (activePanelTab === 'bridge' && !bridgeTasksState.loaded && !bridgeTasksState.loading) {
    refreshBridgeTasks()
  }
  if (activePanelTab === 'lark-inbox' && !larkInboxState.loaded && !larkInboxState.loading) {
    refreshLarkInbox()
  }
  positionPanel()
}

function togglePanel(force) {
  panelVisible = typeof force === 'boolean' ? force : !panelVisible
  eventPanel?.classList.toggle('hidden', !panelVisible)
  if (panelVisible) {
    window.pet.setIgnoreMouse(false)
    requestAnimationFrame(positionPanel)
  } else {
    finishAppearanceConfirm(false)
    window.pet.setIgnoreMouse(true, { forward: true })
  }
  refreshMouseInteractivity()
  syncEventPanel()
}

function recordAgentEvent(event) {
  if (!event || !event.type) return
  rememberSessionTitle(event)
  const record = {
    ...event,
    id: String(++eventSeq),
    target: targetForEvent(event),
    receivedAt: new Date().toISOString(),
  }
  eventLog.unshift(record)
  if (eventLog.length > MAX_EVENT_LOG) eventLog.length = MAX_EVENT_LOG
  syncEventPanel()
}

function targetForEvent(event) {
  return buildTargetForEvent(event, {
    bridgeUrl: activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL,
    token: activeAgentConfig.token || '',
  })
}

function targetKey(target) {
  if (!target) return ''
  return target.url || target.path || target.threadId || target.sessionId || `${target.chatId || ''}:${target.messageId || ''}`
}

function noteActiveTarget(target) {
  const key = targetKey(target)
  if (!key) return
  activeViewedTarget = { key, at: Date.now() }
}

function isTargetLikelyActive(target) {
  const key = targetKey(target)
  if (!key || !activeViewedTarget.key) return false
  return activeViewedTarget.key === key && (Date.now() - activeViewedTarget.at) <= ACTIVE_TARGET_TTL_MS
}

function shouldSuppressForegroundBubble(event) {
  if (!event) return false
  if (!new Set(['task_started', 'task_progress', 'task_done', 'agent_done', 'share_ready']).has(event.type)) {
    return false
  }
  const target = targetForEvent(event)
  const active = isTargetLikelyActive(target)
  if (active) activeViewedTarget.at = Date.now()
  return active
}

function openableEvents() {
  const seen = new Set()
  const out = []
  for (const event of eventLog) {
    if (!event.target) continue
    const key = targetKey(event.target)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out
}

async function openTarget(target) {
  if (!target) return false
  const result = await window.pet.openTarget?.(target)
  if (!result?.ok) {
    const suffix = result?.copiedUrl ? '，已复制链接' : ''
    say(`跳转失败：${result?.error || '没有会话信息'}${suffix}`, 3200)
    return false
  }
  const text = target.kind === 'local-path'
    ? '正在打开本地记录'
    : target.kind === 'terminal-session'
      ? result.method === 'open Orca app' || result.method === 'orca terminal focus'
        ? '正在打开 Orca'
        : result.method === 'open cmux app' || result.method === 'cmux focus'
          ? '正在打开 cmux'
          : '正在打开 Agent 终端'
      : target.kind === 'codex-thread'
        ? '正在打开 Codex 会话'
        : '正在打开飞书会话'
  noteActiveTarget(target)
  say(text, 1400)
  return true
}

function notifyShareReady(label) {
  const text = String(label || '分享链接已生成，已复制到剪贴板')
  say(text, 0, {
    source: 'local',
    type: 'share_ready',
    text,
  })
  if (uiSettings.notificationsEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('Kodama · 分享完成', { body: text })
    } catch {
      /* best effort */
    }
  }
}

async function shareBubbleSession(id) {
  const bubbleId = String(id)
  if (pendingBubbleShares.has(bubbleId)) return
  const item = bubbleLog.find(record => record.id === bubbleId)
  const target = bubbleShareTargetForEvent(item?.event)
  if (!target) {
    say('这条气泡没有可分享的过程信息', 2400)
    return
  }
  pendingBubbleShares.add(bubbleId)
  renderBubbles()
  say(target.kind === 'bridge-task' ? '正在生成机器人过程分享链接...' : '正在生成会话分享链接...', 2200)
  try {
    const result = target.kind === 'bridge-task'
      ? await window.pet.shareBridgeTasks?.(target.request)
      : await window.pet.shareSession?.(target.request)
    if (!result?.ok) {
      say(`分享失败：${result?.error || 'bridge 没返回链接'}`, 4200)
      return
    }
    const url = result.url || result.share?.url
    const label = target.kind === 'bridge-task' ? '机器人过程分享链接' : '分享链接'
    notifyShareReady(url ? `${label}已复制到剪贴板：${url}` : `${label}已生成，已复制到剪贴板`)
  } catch (error) {
    say(`分享失败：${error?.message || error}`, 4200)
  } finally {
    pendingBubbleShares.delete(bubbleId)
    renderBubbles()
  }
}

function openEventById(id) {
  const event = eventLog.find(item => item.id === String(id))
  if (event?.target) openTarget(event.target)
}

// Optional spoken notification for important events (macOS `say`, off by default).
const TTS_LINES = {
  task_done: '任务完成',
  agent_done: '子任务完成',
  task_failed: '任务失败',
  task_waiting: '需要你确认',
  pomodoro_completed: '番茄钟完成',
  lark_message_received: '飞书有新消息',
}
function speakEvent(event) {
  if (!uiSettings.ttsEnabled || !event) return
  const line = TTS_LINES[event.type]
  if (!line) return
  const src = event.source === 'lark' ? '飞书' : '本地'
  window.pet.speak?.(`${src}，${line}`)
}

// Share a single sub-agent's own conversation (its transcript file → session-share).
async function shareSubagentTranscript(transcript) {
  const transcriptPath = String(transcript || '').trim()
  if (pendingSubagentShares.has(transcriptPath)) return
  const sessionId = inferSessionIdFromTranscriptPath(transcriptPath)
  if (!sessionId) {
    say('这个子 Agent 没有可分享的会话文件', 2600)
    return
  }
  pendingSubagentShares.add(transcriptPath)
  syncEventPanel()
  say('正在生成子 Agent 分享链接...', 2200)
  try {
    const result = await window.pet.shareSession?.({
      provider: 'claude',
      sessionId,
      transcriptPath,
      bridgeUrl: activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL,
      token: activeAgentConfig.token || '',
    })
    if (!result?.ok) {
      say(`子 Agent 分享失败：${result?.error || 'bridge 没返回链接'}`, 4200)
      return
    }
    const url = result.url || result.share?.url
    notifyShareReady(url ? `子 Agent 分享链接已复制到剪贴板：${url}` : '子 Agent 分享链接已生成，已复制到剪贴板')
  } catch (error) {
    say(`子 Agent 分享失败：${error?.message || error}`, 4200)
  } finally {
    pendingSubagentShares.delete(transcriptPath)
    syncEventPanel()
  }
}

function openBubbleTarget(event = activeBubbleEvent, bubbleId = '') {
  const bubbleTarget = targetForEvent(event)
  const sessions = openableEvents()
  const hasOtherSession = bubbleTarget && sessions.some(event => targetKey(event.target) !== targetKey(bubbleTarget))
  if (bubbleTarget && !hasOtherSession) {
    openTarget(bubbleTarget).then((ok) => {
      if (ok && bubbleId) removeBubble(bubbleId)
    })
    return
  }
  if (sessions.length === 1) {
    openTarget(sessions[0].target).then((ok) => {
      if (ok && bubbleId) removeBubble(bubbleId)
    })
    return
  }
  if (sessions.length > 1) {
    togglePanel(true)
    return
  }
  togglePanel(true)
}

function syncSettingControls() {
  if (settingPetScale) settingPetScale.value = String(Math.round(uiSettings.petScale * 100))
  if (settingPetScaleValue) settingPetScaleValue.textContent = `${Math.round(uiSettings.petScale * 100)}%`
  if (settingPetOpacity) settingPetOpacity.value = String(Math.round(uiSettings.petOpacity * 100))
  if (settingPetOpacityValue) settingPetOpacityValue.textContent = `${Math.round(uiSettings.petOpacity * 100)}%`
  if (settingHitboxScale) settingHitboxScale.value = String(Math.round(uiSettings.hitboxScale * 100))
  if (settingHitboxScaleValue) settingHitboxScaleValue.textContent = `${Math.round(uiSettings.hitboxScale * 100)}%`
  if (settingBubbleCorner) settingBubbleCorner.value = uiSettings.bubbleCorner
  if (settingPanelCorner) settingPanelCorner.value = uiSettings.panelCorner
  if (settingTriggerMode) {
    settingTriggerMode.querySelectorAll('[data-trigger-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.triggerMode === uiSettings.triggerMode)
    })
  }
  if (settingTerminalLauncher) {
    settingTerminalLauncher.querySelectorAll('[data-terminal-launcher]').forEach((button) => {
      button.classList.toggle('active', button.dataset.terminalLauncher === uiSettings.terminalLauncher)
    })
  }
  if (settingEdgeMode) {
    settingEdgeMode.querySelectorAll('[data-edge-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.edgeMode === uiSettings.edgeMode)
    })
  }
  if (settingPettingEnabled) {
    settingPettingEnabled.querySelectorAll('[data-petting-enabled]').forEach((button) => {
      button.classList.toggle('active', (button.dataset.pettingEnabled === 'true') === uiSettings.pettingEnabled)
    })
  }
  if (settingWanderEnabled) {
    settingWanderEnabled.querySelectorAll('[data-wander-enabled]').forEach((button) => {
      button.classList.toggle('active', (button.dataset.wanderEnabled === 'true') === uiSettings.wanderEnabled)
    })
  }
  if (settingDndMode) {
    settingDndMode.querySelectorAll('[data-dnd-mode]').forEach((button) => {
      button.classList.toggle('active', (button.dataset.dndMode === 'true') === uiSettings.dndMode)
    })
  }
  if (settingSoundEnabled) {
    settingSoundEnabled.querySelectorAll('[data-sound-enabled]').forEach((button) => {
      button.classList.toggle('active', (button.dataset.soundEnabled === 'true') === uiSettings.soundEnabled)
    })
  }
  if (settingNotificationsEnabled) {
    settingNotificationsEnabled.querySelectorAll('[data-notifications-enabled]').forEach((button) => {
      button.classList.toggle('active', (button.dataset.notificationsEnabled === 'true') === uiSettings.notificationsEnabled)
    })
  }
  if (settingFocusMinutes) settingFocusMinutes.value = String(pomodoroSettings.focusMinutes)
  if (settingShortBreakMinutes) settingShortBreakMinutes.value = String(pomodoroSettings.shortBreakMinutes)
  if (settingLongBreakMinutes) settingLongBreakMinutes.value = String(pomodoroSettings.longBreakMinutes)
  if (settingSedentaryMinutes) settingSedentaryMinutes.value = String(pomodoroSettings.sedentaryMinutes)
  if (settingLongBreakEvery) settingLongBreakEvery.value = String(pomodoroSettings.longBreakEvery)
  if (settingLongBreakEveryValue) settingLongBreakEveryValue.textContent = `${pomodoroSettings.longBreakEvery}轮`
  if (settingBubbleAnchor) settingBubbleAnchor.value = String(Math.round(uiSettings.bubbleAnchor))
  if (settingBubbleAnchorValue) settingBubbleAnchorValue.textContent = `${Math.round(uiSettings.bubbleAnchor)}%`
  if (settingBubbleGap) settingBubbleGap.value = String(Math.round(uiSettings.bubbleGap))
  if (settingBubbleGapValue) settingBubbleGapValue.textContent = `${Math.round(uiSettings.bubbleGap)}px`
  if (settingTaskBubblesVisible) {
    settingTaskBubblesVisible.querySelectorAll('[data-task-bubbles-visible]').forEach((button) => {
      button.classList.toggle('active', (button.dataset.taskBubblesVisible === 'true') === uiSettings.taskBubblesVisible)
    })
  }
  syncMoveModeUi()
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function typeLabel(type) {
  return {
    lark_message_received: '飞书消息',
    task_started: '开工',
    task_progress: '进度',
    lark_reply_sent: '飞书回复',
    task_waiting: '待交互',
    agent_done: 'Agent 完成',
    task_done: '完成',
    task_failed: '失败',
    share_ready: '分享完成',
    pomodoro_completed: '番茄钟',
  }[type] || type
}

function sourceLabel(source) {
  const src = PET_CONFIG.sources[source] || PET_CONFIG.sources.lark
  return `${src.icon} ${src.label}`
}

function isWaiting(event) {
  return event.type === 'task_waiting'
}

function isDone(event) {
  return event.type === 'task_done' || event.type === 'agent_done'
}

function eventText(event) {
  return event.text || event.agent || typeLabel(event.type)
}

function fmtTime(value) {
  try {
    return new Date(value).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function renderEventList(el, list) {
  if (!el) return
  if (!list.length) {
    el.className = 'event-list empty'
    el.textContent = '暂无'
    return
  }
  el.className = 'event-list'
  el.innerHTML = list.map((event) => {
    const cls = [
      isWaiting(event) ? 'waiting' : '',
      isDone(event) ? 'done' : '',
      event.source === 'lark' ? 'source-lark' : event.source === 'local' ? 'source-local' : '',
    ].filter(Boolean).map(item => ` ${item}`).join('')
    const agent = event.agent ? ` · ${escapeHtml(event.agent)}` : ''
    const target = event.target ? `<div class="event-target">${escapeHtml(event.target.label || '打开会话')}</div>` : ''
    return [
      `<article class="event-item${cls}" data-event-id="${escapeHtml(event.id || '')}">`,
      '<div class="event-meta">',
      `<span>${escapeHtml(sourceLabel(event.source))} · ${escapeHtml(typeLabel(event.type))}${agent}</span>`,
      `<time>${escapeHtml(fmtTime(event.receivedAt))}</time>`,
      '</div>',
      `<div class="event-text">${escapeHtml(eventText(event))}</div>`,
      target,
      '</article>',
    ].join('')
  }).join('')
}

function renderSessionList(el, list) {
  if (!el) return
  if (!list.length) {
    el.className = 'event-list empty'
    el.textContent = '暂无可跳转会话'
    return
  }
  el.className = 'event-list sessions'
  el.innerHTML = list.map((event) => {
    const subs = subagentsForSession(event)
    const parent = [
      `<article class="event-item" data-event-id="${escapeHtml(event.id || '')}">`,
      '<div class="event-meta">',
      `<span>${escapeHtml(sourceLabel(event.source))} · ${escapeHtml(typeLabel(event.type))}${subs.length ? ` · ${subs.length} 子 Agent` : ''}</span>`,
      `<time>${escapeHtml(fmtTime(event.receivedAt))}</time>`,
      '</div>',
      `<div class="event-text">${escapeHtml(eventText(event))}</div>`,
      `<div class="event-target">${escapeHtml(event.target?.label || '打开会话')}</div>`,
      '</article>',
    ].join('')
    // Sub-agents run inside the parent session's terminal, so clicking jumps to
    // the same parent terminal; the value here is showing them separately with a
    // clear parent→child hierarchy.
    const children = subs.map((sub) => [
      `<article class="event-item event-subagent" data-event-id="${escapeHtml(event.id || '')}" title="子 Agent 运行在父会话终端内">`,
      `<div class="event-subagent-name">↳ 子 Agent · ${escapeHtml(sub.name)}`,
      subagentShareButtonHtml(sub.transcript),
      '</div>',
      `<div class="event-text">${escapeHtml(eventText(sub.last))}</div>`,
      '</article>',
    ].join('')).join('')
    return parent + children
  }).join('')
}

function normalizeAgentTaskBoardState(value) {
  const tasks = Array.isArray(value?.tasks) ? value.tasks : []
  const todayTasks = Array.isArray(value?.todayTasks)
    ? value.todayTasks
    : tasks.filter(task => task.isToday !== false)
  return {
    ok: value?.ok !== false,
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
    updatedAt: value?.updatedAt || '',
  }
}

function reconcileBubbleTaskProgress() {
  const bySession = new Map()
  for (const task of agentTaskBoardState.tasks || []) {
    for (const session of task.sessions || []) {
      bySession.set(session.key, {
        taskId: task.id,
        taskTitle: task.title,
        customGroup: task.customGroup === true,
        ignored: session.ignored === true,
        status: task.status,
        percent: task.progress,
        currentStep: task.currentStep,
        sessionKey: session.key,
        sessionTitle: session.title,
        sessionStatus: session.status,
        sessionPercent: session.progress,
        sessionCount: task.sessionCount,
        doneSessions: task.doneSessions,
        runningSessions: task.runningSessions,
        waitingSessions: task.waitingSessions,
        failedSessions: task.failedSessions,
      })
    }
  }
  const seen = new Set()
  for (let index = 0; index < bubbleLog.length;) {
    const item = bubbleLog[index]
    const progress = bySession.get(item?.event?.taskProgress?.sessionKey)
    if (!progress) {
      index += 1
      continue
    }
    item.event = { ...item.event, taskProgress: progress }
    item.mergeKey = `task:${progress.taskId}`
    item.title = bubbleTitle(item.event)
    if (seen.has(item.mergeKey)) {
      bubbleLog.splice(index, 1)
      continue
    }
    seen.add(item.mergeKey)
    index += 1
  }
  if (bubbleLog.length) renderBubbles()
}

function agentTaskStatusLabel(status) {
  return {
    idle: '待开始',
    running: '进行中',
    waiting: '等待你',
    done: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }[status] || status || '未知'
}

function agentUserTasks() {
  return (agentTaskBoardState.todayTasks || [])
    .filter(task => task.customGroup === true)
    .slice()
    .sort((a, b) => (
      Number(a.progress >= 100) - Number(b.progress >= 100)
      || Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || '')
    ))
}

function agentLooseSessions() {
  return (agentTaskBoardState.todayTasks || [])
    .filter(task => task.customGroup !== true)
    .flatMap(task => (task.sessions || []).map(session => ({ task, session })))
    .sort((a, b) => (
      Number(new Set(['done', 'cancelled']).has(a.session.status))
      - Number(new Set(['done', 'cancelled']).has(b.session.status))
      || Date.parse(b.session.updatedAt || '') - Date.parse(a.session.updatedAt || '')
    ))
}

function agentSessionSourceLabel(session) {
  if (session.source === 'lark') return '飞书机器人'
  return session.app || session.agent || (session.source === 'local' ? '本机 Agent' : session.source) || 'Agent'
}

function agentTaskGroupOptions(currentTaskId = '') {
  const tasks = agentUserTasks()
  const currentIsTask = tasks.some(task => task.id === currentTaskId)
  return [
    currentIsTask
      ? `<option value="${escapeHtml(currentTaskId)}">当前任务</option>`
      : '<option value="" selected disabled>加入任务…</option>',
    ...tasks
      .filter(task => task.id !== currentTaskId)
      .map(task => `<option value="${escapeHtml(task.id)}">移到：${escapeHtml(shortText(task.title, 30))}</option>`),
    currentIsTask ? '<option value="__loose__">移到待归组</option>' : '',
    '<option value="__new__">＋ 新建任务…</option>',
  ].join('')
}

function agentSessionRowHtml(session, currentTaskId = '') {
  const current = shortText(session.currentStep || (session.status === 'done' ? '已完成' : '准备执行'), 54)
  return [
    `<article class="agent-session-row${session.ignored ? ' ignored' : ''}">`,
    `<button class="agent-session-main" type="button" data-agent-session-open="${escapeHtml(session.key)}"${session.target ? '' : ' disabled'}>`,
    `<strong>${escapeHtml(session.title || session.agent || 'Session')}</strong>`,
    `<small>${escapeHtml(agentSessionSourceLabel(session))} · ${escapeHtml(agentTaskStatusLabel(session.status))}${session.ignored ? ' · 已隐藏' : ''}</small>`,
    current ? `<span>${escapeHtml(current)}</span>` : '',
    '</button>',
    '<div class="agent-session-actions">',
    `<button class="agent-session-visibility" type="button" data-agent-session-visibility="${escapeHtml(session.key)}" data-ignored="${session.ignored === true ? 'true' : 'false'}">${session.ignored ? '显示' : '忽略'}</button>`,
    `<select data-agent-session-group="${escapeHtml(session.key)}" data-current-task="${escapeHtml(currentTaskId)}" aria-label="调整 Session 所属任务">`,
    agentTaskGroupOptions(currentTaskId),
    '</select>',
    '</div>',
    '</article>',
  ].join('')
}

function renderAgentTaskBoard() {
  if (!agentTaskBoardList) return
  const tasks = agentUserTasks()
  const loose = agentLooseSessions()
  const running = tasks.filter(task => task.status === 'running').length
  const done = tasks.filter(task => task.status === 'done').length
  if (agentTaskBoardSummary) {
    agentTaskBoardSummary.textContent = `${tasks.length} 个任务 · ${done} 完成 · ${loose.length} 个待归组 Session`
  }
  if (agentTaskBoardRunning) agentTaskBoardRunning.textContent = `${running} 进行中`
  if (metricTasks) metricTasks.textContent = String(tasks.length)
  if (!tasks.length && !loose.length) {
    agentTaskBoardList.className = 'agent-task-board-list empty'
    agentTaskBoardList.textContent = '先新建你今天要完成的任务，再把相关 Session 归入其中'
    return
  }
  agentTaskBoardList.className = 'agent-task-board-list'
  const taskCards = tasks.map((task) => {
    const sessions = Array.isArray(task.sessions) ? task.sessions : []
    const percent = Math.min(100, Math.max(0, Math.round(Number(task.progress || 0))))
    const nextTodo = (task.todos || []).find(todo => todo.done !== true)
    return [
      `<article class="agent-task-card" data-status="${escapeHtml(task.status)}" data-agent-task-id="${escapeHtml(task.id)}">`,
      '<div class="agent-task-card-head">',
      '<div>',
      `<strong>${escapeHtml(task.title || '未命名任务')}</strong>`,
      `<span>${escapeHtml(agentTaskStatusLabel(task.status))} · ${sessions.length} Session · ${task.openTodoCount || 0} Todo</span>`,
      '</div>',
      `<button type="button" data-agent-task-edit="${escapeHtml(task.id)}">编辑</button>`,
      '</div>',
      '<div class="agent-task-progress">',
      `<progress max="100" value="${percent}" aria-label="任务进度 ${percent}%"></progress>`,
      `<span>${percent}%</span>`,
      '</div>',
      nextTodo ? `<p class="agent-task-current">下一步：${escapeHtml(shortText(nextTodo.text, 72))}</p>` : '',
      '</article>',
    ].join('')
  }).join('')
  const looseSection = [
    '<section class="agent-loose-sessions">',
    '<div class="agent-loose-sessions-head">',
    '<div><strong>待归组 Session</strong><small>Session 只有状态，不代表任务进度</small></div>',
    `<span>${loose.length}</span>`,
    '</div>',
    '<div class="agent-task-sessions">',
    ...(loose.length
      ? loose.map(({ task, session }) => agentSessionRowHtml(session, task.id))
      : ['<div class="agent-task-editor-empty">当前没有待归组 Session</div>']),
    '</div>',
    '</section>',
  ].join('')
  agentTaskBoardList.innerHTML = taskCards + looseSection
}

function agentSessionByKey(key) {
  for (const task of agentTaskBoardState.tasks || []) {
    const session = (task.sessions || []).find(item => item.key === key)
    if (session) return session
  }
  return null
}

async function assignAgentSession(select) {
  const sessionKey = select?.dataset.agentSessionGroup || ''
  const currentTaskId = select?.dataset.currentTask || ''
  const targetTaskId = select?.value || ''
  if (!sessionKey || !targetTaskId || targetTaskId === currentTaskId) return
  if (targetTaskId === '__loose__') {
    select.disabled = true
    await runAgentTaskMutation(
      () => window.pet.detachAgentSession?.({ sessionKey }),
      'Session 已移到待归组',
    )
    select.disabled = false
    return
  }
  if (targetTaskId === '__new__') {
    const session = agentSessionByKey(sessionKey)
    select.value = currentTaskId
    await openUnifiedWorkbench('tasks', '', {
      action: 'create-task',
      sessionKey,
      initialTitle: session?.title || '',
    })
    return
  }
  const request = { sessionKey, taskId: targetTaskId }
  select.disabled = true
  try {
    const result = await window.pet.assignAgentSession?.(request)
    if (!result?.ok) {
      say(`归组失败：${result?.error || '未知错误'}`, 3000)
      select.value = currentTaskId
      return
    }
    applyAgentTaskState(result.state)
  } catch (error) {
    say(`归组失败：${error?.message || error}`, 3000)
    select.value = currentTaskId
  } finally {
    select.disabled = false
  }
}

function applyAgentTaskState(value) {
  agentTaskBoardState = normalizeAgentTaskBoardState(value)
  reconcileBubbleTaskProgress()
  renderAgentTaskBoard()
  renderBubbles()
}

async function runAgentTaskMutation(action, successText = '') {
  try {
    const result = await action()
    if (!result?.ok) {
      say(`任务操作失败：${result?.error || '未知错误'}`, 3200)
      return false
    }
    applyAgentTaskState(result.state)
    if (successText) say(successText, 1800)
    return true
  } catch (error) {
    say(`任务操作失败：${error?.message || error}`, 3200)
    return false
  }
}

async function createAgentTask() {
  await openUnifiedWorkbench('tasks', '', { action: 'create-task' })
}

function larkMessageTarget(message) {
  if (!message?.chatId) return null
  return {
    kind: 'lark',
    chatId: message.chatId,
    messageId: message.messageId || '',
    label: message.chatName || '飞书群聊',
  }
}

function renderLarkInbox() {
  if (!larkInboxEvents || !larkInboxSummary) return
  const state = larkInboxState || {}
  if (!state.enabled) {
    larkInboxSummary.textContent = '已关闭'
    larkInboxEvents.className = 'event-list empty'
    larkInboxEvents.textContent = '飞书群消息轮询未开启'
    return
  }
  const updated = state.updatedAt ? fmtTime(state.updatedAt) : ''
  const webPushText = larkWebPushState.enabled === false
    ? '实时关闭'
    : larkWebPushState.error
      ? `实时异常`
      : larkWebPushState.running
        ? (larkWebPushState.injected ? '实时已接入' : '实时运行中')
        : '实时未运行'
  const baseText = larkBaseSinkState.url
    ? '表格已绑定'
    : larkBaseSinkState.baseTokenConfigured
      ? '表格待启用'
      : '表格未绑定'
  const status = state.loading
    ? '正在读取...'
    : state.error
      ? `读取失败：${state.error}`
      : state.loaded
        ? `${state.attentionCount || 0} 条需处理 · ${state.chatCount || 0} 个会话 · ${state.messageCount || 0} 条 · ${webPushText} · ${baseText}${updated ? ` · ${updated}` : ''}`
        : '尚未读取'
  larkInboxSummary.textContent = status
  if (larkInboxRefresh) {
    larkInboxRefresh.disabled = state.loading === true
    larkInboxRefresh.textContent = state.loading ? '刷新中...' : '刷新'
  }
  if (larkWebPushOpen) larkWebPushOpen.textContent = larkWebPushState.windowVisible ? '实时窗口' : '实时登录'
  if (larkWebPushReload) larkWebPushReload.disabled = larkWebPushState.enabled === false
  if (larkBaseOpen) {
    larkBaseOpen.disabled = !larkBaseSinkState.url
    larkBaseOpen.textContent = larkBaseSinkState.url ? '打开表格' : '表格未绑定'
    larkBaseOpen.title = larkBaseSinkState.url
      ? '打开飞书多维表格归档'
      : '先运行 pnpm run lark:base:setup 创建并绑定多维表格'
  }

  const messages = Array.isArray(state.messages)
    ? state.messages
      .slice()
      .sort((a, b) => Number(Boolean(b.needsAttention)) - Number(Boolean(a.needsAttention)))
      .slice(0, 16)
    : []
  if (!messages.length) {
    larkInboxEvents.className = 'event-list empty'
    larkInboxEvents.textContent = state.loaded ? '暂无最近群消息' : '尚未加载'
    return
  }
  larkInboxEvents.className = 'event-list lark-inbox-list'
  larkInboxEvents.innerHTML = [
    '<table class="lark-message-table">',
    '<thead><tr><th>时间</th><th>会话</th><th>发送人</th><th>内容</th><th>状态</th></tr></thead>',
    '<tbody>',
    messages.map((message) => {
      const text = message.content || `[${message.msgType || 'message'}]`
      const type = message.msgType && message.msgType !== 'text' ? ` ${message.msgType}` : ''
      const status = message.needsAttention
        ? message.attentionReason === 'p2p' ? '私聊' : '@我'
        : message.source === 'web-push' ? '实时' : '普通'
      return [
        `<tr class="lark-message-item${message.needsAttention ? ' needs-attention' : ''}" data-lark-message-id="${escapeHtml(message.messageId || '')}">`,
        `<td>${escapeHtml(fmtTime(message.createdAt || message.createTime))}</td>`,
        `<td title="${escapeHtml(message.chatName || '飞书群聊')}">${escapeHtml(shortText(message.chatName || '飞书群聊', 18))}</td>`,
        `<td title="${escapeHtml(message.senderName || '成员')}">${escapeHtml(shortText(message.senderName || '成员', 14))}</td>`,
        `<td title="${escapeHtml(text)}">${escapeHtml(shortText(text, 58))}${escapeHtml(type)}</td>`,
        `<td>${escapeHtml(status)}</td>`,
        '</tr>',
      ].join('')
    }).join(''),
    '</tbody></table>',
  ].join('')
}

async function refreshLarkInbox({ force = false } = {}) {
  if (!force && larkInboxState.loading) return
  larkInboxState = { ...larkInboxState, loading: true, error: '' }
  renderLarkInbox()
  try {
    const result = await window.pet.refreshLarkInbox?.()
    larkInboxState = normalizeLarkInboxState(result, true)
  } catch (error) {
    larkInboxState = {
      ...larkInboxState,
      ok: false,
      loading: false,
      loaded: true,
      error: error?.message || String(error),
      updatedAt: new Date().toISOString(),
    }
  }
  renderLarkInbox()
  syncEventPanel()
}

async function openLarkWebPushWindow() {
  try {
    const status = await window.pet.openLarkWebPush?.()
    larkWebPushState = normalizeLarkWebPushState(status)
  } catch (error) {
    larkWebPushState = { ...larkWebPushState, ok: false, error: error?.message || String(error) }
  }
  renderLarkInbox()
  syncEventPanel()
}

async function reloadLarkWebPushWindow() {
  try {
    const status = await window.pet.reloadLarkWebPush?.()
    larkWebPushState = normalizeLarkWebPushState(status)
  } catch (error) {
    larkWebPushState = { ...larkWebPushState, ok: false, error: error?.message || String(error) }
  }
  renderLarkInbox()
  syncEventPanel()
}

async function openLarkBaseTable() {
  if (!larkBaseSinkState.url) return
  try {
    const result = await window.pet.openLarkBase?.()
    larkBaseSinkState = normalizeLarkBaseSinkState({ ...larkBaseSinkState, ...result })
  } catch (error) {
    larkBaseSinkState = { ...larkBaseSinkState, ok: false, error: error?.message || String(error) }
  }
  renderLarkInbox()
  syncEventPanel()
}

function normalizeLarkInboxState(snapshot, loaded = true) {
  const messages = Array.isArray(snapshot?.messages) ? snapshot.messages : []
  const chats = Array.isArray(snapshot?.chats) ? snapshot.chats : []
  return {
    ok: snapshot?.ok !== false,
    enabled: snapshot?.enabled !== false,
    loading: snapshot?.loading === true,
    loaded,
    error: snapshot?.error || '',
    chats,
    messages,
    chatCount: Number(snapshot?.chatCount || chats.length || 0),
    messageCount: Number(snapshot?.messageCount || messages.length || 0),
    attentionCount: Number(snapshot?.attentionCount || messages.filter(message => message.needsAttention).length || 0),
    newCount: Number(snapshot?.newCount || 0),
    currentUserReady: snapshot?.currentUserReady === true,
    updatedAt: snapshot?.updatedAt || '',
  }
}

function normalizeLarkWebPushState(status) {
  return {
    ok: status?.ok !== false,
    enabled: status?.enabled !== false,
    running: status?.running === true,
    windowVisible: status?.windowVisible === true,
    injected: status?.injected === true,
    error: status?.error || '',
    lastPushAt: status?.lastPushAt || '',
    lastMessageAt: status?.lastMessageAt || '',
    pushCount: Number(status?.pushCount || 0),
    messageCount: Number(status?.messageCount || 0),
    updatedAt: status?.updatedAt || '',
  }
}

function normalizeLarkBaseSinkState(summary) {
  return {
    ok: summary?.ok !== false,
    enabled: summary?.enabled === true,
    baseTokenConfigured: summary?.baseTokenConfigured === true,
    url: String(summary?.url || ''),
    tableId: String(summary?.tableId || '消息'),
    queueLength: Number(summary?.queueLength || 0),
    syncedCount: Number(summary?.syncedCount || 0),
    error: summary?.error || '',
  }
}

function openLarkMessageById(messageId) {
  const id = String(messageId || '').trim()
  if (!id) return
  const message = (larkInboxState.messages || []).find(item => item.messageId === id)
  const target = larkMessageTarget(message)
  if (target) openTarget(target)
}

function subagentShareButtonHtml(transcript) {
  const transcriptPath = String(transcript || '').trim()
  if (!transcriptPath) return ''
  const pending = pendingSubagentShares.has(transcriptPath)
  return [
    `<button type="button" class="subagent-share" data-share-subagent="${escapeHtml(transcriptPath)}"`,
    pending ? ' disabled aria-busy="true"' : '',
    `>${pending ? '分享中...' : '分享'}</button>`,
  ].join('')
}

// Collect the sub-agents (SubagentStart/Stop carry agent_transcript_path + the
// parent session_id) belonging to a parent session, deduped by transcript.
function subagentsForSession(sessionEvent) {
  const parentId = sessionEvent?.sessionId || sessionEvent?.session_id || ''
  if (!parentId) return []
  const seen = new Set()
  const subs = []
  for (const ev of eventLog) {
    const transcript = ev.agentTranscriptPath || ev.agent_transcript_path || ''
    const pid = ev.sessionId || ev.session_id || ''
    if (!transcript || pid !== parentId || seen.has(transcript)) continue
    seen.add(transcript)
    subs.push({ transcript, name: ev.agent || ev.agentId || ev.agent_id || '子 Agent', last: ev })
  }
  return subs
}

function renderConfig() {
  if (!configEvents) return
  const notif = typeof Notification === 'undefined' ? '不可用' : Notification.permission
  const tokenText = activeAgentConfig.token ? '已配置' : '未配置'
  configEvents.innerHTML = [
    ['Bridge', activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL],
    ['SSE', agentSyncStatus === 'connected' ? '已连接' : '离线/重连中'],
    ['Hook', '127.0.0.1:7766'],
    ['飞书群聊', larkInboxState.enabled === false
      ? '关闭'
      : larkInboxState.error
        ? `异常: ${larkInboxState.error}`
        : `${larkInboxState.chatCount || 0} 群 / ${larkInboxState.messageCount || 0} 条 · ${larkWebPushState.running ? '实时' : '轮询'}`],
    ['多维表格', larkBaseSinkState.url
      ? `已绑定 · ${larkBaseSinkState.syncedCount || 0} 条已同步`
      : larkBaseSinkState.baseTokenConfigured
        ? '已配置，等待启用'
        : '未绑定'],
    ['Token', tokenText],
    ['勿扰', uiSettings.dndMode ? '开启' : '关闭'],
    ['声音', uiSettings.soundEnabled ? '开启' : '关闭'],
    ['系统通知', uiSettings.notificationsEnabled ? '开启' : '关闭'],
    ['通知权限', notif],
    ['番茄钟', `${pomodoroSettings.focusMinutes}/${pomodoroSettings.shortBreakMinutes}/${pomodoroSettings.longBreakMinutes} min`],
    ['久坐提醒', pomodoroSettings.sedentaryMinutes > 0 ? `${pomodoroSettings.sedentaryMinutes} min` : '关闭'],
  ].map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')
}

function bridgeTaskStatusLabel(status) {
  return {
    running: '运行中',
    waiting: '待交互',
    done: '完成',
    failed: '失败',
    canceled: '取消',
  }[status] || status || '未知'
}

function bridgeTaskMeta(task) {
  const parts = [
    bridgeTaskStatusLabel(task.status),
    task.backend || '',
    task.runtime || '',
    task.tokens ? `${task.tokens} tok` : '',
    task.eventCount ? `${task.eventCount} 事件` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function bridgeTaskTime(task) {
  return fmtTime(task.updatedAt || task.finishedAt || task.startedAt)
}

function renderBridgeTasks() {
  if (!bridgeTasksSummary || !bridgeTasksList) return
  if (bridgeTasksState.loading) {
    bridgeTasksSummary.textContent = '正在读取 Bridge 任务...'
  } else if (bridgeTasksState.error) {
    bridgeTasksSummary.textContent = `读取失败：${bridgeTasksState.error}`
  } else {
    const tasks = bridgeTasksState.tasks || []
    const running = tasks.filter(task => task.status === 'running').length
    const waiting = tasks.filter(task => task.status === 'waiting').length
    const done = tasks.filter(task => task.status === 'done').length
    const failed = tasks.filter(task => task.status === 'failed').length
    const updated = bridgeTasksState.updatedAt ? fmtTime(bridgeTasksState.updatedAt) : ''
    bridgeTasksSummary.textContent = `共 ${tasks.length} 个任务 · 运行 ${running} · 待交互 ${waiting} · 完成 ${done} · 失败 ${failed}${updated ? ` · ${updated}` : ''}`
  }

  const tasks = (bridgeTasksState.tasks || []).slice(0, 5)
  if (!tasks.length) {
    bridgeTasksList.className = 'event-list empty'
    bridgeTasksList.textContent = bridgeTasksState.loaded ? '暂无 Bridge 任务' : '尚未加载'
    return
  }
  bridgeTasksList.className = 'event-list'
  bridgeTasksList.innerHTML = tasks.map(task => [
    `<article class="event-item${task.status === 'failed' ? ' waiting' : task.status === 'done' ? ' done' : ''}" data-bridge-task-id="${escapeHtml(task.id || '')}">`,
    '<div class="event-meta">',
    `<span>${escapeHtml(task.source || 'bridge')} · ${escapeHtml(bridgeTaskStatusLabel(task.status))}</span>`,
    `<time>${escapeHtml(bridgeTaskTime(task))}</time>`,
    '</div>',
    '<div class="bridge-task-mini">',
    `<strong>${escapeHtml(shortText(task.title || task.prompt || task.id, 56))}</strong>`,
    `<span>${escapeHtml(bridgeTaskMeta(task))}</span>`,
    '</div>',
    '</article>',
  ].join('')).join('')
}

async function refreshBridgeTasks({ force = false } = {}) {
  if (!force && bridgeTasksState.loading) return
  bridgeTasksState = { ...bridgeTasksState, loading: true, error: '' }
  renderBridgeTasks()
  try {
    const result = await window.pet.bridgeTasks?.({
      bridgeUrl: activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL,
      token: activeAgentConfig.token || '',
      limit: 50,
    })
    if (!result?.ok) {
      bridgeTasksState = {
        loading: false,
        loaded: true,
        error: result?.error || 'Bridge 任务页不可用',
        tasks: [],
        updatedAt: new Date().toISOString(),
      }
    } else {
      bridgeTasksState = {
        loading: false,
        loaded: true,
        error: '',
        tasks: Array.isArray(result.tasks) ? result.tasks : [],
        updatedAt: result.updatedAt || new Date().toISOString(),
      }
    }
  } catch (error) {
    bridgeTasksState = {
      loading: false,
      loaded: true,
      error: error?.message || String(error),
      tasks: [],
      updatedAt: new Date().toISOString(),
    }
  }
  renderBridgeTasks()
}

async function openBridgeTasksWindow() {
  const result = await openUnifiedWorkbench('bridge')
  if (!result?.ok) say(`打开任务详情失败：${result?.error || '未知错误'}`, 2600)
}

async function openUnifiedWorkbench(tab = 'messages', taskId = '', options = {}) {
  if (panelVisible) togglePanel(false)
  window.pet.setIgnoreMouse(true, { forward: true })
  const result = await window.pet.openLarkWorkbench?.({ tab, taskId, ...options })
  if (!result?.ok) say(`打开工作台失败：${result?.error || '未知错误'}`, 2600)
  return result || { ok: false, error: '工作台入口不可用' }
}

async function shareBridgeTaskViewer() {
  if (bridgeTasksSharePending) return
  bridgeTasksSharePending = true
  syncBridgeTasksShareButton()
  say('正在生成 Bridge 全部任务分享页...', 2200)
  try {
    const result = await window.pet.shareBridgeTasks?.({
      bridgeUrl: activeAgentConfig.bridgeUrl || DEFAULT_BRIDGE_URL,
      token: activeAgentConfig.token || '',
      limit: 100,
    })
    if (!result?.ok) {
      say(`分享失败：${result?.error || 'bridge 没返回链接'}`, 4200)
      return
    }
    notifyShareReady(result.url ? `Bridge 任务分享链接已复制到剪贴板：${result.url}` : 'Bridge 任务分享链接已复制到剪贴板')
  } catch (error) {
    say(`分享失败：${error?.message || error}`, 4200)
  } finally {
    bridgeTasksSharePending = false
    syncBridgeTasksShareButton()
  }
}

function syncBridgeTasksShareButton() {
  if (!bridgeTasksShare) return
  bridgeTasksShare.disabled = bridgeTasksSharePending
  bridgeTasksShare.textContent = bridgeTasksSharePending ? '分享中...' : '分享全部任务'
  bridgeTasksShare.setAttribute('aria-busy', bridgeTasksSharePending ? 'true' : 'false')
}

function syncEventPanel() {
  const waiting = eventLog.filter(isWaiting)
  const done = eventLog.filter(isDone)
  if (metricWaiting) metricWaiting.textContent = String(waiting.length)
  if (metricDone) metricDone.textContent = String(done.length)
  if (metricInbox) metricInbox.textContent = String(larkInboxState.attentionCount || 0)
  if (metricTotal) metricTotal.textContent = String(eventLog.length)
  if (panelStatus) {
    const statusText = agentSyncStatus === 'connected' ? 'Bridge 已连接' : 'Bridge 离线/重连中'
    const inboxText = larkInboxState.enabled === false
      ? '消息关闭'
      : larkInboxState.error
        ? '消息异常'
        : larkInboxState.loading
          ? '消息刷新中'
          : `需处理 ${larkInboxState.attentionCount || 0}${larkWebPushState.running ? ' · 实时' : ''}`
    panelStatus.textContent = `${statusText} · Hook 127.0.0.1:7766 · ${inboxText}`
  }
  renderEventList(waitingEvents, waiting.slice(0, 6))
  renderEventList(doneEvents, done.slice(0, 8))
  renderAgentTaskBoard()
  renderSessionList(sessionEvents, openableEvents().slice(0, 8))
  renderLarkInbox()
  renderEventList(recentEvents, eventLog.slice(0, 8))
  renderConfig()
  renderBridgeTasks()
  syncSettingControls()
  setActivePanelTab(activePanelTab)
  positionPanel()
}

window.addEventListener('resize', () => {
  positionBubble()
  positionPanel()
  positionAppearanceConfirm()
})
