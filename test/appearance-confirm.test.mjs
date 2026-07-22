import assert from 'node:assert/strict'
import test from 'node:test'

import { anchoredConfirmRect } from '../src/renderer/appearance-confirm.js'

test('anchors adoption confirmation near the wardrobe instead of the screen bottom', () => {
  const rect = anchoredConfirmRect({
    panelRect: { left: 9, top: 9, width: 380, height: 1159 },
    viewport: { width: 2048, height: 1197 },
    cardHeight: 176,
  })

  assert.ok(rect.left >= 12)
  assert.ok(rect.left + rect.width <= 2036)
  assert.ok(rect.top >= 12)
  assert.ok(rect.top < 260, `confirmation should stay near the wardrobe top, got ${rect.top}`)
  assert.ok(rect.top + 176 <= 1185)
})

test('keeps the entire confirmation card reachable on a short screen', () => {
  const rect = anchoredConfirmRect({
    panelRect: { left: 8, top: 8, width: 340, height: 624 },
    viewport: { width: 360, height: 640 },
    cardHeight: 196,
  })

  assert.ok(rect.left >= 12)
  assert.ok(rect.left + rect.width <= 348)
  assert.ok(rect.top >= 12)
  assert.ok(rect.top + 196 <= 628)
})
