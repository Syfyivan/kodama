export const COMPANION_MOMENTS = Object.freeze([
  Object.freeze({ text: '我在这里，随时叫我。', motion: '' }),
  Object.freeze({ text: '', motion: 'Doze' }),
  Object.freeze({ text: '要不要休息一下眼睛？', motion: '' }),
  Object.freeze({ text: '我先安静待着，有需要再叫我。', motion: '' }),
])

export function isActiveCompanionMode(settings = {}) {
  return settings.taskBubblesVisible === false && settings.dndMode !== true
}

export function companionMomentAt(index = 0) {
  const normalized = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0
  return COMPANION_MOMENTS[normalized % COMPANION_MOMENTS.length]
}

export function companionDelayMs(random = Math.random) {
  const sample = Math.min(1, Math.max(0, Number(random()) || 0))
  return Math.round(300_000 + sample * 300_000)
}

export function companionInitialDelayMs(random = Math.random) {
  const sample = Math.min(1, Math.max(0, Number(random()) || 0))
  return Math.round(120_000 + sample * 120_000)
}
