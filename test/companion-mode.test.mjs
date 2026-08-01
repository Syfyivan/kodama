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

test('companion moments rotate safely and always include dialogue plus motion', () => {
  assert.ok(COMPANION_MOMENTS.length >= 4)
  assert.deepEqual(companionMomentAt(COMPANION_MOMENTS.length), companionMomentAt(0))
  for (const moment of COMPANION_MOMENTS) {
    assert.ok(moment.text.length > 0)
    assert.ok(moment.motion.length > 0)
  }
})

test('companion activity delay stays calm but visibly more active', () => {
  assert.equal(companionDelayMs(() => 0), 24_000)
  assert.equal(companionDelayMs(() => 0.5), 35_000)
  assert.equal(companionDelayMs(() => 1), 46_000)
})
