import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  createKnowledgeHub,
  githubHotQuery,
  githubRepository,
  larkDocResults,
  xStatusUrl,
} = require('../src/main/knowledge-hub.js')

function fixture(options = {}) {
  let tick = 0
  const directory = mkdtempSync(join(tmpdir(), 'kodama-knowledge-'))
  const file = join(directory, 'knowledge.json')
  const hub = createKnowledgeHub({
    file,
    makeId: () => `kb_${tick + 1}`,
    now: () => `2026-07-30T08:00:0${tick++}.000Z`,
    ...options,
  })
  return { file, hub }
}

test('ByteTech search uses bytedcli structured results and saves one deduplicated article', async () => {
  const calls = []
  const { file, hub } = fixture({
    runJson: async (command, args) => {
      calls.push({ command, args })
      return {
        data: {
          sources: [{
            source: 'bytetech.info',
            items: [{
              title: 'AI Agent 实践指北',
              url: 'https://bytetech.info/articles/1',
              author: '作者',
              snippet: '摘要',
            }],
          }],
        },
      }
    },
  })
  const found = await hub.search('bytetech', 'AI Agent')
  assert.equal(found.ok, true)
  assert.deepEqual(calls[0].args.slice(0, 4), ['--json', 'insearch', 'query', 'AI Agent'])
  assert.equal((hub.saveSearchResult(found.results[0].key)).created, true)
  assert.equal((hub.saveSearchResult(found.results[0].key)).created, false)
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items.length, 1)
})

test('Lark document search strips highlight markup and always uses user identity', async () => {
  const calls = []
  const { hub } = fixture({
    runJson: async (_command, args) => {
      calls.push(args)
      return {
        data: {
          results: [{
            title_highlighted: '<h>AI</h> &amp; Agent',
            summary_highlighted: '一个 <h>Agent</h> 文档 &amp; 索引',
            result_meta: {
              url: 'https://bytedance.larkoffice.com/docx/demo',
              owner_name: '宋一凡',
              doc_types: 'DOCX',
            },
          }],
        },
      }
    },
  })
  const found = await hub.search('lark', 'AI Agent')
  assert.equal(found.results[0].title, 'AI & Agent')
  assert.equal(found.results[0].snippet, '一个 Agent 文档 & 索引')
  assert.deepEqual(calls[0].slice(0, 5), ['docs', '+search', '--as', 'user', '--query'])
  assert.equal(larkDocResults({ data: { results: [] } }).length, 0)
})

test('GitHub hot search uses a seven-day created window', async () => {
  const calls = []
  const { hub } = fixture({
    now: () => '2026-07-30T08:00:00.000Z',
    runJson: async (_command, args) => {
      calls.push(args)
      return {
        items: [{
          full_name: 'openai/example',
          html_url: 'https://github.com/openai/example',
          description: 'Example',
          stargazers_count: 120,
          language: 'TypeScript',
          owner: { login: 'openai' },
        }],
      }
    },
  })
  const found = await hub.search('github', '')
  assert.equal(found.query, 'created:>=2026-07-23')
  assert.equal(calls[0].includes('q=created:>=2026-07-23'), true)
  assert.equal(found.results[0].meta.includes('★ 120'), true)
  assert.equal(githubHotQuery('2026-07-30T08:00:00.000Z'), 'created:>=2026-07-23')
})

test('clipboard capture reads public X oEmbed content without browser cookies', async () => {
  const { hub } = fixture({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        author_name: 'OpenAI',
        html: '<blockquote><p>Hello &amp; welcome</p></blockquote>',
      }),
    }),
  })
  const result = await hub.captureClipboard('https://x.com/openai/status/12345')
  assert.equal(result.item.source, 'x')
  assert.equal(result.item.author, 'OpenAI')
  assert.equal(result.item.content, 'Hello & welcome')
  assert.equal(xStatusUrl('https://x.com/openai/status/12345').includes('/status/12345'), true)
  assert.equal(xStatusUrl('https://x.com/home'), '')
})

test('plain clipboard text becomes an idea and GitHub URLs are recognized safely', async () => {
  const { hub } = fixture()
  const result = await hub.captureClipboard('做一个工作台，把消息和想法收拢在一起')
  assert.equal(result.item.source, 'idea')
  assert.equal(hub.getState().ideaCount, 1)
  assert.deepEqual(githubRepository('https://github.com/openai/codex/issues/1'), {
    owner: 'openai',
    repository: 'codex',
  })
  assert.equal(githubRepository('https://example.com/openai/codex'), null)
})
