import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const appearance = await import('../src/renderer/config/appearance.js')

test('built-in pet families expose three ordered evolution stages', () => {
  assert.ok(Array.isArray(appearance.PET_FAMILIES))
  assert.ok(appearance.PET_FAMILIES.length >= 4)
  for (const family of appearance.PET_FAMILIES) {
    assert.ok(family.id)
    assert.ok(family.label)
    assert.equal(family.stages.length, 3)
    assert.equal(family.stages[0].minLevel, 1)
    assert.match(family.stages[0].file, /\.png$/)
    assert.equal(family.stages[1].minLevel, 5)
    assert.equal(family.stages[2].minLevel, 15)
  }
})

test('pet family lookup falls back to the default family for stale saved ids', () => {
  assert.equal(typeof appearance.petFamilyById, 'function')
  assert.equal(appearance.petFamilyById('moonbunny').id, 'moonbunny')
  assert.equal(appearance.petFamilyById('removed-family').id, appearance.DEFAULT_PET_FAMILY_ID)
  assert.equal(appearance.petFamilyById('').id, appearance.DEFAULT_PET_FAMILY_ID)
})

test('each companion family has species-specific evolution names', () => {
  assert.equal(new Set(appearance.PET_FAMILIES.map((family) => family.stages[1].label)).size, appearance.PET_FAMILIES.length)
  assert.equal(new Set(appearance.PET_FAMILIES.map((family) => family.stages[2].label)).size, appearance.PET_FAMILIES.length)
})

test('the default keyboard mouse rests on static growth art and ships animated reactions', () => {
  const family = appearance.petFamilyById(appearance.DEFAULT_PET_FAMILY_ID)
  assert.equal(family.id, 'aetherling')
  assert.equal(family.frameAnimation, true)
  assert.deepEqual(family.stages.map(stage => stage.file), ['egg.png', 'young.png', 'winged.png'])
  assert.equal(family.map.thinking, 'thinking-animated.png')
  assert.equal(family.map.working, 'working-animated.png')
  assert.equal(family.map.waiting, 'waiting-animated.png')
  assert.equal(family.map.eating, 'eating-animated.png')
  assert.equal(family.map.done, 'done-animated.png')
  assert.equal(family.map.failed, 'failed-animated.png')
  const files = new Set([
    ...family.stages.map(stage => stage.file),
    ...Object.values(family.map || {}),
  ])
  for (const file of files) {
    const asset = fileURLToPath(new URL(`../src/renderer/pets/${family.set}/${file}`, import.meta.url))
    assert.ok(existsSync(asset), `missing configured keyboard mouse asset: ${file}`)
  }
})
