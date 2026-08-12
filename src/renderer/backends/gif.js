// GIF / sprite rendering backend — a single <img> whose source swaps by status
// (and, with `stages`, by growth level). Kodama's built-in families use this
// backend; config/render.local.js can still replace them with a private pack.
//
// Assets live in src/renderer/pets/<set>/. The bundled `slime` set is CC0 and
// shipped; any other set is gitignored, so your own (possibly copyrighted) GIFs
// stay local and never get committed or shipped.
//
// cfg: {
//   set,
//   map: { idle, thinking, looking, working, replying, waiting, eating, done, failed, tap },
//   stages: [{ file, idleFile, minLevel }]  // optional level-based evolution
// }
// When `stages` is set, the growth level picks the idle sprite. A configured
// per-status file can temporarily override it, then the backend returns to the
// current growth pose when that reaction ends.
const ANIMATION_STATES = new Set([
  'idle',
  'thinking',
  'looking',
  'working',
  'replying',
  'waiting',
  'eating',
  'done',
  'failed',
  'tap',
  'blink',
  'hop',
  'stretch',
  'sway',
  'wave',
  'doze',
  'nod',
  'micro',
])
const TRANSIENT = new Set(['done', 'failed', 'tap', 'eating'])
const TERMINAL_REACTIONS = new Set(['done', 'failed'])
const MOTION_ALIASES = Object.freeze({
  think: 'thinking',
  thinking: 'thinking',
  eat: 'eating',
  eating: 'eating',
  snack: 'eating',
  feed: 'eating',
  look: 'looking',
  looking: 'looking',
  tap: 'tap',
  touch: 'tap',
  blink: 'blink',
  hop: 'hop',
  jump: 'hop',
  stretch: 'stretch',
  sway: 'sway',
  wave: 'wave',
  doze: 'doze',
  sleep: 'doze',
  nod: 'nod',
})

// CSS owns the motion vocabulary. Keep renderer input constrained to that
// vocabulary so an unexpected backend status cannot strand the pet in a static
// data-state with no matching animation.
export function animationStateFor(state) {
  const normalized = typeof state === 'string' ? state.trim().toLowerCase() : ''
  return ANIMATION_STATES.has(normalized) ? normalized : 'idle'
}

export function motionStateFor(motion) {
  const normalized = typeof motion === 'string' ? motion.trim().toLowerCase() : ''
  if (MOTION_ALIASES[normalized]) return MOTION_ALIASES[normalized]
  if (/tap|touch/.test(normalized)) return 'tap'
  return ''
}

// Pick the stage whose minLevel is the highest one still <= level. Order-independent
// (doesn't assume `stages` is sorted), and falls back to the lowest-minLevel stage
// when level is below every threshold. Exported for unit testing.
export function pickStageFile(stages, level) {
  let chosen = ''
  let chosenMin = -Infinity
  let lowest = ''
  let lowestMin = Infinity
  for (const s of stages) {
    if (!s?.file) continue
    const min = Number(s.minLevel) || 1
    if (min < lowestMin) { lowestMin = min; lowest = s.file }
    if (level >= min && min > chosenMin) { chosenMin = min; chosen = s.file }
  }
  return chosen || lowest || ''
}

function idleFileForStage(stages, stageFile) {
  return stages.find(stage => stage?.file === stageFile)?.idleFile || ''
}

export function pickStateFile(map, stageFile, state) {
  if (state !== 'idle' && map?.[state]) return map[state]
  return stageFile || map?.[state] || map?.idle || 'idle.gif'
}

export function resolvePetImageSource(base, file, customSource = '') {
  return String(customSource || '').trim() || `${base}${file}`
}

export function initGifBackend(cfg = {}) {
  let base = `./pets/${cfg.set || 'default'}/`
  let map = cfg.map || {}
  let stages = Array.isArray(cfg.stages) ? cfg.stages : []
  let frameAnimation = cfg.frameAnimation === true
  let currentLevel = 1
  let stageFile = stages.length ? pickStageFile(stages, 1) : ''
  let stageIdleFile = idleFileForStage(stages, stageFile)
  let customSource = ''
  const img = document.createElement('img')
  img.id = 'pet-gif'
  img.draggable = false
  img.style.objectFit = 'contain'
  img.addEventListener('error', () => {
    const b = document.getElementById('bubble')
    if (b) {
      b.textContent = customSource
        ? '⚠️ 无法读取这个自定义形象'
        : `⚠️ 缺少 ${base}${img.getAttribute('data-file') || 'idle.gif'}`
      b.classList.remove('hidden')
    }
  })
  document.body.appendChild(img)

  let ongoing = 'idle' // the looping baseline state to revert to
  let revertTimer

  const syncFrameAnimationMode = (file = img.getAttribute('data-file') || '') => {
    // APNGs own their internal eye, ear, paw, leaf or prop movement. Suppress
    // whole-image CSS for any animated file, regardless of the family pack.
    const fileAnimatesInternally = /(?:^|[-_.])animated(?:[-_.]|$)/i.test(String(file || ''))
    img.setAttribute('data-frame-animation', String(!customSource && fileAnimatesInternally))
  }

  const fileFor = (state) => (
    state === 'micro' && stageIdleFile
      ? stageIdleFile
      : pickStateFile(map, stageFile, state)
  )

  // Compare the resolved file (not the state) so a stage swap re-renders even when
  // the status is unchanged.
  function restartAnimation(source) {
    if (frameAnimation && !customSource) {
      img.src = ''
      void img.offsetWidth
      img.src = source
      return
    }
    // Repeated taps/completions should still feel responsive even when the
    // sprite file and data-state are unchanged. This layout read happens only
    // for a repeated transient reaction, never in the animation frame loop.
    img.style.animation = 'none'
    void img.offsetWidth
    img.style.removeProperty('animation')
  }

  function render(state, { restart = false } = {}) {
    const animationState = animationStateFor(state)
    if (document.body?.dataset) document.body.dataset.petAnimationState = animationState
    const file = fileFor(animationState)
    syncFrameAnimationMode(file)
    const source = resolvePetImageSource(base, file, customSource)
    const sameState = img.getAttribute('data-state') === animationState
    if (img.getAttribute('data-source') === source) {
      img.setAttribute('data-state', animationState)
      if (restart && sameState) restartAnimation(source)
      return
    }
    img.setAttribute('data-file', file)
    img.setAttribute('data-source', source)
    img.src = source
    img.setAttribute('data-state', animationState)
    if (restart && sameState) restartAnimation(source)
  }

  function show(state, transient) {
    const animationState = animationStateFor(state)
    clearTimeout(revertTimer)
    render(animationState, { restart: transient })
    if (transient) {
      revertTimer = setTimeout(() => render(ongoing), 2600)
    } else {
      ongoing = animationState
    }
  }

  show('idle', false)

  return {
    el: img,
    getBounds() {
      const r = img.getBoundingClientRect()
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    },
    getState() {
      return img.getAttribute('data-state') || ongoing
    },
    getOngoingState() {
      return ongoing
    },
    // Load the current growth stage's short APNG only for this one gesture.
    // Returning false lets legacy/custom packs keep the CSS motion fallback.
    playIdleMotion() {
      if (!stageIdleFile || customSource) return false
      show('micro', true)
      return true
    },
    // Logical motions are transient overlays on the current task status. The
    // CSS backend supplies a richer vocabulary for static pet art, while an
    // unknown Live2D-style motion remains a safe no-op here.
    playMotion(pref) {
      const state = motionStateFor(pref)
      if (state) show(state, true)
    },
    // status from reactions (working/done/failed/waiting/looking/replying/idle)
    setStatus(status) {
      if (status) {
        const animationState = animationStateFor(status)
        if (TERMINAL_REACTIONS.has(animationState)) ongoing = 'idle'
        show(animationState, TRANSIENT.has(animationState))
      }
    },
    // growth level → evolution stage (no-op when `stages` isn't configured)
    setLevel(level) {
      currentLevel = Math.max(1, Number(level) || 1)
      if (!stages.length) return
      const next = pickStageFile(stages, currentLevel)
      stageIdleFile = idleFileForStage(stages, next)
      if (next && next !== stageFile) {
        stageFile = next
        render(img.getAttribute('data-state') || ongoing)
      }
    },
    setPetPack(pack = {}) {
      base = `./pets/${pack.set || 'default'}/`
      map = pack.map || {}
      stages = Array.isArray(pack.stages) ? pack.stages : []
      frameAnimation = pack.frameAnimation === true
      stageFile = stages.length ? pickStageFile(stages, currentLevel) : ''
      stageIdleFile = idleFileForStage(stages, stageFile)
      render(img.getAttribute('data-state') || ongoing)
    },
    setCustomSource(source) {
      const next = String(source || '').trim()
      if (next === customSource) return
      customSource = next
      img.setAttribute('data-custom-style', customSource ? 'true' : 'false')
      syncFrameAnimationMode()
      render(img.getAttribute('data-state') || ongoing)
    },
  }
}
