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
  assert.ok(new Set(COMPANION_MOMENTS.map(moment => moment.motion).filter(Boolean)).size >= 2)
  assert.ok(COMPANION_MOMENTS.some(moment => moment.text && !moment.motion))
  assert.ok(COMPANION_MOMENTS.some(moment => moment.motion === 'Eat'))
})

test('companion activity starts calmly and stays deliberately infrequent', () => {
  assert.equal(companionInitialDelayMs(() => 0), 25_000)
  assert.equal(companionInitialDelayMs(() => 0.5), 35_000)
  assert.equal(companionInitialDelayMs(() => 1), 45_000)
  assert.equal(companionDelayMs(() => 0), 55_000)
  assert.equal(companionDelayMs(() => 0.5), 82_500)
  assert.equal(companionDelayMs(() => 1), 110_000)
})
