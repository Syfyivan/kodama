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
//   map: { idle, looking, working, replying, waiting, done, failed, tap },
//   stages: [{ file, minLevel }]  // optional level-based evolution
// }
// When `stages` is set, the growth level picks the sprite (e.g. a slime that
// changes color as it levels up) and that sprite is shown for every status —
// evolution is conveyed by the stage art, not per-status animations.
const ANIMATION_STATES = new Set(['idle', 'looking', 'working', 'replying', 'waiting', 'done', 'failed', 'tap'])
const TRANSIENT = new Set(['done', 'failed', 'waiting', 'tap'])

// CSS owns the motion vocabulary. Keep renderer input constrained to that
// vocabulary so an unexpected backend status cannot strand the pet in a static
// data-state with no matching animation.
export function animationStateFor(state) {
  const normalized = typeof state === 'string' ? state.trim().toLowerCase() : ''
  return ANIMATION_STATES.has(normalized) ? normalized : 'idle'
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

export function resolvePetImageSource(base, file, customSource = '') {
  return String(customSource || '').trim() || `${base}${file}`
}

export function initGifBackend(cfg = {}) {
  let base = `./pets/${cfg.set || 'default'}/`
  let map = cfg.map || {}
  let stages = Array.isArray(cfg.stages) ? cfg.stages : []
  let currentLevel = 1
  let stageFile = stages.length ? pickStageFile(stages, 1) : ''
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

  // Stage art (if any) overrides per-status files: the evolved sprite is always shown.
  const fileFor = (state) => stageFile || map[state] || map.idle || 'idle.gif'

  // Compare the resolved file (not the state) so a stage swap re-renders even when
  // the status is unchanged.
  function restartCssAnimation() {
    // Repeated taps/completions should still feel responsive even when the
    // sprite file and data-state are unchanged. This layout read happens only
    // for a repeated transient reaction, never in the animation frame loop.
    img.style.animation = 'none'
    void img.offsetWidth
    img.style.removeProperty('animation')
  }

  function render(state, { restart = false } = {}) {
    const animationState = animationStateFor(state)
    const file = fileFor(animationState)
    const source = resolvePetImageSource(base, file, customSource)
    const sameState = img.getAttribute('data-state') === animationState
    if (img.getAttribute('data-source') === source) {
      img.setAttribute('data-state', animationState)
      if (restart && sameState) restartCssAnimation()
      return
    }
    img.setAttribute('data-file', file)
    img.setAttribute('data-source', source)
    img.src = source
    img.setAttribute('data-state', animationState)
    if (restart && sameState) restartCssAnimation()
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
    // logical motion from reactions / tap ('Idle' | 'Tap')
    playMotion(pref) {
      if (/tap|touch/i.test(pref)) show('tap', true)
    },
    // status from reactions (working/done/failed/waiting/looking/replying/idle)
    setStatus(status) {
      if (status) {
        const animationState = animationStateFor(status)
        show(animationState, TRANSIENT.has(animationState))
      }
    },
    // growth level → evolution stage (no-op when `stages` isn't configured)
    setLevel(level) {
      currentLevel = Math.max(1, Number(level) || 1)
      if (!stages.length) return
      const next = pickStageFile(stages, currentLevel)
      if (next && next !== stageFile) {
        stageFile = next
        render(img.getAttribute('data-state') || ongoing)
      }
    },
    setPetPack(pack = {}) {
      base = `./pets/${pack.set || 'default'}/`
      map = pack.map || {}
      stages = Array.isArray(pack.stages) ? pack.stages : []
      stageFile = stages.length ? pickStageFile(stages, currentLevel) : ''
      render(img.getAttribute('data-state') || ongoing)
    },
    setCustomSource(source) {
      const next = String(source || '').trim()
      if (next === customSource) return
      customSource = next
      img.setAttribute('data-custom-style', customSource ? 'true' : 'false')
      render(img.getAttribute('data-state') || ongoing)
    },
  }
}
