import { ACCESSORIES } from './config/accessories.js'

const ACCESSORY_MARKUP = {
  round_glasses: '<span class="lens lens-left"></span><span class="bridge"></span><span class="lens lens-right"></span>',
  agent_badge: '<span>AI</span>',
}

let byId = new Map(ACCESSORIES.map((a) => [a.id, a]))

let layer = null
let growthLayer = null
let getBounds = () => null
let equipped = {}
let renderedKey = ''
let appearance = { skinId: 'forest', stageId: 'egg' }
let scheduledFrame = 0
let trackingFrame = 0
let continuousTracking = false
let lastTrackingAt = 0

function ensureLayer() {
  if (layer) return layer
  layer = document.getElementById('accessory-layer')
  if (!layer) {
    layer = document.createElement('div')
    layer.id = 'accessory-layer'
    document.body.appendChild(layer)
  }
  return layer
}

function ensureGrowthLayer() {
  if (growthLayer) return growthLayer
  growthLayer = document.getElementById('pet-growth-layer')
  if (!growthLayer) {
    growthLayer = document.createElement('div')
    growthLayer.id = 'pet-growth-layer'
    growthLayer.setAttribute('aria-hidden', 'true')
    growthLayer.innerHTML = [
      '<span class="spirit-aura"></span>',
      '<span class="spirit-wing spirit-wing-left"></span>',
      '<span class="spirit-wing spirit-wing-right"></span>',
      '<span class="spirit-shell"></span>',
      '<span class="spirit-spark spirit-spark-one"></span>',
      '<span class="spirit-spark spirit-spark-two"></span>',
      '<span class="spirit-spark spirit-spark-three"></span>',
    ].join('')
    document.body.appendChild(growthLayer)
  }
  return growthLayer
}

function equippedIds() {
  return Object.values(equipped).filter(Boolean)
}

function render() {
  const ids = equippedIds()
  const key = ids.join('|')
  if (key === renderedKey) return
  renderedKey = key

  const root = ensureLayer()
  root.textContent = ''
  for (const id of ids) {
    const acc = byId.get(id)
    if (!acc) continue
    const el = document.createElement('div')
    el.className = `accessory accessory-${acc.id}`
    el.dataset.accessoryId = acc.id
    el.setAttribute('aria-hidden', 'true')
    // emoji 配饰:直接画字形(免素材);其余走内置 CSS markup。
    if (acc.icon) {
      el.classList.add('accessory-emoji')
      el.textContent = acc.icon
    } else {
      el.innerHTML = ACCESSORY_MARKUP[acc.id] || ''
    }
    root.appendChild(el)
  }
}

function position() {
  const root = ensureLayer()
  const growth = ensureGrowthLayer()
  const bounds = getBounds?.()
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    root.classList.add('accessory-layer-hidden')
    growth.classList.add('pet-growth-layer-hidden')
    return
  }
  root.classList.remove('accessory-layer-hidden')
  growth.classList.remove('pet-growth-layer-hidden')
  growth.style.left = `${bounds.x}px`
  growth.style.top = `${bounds.y}px`
  growth.style.width = `${bounds.width}px`
  growth.style.height = `${bounds.height}px`

  for (const el of root.children) {
    const acc = byId.get(el.dataset.accessoryId)
    if (!acc) continue
    const a = acc.anchor
    const width = bounds.width * a.width
    const height = width * (a.aspect || 1)
    el.style.left = `${bounds.x + bounds.width * a.x}px`
    el.style.top = `${bounds.y + bounds.height * a.y}px`
    el.style.width = `${width}px`
    el.style.height = `${height}px`
    // emoji 字形按盒子大小缩放(取较小边,避免溢出)。
    if (acc.icon) el.style.fontSize = `${Math.min(width, height)}px`
  }
}

function schedulePosition() {
  if (scheduledFrame) return
  scheduledFrame = requestAnimationFrame(() => {
    scheduledFrame = 0
    position()
  })
}

function trackMovingModel(now) {
  if (!continuousTracking) {
    trackingFrame = 0
    return
  }
  if (now - lastTrackingAt >= 80) {
    lastTrackingAt = now
    position()
  }
  trackingFrame = requestAnimationFrame(trackMovingModel)
}

export function initAccessoryLayer(boundsGetter, options = {}) {
  getBounds = boundsGetter || getBounds
  continuousTracking = options.continuousTracking === true
  if (Array.isArray(options.accessories) && options.accessories.length) {
    byId = new Map(options.accessories.map((a) => [a.id, a]))
  }
  ensureLayer()
  ensureGrowthLayer()
  schedulePosition()
  if (continuousTracking && !trackingFrame) trackingFrame = requestAnimationFrame(trackMovingModel)
  return {
    refresh: schedulePosition,
    setEquipped(nextEquipped = {}) {
      equipped = { ...nextEquipped }
      render()
      schedulePosition()
    },
    setAppearance(nextAppearance = {}) {
      appearance = { ...appearance, ...nextAppearance }
      const stageId = appearance.stageId || 'egg'
      const skinId = appearance.skinId || 'forest'
      const root = ensureGrowthLayer()
      root.dataset.stage = stageId
      root.dataset.skin = skinId
      document.body.dataset.petStage = stageId
      document.body.dataset.petSkin = skinId
      schedulePosition()
    },
    dispose() {
      continuousTracking = false
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame)
      if (trackingFrame) cancelAnimationFrame(trackingFrame)
      scheduledFrame = 0
      trackingFrame = 0
    },
  }
}
