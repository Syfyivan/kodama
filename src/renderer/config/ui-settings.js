export const UI_SETTINGS_VERSION = 4
export const PET_SCALE_MIN = 0.2
export const PET_SCALE_MAX = 1.25
const PREVIOUS_UI_SETTINGS_VERSION = 3
const PREVIOUS_PET_SCALE_MIN = 0.4

export function clampPetScale(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(PET_SCALE_MAX, Math.max(PET_SCALE_MIN, n))
}

// People who left the old slider at its floor were asking for "as small as
// possible". Carry that intent forward when the floor moves from 40% to 20%,
// while preserving every other version-3 preference and deliberate size.
export function uiSettingsSourceForVersion(raw = {}) {
  if (!raw || typeof raw !== 'object') return {}
  if (raw.version === UI_SETTINGS_VERSION) return raw
  if (raw.version !== PREVIOUS_UI_SETTINGS_VERSION) return {}
  const petScale = Number(raw.petScale)
  return {
    ...raw,
    version: UI_SETTINGS_VERSION,
    petScale: Number.isFinite(petScale) && petScale <= PREVIOUS_PET_SCALE_MIN
      ? PET_SCALE_MIN
      : raw.petScale,
  }
}
