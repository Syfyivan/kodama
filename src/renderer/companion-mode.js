export const COMPANION_MOMENTS = Object.freeze([
  Object.freeze({ text: '任务卡收好啦，我活动一下～', motion: 'Hop' }),
  Object.freeze({ text: '', motion: 'Look' }),
  Object.freeze({ text: '', motion: 'Blink' }),
  Object.freeze({ text: '我在这里，随时叫我。', motion: 'Wave' }),
  Object.freeze({ text: '', motion: 'Stretch' }),
  Object.freeze({ text: '', motion: 'Sway' }),
  Object.freeze({ text: '要不要休息一下眼睛？', motion: 'Doze' }),
  Object.freeze({ text: '', motion: 'Nod' }),
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
  return Math.round(14_000 + sample * 18_000)
}
