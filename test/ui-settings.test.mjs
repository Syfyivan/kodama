import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  UI_SETTINGS_VERSION,
  clampPetScale,
  uiSettingsSourceForVersion,
} from '../src/renderer/config/ui-settings.js'

test('pet scale stays useful from a tiny desktop companion to a bounded large size', () => {
  assert.equal(PET_SCALE_MIN, 0.12)
  assert.equal(PET_SCALE_MAX, 0.75)
  assert.equal(clampPetScale(0.1, 0.42), 0.12)
  assert.equal(clampPetScale(0.2, 0.42), 0.2)
  assert.equal(clampPetScale(1.5, 0.42), 0.75)
})

test('version 4 migrates opacity and remaps its old wide size range', () => {
  const migrated = uiSettingsSourceForVersion({
    version: 4,
    petScale: 0.62,
    petOpacity: 0.55,
    taskBubbleOpacity: 0.25,
  })
  assert.equal(migrated.version, UI_SETTINGS_VERSION)
  assert.equal(migrated.petScale, 0.372)
  assert.equal(migrated.petOpacity, 0.55)
  assert.equal('taskBubbleOpacity' in migrated, false)
})

test('version 5 default size becomes the quieter version 6 default-equivalent size', () => {
  const migrated = uiSettingsSourceForVersion({ version: 5, petScale: 0.72, petOpacity: 0.82 })
  assert.equal(migrated.version, UI_SETTINGS_VERSION)
  assert.equal(migrated.petScale, 0.432)
  assert.equal(migrated.petOpacity, 0.82)
})

test('version 3 users parked at the old minimum migrate to the new minimum', () => {
  const migrated = uiSettingsSourceForVersion({ version: 3, petScale: 0.4, petOpacity: 0.45 })
  assert.equal(migrated.version, UI_SETTINGS_VERSION)
  assert.equal(migrated.petScale, 0.12)
  assert.equal(migrated.petOpacity, 0.45)
})

test('migration preserves intentional non-minimum sizes and current settings', () => {
  assert.equal(uiSettingsSourceForVersion({ version: 3, petScale: 0.65 }).petScale, 0.39)
  assert.equal(uiSettingsSourceForVersion({ version: UI_SETTINGS_VERSION, petScale: 0.4 }).petScale, 0.4)
  assert.deepEqual(uiSettingsSourceForVersion({ version: 2, petScale: 0.4 }), {})
})
