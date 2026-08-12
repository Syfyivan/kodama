import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPANION_MOMENTS,
  companionDelayMs,
  companionInitialDelayMs,
  companionMomentAt,
  isActiveCompanionMode,
} from '../src/renderer/companion-mode.js'

test('companion becomes active only when task bubbles are hidden and DND is off', () => {
  assert.equal(isActiveCompanionMode({ taskBubblesVisible: false, dndMode: false }), true)
  assert.equal(isActiveCompanionMode({ taskBubblesVisible: true, dndMode: false }), false)
  assert.equal(isActiveCompanionMode({ taskBubblesVisible: false, dndMode: true }), false)
})

test('companion moments rotate safely with varied quiet and speaking actions', () => {
  assert.ok(COMPANION_MOMENTS.length >= 4)
  assert.deepEqual(companionMomentAt(COMPANION_MOMENTS.length), companionMomentAt(0))
  for (const moment of COMPANION_MOMENTS) {
    assert.equal(typeof moment.text, 'string')
    assert.equal(typeof moment.motion, 'string')
  }
  assert.equal(new Set(COMPANION_MOMENTS.map(moment => moment.motion).filter(Boolean)).size, 1)
  assert.ok(COMPANION_MOMENTS.some(moment => moment.text && !moment.motion))
  assert.ok(COMPANION_MOMENTS.some(moment => moment.motion === 'Doze'))
  assert.equal(COMPANION_MOMENTS.some(moment => ['Eat', 'Wave'].includes(moment.motion)), false)
})

test('companion activity starts calmly and stays deliberately infrequent', () => {
  assert.equal(companionInitialDelayMs(() => 0), 120_000)
  assert.equal(companionInitialDelayMs(() => 0.5), 180_000)
  assert.equal(companionInitialDelayMs(() => 1), 240_000)
  assert.equal(companionDelayMs(() => 0), 300_000)
  assert.equal(companionDelayMs(() => 0.5), 450_000)
  assert.equal(companionDelayMs(() => 1), 600_000)
})
