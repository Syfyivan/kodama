import assert from 'node:assert/strict'
import { test } from 'node:test'

const module = await import('../src/renderer/token-feed.js').catch(() => ({}))
const tokenTotalWhenReady = module.tokenTotalWhenReady

test('does not establish a growth baseline from placeholder token stats', () => {
  assert.equal(typeof tokenTotalWhenReady, 'function')
  assert.equal(tokenTotalWhenReady({ ready: false, total: 0 }), null)
})

test('returns a finite total only after token history is ready', () => {
  assert.equal(typeof tokenTotalWhenReady, 'function')
  assert.equal(tokenTotalWhenReady({ ready: true, total: 6200000 }), 6200000)
  assert.equal(tokenTotalWhenReady({ ready: true, total: -1 }), null)
  assert.equal(tokenTotalWhenReady({ ready: true, total: 'bad' }), null)
})
