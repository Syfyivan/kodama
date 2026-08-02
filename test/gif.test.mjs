import assert from 'node:assert/strict'
import { test } from 'node:test'

// gif.js's module top-level only defines constants/functions (no `document`), so
// importing it in node is safe as long as we don't call initGifBackend.
const { animationStateFor, initGifBackend, motionStateFor, pickStageFile, resolvePetImageSource } = await import('../src/renderer/backends/gif.js')

const SLIME = [
  { file: 'green.png', minLevel: 1 },
  { file: 'blue.png', minLevel: 5 },
  { file: 'yellow.png', minLevel: 15 },
  { file: 'red.png', minLevel: 30 },
  { file: 'purple.png', minLevel: 60 },
]

test('picks the highest stage whose minLevel <= level', () => {
  assert.equal(pickStageFile(SLIME, 1), 'green.png')
  assert.equal(pickStageFile(SLIME, 4), 'green.png')
  assert.equal(pickStageFile(SLIME, 5), 'blue.png')
  assert.equal(pickStageFile(SLIME, 29), 'yellow.png')
  assert.equal(pickStageFile(SLIME, 60), 'purple.png')
  assert.equal(pickStageFile(SLIME, 582), 'purple.png') // high level → final form
})

test('below every threshold falls back to the lowest-minLevel stage', () => {
  const stages = [
    { file: 'b.png', minLevel: 10 },
    { file: 'a.png', minLevel: 5 },
  ]
  assert.equal(pickStageFile(stages, 1), 'a.png') // 1 < 5 → lowest, not array[0]
})

test('order-independent: unsorted stages still pick correctly', () => {
  const shuffled = [
    { file: 'purple.png', minLevel: 60 },
    { file: 'green.png', minLevel: 1 },
    { file: 'red.png', minLevel: 30 },
    { file: 'blue.png', minLevel: 5 },
    { file: 'yellow.png', minLevel: 15 },
  ]
  assert.equal(pickStageFile(shuffled, 20), 'yellow.png')
  assert.equal(pickStageFile(shuffled, 1000), 'purple.png')
})

test('skips entries without a file; empty list yields empty string', () => {
  assert.equal(pickStageFile([{ minLevel: 1 }, { file: 'x.png', minLevel: 2 }], 5), 'x.png')
  assert.equal(pickStageFile([], 5), '')
})

test('missing minLevel defaults to 1', () => {
  assert.equal(pickStageFile([{ file: 'only.png' }], 1), 'only.png')
})

test('animation states preserve known reactions and safely fall back to idle', () => {
  for (const state of [
    'idle', 'working', 'looking', 'replying', 'waiting', 'done', 'failed', 'tap',
    'blink', 'hop', 'stretch', 'sway', 'wave', 'doze', 'nod',
  ]) {
    assert.equal(animationStateFor(state), state)
  }
  assert.equal(animationStateFor('unknown-status'), 'idle')
  assert.equal(animationStateFor(null), 'idle')
})

test('companion motion names map to distinct transient sprite actions', () => {
  assert.equal(motionStateFor('Look'), 'looking')
  assert.equal(motionStateFor('Blink'), 'blink')
  assert.equal(motionStateFor('Hop'), 'hop')
  assert.equal(motionStateFor('Stretch'), 'stretch')
  assert.equal(motionStateFor('Sway'), 'sway')
  assert.equal(motionStateFor('Wave'), 'wave')
  assert.equal(motionStateFor('Doze'), 'doze')
  assert.equal(motionStateFor('Nod'), 'nod')
  assert.equal(motionStateFor('TapBody'), 'tap')
  assert.equal(motionStateFor('not-a-motion'), '')
})

test('custom pet image overrides built-in stage art without changing its stored file', () => {
  assert.equal(typeof resolvePetImageSource, 'function', 'custom image source resolver should exist')
  assert.equal(
    resolvePetImageSource('./pets/aetherling/', 'egg.png', 'file:///Users/me/Kodama/custom.gif'),
    'file:///Users/me/Kodama/custom.gif',
  )
  assert.equal(resolvePetImageSource('./pets/aetherling/', 'egg.png', ''), './pets/aetherling/egg.png')
})

test('switching a running GIF backend updates the image source immediately', () => {
  const attributes = new Map()
  const img = {
    style: { removeProperty() {} },
    addEventListener() {},
    getAttribute: (key) => attributes.get(key) || '',
    setAttribute: (key, value) => attributes.set(key, String(value)),
  }
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement: () => img,
    getElementById: () => null,
    body: { appendChild() {} },
  }
  try {
    const backend = initGifBackend({ set: 'aetherling', map: { idle: 'egg.png' } })
    assert.equal(img.style.objectFit, 'contain', 'non-square custom images must keep their aspect ratio')
    assert.equal(img.src, './pets/aetherling/egg.png')
    backend.setCustomSource('file:///Users/me/Kodama/custom.gif')
    assert.equal(img.src, 'file:///Users/me/Kodama/custom.gif')
    backend.setCustomSource('')
    assert.equal(img.src, './pets/aetherling/egg.png')
  } finally {
    globalThis.document = previousDocument
  }
})

test('switching built-in pet families preserves the current evolution level', () => {
  const attributes = new Map()
  const img = {
    style: { removeProperty() {} },
    addEventListener() {},
    getAttribute: (key) => attributes.get(key) || '',
    setAttribute: (key, value) => attributes.set(key, String(value)),
  }
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement: () => img,
    getElementById: () => null,
    body: { appendChild() {} },
  }
  try {
    const backend = initGifBackend({
      set: 'aetherling',
      stages: [
        { file: 'egg.png', minLevel: 1 },
        { file: 'young.png', minLevel: 5 },
      ],
    })
    backend.setLevel(8)
    assert.equal(img.src, './pets/aetherling/young.png')

    backend.setPetPack({
      set: 'moonbunny',
      stages: [
        { file: 'egg.png', minLevel: 1 },
        { file: 'young.png', minLevel: 5 },
      ],
    })
    assert.equal(img.src, './pets/moonbunny/young.png')
  } finally {
    globalThis.document = previousDocument
  }
})
