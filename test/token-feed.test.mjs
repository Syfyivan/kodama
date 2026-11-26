import assert from 'node:assert/strict'
import { test } from 'node:test'

const module = await import('../src/renderer/token-feed.js').catch(() => ({}))
const tokenTotalWhenReady = module.tokenTotalWhenReady
const createTokenRefresher = module.createTokenRefresher

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

test('missing totals do not start a growth baseline at zero', () => {
  for (const total of [null, undefined, '', '  ', false, []]) {
    assert.equal(tokenTotalWhenReady({ ready: true, total }), null)
  }
  assert.equal(tokenTotalWhenReady({ ready: true, total: 0 }), 0)
  assert.equal(tokenTotalWhenReady({ ready: true, total: '42' }), 42)
})

test('overlapping refreshes share a read and leave at most one retry pending', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const first = Promise.withResolvers()
  const totals = []
  let reads = 0
  const refresh = createTokenRefresher({
    read: () => ++reads === 1 ? first.promise : { ready: reads > 2, total: 25 },
    onStats() {},
    onTotal: value => totals.push(value),
  })

  const pending = refresh()
  assert.equal(refresh(), pending)
  first.resolve({ ready: false })
  await pending
  assert.equal(reads, 1)

  t.mock.timers.tick(5000)
  await refresh()
  t.mock.timers.tick(5000)
  await Promise.resolve()
  assert.equal(reads, 2, 'manual refresh replaced the original retry')

  t.mock.timers.tick(5000)
  await refresh()
  assert.equal(reads, 3)
  assert.deepEqual(totals, [25])
})
