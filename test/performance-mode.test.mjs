import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const { normalizePerformanceMode, performanceProfile } = require('../src/main/performance-mode.js')

test('balanced mode is the safe default and does not keep a browser-sized Feishu renderer alive', () => {
  assert.equal(normalizePerformanceMode(), 'balanced')
  assert.equal(normalizePerformanceMode('unknown'), 'balanced')
  assert.equal(performanceProfile('balanced').larkWebPush, false)
  assert.equal(performanceProfile('balanced').larkPollIntervalMs, 3 * 60 * 1000)
})

test('realtime and saver modes make their resource tradeoffs explicit', () => {
  assert.equal(performanceProfile('realtime').larkWebPush, true)
  assert.equal(performanceProfile('saver').larkWebPush, false)
  assert.equal(performanceProfile('saver').larkPollIntervalMs, 10 * 60 * 1000)
  assert.equal(performanceProfile('saver').decorativeMotion, false)
})

test('startup waits for the persisted mode instead of unconditionally starting Feishu web push', async () => {
  const main = await readFile(new URL('../src/main/index.js', import.meta.url), 'utf8')
  const startup = main.match(/app\.whenReady\(\)\.then\(\(\) => \{([\s\S]*?)\n\}\)/)?.[1] || ''
  assert.doesNotMatch(startup, /\bstartLarkWebPush\(\)/)
  assert.match(main, /applyPerformanceMode\(settings\.performanceMode\)/)
})

test('static pets do not run a permanent animation-frame positioning loop', async () => {
  const accessories = await readFile(new URL('../src/renderer/accessories.js', import.meta.url), 'utf8')
  assert.doesNotMatch(accessories, /function tick\(\)[\s\S]*requestAnimationFrame\(tick\)/)
  assert.match(accessories, /continuousTracking/)
  assert.match(accessories, /refresh:/)
})

test('the bundled mouse rests on static art while task reactions keep animated assets', async () => {
  const appearance = await readFile(new URL('../src/renderer/config/appearance.js', import.meta.url), 'utf8')
  assert.match(appearance, /\['egg\.png', 'young\.png', 'winged\.png'\]/)
  assert.match(appearance, /thinking: 'thinking-animated\.png'/)
  assert.match(appearance, /working: 'working-animated\.png'/)
})

test('decorative growth effects stop compositing while the pet is idle', async () => {
  const gif = await readFile(new URL('../src/renderer/backends/gif.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/renderer/style.css', import.meta.url), 'utf8')
  assert.match(gif, /document\.body\.dataset\.petAnimationState = animationState/)
  assert.match(css, /body\[data-pet-animation-state="idle"\] \.spirit-aura/)
  assert.match(css, /animation-play-state: paused !important/)
})
