import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  createLarkTaskArgs,
  createWorkItemStore,
  normalizeDueForCli,
} = require('../src/main/work-items.js')

function fixture(options = {}) {
  let tick = 0
  const directory = mkdtempSync(join(tmpdir(), 'kodama-work-items-'))
  const file = join(directory, 'items.json')
  const store = createWorkItemStore({
    file,
    makeId: () => `wi_${tick + 1}`,
    now: () => `2026-07-30T07:00:0${tick++}.000Z`,
    ...options,
  })
  return { file, store }
}

function verifiedUserPayload() {
  return {
    identity: 'user',
    verified: true,
    identities: {
      user: {
        status: 'ready',
        verified: true,
        openId: 'ou_current_user',
      },
    },
  }
}

test('work item store persists priority and deduplicates one extracted source item', () => {
  const { file, store } = fixture()
  const first = store.create({
    title: '同步灰度结果',
    kind: 'todo',
    priority: 'high',
    sourceKey: 'om_demo:todo:0',
    messageId: 'om_demo',
  })
  const second = store.create({
    title: '同步灰度结果',
    kind: 'todo',
    priority: 'low',
    sourceKey: 'om_demo:todo:0',
  })
  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(store.getState().items[0].priority, 'high')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).items.length, 1)
})

test('work item store creates a user-owned Lark task with local priority metadata', async () => {
  const calls = []
  const { store } = fixture({
    runJson: async (command, args) => {
      calls.push({ command, args })
      if (args[0] === 'auth') return verifiedUserPayload()
      return {
        ok: true,
        data: {
          task: {
            guid: 'task-guid-1',
            status: 'todo',
            url: 'https://applink.larkoffice.com/client/todo/detail?guid=task-guid-1',
          },
        },
      }
    },
  })
  const created = store.create({
    title: '同步灰度结果',
    description: '把灰度结论同步到群里',
    priority: 'critical',
    dueAt: '2026-07-31T15:00:00+08:00',
    sourceUrl: 'https://applink.feishu.cn/client/chat/open?openChatId=oc_demo',
  })
  const result = await store.createLarkTask(created.item.id)
  assert.equal(result.ok, true)
  assert.equal(result.item.lark.guid, 'task-guid-1')
  assert.deepEqual(calls[0].args, ['auth', 'status', '--json', '--verify'])
  const createCall = calls.find(call => call.args.includes('+create'))
  assert.deepEqual(createCall.args.slice(0, 4), ['task', '+create', '--as', 'user'])
  assert.equal(createCall.args[createCall.args.indexOf('--assignee') + 1], 'ou_current_user')
  assert.match(createCall.args[createCall.args.indexOf('--description') + 1], /Kodama 优先级：critical/)
  assert.equal(createCall.args[createCall.args.indexOf('--due') + 1], '2026-07-31T15:00:00+08:00')
})

test('work item Lark sync updates local completion in both directions', async () => {
  const calls = []
  let completed = true
  const { store } = fixture({
    runJson: async (_command, args) => {
      calls.push(args)
      if (args[0] === 'auth') return verifiedUserPayload()
      if (args.includes('+create')) {
        return { data: { task: { guid: 'task-guid-1', status: 'todo' } } }
      }
      if (args.includes('get')) {
        return { data: { task: { guid: 'task-guid-1', status: completed ? 'done' : 'todo', completed_at: completed ? '123' : '0' } } }
      }
      return { ok: true }
    },
  })
  const created = store.create({ title: '同步进度' })
  await store.createLarkTask(created.item.id)
  assert.equal((await store.syncLarkTask(created.item.id)).item.status, 'done')
  completed = false
  assert.equal((await store.syncLarkTask(created.item.id)).item.status, 'open')
  await store.setCompleted(created.item.id, true)
  assert.equal(calls.some(args => args.includes('+complete')), true)
})

test('work item Lark writes fail closed when the verified identity is not the user', async () => {
  const calls = []
  const { store } = fixture({
    runJson: async (_command, args) => {
      calls.push(args)
      return {
        identity: 'bot',
        verified: true,
        identities: {
          user: {
            status: 'missing',
            verified: false,
            openId: '',
          },
        },
      }
    },
  })
  const created = store.create({ title: '不应创建' })
  const result = await store.createLarkTask(created.item.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /verified Lark user identity/)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ['auth', 'status', '--json', '--verify'])
})

test('work item due parser only forwards unambiguous task CLI values', () => {
  assert.equal(normalizeDueForCli('2026-07-31T15:00:00+08:00'), '2026-07-31T15:00:00+08:00')
  assert.equal(normalizeDueForCli('+2d'), '+2d')
  assert.equal(normalizeDueForCli('明天下午'), '')
  const args = createLarkTaskArgs({
    id: 'wi_1',
    title: '任务',
    description: '',
    priority: 'medium',
    kind: 'todo',
    sourceUrl: '',
    dueAt: '',
  }, { assigneeOpenId: 'ou_current_user' })
  assert.match(args.join(' '), /task \+create --as user/)
  assert.equal(args[args.indexOf('--assignee') + 1], 'ou_current_user')
})
