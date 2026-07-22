const DEFAULT_MIN_HITBOX_SIZE = 40

export function scaledHitboxSize({ width, height, scale, minSize = DEFAULT_MIN_HITBOX_SIZE }) {
  const safeWidth = Math.max(0, Number(width) || 0)
  const safeHeight = Math.max(0, Number(height) || 0)
  const safeScale = Math.max(0, Number(scale) || 0)
  const safeMinimum = Math.max(0, Number(minSize) || 0)

  return {
    width: Math.min(safeWidth, Math.max(safeMinimum, safeWidth * safeScale)),
    height: Math.min(safeHeight, Math.max(safeMinimum, safeHeight * safeScale)),
  }
}
