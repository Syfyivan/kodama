import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const appearance = await import('../src/renderer/config/appearance.js')

test('built-in pet families expose three ordered evolution stages', () => {
  assert.ok(Array.isArray(appearance.PET_FAMILIES))
  assert.deepEqual(
    appearance.PET_FAMILIES.map((family) => family.id),
    [
      'aetherling',
      'cottonpod-hermit',
      'ferncurl-pangolin',
      'rainpouch-newt',
      'little-undo',
      'pocket-glider',
      'nuonuo-seal',
      'upside-sprout',
    ],
  )
  for (const family of appearance.PET_FAMILIES) {
    assert.ok(family.id)
    assert.ok(family.label)
    assert.equal(family.stages.length, 3)
    assert.equal(family.stages[0].minLevel, 1)
    assert.match(family.stages[0].file, /\.png$/)
    assert.match(family.stages[0].idleFile, /-idle-animated\.png$/)
    assert.equal(family.stages[1].minLevel, 5)
    assert.equal(family.stages[2].minLevel, 15)
  }
})

test('every selectable companion ships its configured growth and reaction art', () => {
  const requiredReactions = ['thinking', 'working', 'waiting', 'eating', 'done', 'failed', 'doze']
  for (const family of appearance.PET_FAMILIES) {
    for (const reaction of requiredReactions) {
      assert.match(family.map?.[reaction] || '', /\.png$/, `${family.id} is missing ${reaction} art`)
    }
    const files = new Set([
      family.preview,
      ...family.stages.map((stage) => stage.file),
      ...family.stages.map((stage) => stage.idleFile),
      ...Object.values(family.map || {}),
    ])
    for (const file of files) {
      const asset = fileURLToPath(new URL(`../src/renderer/pets/${family.set}/${file}`, import.meta.url))
      assert.ok(existsSync(asset), `missing configured ${family.id} asset: ${file}`)
      if (family.id !== appearance.DEFAULT_PET_FAMILY_ID) {
        const png = readFileSync(asset)
        assert.equal(png.readUInt32BE(16), 512, `${family.id}/${file} must use a 512px canvas`)
        assert.equal(png.readUInt32BE(20), 512, `${family.id}/${file} must use a 512px canvas`)
        assert.equal(png[25], 6, `${family.id}/${file} must preserve RGBA transparency`)
      }
    }
  }
})

test('all growth stages ship a single-play transparent APNG micro gesture', () => {
  for (const family of appearance.PET_FAMILIES) {
    for (const stage of family.stages) {
      const asset = fileURLToPath(new URL(`../src/renderer/pets/${family.set}/${stage.idleFile}`, import.meta.url))
      const png = readFileSync(asset)
      assert.equal(png.readUInt32BE(16), 512, `${family.id}/${stage.idleFile} must use a 512px canvas`)
      assert.equal(png.readUInt32BE(20), 512, `${family.id}/${stage.idleFile} must use a 512px canvas`)
      assert.equal(png[25], 6, `${family.id}/${stage.idleFile} must preserve RGBA transparency`)
      const animationControl = png.indexOf(Buffer.from('acTL'))
      assert.ok(animationControl > 0, `${family.id}/${stage.idleFile} must be an APNG`)
      assert.ok(png.readUInt32BE(animationControl + 4) > 1, `${family.id}/${stage.idleFile} must contain multiple frames`)
      assert.equal(png.readUInt32BE(animationControl + 8), 1, `${family.id}/${stage.idleFile} must play once`)
    }
  }
})

test('switching built-in companions preserves the shared growth journey', () => {
  const renderer = readFileSync(fileURLToPath(new URL('../src/renderer/renderer.js', import.meta.url)), 'utf8')
  const familySwitch = renderer.slice(
    renderer.indexOf("const familyButton = target.closest?.('[data-pet-family-id]')"),
    renderer.indexOf("const uploadButton = target.closest?.('#custom-style-upload')"),
  )
  assert.doesNotMatch(familySwitch, /resetGrowthFromCurrentTokens/)
  assert.match(familySwitch, /成长进度保留/)
})

test('pet family lookup falls back to the default family for stale saved ids', () => {
  assert.equal(typeof appearance.petFamilyById, 'function')
  assert.equal(appearance.petFamilyById('pocket-glider').id, 'pocket-glider')
  assert.equal(appearance.petFamilyById('removed-family').id, appearance.DEFAULT_PET_FAMILY_ID)
  assert.equal(appearance.petFamilyById('').id, appearance.DEFAULT_PET_FAMILY_ID)
})

test('each companion family has species-specific evolution names', () => {
  assert.equal(new Set(appearance.PET_FAMILIES.map((family) => family.stages[1].label)).size, appearance.PET_FAMILIES.length)
  assert.equal(new Set(appearance.PET_FAMILIES.map((family) => family.stages[2].label)).size, appearance.PET_FAMILIES.length)
})

test('the three adjacent nature companions keep visibly distinct wardrobe palettes', () => {
  const palettes = Object.fromEntries(
    appearance.PET_FAMILIES.map(family => [family.id, family.palette]),
  )
  assert.deepEqual(palettes['cottonpod-hermit'], ['#fff3d9', '#ffc8b2'])
  assert.deepEqual(palettes['ferncurl-pangolin'], ['#21ae74', '#f2d83f'])
  assert.deepEqual(palettes['rainpouch-newt'], ['#85b9ff', '#ffc0cf'])
  assert.equal(
    new Set([
      ...palettes['cottonpod-hermit'],
      ...palettes['ferncurl-pangolin'],
      ...palettes['rainpouch-newt'],
    ]).size,
    6,
  )
})

test('the three redesigned companions reserve happiness for positive states', () => {
  for (const id of ['cottonpod-hermit', 'ferncurl-pangolin', 'rainpouch-newt']) {
    const family = appearance.petFamilyById(id)
    assert.equal(family.map.thinking, 'working.png')
    assert.equal(family.map.working, 'working.png')
    assert.equal(family.map.waiting, 'waiting.png')
    assert.equal(family.map.looking, 'waiting.png')
    assert.equal(family.map.done, 'done.png')
    assert.equal(family.map.eating, 'done.png')
    assert.equal(family.map.failed, 'failed.png')
    assert.equal(family.map.doze, 'doze.png')
  }
})

test('the default keyboard mouse keeps static growth art plus stage-specific idle and reaction animation', () => {
  const family = appearance.petFamilyById(appearance.DEFAULT_PET_FAMILY_ID)
  assert.equal(family.id, 'aetherling')
  assert.equal(family.frameAnimation, true)
  assert.deepEqual(family.stages.map(stage => stage.file), ['egg.png', 'young.png', 'winged.png'])
  assert.deepEqual(
    family.stages.map(stage => stage.idleFile),
    ['egg-idle-animated.png', 'young-idle-animated.png', 'winged-idle-animated.png'],
  )
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
  for (const file of ['thinking-animated.png', 'working-animated.png', 'doze-animated.png']) {
    const asset = fileURLToPath(new URL(`../src/renderer/pets/${family.set}/${file}`, import.meta.url))
    const png = readFileSync(asset)
    const animationControl = png.indexOf(Buffer.from('acTL'))
    assert.ok(animationControl > 0, `${file} must remain an APNG`)
    assert.equal(png.readUInt32BE(animationControl + 8), 1, `${file} must play once and then settle`)
  }
})
