function finite(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

// The pet window spans the whole work area, while the wardrobe occupies only a
// narrow floating panel. Confirmation UI must therefore anchor to the wardrobe
// rect, not to the center of the full-screen transparent BrowserWindow.
export function anchoredConfirmRect({ panelRect = {}, viewport = {}, cardHeight = 176 } = {}) {
  const margin = 12
  const viewportWidth = Math.max(margin * 2, finite(viewport.width, 360))
  const viewportHeight = Math.max(margin * 2, finite(viewport.height, 640))
  const panelLeft = finite(panelRect.left, margin)
  const panelTop = finite(panelRect.top, margin)
  const panelWidth = Math.max(0, finite(panelRect.width, 340))
  const panelHeight = Math.max(0, finite(panelRect.height, 0))
  const height = Math.max(0, finite(cardHeight, 176))
  const availableWidth = viewportWidth - margin * 2
  const width = Math.min(300, Math.max(220, panelWidth - 28), availableWidth)
  const preferredLeft = panelLeft + (panelWidth - width) / 2
  const preferredTop = panelTop + Math.min(112, Math.max(32, panelHeight * 0.12))

  return {
    left: Math.round(clamp(preferredLeft, margin, viewportWidth - width - margin)),
    top: Math.round(clamp(preferredTop, margin, viewportHeight - height - margin)),
    width: Math.round(width),
  }
}
