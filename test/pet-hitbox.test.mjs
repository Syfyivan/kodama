import assert from 'node:assert/strict'
import test from 'node:test'

import { scaledHitboxSize } from '../src/renderer/pet-hitbox.js'

test('keeps a touch-friendly hitbox when a pet is scaled down to 20%', () => {
  assert.deepEqual(
    scaledHitboxSize({ width: 56, height: 42, scale: 0.35 }),
    { width: 40, height: 40 },
  )
})

test('preserves the configured hitbox ratio for a normally sized pet', () => {
  assert.deepEqual(
    scaledHitboxSize({ width: 240, height: 180, scale: 0.5 }),
    { width: 120, height: 90 },
  )
})

test('never grows the interactive bounds beyond the visible pet bounds', () => {
  assert.deepEqual(
    scaledHitboxSize({ width: 24, height: 30, scale: 0.2 }),
    { width: 24, height: 30 },
  )
})
