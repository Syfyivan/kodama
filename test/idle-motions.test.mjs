import test from 'node:test'
import assert from 'node:assert/strict'
import { PET_FAMILIES } from '../src/renderer/config/appearance.js'
import {
  IDLE_MOTION_PROFILES,
  canPlayIdleMotion,
  idleMotionAt,
  idleMotionDelayMs,
  idleMotionInitialDelayMs,
} from '../src/renderer/idle-motions.js'

test('every built-in companion has its own bounded idle-motion profile', () => {
  const allowed = new Set(['Blink', 'Nod', 'Stretch', 'Sway', 'Wave'])
  const signatures = new Set()

  for (const family of PET_FAMILIES) {
    const profile = IDLE_MOTION_PROFILES[family.id]
    assert.ok(Array.isArray(profile), `missing idle profile for ${family.id}`)
    assert.ok(profile.length >= 1 && profile.length <= 2, `${family.id} should stay visually quiet`)
    profile.forEach(motion => assert.ok(allowed.has(motion), `${family.id} has an oversized idle motion`))
    assert.equal(idleMotionAt(family.id, profile.length), profile[0])
    signatures.add(profile.join(','))
  }

  assert.ok(signatures.size >= 6, 'companions should not all repeat the same whole-sprite motion')
  assert.equal(idleMotionAt('removed-family', 0), IDLE_MOTION_PROFILES.aetherling[0])
})

test('idle motions remain rare enough to avoid repeatedly stealing attention', () => {
  assert.equal(idleMotionInitialDelayMs(() => 0), 60_000)
  assert.equal(idleMotionInitialDelayMs(() => 0.5), 90_000)
  assert.equal(idleMotionInitialDelayMs(() => 1), 120_000)
  assert.equal(idleMotionDelayMs(() => 0), 180_000)
  assert.equal(idleMotionDelayMs(() => 0.5), 270_000)
  assert.equal(idleMotionDelayMs(() => 1), 360_000)
})

test('micro gestures only run while the companion is safely resting', () => {
  const resting = {
    documentHidden: false,
    panelVisible: false,
    moveModeActive: false,
    dndMode: false,
    performanceMode: 'balanced',
    currentState: 'idle',
    ongoingState: 'idle',
  }

  assert.equal(canPlayIdleMotion(resting), true)
  assert.equal(canPlayIdleMotion({ ...resting, currentState: 'waiting', ongoingState: 'waiting' }), true)
  assert.equal(canPlayIdleMotion({ ...resting, currentState: 'working', ongoingState: 'working' }), false)
  assert.equal(canPlayIdleMotion({ ...resting, currentState: 'tap' }), false)
  assert.equal(canPlayIdleMotion({ ...resting, documentHidden: true }), false)
  assert.equal(canPlayIdleMotion({ ...resting, panelVisible: true }), false)
  assert.equal(canPlayIdleMotion({ ...resting, moveModeActive: true }), false)
  assert.equal(canPlayIdleMotion({ ...resting, dndMode: true }), false)
  assert.equal(canPlayIdleMotion({ ...resting, performanceMode: 'saver' }), false)
})
