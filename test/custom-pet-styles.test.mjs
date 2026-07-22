import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const imported = await import('../src/main/custom-pet-styles.js').catch(() => ({}))
const createCustomPetStyleStore = imported.createCustomPetStyleStore || imported.default?.createCustomPetStyleStore

test('imports an image into Kodama storage and activates it', () => {
  assert.equal(typeof createCustomPetStyleStore, 'function', 'custom style store factory should exist')
  const root = mkdtempSync(join(tmpdir(), 'kodama-custom-style-'))
  try {
    const source = join(root, 'My Spirit.GIF')
    writeFileSync(source, Buffer.from('GIF89a'))
    const store = createCustomPetStyleStore({
      directory: join(root, 'styles'),
      idFactory: () => 'style-1',
      now: () => new Date('2026-07-11T12:00:00.000Z'),
    })

    const result = store.importFile(source)

    assert.equal(result.ok, true)
    assert.equal(result.style.id, 'style-1')
    assert.equal(result.style.label, 'My Spirit')
    assert.match(result.style.url, /^file:/)
    assert.equal(result.activeId, 'style-1')
    assert.equal(existsSync(join(root, 'styles', 'style-1.gif')), true)
    assert.deepEqual(store.getSnapshot(), {
      activeId: 'style-1',
      styles: [result.style],
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects executable or oversized custom pet assets', () => {
  assert.equal(typeof createCustomPetStyleStore, 'function', 'custom style store factory should exist')
  const root = mkdtempSync(join(tmpdir(), 'kodama-custom-style-'))
  try {
    const svg = join(root, 'unsafe.svg')
    const huge = join(root, 'huge.png')
    writeFileSync(svg, '<svg><script>alert(1)</script></svg>')
    writeFileSync(huge, Buffer.alloc(9))
    const store = createCustomPetStyleStore({ directory: join(root, 'styles'), maxFileBytes: 8 })

    assert.deepEqual(store.importFile(svg), { ok: false, error: 'unsupported-format' })
    assert.deepEqual(store.importFile(huge), { ok: false, error: 'file-too-large', maxFileBytes: 8 })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('can return to the built-in pet and delete a custom style', () => {
  assert.equal(typeof createCustomPetStyleStore, 'function', 'custom style store factory should exist')
  const root = mkdtempSync(join(tmpdir(), 'kodama-custom-style-'))
  try {
    const source = join(root, 'pet.png')
    writeFileSync(source, Buffer.from('png'))
    const store = createCustomPetStyleStore({ directory: join(root, 'styles'), idFactory: () => 'style-2' })
    store.importFile(source)

    assert.deepEqual(store.activate(''), { ok: true, activeId: '' })
    assert.deepEqual(store.remove('style-2'), { ok: true, activeId: '' })
    assert.deepEqual(store.getSnapshot(), { activeId: '', styles: [] })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
