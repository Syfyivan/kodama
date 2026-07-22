export function tokenTotalWhenReady(stats) {
  if (!stats || stats.ready !== true) return null
  const total = Number(stats.total)
  return Number.isFinite(total) && total >= 0 ? total : null
}
