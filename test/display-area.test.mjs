import assert from 'node:assert/strict'
import test from 'node:test'

import {
  areasToWindowRects,
  clampFloatingHeight,
  pickDisplayArea,
} from '../src/renderer/display-area.js'

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

// Real topology captured from a mixed-DPI setup: external 1920x1055 work area
// above-left of a scaled Retina main display, overlay origin (-104, -1055).
// Chromium lays the overlay out at CSS 2103x2167 although the combined DIP
// bounds are only 1920x1978, so areas must be scaled by ~1.0955 or the pet
// (CSS x~2046) falls outside every area and bubbles get stranded.
test('scales DIP work areas into the overlay CSS pixel space', () => {
  const origin = { x: -104, y: -1055 }
  const windowSize = { width: 1920, height: 1978 }
  const viewport = { width: 2103, height: 2167 }
  const areas = [
    { x: 0, y: 38, width: 1512, height: 885 }, // main display (below)
    { x: -104, y: -1055, width: 1920, height: 1055 }, // external (above)
  ]
  const rects = areasToWindowRects(areas, origin, windowSize, viewport)
  assert.equal(rects.length, 2)
  const external = rects[1]
  // The external display must reach the overlay's right edge in CSS px, not
  // stop at the unscaled 1920.
  assert.ok(external.right > 2000, `external.right ${external.right} should approach the CSS viewport width`)
  assert.equal(external.left, 0)
  assert.equal(external.top, 0)
  // And the pet near the bottom-right corner (CSS coords) is contained.
  const picked = pickDisplayArea(rects, { x: 2086, y: 1040 }, null)
  assert.equal(picked, external)
})

test('maps areas 1:1 when window size matches the viewport', () => {
  const rects = areasToWindowRects(
    [{ x: 100, y: 50, width: 800, height: 600 }],
    { x: 100, y: 50 },
    { width: 800, height: 600 },
    { width: 800, height: 600 },
  )
  assert.deepEqual(rects, [{ left: 0, top: 0, right: 800, bottom: 600 }])
})

test('returns no rects for a missing origin or empty viewport', () => {
  const areas = [{ x: 0, y: 0, width: 800, height: 600 }]
  assert.deepEqual(areasToWindowRects(areas, null, { width: 800, height: 600 }, { width: 800, height: 600 }), [])
  assert.deepEqual(areasToWindowRects(areas, { x: 0, y: 0 }, { width: 800, height: 600 }, { width: 0, height: 600 }), [])
})

test('positions a long floating stack using its capped visible height', () => {
  // A long bubble may contain many cards (1400px of scrollable content), but
  // only the rendered 300px surface participates in placement beside the pet.
  assert.equal(clampFloatingHeight(1400, 869, 300), 300)
})

test('keeps the display work area as the fallback floating-height limit', () => {
  assert.equal(clampFloatingHeight(1400, 240), 240)
  assert.equal(clampFloatingHeight(180, 869, 300), 180)
})
