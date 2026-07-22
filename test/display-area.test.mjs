import assert from 'node:assert/strict'
import test from 'node:test'

import { pickDisplayArea } from '../src/renderer/display-area.js'

// Two side-by-side 1920x1080 monitors in window coords (primary at origin).
const TWO_DISPLAYS = [
  { left: 0, top: 0, right: 1920, bottom: 1080 },
  { left: 1920, top: 0, right: 3840, bottom: 1080 },
]

test('picks the area that contains the pet anchor point', () => {
  const picked = pickDisplayArea(TWO_DISPLAYS, { x: 2600, y: 400 }, null)
  assert.equal(picked, TWO_DISPLAYS[1])
})

test('picks the nearest area when the point is outside every display', () => {
  // Above the second monitor (e.g. pet dragged past the top edge).
  const picked = pickDisplayArea(TWO_DISPLAYS, { x: 2600, y: -120 }, null)
  assert.equal(picked, TWO_DISPLAYS[1])
})

test('picks the closer of two monitors for a point between them', () => {
  // Displays 100px apart (gap can appear with mismatched work areas); a point
  // in the gap 30px from the left display must not snap to the right one.
  const gapped = [
    { left: 0, top: 0, right: 1920, bottom: 1080 },
    { left: 2020, top: 0, right: 3940, bottom: 1080 },
  ]
  const picked = pickDisplayArea(gapped, { x: 1950, y: 500 }, null)
  assert.equal(picked, gapped[0])
})

test('returns the fallback when no display areas are available', () => {
  const fallback = { left: 0, top: 0, right: 800, bottom: 600 }
  assert.equal(pickDisplayArea([], { x: 10, y: 10 }, fallback), fallback)
  assert.equal(pickDisplayArea(null, { x: 10, y: 10 }, fallback), fallback)
  assert.equal(pickDisplayArea(undefined, { x: 10, y: 10 }, fallback), fallback)
})

test('ignores zero-size areas for containment but keeps the result sane', () => {
  const areas = [
    { left: 500, top: 500, right: 500, bottom: 500 }, // degenerate point-rect
    { left: 0, top: 0, right: 1920, bottom: 1080 },
  ]
  // Point sits exactly on the degenerate rect: containment must go to the
  // real display, not the zero-size one.
  assert.equal(pickDisplayArea(areas, { x: 500, y: 500 }, null), areas[1])
})

test('skips non-finite areas and falls back when nothing usable remains', () => {
  const fallback = { left: 0, top: 0, right: 800, bottom: 600 }
  const broken = [
    null,
    { left: Number.NaN, top: 0, right: 100, bottom: 100 },
    { left: 0, top: 0 },
  ]
  assert.equal(pickDisplayArea(broken, { x: 10, y: 10 }, fallback), fallback)
})

test('returns the fallback for a non-finite point', () => {
  const fallback = { left: 0, top: 0, right: 800, bottom: 600 }
  assert.equal(pickDisplayArea(TWO_DISPLAYS, { x: Number.NaN, y: 10 }, fallback), fallback)
  assert.equal(pickDisplayArea(TWO_DISPLAYS, null, fallback), fallback)
})
