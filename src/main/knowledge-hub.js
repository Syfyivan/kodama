const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const { spawn } = require('child_process')

const KNOWLEDGE_SOURCES = Object.freeze(['bytetech', 'github', 'lark', 'x', 'idea', 'link'])

function compactText(value, max = 4000) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function stripHighlight(value) {
  return compactText(String(value || '').replace(/<\/?h>/gi, ''), 4000)
}

function stripHtml(value) {
  return compactText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' '),
    8000,
  )
}

function runJson(command, args, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill('SIGTERM') } catch { /* already exited */ }
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    timer.unref?.()
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `${command} exited ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout || '{}'))
      } catch (error) {
        reject(new Error(`invalid ${command} JSON: ${error.message}`))
      }
    })
  })
}

function readItems(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return Array.isArray(parsed?.items) ? parsed.items : []
  } catch {
    return []
  }
}

function writeItems(file, items) {
  const temp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify({ version: 1, items }, null, 2))
  fs.renameSync(temp, file)
}

function normalizedSource(value) {
  const source = String(value || '').trim().toLowerCase()
  return KNOWLEDGE_SOURCES.includes(source) ? source : 'link'
}

function normalizeItem(raw = {}) {
  const source = normalizedSource(raw.source)
  return {
    ...raw,
    id: compactText(raw.id, 120),
    source,
    kind: compactText(raw.kind || (source === 'idea' ? 'idea' : 'reference'), 40),
    title: compactText(raw.title, 400),
    url: compactText(raw.url, 1200),
    snippet: compactText(raw.snippet, 5000),
    content: compactText(raw.content, 12000),
    author: compactText(raw.author, 200),
    tags: Array.isArray(raw.tags) ? raw.tags.map(value => compactText(value, 80)).filter(Boolean).slice(0, 20) : [],
    summary: raw.summary && typeof raw.summary === 'object' ? raw.summary : null,
    agent: raw.agent && typeof raw.agent === 'object' ? raw.agent : {},
  }
}

function bytedTechResults(payload) {
  const sources = Array.isArray(payload?.data?.sources) ? payload.data.sources : []
  return sources.flatMap(source => Array.isArray(source?.items) ? source.items : [])
    .map(item => ({
      source: 'bytetech',
      kind: 'article',
      title: compactText(item?.title, 400),
      url: compactText(item?.url, 1200),
      snippet: compactText(item?.snippet, 5000),
      author: compactText(item?.author, 200),
      meta: item?.type ? String(item.type) : 'article',
    }))
    .filter(item => item.title || item.url)
}

function larkDocResults(payload) {
  const results = Array.isArray(payload?.data?.results) ? payload.data.results : []
  return results.map((item) => {
    const meta = item?.result_meta || {}
    return {
      source: 'lark',
      kind: 'document',
      title: stripHighlight(item?.title_highlighted || meta?.url),
      url: compactText(meta?.url, 1200),
      snippet: stripHighlight(item?.summary_highlighted),
      author: compactText(meta?.owner_name, 200),
      meta: compactText([
        meta?.doc_types,
        meta?.update_time_iso,
      ].filter(Boolean).join(' · '), 300),
    }
  }).filter(item => item.title || item.url)
}

function githubResults(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : []
  return items.map(item => ({
    source: 'github',
    kind: 'project',
    title: compactText(item?.full_name || item?.name, 400),
    url: compactText(item?.html_url, 1200),
    snippet: compactText(item?.description, 5000),
    author: compactText(item?.owner?.login, 200),
    meta: compactText([
      Number.isFinite(item?.stargazers_count) ? `★ ${item.stargazers_count}` : '',
      item?.language,
      item?.updated_at ? `更新 ${item.updated_at}` : '',
    ].filter(Boolean).join(' · '), 500),
  })).filter(item => item.title || item.url)
}

function githubHotQuery(nowValue) {
  const date = new Date(nowValue)
  date.setUTCDate(date.getUTCDate() - 7)
  return `created:>=${date.toISOString().slice(0, 10)}`
}

function firstUrl(value) {
  const match = compactText(value, 12000).match(/https?:\/\/[^\s<>"']+/i)
  if (!match) return ''
  return match[0].replace(/[),.;!?，。；！？]+$/, '')
}

function xStatusUrl(value) {
  try {
    const parsed = new URL(value)
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (!['x.com', 'twitter.com'].includes(hostname)) return ''
    if (!/^\/[^/]+\/status\/\d+/.test(parsed.pathname)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

function githubRepository(value) {
  try {
    const parsed = new URL(value)
    if (parsed.hostname.toLowerCase() !== 'github.com') return null
    const [owner, repository] = parsed.pathname.split('/').filter(Boolean)
    if (!owner || !repository || ['settings', 'features', 'topics', 'trending'].includes(owner.toLowerCase())) return null
    return { owner, repository: repository.replace(/\.git$/i, '') }
  } catch {
    return null
  }
}

async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': 'Kodama/knowledge-hub' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timer)
  }
}

function createKnowledgeHub(input = {}) {
  const file = input.file
  if (!file) throw new Error('knowledge hub file is required')
  const run = input.runJson || runJson
  const fetchImpl = input.fetchImpl || globalThis.fetch
  const now = input.now || (() => new Date().toISOString())
  const makeId = input.makeId || (() => `kb_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`)
  const bytedcliBin = input.bytedcliBin || 'bytedcli'
  const larkCliBin = input.larkCliBin || 'lark-cli'
  const ghBin = input.ghBin || 'gh'
  const searchCache = new Map()
  let items = readItems(file).map(normalizeItem).filter(item => item.id && item.title)

  function snapshot() {
    return {
      ok: true,
      items: items.map(item => structuredClone(item)),
      count: items.length,
      summarizedCount: items.filter(item => item.summary).length,
      ideaCount: items.filter(item => item.source === 'idea').length,
      updatedAt: now(),
    }
  }

  function persist() {
    writeItems(file, items)
    const state = snapshot()
    input.onUpdate?.(state)
    return state
  }

  function find(id) {
    return items.find(item => item.id === String(id || '').trim()) || null
  }

  function save(raw = {}) {
    const candidate = normalizeItem(raw)
    if (!candidate.title) return { ok: false, error: 'missing-title' }
    const sourceKey = compactText(raw.sourceKey || candidate.url, 1200)
    if (sourceKey) {
      const existing = items.find(item => item.sourceKey === sourceKey)
      if (existing) return { ok: true, created: false, item: structuredClone(existing) }
    }
    const createdAt = now()
    const item = normalizeItem({
      ...candidate,
      id: makeId(),
      sourceKey,
      createdAt,
      updatedAt: createdAt,
    })
    items.unshift(item)
    persist()
    return { ok: true, created: true, item: structuredClone(item) }
  }

  function patch(id, value = {}) {
    const item = find(id)
    if (!item) return { ok: false, error: 'knowledge-item-not-found' }
    if (value.summary !== undefined) item.summary = value.summary
    if (value.tags !== undefined) {
      item.tags = Array.isArray(value.tags)
        ? value.tags.map(tag => compactText(tag, 80)).filter(Boolean).slice(0, 20)
        : item.tags
    }
    if (value.agent && typeof value.agent === 'object') item.agent = { ...item.agent, ...value.agent }
    item.updatedAt = now()
    persist()
    return { ok: true, item: structuredClone(item) }
  }

  async function search(sourceValue, queryValue = '') {
    const source = normalizedSource(sourceValue)
    const query = compactText(queryValue, 240)
    let results
    let effectiveQuery = query
    if (source === 'bytetech') {
      effectiveQuery = query || 'AI Agent'
      results = bytedTechResults(await run(bytedcliBin, [
        '--json',
        'insearch',
        'query',
        effectiveQuery,
        '--source',
        'bytetech.info',
        '--count',
        '12',
      ], { timeoutMs: 30000 }))
    } else if (source === 'lark') {
      if (!query) return { ok: false, error: 'search-query-required' }
      results = larkDocResults(await run(larkCliBin, [
        'docs',
        '+search',
        '--as',
        'user',
        '--query',
        query,
        '--page-size',
        '12',
        '--format',
        'json',
      ], { timeoutMs: 30000 }))
    } else if (source === 'github') {
      effectiveQuery = query || githubHotQuery(now())
      results = githubResults(await run(ghBin, [
        'api',
        '--method',
        'GET',
        'search/repositories',
        '-f',
        `q=${effectiveQuery}`,
        '-f',
        'sort=stars',
        '-f',
        'order=desc',
        '-f',
        'per_page=12',
      ], { timeoutMs: 30000 }))
    } else {
      return { ok: false, error: 'unsupported-search-source' }
    }

    const cached = results.slice(0, 20).map((result) => {
      const key = `ks_${randomUUID()}`
      searchCache.set(key, result)
      return {
        ...structuredClone(result),
        key,
        saved: Boolean(result.url && items.some(item => item.sourceKey === result.url)),
      }
    })
    while (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value)
    return { ok: true, source, query: effectiveQuery, results: cached }
  }

  function saveSearchResult(key) {
    const result = searchCache.get(String(key || '').trim())
    if (!result) return { ok: false, error: 'search-result-expired' }
    return save(result)
  }

  function captureIdea(value) {
    const content = compactText(value, 12000)
    if (!content) return { ok: false, error: 'missing-idea' }
    const title = compactText(content.split('\n').find(Boolean) || content, 120)
    return save({
      source: 'idea',
      kind: 'idea',
      title,
      snippet: content,
      content,
      sourceKey: '',
    })
  }

  async function captureClipboard(value) {
    const text = compactText(value, 12000)
    if (!text) return { ok: false, error: 'clipboard-empty' }
    const url = firstUrl(text)
    if (!url) return captureIdea(text)

    const tweetUrl = xStatusUrl(url)
    if (tweetUrl) {
      let payload = {}
      try {
        payload = await fetchJson(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(tweetUrl)}`, {
          fetchImpl,
        })
      } catch {
        // The URL is still useful even when a public tweet cannot be embedded.
      }
      const content = stripHtml(payload?.html) || text
      return save({
        source: 'x',
        kind: 'tweet',
        title: compactText(payload?.author_name ? `${payload.author_name} 的推文` : content, 160) || 'X 推文',
        url: tweetUrl,
        author: compactText(payload?.author_name, 200),
        snippet: content,
        content,
      })
    }

    const repository = githubRepository(url)
    if (repository) {
      let payload = {}
      try {
        payload = await run(ghBin, ['api', `repos/${repository.owner}/${repository.repository}`], { timeoutMs: 20000 })
      } catch {
        // Keep the repository URL even when GitHub metadata is unavailable.
      }
      return save({
        source: 'github',
        kind: 'project',
        title: compactText(payload?.full_name || `${repository.owner}/${repository.repository}`, 400),
        url,
        author: compactText(payload?.owner?.login || repository.owner, 200),
        snippet: compactText(payload?.description || text, 5000),
      })
    }

    let source = 'link'
    if (/^https:\/\/bytetech\.info\//i.test(url)) source = 'bytetech'
    if (/^https:\/\/[^/]*(?:feishu|larkoffice|larksuite)\.(?:cn|com)\//i.test(url)) source = 'lark'
    return save({
      source,
      kind: source === 'lark' ? 'document' : source === 'bytetech' ? 'article' : 'link',
      title: compactText(text === url ? new URL(url).hostname : text, 180),
      url,
      snippet: text === url ? '' : text,
    })
  }

  return {
    captureClipboard,
    captureIdea,
    find: id => {
      const item = find(id)
      return item ? structuredClone(item) : null
    },
    getState: snapshot,
    patch,
    saveSearchResult,
    search,
  }
}

module.exports = {
  KNOWLEDGE_SOURCES,
  bytedTechResults,
  createKnowledgeHub,
  firstUrl,
  githubHotQuery,
  githubRepository,
  githubResults,
  larkDocResults,
  stripHighlight,
  xStatusUrl,
}
