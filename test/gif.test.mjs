import assert from 'node:assert/strict'
import { test } from 'node:test'

// gif.js's module top-level only defines constants/functions (no `document`), so
// importing it in node is safe as long as we don't call initGifBackend.
const {
  animationStateFor,
  initGifBackend,
  motionStateFor,
  pickStageFile,
  pickStateFile,
  resolvePetImageSource,
} = await import('../src/renderer/backends/gif.js')

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

test('status art overrides the growth pose while idle keeps the current stage', () => {
  const map = {
    working: 'working.png',
    done: 'done.png',
  }
  assert.equal(pickStateFile(map, 'young.png', 'idle'), 'young.png')
  assert.equal(pickStateFile(map, 'young.png', 'working'), 'working.png')
  assert.equal(pickStateFile(map, 'young.png', 'done'), 'done.png')
  assert.equal(pickStateFile(map, 'young.png', 'looking'), 'young.png')
  assert.equal(pickStateFile({ idle: 'idle.png' }, '', 'idle'), 'idle.png')
})

test('animation states preserve known reactions and safely fall back to idle', () => {
  for (const state of [
    'idle', 'thinking', 'working', 'looking', 'replying', 'waiting', 'eating', 'done', 'failed', 'tap',
    'blink', 'hop', 'stretch', 'sway', 'wave', 'doze', 'nod', 'micro',
  ]) {
    assert.equal(animationStateFor(state), state)
  }
  assert.equal(animationStateFor('unknown-status'), 'idle')
  assert.equal(animationStateFor(null), 'idle')
})

test('a resting companion plays the selected growth stage APNG and returns to its baseline', async () => {
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
    body: { appendChild() {}, dataset: {} },
  }
  try {
    const backend = initGifBackend({
      set: 'aetherling',
      stages: [
        { file: 'egg.png', idleFile: 'egg-idle-animated.png', minLevel: 1 },
        { file: 'young.png', idleFile: 'young-idle-animated.png', minLevel: 5 },
      ],
    })
    backend.setLevel(8)
    assert.equal(img.src, './pets/aetherling/young.png')
    assert.equal(backend.playIdleMotion(), true)
    assert.equal(img.src, './pets/aetherling/young-idle-animated.png')
    assert.equal(img.getAttribute('data-state'), 'micro')
    assert.equal(img.getAttribute('data-frame-animation'), 'true')
    assert.equal(backend.getOngoingState(), 'idle')

    await new Promise(resolve => setTimeout(resolve, 2700))
    assert.equal(img.src, './pets/aetherling/young.png')
    assert.equal(img.getAttribute('data-state'), 'idle')
  } finally {
    globalThis.document = previousDocument
  }
})

test('stage micro gestures are optional so custom and legacy packs can fall back safely', () => {
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
    body: { appendChild() {}, dataset: {} },
  }
  try {
    const backend = initGifBackend({
      set: 'custom',
      stages: [{ file: 'young.png', minLevel: 1 }],
    })
    assert.equal(backend.playIdleMotion(), false)
    assert.equal(img.src, './pets/custom/young.png')
  } finally {
    globalThis.document = previousDocument
  }
})

test('companion motion names map to distinct transient sprite actions', () => {
  assert.equal(motionStateFor('Think'), 'thinking')
  assert.equal(motionStateFor('Eat'), 'eating')
  assert.equal(motionStateFor('Snack'), 'eating')
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
    const backend = initGifBackend({
      set: 'aetherling',
      stages: [{ file: 'egg.png', minLevel: 1 }],
      map: { waiting: 'waiting-animated.png' },
      frameAnimation: true,
    })
    assert.equal(img.style.objectFit, 'contain', 'non-square custom images must keep their aspect ratio')
    assert.equal(img.src, './pets/aetherling/egg.png')
    assert.equal(img.getAttribute('data-frame-animation'), 'false', 'static growth art keeps CSS micro gestures available')
    backend.setStatus('waiting')
    assert.equal(img.src, './pets/aetherling/waiting-animated.png')
    assert.equal(img.getAttribute('data-frame-animation'), 'true', 'APNG reaction art must not receive a second whole-image animation')
    backend.setCustomSource('file:///Users/me/Kodama/custom.gif')
    assert.equal(img.src, 'file:///Users/me/Kodama/custom.gif')
    assert.equal(img.getAttribute('data-frame-animation'), 'false')
    backend.setCustomSource('')
    assert.equal(img.src, './pets/aetherling/waiting-animated.png')
    assert.equal(img.getAttribute('data-frame-animation'), 'true')
    backend.setStatus('idle')
    assert.equal(img.src, './pets/aetherling/egg.png')
    assert.equal(img.getAttribute('data-frame-animation'), 'false')
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

test('a configured reaction swaps the live sprite and idle restores its growth pose', () => {
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
      stages: [{ file: 'young.png', minLevel: 1 }],
      map: { working: 'working.png' },
    })
    assert.equal(img.src, './pets/aetherling/young.png')
    backend.setStatus('working')
    assert.equal(img.src, './pets/aetherling/working.png')
    assert.equal(img.getAttribute('data-state'), 'working')
    backend.setStatus('idle')
    assert.equal(img.src, './pets/aetherling/young.png')
    assert.equal(img.getAttribute('data-state'), 'idle')
  } finally {
    globalThis.document = previousDocument
  }
})

test('terminal reactions return to idle art instead of resuming stale working art', async () => {
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
      stages: [{ file: 'young-animated.png', minLevel: 1 }],
      map: { working: 'working-animated.png', done: 'done-animated.png' },
    })
    backend.setStatus('working')
    backend.setStatus('done')
    assert.equal(img.src, './pets/aetherling/done-animated.png')
    await new Promise(resolve => setTimeout(resolve, 2700))
    assert.equal(img.src, './pets/aetherling/young-animated.png')
    assert.equal(img.getAttribute('data-state'), 'idle')
  } finally {
    globalThis.document = previousDocument
  }
})
