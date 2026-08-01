import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PET_SCALE_MIN,
  TASK_BUBBLE_OPACITY_MIN,
  UI_SETTINGS_VERSION,
  clampPetScale,
  clampTaskBubbleOpacity,
  uiSettingsSourceForVersion,
} from '../src/renderer/config/ui-settings.js'

test('pet scale supports a genuinely compact 20 percent minimum', () => {
  assert.equal(PET_SCALE_MIN, 0.2)
  assert.equal(clampPetScale(0.1, 0.72), 0.2)
  assert.equal(clampPetScale(0.2, 0.72), 0.2)
  assert.equal(clampPetScale(1.5, 0.72), 1.25)
})

test('task bubble opacity remains readable and independently adjustable', () => {
  assert.equal(TASK_BUBBLE_OPACITY_MIN, 0.2)
  assert.equal(clampTaskBubbleOpacity(0.1, 1), 0.2)
  assert.equal(clampTaskBubbleOpacity(0.55, 1), 0.55)
  assert.equal(clampTaskBubbleOpacity(1.5, 1), 1)
})

test('version 3 users parked at the old minimum migrate to the new minimum', () => {
  const migrated = uiSettingsSourceForVersion({ version: 3, petScale: 0.4, petOpacity: 0.45 })
  assert.equal(migrated.version, UI_SETTINGS_VERSION)
  assert.equal(migrated.petScale, 0.2)
  assert.equal(migrated.petOpacity, 0.45)
})

test('migration preserves intentional non-minimum sizes and current settings', () => {
  assert.equal(uiSettingsSourceForVersion({ version: 3, petScale: 0.65 }).petScale, 0.65)
  assert.equal(uiSettingsSourceForVersion({ version: UI_SETTINGS_VERSION, petScale: 0.4 }).petScale, 0.4)
  assert.deepEqual(uiSettingsSourceForVersion({ version: 2, petScale: 0.4 }), {})
})
