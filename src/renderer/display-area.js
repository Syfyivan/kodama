// Pure rect math for choosing which display's work area a point belongs to.
// The pet overlay window spans the combined work area of every display, so
// floating elements (bubble, panel) must follow the pet onto the display it
// actually sits on — window.screen only describes a single display.

function isFiniteRect(area) {
  return Boolean(area)
    && Number.isFinite(area.left)
    && Number.isFinite(area.top)
    && Number.isFinite(area.right)
    && Number.isFinite(area.bottom)
}

// Distance from a point to a rect (0 when inside). Inverted or zero-size
// rects are normalized first so a degenerate area still gets a sane distance.
function distanceToRect(point, area) {
  const left = Math.min(area.left, area.right)
  const right = Math.max(area.left, area.right)
  const top = Math.min(area.top, area.bottom)
  const bottom = Math.max(area.top, area.bottom)
  const dx = Math.max(left - point.x, 0, point.x - right)
  const dy = Math.max(top - point.y, 0, point.y - bottom)
  return Math.hypot(dx, dy)
}

function containsPoint(area, point) {
  // Zero-area rects can't host a floating element, so only positive-area
  // rects count as "containing" the point.
  if (area.right - area.left <= 0 || area.bottom - area.top <= 0) return false
  return point.x >= area.left && point.x <= area.right
    && point.y >= area.top && point.y <= area.bottom
}

// Pick the display work area for a point (the pet's anchor): the area that
// contains it, else the nearest one (the pet can hang between monitors), else
// the fallback when no usable area data exists yet.
export function pickDisplayArea(areas, point, fallbackArea) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return fallbackArea ?? null
  }
  const list = (Array.isArray(areas) ? areas : []).filter(isFiniteRect)
  if (!list.length) return fallbackArea ?? null
  const containing = list.find(area => containsPoint(area, point))
  if (containing) return containing
  let nearest = list[0]
  let nearestDistance = distanceToRect(point, nearest)
  for (const area of list.slice(1)) {
    const distance = distanceToRect(point, area)
    if (distance < nearestDistance) {
      nearest = area
      nearestDistance = distance
    }
  }
  return nearest
}
