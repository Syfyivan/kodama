import assert from 'node:assert/strict'
import { test } from 'node:test'

// growth.js talks to window.pet; stub it before importing.
let loadedState = null
let saved = null
globalThis.window = {
  pet: {
    getState: async () => loadedState,
    saveState: (s) => {
      saved = s
    },
  },
}

const {
  appearanceState,
  equipAccessory,
  feed,
  feedManually,
  feedTokens,
  getState,
  growthStageForLevel,
  initGrowth,
  resetGrowth,
  selectGrowthStage,
  selectSkin,
  statusText,
  unlockWithExp,
} = await import('../src/renderer/growth.js')

function setLoadedState(state) {
  loadedState = state
  saved = null
}

test('agent events alone cannot bypass token-fed growth', async () => {
  setLoadedState(null)
  await initGrowth({ say() {}, playMotion() {} })
  assert.equal(getState().level, 1)
  for (let i = 0; i < 5; i++) feed('task_done')
  assert.equal(getState().level, 1)
  assert.equal(getState().exp, 0)
  assert.equal(getState().food, 0)
  assert.equal(feedManually().reason, 'no-food')
  assert.match(statusText(), /Lv\.1 · 🍖0/)
})

test('unknown event type feeds nothing', async () => {
  setLoadedState(null)
  await initGrowth({ say() {}, playMotion() {} })
  const before = getState().exp
  feed('definitely-not-an-event')
  assert.equal(getState().exp, before)
})

test('feedTokens only sets a baseline on first call (no feed)', () => {
  const before = getState().food
  feedTokens(10000) // first call -> baseline
  assert.equal(getState().food, before)
  assert.equal(getState().lastTokens, 10000)
})

test('feedTokens feeds the delta afterwards (100000 tok = 1 food)', () => {
  const before = getState().food
  feedTokens(10000 + 200000) // +200000 tokens => +2 food
  assert.equal(getState().food, before + 2)
})

test('feedTokens carries the sub-100000 remainder across refreshes', () => {
  const start = getState().lastTokens // 210000 from the previous test
  const before = getState().food
  feedTokens(start + 75000) // below the threshold => no food, remainder must be kept
  assert.equal(getState().food, before)
  feedTokens(start + 150000) // cumulative delta crosses 100000 => +1 food
  assert.equal(getState().food, before + 1)
})

test('old growth state is migrated with level-based accessory unlocks', async () => {
  setLoadedState({ level: 3, exp: 0, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  assert.deepEqual(getState().unlockedAccessories, ['sprout', 'round_glasses', 'agent_badge'])
  assert.deepEqual(getState().equippedAccessories, {})
  assert.deepEqual(saved.unlockedAccessories, ['sprout', 'round_glasses', 'agent_badge'])
})

test('equipping an unlocked accessory persists by slot', async () => {
  setLoadedState({ level: 2, exp: 0, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  const result = equipAccessory({ id: 'round_glasses' })
  assert.equal(result.ok, true)
  assert.equal(getState().equippedAccessories.face, 'round_glasses')
  assert.equal(saved.equippedAccessories.face, 'round_glasses')
})

test('locked accessories cannot be equipped', async () => {
  setLoadedState({ level: 1, exp: 0, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  const result = equipAccessory({ id: 'focus_halo' })
  assert.equal(result.ok, false)
  assert.match(result.reason, /Lv\.5/)
  assert.equal(getState().equippedAccessories.aura, undefined)
})

test('shop: buying an emoji accessory spends exp and unlocks it', async () => {
  // 'crown' costs 120⭐; high level gives a big exp buffer before next level-up.
  setLoadedState({ level: 50, exp: 200, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  assert.ok(!getState().unlockedAccessories.includes('crown'))
  const result = unlockWithExp({ id: 'crown' })
  assert.equal(result.ok, true)
  assert.equal(result.action, 'unlock')
  assert.equal(getState().exp, 80) // 200 - 120
  assert.ok(getState().unlockedAccessories.includes('crown'))
  assert.equal(saved.exp, 80)
})

test('shop: cannot buy with insufficient exp', async () => {
  setLoadedState({ level: 50, exp: 10, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  const result = unlockWithExp({ id: 'crown' })
  assert.equal(result.ok, false)
  assert.match(result.reason, /经验不足/)
  assert.ok(!getState().unlockedAccessories.includes('crown'))
  assert.equal(getState().exp, 10) // unchanged
})

test('shop: a purchased emoji accessory can then be equipped', async () => {
  setLoadedState({ level: 50, exp: 100, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  unlockWithExp({ id: 'star_badge' }) // 30⭐, slot badge
  const result = equipAccessory({ id: 'star_badge' })
  assert.equal(result.ok, true)
  assert.equal(getState().equippedAccessories.badge, 'star_badge')
})

test('growth stages progress from egg to young spirit to winged spirit', () => {
  assert.equal(growthStageForLevel(1).id, 'egg')
  assert.equal(growthStageForLevel(4).id, 'egg')
  assert.equal(growthStageForLevel(5).id, 'spirit')
  assert.equal(growthStageForLevel(14).id, 'spirit')
  assert.equal(growthStageForLevel(15).id, 'winged')
})

test('appearance choices persist and locked growth stages stay unavailable', async () => {
  setLoadedState({ level: 5, exp: 3, food: 0, totalFed: 0 })
  await initGrowth({ say() {}, playMotion() {} })
  assert.equal(selectSkin('moon').ok, true)
  assert.equal(selectGrowthStage('spirit').ok, true)
  assert.equal(selectGrowthStage('winged').ok, false)
  assert.equal(getState().skinId, 'moon')
  assert.equal(getState().selectedStage, 'spirit')
  assert.equal(appearanceState().stage.id, 'spirit')
  assert.equal(saved.skinId, 'moon')
})

test('invalid saved appearance migrates back to safe automatic defaults', async () => {
  setLoadedState({ level: 1, skinId: 'missing', selectedStage: 'winged' })
  await initGrowth({ say() {}, playMotion() {} })
  assert.equal(getState().skinId, 'forest')
  assert.equal(getState().selectedStage, 'auto')
  assert.equal(appearanceState().stage.id, 'egg')
})

test('a new pet starts as an egg with a complete hatching journey', async () => {
  setLoadedState(null)
  await initGrowth({ say() {}, playMotion() {} })

  const look = appearanceState()
  assert.equal(getState().level, 1)
  assert.equal(look.naturalStage.id, 'egg')
  assert.equal(look.journey.currentStage.id, 'egg')
  assert.equal(look.journey.nextStage.id, 'spirit')
  assert.equal(look.journey.levelsRemaining, 4)
  assert.deepEqual(look.journey.progress, {
    value: 0,
    required: 170,
    ratio: 0,
  })
})

test('token feeding exposes partial progress and the exact growth conversion', async () => {
  setLoadedState({ level: 1, exp: 0, food: 0, totalFed: 0, lastTokens: 10000 })
  await initGrowth({ say() {}, playMotion() {} })

  const partial = feedTokens(85000)
  assert.deepEqual(partial, {
    ok: true,
    baseline: false,
    deltaTokens: 75000,
    convertedTokens: 0,
    food: 0,
    exp: 0,
    pendingTokens: 75000,
  })
  assert.equal(getState().tokenRemainder, 75000)
  assert.deepEqual(appearanceState().tokenProgress, {
    value: 75000,
    required: 100000,
    ratio: 0.75,
    tokensPerFood: 100000,
    expPerFood: 2,
  })

  const converted = feedTokens(160000)
  assert.deepEqual(converted, {
    ok: true,
    baseline: false,
    deltaTokens: 150000,
    convertedTokens: 100000,
    food: 1,
    exp: 2,
    pendingTokens: 50000,
  })
  assert.equal(getState().food, 1)
  assert.equal(getState().exp, 2)
  assert.equal(getState().lastTokens, 110000)
  assert.equal(getState().tokenRemainder, 50000)
})

test('legacy growth state gains journey and token defaults without losing progress', async () => {
  setLoadedState({ level: 4, exp: 10, food: 7, totalFed: 12, lastTokens: 8000 })
  await initGrowth({ say() {}, playMotion() {} })

  const look = appearanceState()
  assert.equal(getState().tokenRemainder, 0)
  assert.equal(look.journey.currentStage.id, 'egg')
  assert.equal(look.journey.nextStage.id, 'spirit')
  assert.equal(look.journey.levelsRemaining, 1)
  assert.deepEqual(look.journey.progress, {
    value: 115,
    required: 170,
    ratio: 115 / 170,
  })
  assert.equal(getState().food, 7)
  assert.equal(getState().totalFed, 12)
})

test('token total rollback safely re-baselines without granting historical growth', async () => {
  setLoadedState({ level: 1, exp: 0, food: 0, totalFed: 0, lastTokens: 10000, tokenRemainder: 1500 })
  await initGrowth({ say() {}, playMotion() {} })
  const result = feedTokens(8000)
  assert.equal(result.baseline, true)
  assert.equal(result.reset, true)
  assert.equal(getState().lastTokens, 8000)
  assert.equal(getState().tokenRemainder, 0)
  assert.equal(getState().level, 1)
})

test('adopting a new pet resets the journey to a fresh egg', async () => {
  setLoadedState({ level: 18, exp: 9, food: 30, totalFed: 400, lastTokens: 50000, tokenRemainder: 300 })
  await initGrowth({ say() {}, playMotion() {} })
  const result = resetGrowth()
  assert.equal(result.ok, true)
  assert.equal(getState().level, 1)
  assert.equal(getState().exp, 0)
  assert.equal(getState().food, 0)
  assert.equal(getState().lastTokens, null)
  assert.equal(appearanceState().journey.currentStage.id, 'egg')
  assert.equal(saved.level, 1)
})

test('adopting with a ready token total establishes the new baseline atomically', async () => {
  setLoadedState({ level: 18, exp: 9, food: 30, totalFed: 400, lastTokens: 50000, tokenRemainder: 300 })
  await initGrowth({ say() {}, playMotion() {} })
  resetGrowth({ tokenTotal: 6206756322 })
  assert.equal(getState().lastTokens, 6206756322)
  assert.equal(getState().level, 1)
  assert.equal(getState().exp, 0)
  assert.equal(getState().food, 0)

  const next = feedTokens(6206856322)
  assert.equal(next.food, 1)
  assert.equal(getState().exp, 2)
})
