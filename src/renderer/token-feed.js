export function tokenTotalWhenReady(stats) {
  if (!stats || stats.ready !== true) return null
  const value = stats.total
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null
  const total = Number(value)
  return Number.isFinite(total) && total >= 0 ? total : null
}

export function createTokenRefresher({ read, onStats, onTotal, retryMs = 10000 }) {
  let pending = null
  let retryTimer = null

  function refresh() {
    if (pending) return pending
    clearTimeout(retryTimer)
    retryTimer = null
    pending = Promise.resolve().then(async () => {
      const stats = await read()
      if (!stats) return
      onStats(stats)
      const total = tokenTotalWhenReady(stats)
      if (total === null) retryTimer = setTimeout(refresh, retryMs)
      else onTotal(total)
    }).catch(() => {
      // The Electron main process may be temporarily unavailable.
    }).finally(() => { pending = null })
    return pending
  }

  return refresh
}
