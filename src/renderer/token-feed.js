export function tokenTotalWhenReady(stats) {
  if (!stats || stats.ready !== true) return null
  const value = stats.total
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null
  const total = Number(value)
  return Number.isFinite(total) && total >= 0 ? total : null
}
