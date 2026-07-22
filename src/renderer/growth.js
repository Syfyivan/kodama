// P4 养成系统：token 用量是唯一成长燃料 → 饱食(food)/经验(exp) → 升级(level)。
// 状态持久化在主进程(userData/kodama-state.json)，经 preload 的 getState/saveState。
import { ACCESSORIES, ACCESSORY_SLOTS } from './config/accessories.js'
import {
  DEFAULT_SKIN_ID,
  DEFAULT_STAGE_SELECTION,
  GROWTH_STAGES,
  PET_SKINS,
} from './config/appearance.js'

const COMPANION_EVENTS = new Set([
  'lark_message_received',
  'task_started',
  'task_progress',
  'lark_reply_sent',
  'agent_done',
  'task_done',
  'task_waiting',
  'task_failed',
  'pomodoro_completed',
])

// Token 统计含缓存读写，实际量级很大；100k/口让孵化需要多轮真实使用，
// 避免一个普通任务就从蛋直接跳过幼体。
const TOKENS_PER_FOOD = 100000
const TOKEN_EXP_PER_FOOD = 2 // 每点 token 食物同步转化为 2 点成长经验

// 从 level 升到 level+1 所需经验
function expForLevel(level) {
  return 20 + (level - 1) * 15
}

const skinIds = new Set(PET_SKINS.map((skin) => skin.id))
const stageById = new Map(GROWTH_STAGES.map((stage) => [stage.id, stage]))

let activeAccessories = ACCESSORIES
let accessoryById = new Map(activeAccessories.map((a) => [a.id, a]))
let slotIds = new Set(ACCESSORY_SLOTS.map((s) => s.id))

function defaultState() {
  return {
    level: 1,
    exp: 0,
    food: 0,
    totalFed: 0,
    lastTokens: null,
    tokenRemainder: 0,
    unlockedAccessories: [],
    equippedAccessories: {},
    skinId: DEFAULT_SKIN_ID,
    selectedStage: DEFAULT_STAGE_SELECTION,
  }
}

let state = defaultState()
let hooks = {}

export function configureAccessories({ accessories, slots } = {}) {
  if (Array.isArray(accessories) && accessories.length) {
    activeAccessories = accessories
    accessoryById = new Map(activeAccessories.map((a) => [a.id, a]))
  }
  if (Array.isArray(slots) && slots.length) {
    slotIds = new Set(slots.map((s) => s.id))
  }
  if (hooks.onChange) {
    state = normalizeState(state)
    persist()
  }
}

export async function initGrowth(h) {
  hooks = h || {}
  try {
    const saved = await window.pet.getState?.()
    state = normalizeState(saved)
  } catch {
    state = normalizeState(null)
  }
  persist()
}

function persist() {
  window.pet?.saveState?.(getState())
  hooks.onChange?.(getState())
}

function numberOr(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeState(saved) {
  const raw = saved && typeof saved === 'object' ? saved : {}
  const next = { ...defaultState(), ...raw }
  next.level = Math.max(1, Math.floor(numberOr(next.level, 1)))
  next.exp = Math.max(0, Math.floor(numberOr(next.exp, 0)))
  next.food = Math.max(0, Math.floor(numberOr(next.food, 0)))
  next.totalFed = Math.max(0, Math.floor(numberOr(next.totalFed, 0)))
  next.lastTokens = next.lastTokens == null ? null : Math.max(0, numberOr(next.lastTokens, 0))
  next.tokenRemainder = next.lastTokens == null
    ? 0
    : Math.max(0, Math.floor(numberOr(next.tokenRemainder, 0))) % TOKENS_PER_FOOD
  next.skinId = skinIds.has(raw.skinId) ? raw.skinId : DEFAULT_SKIN_ID
  const savedStage = raw.selectedStage === DEFAULT_STAGE_SELECTION ? DEFAULT_STAGE_SELECTION : stageById.get(raw.selectedStage)?.id
  next.selectedStage = savedStage && (savedStage === DEFAULT_STAGE_SELECTION || next.level >= stageById.get(savedStage).minLevel)
    ? savedStage
    : DEFAULT_STAGE_SELECTION

  const unlocked = new Set(Array.isArray(raw.unlockedAccessories) ? raw.unlockedAccessories : [])
  for (const acc of activeAccessories) {
    if (next.level >= acc.unlockLevel) unlocked.add(acc.id)
  }
  next.unlockedAccessories = activeAccessories.filter((acc) => unlocked.has(acc.id)).map((acc) => acc.id)

  const equipped = {}
  const rawEquipped = raw.equippedAccessories && typeof raw.equippedAccessories === 'object' ? raw.equippedAccessories : {}
  for (const [slot, id] of Object.entries(rawEquipped)) {
    const acc = accessoryById.get(id)
    if (slotIds.has(slot) && acc?.slot === slot && next.unlockedAccessories.includes(id)) equipped[slot] = id
  }
  next.equippedAccessories = equipped
  return next
}

function unlockForLevel() {
  const unlocked = new Set(state.unlockedAccessories)
  const newly = []
  for (const acc of activeAccessories) {
    if (state.level >= acc.unlockLevel && !unlocked.has(acc.id)) {
      unlocked.add(acc.id)
      newly.push(acc)
    }
  }
  state.unlockedAccessories = activeAccessories.filter((acc) => unlocked.has(acc.id)).map((acc) => acc.id)
  return newly
}

// Add food/exp, handle level-ups, persist. Returns true if leveled up.
function applyGains(food, exp) {
  state.food += food
  state.totalFed += food
  state.exp += exp
  let leveled = false
  while (state.exp >= expForLevel(state.level)) {
    state.exp -= expForLevel(state.level)
    state.level += 1
    leveled = true
  }
  const newlyUnlocked = unlockForLevel()
  persist()
  if (leveled) {
    hooks.playMotion?.('Tap')
    const unlockText = newlyUnlocked.length ? ` · 解锁 ${newlyUnlocked.map((a) => a.label).join('、')}` : ''
    hooks.say?.(`✨ 升级啦！现在 Lv.${state.level}${unlockText} ✨`, 5000)
  }
  return leveled
}

export function feed(type) {
  if (!COMPANION_EVENTS.has(type)) return
  return { ok: true, growth: false, reason: 'token-only' }
}

// 主动投喂:消耗食物换经验(食物自动从使用累积,投喂是把它"花"成成长)。
const FEED_COST = 200 // 每次投喂消耗的食物(不足则全投)
const FEED_EXP_RATE = 0.5 // 食物→经验的转化率
export function feedManually() {
  const cost = Math.min(state.food, FEED_COST)
  if (cost <= 0) {
    hooks.say?.('还没有能量呢，继续使用 Agent 攒一些 token 吧 ✨', 2800)
    return { ok: false, reason: 'no-food' }
  }
  state.food -= cost
  const expGain = Math.max(1, Math.round(cost * FEED_EXP_RATE))
  hooks.playMotion?.('Tap')
  hooks.say?.(`投喂 -${cost}🍖 → +${expGain}⭐ 😋`, 2600)
  applyGains(0, expGain) // 加经验 + 处理升级 + 持久化
  return { ok: true, cost, expGain, level: state.level }
}

// 等级影响显示大小:幼崽小 → 成年大,温和封顶(31 级到顶 1.0,不打扰已满级桌宠)。
export function growthScale() {
  return Math.min(1, 0.7 + (state.level - 1) * 0.01)
}

export function growthStageForLevel(level) {
  const currentLevel = Math.max(1, Math.floor(numberOr(level, 1)))
  let selected = GROWTH_STAGES[0]
  for (const stage of GROWTH_STAGES) {
    if (currentLevel >= stage.minLevel) selected = stage
  }
  return { ...selected }
}

function expBetweenLevels(fromLevel, toLevel) {
  let total = 0
  for (let level = fromLevel; level < toLevel; level += 1) total += expForLevel(level)
  return total
}

function growthJourney() {
  const currentStage = growthStageForLevel(state.level)
  const stageIndex = GROWTH_STAGES.findIndex((stage) => stage.id === currentStage.id)
  const nextStage = GROWTH_STAGES[stageIndex + 1] || null
  if (!nextStage) {
    return {
      currentStage,
      nextStage: null,
      levelsRemaining: 0,
      progress: { value: 0, required: 0, ratio: 1 },
    }
  }

  const required = expBetweenLevels(currentStage.minLevel, nextStage.minLevel)
  const value = Math.min(required, expBetweenLevels(currentStage.minLevel, state.level) + state.exp)
  return {
    currentStage,
    nextStage: { ...nextStage },
    levelsRemaining: Math.max(0, nextStage.minLevel - state.level),
    progress: {
      value,
      required,
      ratio: required > 0 ? value / required : 1,
    },
  }
}

function tokenProgress() {
  return {
    value: state.tokenRemainder,
    required: TOKENS_PER_FOOD,
    ratio: state.tokenRemainder / TOKENS_PER_FOOD,
    tokensPerFood: TOKENS_PER_FOOD,
    expPerFood: TOKEN_EXP_PER_FOOD,
  }
}

export function appearanceState() {
  const naturalStage = growthStageForLevel(state.level)
  const selected = state.selectedStage === DEFAULT_STAGE_SELECTION
    ? naturalStage
    : stageById.get(state.selectedStage) || naturalStage
  const skin = PET_SKINS.find((item) => item.id === state.skinId) || PET_SKINS[0]
  const required = expForLevel(state.level)
  return {
    skin: { ...skin },
    selectedStage: state.selectedStage,
    stage: { ...selected },
    naturalStage,
    stages: GROWTH_STAGES.map((stage) => ({
      ...stage,
      unlocked: state.level >= stage.minLevel,
    })),
    skins: PET_SKINS.map((item) => ({ ...item })),
    progress: {
      value: state.exp,
      required,
      ratio: required > 0 ? Math.min(1, state.exp / required) : 0,
    },
    journey: growthJourney(),
    tokenProgress: tokenProgress(),
  }
}

export function selectSkin(id) {
  const skin = PET_SKINS.find((item) => item.id === id)
  if (!skin) return { ok: false, reason: '未知皮肤' }
  state.skinId = skin.id
  persist()
  return { ok: true, skin: { ...skin }, state: getState() }
}

export function selectGrowthStage(id) {
  if (id === DEFAULT_STAGE_SELECTION) {
    state.selectedStage = DEFAULT_STAGE_SELECTION
    persist()
    return { ok: true, stage: growthStageForLevel(state.level), state: getState() }
  }
  const stage = stageById.get(id)
  if (!stage) return { ok: false, reason: '未知成长形态' }
  if (state.level < stage.minLevel) {
    return { ok: false, reason: `${stage.label} 需要 Lv.${stage.minLevel}` }
  }
  state.selectedStage = stage.id
  persist()
  return { ok: true, stage: { ...stage }, state: getState() }
}

// Feed the pet from cumulative token usage. First call only sets a baseline
// (so pre-existing usage doesn't dump a huge level-up); afterwards each refresh
// feeds the delta of newly-used tokens.
export function feedTokens(totalTokens) {
  if (typeof totalTokens !== 'number' || totalTokens < 0) return
  if (state.lastTokens == null) {
    state.lastTokens = totalTokens
    state.tokenRemainder = 0
    persist()
    return {
      ok: true,
      baseline: true,
      deltaTokens: 0,
      convertedTokens: 0,
      food: 0,
      exp: 0,
      pendingTokens: 0,
    }
  }
  const delta = totalTokens - state.lastTokens
  if (delta < 0) {
    state.lastTokens = totalTokens
    state.tokenRemainder = 0
    persist()
    return {
      ok: true,
      baseline: true,
      reset: true,
      deltaTokens: 0,
      convertedTokens: 0,
      food: 0,
      exp: 0,
      pendingTokens: 0,
    }
  }
  if (delta === 0) return {
    ok: true,
    baseline: false,
    deltaTokens: 0,
    convertedTokens: 0,
    food: 0,
    exp: 0,
    pendingTokens: state.tokenRemainder,
  }
  const food = Math.floor(delta / TOKENS_PER_FOOD)
  const convertedTokens = food * TOKENS_PER_FOOD
  state.tokenRemainder = delta - convertedTokens
  // Keep the sub-threshold remainder: advance the baseline only by what we actually
  // converted, so many small (<100000-token) refreshes still add up to a food point
  // instead of each one resetting the baseline and dropping its remainder.
  if (food <= 0) persist()
  else {
    state.lastTokens += convertedTokens
    applyGains(food, food * TOKEN_EXP_PER_FOOD)
  }
  return {
    ok: true,
    baseline: false,
    deltaTokens: delta,
    convertedTokens,
    food,
    exp: food * TOKEN_EXP_PER_FOOD,
    pendingTokens: state.tokenRemainder,
  }
}

export function resetGrowth({ tokenTotal = null } = {}) {
  state = normalizeState(null)
  const baseline = Number(tokenTotal)
  if (tokenTotal != null && Number.isFinite(baseline) && baseline >= 0) {
    state.lastTokens = Math.floor(baseline)
  }
  persist()
  return { ok: true, state: getState() }
}

export function statusText() {
  return `Lv.${state.level} · 🍖${state.food} · ⭐${state.exp}/${expForLevel(state.level)}`
}

export function getState() {
  return {
    ...state,
    unlockedAccessories: [...state.unlockedAccessories],
    equippedAccessories: { ...state.equippedAccessories },
  }
}

export function equipAccessory(request) {
  const id = typeof request === 'object' ? request?.id : request
  const requestedSlot = typeof request === 'object' ? request?.slot : null

  if (!id || id === 'none') return unequipAccessory(requestedSlot)

  const acc = accessoryById.get(id)
  if (!acc) return { ok: false, reason: '未知配饰' }
  if (!state.unlockedAccessories.includes(acc.id)) {
    return { ok: false, reason: `${acc.label} 需要 Lv.${acc.unlockLevel}` }
  }

  state.equippedAccessories = { ...state.equippedAccessories, [acc.slot]: acc.id }
  persist()
  return { ok: true, action: 'equip', accessory: publicAccessory(acc), state: getState() }
}

export function unequipAccessory(slot) {
  if (!slotIds.has(slot)) return { ok: false, reason: '未知配饰槽位' }
  const next = { ...state.equippedAccessories }
  delete next[slot]
  state.equippedAccessories = next
  persist()
  return { ok: true, action: 'unequip', slot, state: getState() }
}

// 用经验购买配饰:exp ≥ cost 则扣经验 + 加入已解锁 + 持久化。
// 注意:exp 同时是升级货币(applyGains 会把 exp 攒满转成等级),所以可购买的
// 预算 = 当前距下一级前累积的 exp。等级越高缓冲越大,买 emoji 件绰绰有余;
// 不够时可先「投喂」把食物换成经验再来买。
export function unlockWithExp(request) {
  const id = typeof request === 'object' ? request?.id : request
  const acc = accessoryById.get(id)
  if (!acc) return { ok: false, reason: '未知配饰' }
  if (state.unlockedAccessories.includes(acc.id)) {
    return { ok: true, already: true, accessory: publicAccessory(acc), state: getState() }
  }
  const cost = Math.max(0, Math.floor(numberOr(acc.cost, 0)))
  if (cost <= 0) return { ok: false, reason: `${acc.label} 不在商店出售` }
  if (state.exp < cost) return { ok: false, reason: `经验不足(${state.exp}/${cost}⭐)` }

  state.exp -= cost
  const unlocked = new Set(state.unlockedAccessories)
  unlocked.add(acc.id)
  state.unlockedAccessories = activeAccessories.filter((a) => unlocked.has(a.id)).map((a) => a.id)
  persist()
  return { ok: true, action: 'unlock', cost, accessory: publicAccessory(acc), state: getState() }
}

function publicAccessory(acc) {
  return { id: acc.id, slot: acc.slot, label: acc.label, unlockLevel: acc.unlockLevel, icon: acc.icon, cost: acc.cost }
}
