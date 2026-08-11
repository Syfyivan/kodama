export const UI_SETTINGS_VERSION = 7
export const PET_SCALE_MIN = 0.12
export const PET_SCALE_MAX = 0.75
export const PERFORMANCE_MODES = Object.freeze(['balanced', 'realtime', 'saver'])
const COMPACT_PET_UI_SETTINGS_VERSION = 3
const SHARED_BUBBLE_OPACITY_UI_SETTINGS_VERSION = 4
const WIDE_PET_UI_SETTINGS_VERSION = 5
const PREVIOUS_UI_SETTINGS_VERSION = 6
const PREVIOUS_PET_SCALE_MIN = 0.4
const WIDE_SCALE_MIN = 0.2
const WIDE_SCALE_MAX = 1.25

export function clampPetScale(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, n))
}

export function normalizePerformanceMode(value) {
  return PERFORMANCE_MODES.includes(value) ? value : 'balanced'
}

function remapWidePetScale(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return value
  const oldValue = Math.min(WIDE_SCALE_MAX, Math.max(WIDE_SCALE_MIN, n))
  const ratio = (oldValue - WIDE_SCALE_MIN) / (WIDE_SCALE_MAX - WIDE_SCALE_MIN)
  return Math.round((PET_SCALE_MIN + ratio * (PET_SCALE_MAX - PET_SCALE_MIN)) * 1000) / 1000
}

// Preserve the user's relative slider choice while the range narrows from
// 20%–125% to 12%–75%. People parked at the older version-3 floor still map to
// the new floor. Version 4's duplicate task-bubble opacity remains discarded:
// task bubbles follow petOpacity exactly.
export function uiSettingsSourceForVersion(raw = {}) {
  if (!raw || typeof raw !== 'object') return {}
  if (raw.version === UI_SETTINGS_VERSION) return raw
  if (raw.version === PREVIOUS_UI_SETTINGS_VERSION) {
    return {
      ...raw,
      version: UI_SETTINGS_VERSION,
      performanceMode: normalizePerformanceMode(raw.performanceMode),
    }
  }
  if (raw.version === WIDE_PET_UI_SETTINGS_VERSION) {
    return {
      ...raw,
      version: UI_SETTINGS_VERSION,
      petScale: remapWidePetScale(raw.petScale),
      performanceMode: 'balanced',
    }
  }
  if (raw.version === SHARED_BUBBLE_OPACITY_UI_SETTINGS_VERSION) {
    const { taskBubbleOpacity: _discardedTaskBubbleOpacity, ...settings } = raw
    return {
      ...settings,
      version: UI_SETTINGS_VERSION,
      petScale: remapWidePetScale(raw.petScale),
      performanceMode: 'balanced',
    }
  }
  if (raw.version !== COMPACT_PET_UI_SETTINGS_VERSION) return {}
  const petScale = Number(raw.petScale)
  const { taskBubbleOpacity: _discardedTaskBubbleOpacity, ...settings } = raw
  return {
    ...settings,
    version: UI_SETTINGS_VERSION,
    performanceMode: 'balanced',
    petScale: remapWidePetScale(
      Number.isFinite(petScale) && petScale <= PREVIOUS_PET_SCALE_MIN
        ? WIDE_SCALE_MIN
        : raw.petScale,
    ),
  }
}
