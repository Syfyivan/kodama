const profile = (...motions) => Object.freeze(motions)

// A tiny species-specific fallback vocabulary for custom or legacy packs that
// do not provide stage APNGs. Built-in companions use their internal-frame
// gestures; the long random pause is shared by both paths.
export const IDLE_MOTION_PROFILES = Object.freeze({
  aetherling: profile('Nod', 'Blink'),
  'cottonpod-hermit': profile('Sway', 'Blink'),
  'ferncurl-pangolin': profile('Stretch', 'Nod'),
  'rainpouch-newt': profile('Nod', 'Sway'),
  'little-undo': profile('Wave', 'Blink'),
  'pocket-glider': profile('Blink', 'Sway'),
  'nuonuo-seal': profile('Nod', 'Stretch'),
  'upside-sprout': profile('Sway', 'Nod'),
})

const FALLBACK_PROFILE = IDLE_MOTION_PROFILES.aetherling
const RESTING_STATES = new Set(['idle', 'waiting'])

function boundedSample(random) {
  return Math.min(1, Math.max(0, Number(random()) || 0))
}

export function idleMotionAt(familyId, index = 0) {
  const motions = IDLE_MOTION_PROFILES[familyId] || FALLBACK_PROFILE
  const normalized = Number.isFinite(Number(index)) ? Math.max(0, Math.floor(Number(index))) : 0
  return motions[normalized % motions.length]
}

export function idleMotionInitialDelayMs(random = Math.random) {
  return Math.round(60_000 + boundedSample(random) * 60_000)
}

export function idleMotionDelayMs(random = Math.random) {
  return Math.round(180_000 + boundedSample(random) * 180_000)
}

export function canPlayIdleMotion({
  documentHidden = false,
  panelVisible = false,
  moveModeActive = false,
  dndMode = false,
  performanceMode = 'balanced',
  currentState = '',
  ongoingState = '',
} = {}) {
  return !documentHidden
    && !panelVisible
    && !moveModeActive
    && !dndMode
    && performanceMode !== 'saver'
    && RESTING_STATES.has(currentState)
    && RESTING_STATES.has(ongoingState)
}
