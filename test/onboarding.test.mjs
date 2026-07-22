import assert from 'node:assert/strict'
import { test } from 'node:test'

const module = await import('../src/renderer/onboarding.js').catch(() => ({}))
const welcomeCopyForGrowth = module.welcomeCopyForGrowth

test('a brand-new pet introduces itself as an egg that grows from token use', () => {
  assert.equal(typeof welcomeCopyForGrowth, 'function')
  assert.match(welcomeCopyForGrowth({ level: 1, totalFed: 0 }), /蛋/)
  assert.match(welcomeCopyForGrowth({ level: 1, totalFed: 0 }), /token/i)
})

test('a returning pet welcomes the user with its current level', () => {
  assert.equal(typeof welcomeCopyForGrowth, 'function')
  assert.match(welcomeCopyForGrowth({ level: 8, totalFed: 42 }), /Lv\.8/)
})
