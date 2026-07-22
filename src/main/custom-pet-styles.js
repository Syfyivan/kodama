const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const SUPPORTED_EXTENSIONS = new Set(['.png', '.gif', '.webp', '.jpg', '.jpeg'])
const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024

function cleanLabel(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) || '我的桌宠'
}

function createCustomPetStyleStore(options = {}) {
  const directory = path.resolve(String(options.directory || ''))
  const manifestFile = path.join(directory, 'manifest.json')
  const maxFileBytes = Math.max(1, Number(options.maxFileBytes) || DEFAULT_MAX_FILE_BYTES)
  const idFactory = options.idFactory || (() => crypto.randomUUID())
  const now = options.now || (() => new Date())
  fs.mkdirSync(directory, { recursive: true })

  function loadManifest() {
    try {
      const value = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
      return {
        activeId: String(value?.activeId || ''),
        styles: Array.isArray(value?.styles) ? value.styles.filter(item => item?.id && item?.fileName) : [],
      }
    } catch {
      return { activeId: '', styles: [] }
    }
  }

  let manifest = loadManifest()

  function saveManifest() {
    const tmp = `${manifestFile}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2))
    fs.renameSync(tmp, manifestFile)
  }

  function publicStyle(style) {
    return {
      id: style.id,
      label: style.label,
      format: style.format,
      createdAt: style.createdAt,
      url: pathToFileURL(path.join(directory, style.fileName)).href,
    }
  }

  function getSnapshot() {
    const styles = manifest.styles.filter(style => fs.existsSync(path.join(directory, style.fileName)))
    const activeId = styles.some(style => style.id === manifest.activeId) ? manifest.activeId : ''
    return { activeId, styles: styles.map(publicStyle) }
  }

  function importFile(sourcePath) {
    const source = path.resolve(String(sourcePath || ''))
    const extension = path.extname(source).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.has(extension)) return { ok: false, error: 'unsupported-format' }
    let stat
    try {
      stat = fs.statSync(source)
    } catch {
      return { ok: false, error: 'file-not-found' }
    }
    if (!stat.isFile()) return { ok: false, error: 'file-not-found' }
    if (stat.size > maxFileBytes) return { ok: false, error: 'file-too-large', maxFileBytes }

    let id = String(idFactory()).replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || crypto.randomUUID()
    while (manifest.styles.some(style => style.id === id)) id = crypto.randomUUID()
    const fileName = `${id}${extension}`
    const storedPath = path.join(directory, fileName)
    fs.copyFileSync(source, storedPath)
    const style = {
      id,
      label: cleanLabel(path.basename(source, path.extname(source))),
      format: extension.slice(1),
      fileName,
      createdAt: now().toISOString(),
    }
    manifest.styles.push(style)
    manifest.activeId = id
    saveManifest()
    return { ok: true, style: publicStyle(style), activeId: id }
  }

  function activate(id) {
    const activeId = String(id || '')
    if (activeId && !manifest.styles.some(style => style.id === activeId)) {
      return { ok: false, error: 'style-not-found' }
    }
    manifest.activeId = activeId
    saveManifest()
    return { ok: true, activeId }
  }

  function remove(id) {
    const styleId = String(id || '')
    const index = manifest.styles.findIndex(style => style.id === styleId)
    if (index < 0) return { ok: false, error: 'style-not-found' }
    const [style] = manifest.styles.splice(index, 1)
    try { fs.unlinkSync(path.join(directory, style.fileName)) } catch { /* already gone */ }
    if (manifest.activeId === styleId) manifest.activeId = ''
    saveManifest()
    return { ok: true, activeId: manifest.activeId }
  }

  return { activate, getSnapshot, importFile, remove }
}

module.exports = {
  DEFAULT_MAX_FILE_BYTES,
  SUPPORTED_EXTENSIONS,
  cleanLabel,
  createCustomPetStyleStore,
}
