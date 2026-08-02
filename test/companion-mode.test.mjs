import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COMPANION_MOMENTS,
  companionDelayMs,
  companionMomentAt,
  isActiveCompanionMode,
} from '../src/renderer/companion-mode.js'

test('companion becomes active only when task bubbles are hidden and DND is off', () => {
  assert.equal(isActiveCompanionMode({ taskBubblesVisible: false, dndMode: false }), true)
  assert.equal(isActiveCompanionMode({ taskBubblesVisible: true, dndMode: false }), false)
  assert.equal(isActiveCompanionMode({ taskBubblesVisible: false, dndMode: true }), false)
})

test('companion moments rotate safely with varied quiet and speaking actions', () => {
  assert.ok(COMPANION_MOMENTS.length >= 8)
  assert.deepEqual(companionMomentAt(COMPANION_MOMENTS.length), companionMomentAt(0))
  for (const moment of COMPANION_MOMENTS) {
    assert.equal(typeof moment.text, 'string')
    assert.ok(moment.motion.length > 0)
  }
  assert.ok(new Set(COMPANION_MOMENTS.map(moment => moment.motion)).size >= 7)
  assert.ok(COMPANION_MOMENTS.filter(moment => !moment.text).length >= 4)
})

test('companion activity delay stays calm but visibly more active', () => {
  assert.equal(companionDelayMs(() => 0), 14_000)
  assert.equal(companionDelayMs(() => 0.5), 23_000)
  assert.equal(companionDelayMs(() => 1), 32_000)
})
