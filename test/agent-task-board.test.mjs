import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  createAgentTaskBoard,
  sessionKeyForEvent,
} = require('../src/main/agent-task-board.js')

function fixture() {
  let sequence = 0
  const directory = mkdtempSync(join(tmpdir(), 'kodama-agent-task-board-'))
  const file = join(directory, 'tasks.json')
  const board = createAgentTaskBoard({
    file,
    makeId: () => `task_${++sequence}`,
    now: () => `2026-07-31T08:0${sequence}:00.000Z`,
    persistDelayMs: 0,
  })
  return { board, file }
}

test('agent task board turns one session event stream into live progress', () => {
  const { board } = fixture()
  const started = board.record({
    type: 'task_started',
    source: 'local',
    sessionId: 'session-a',
    sessionTitle: '优化 Kodama 工作台',
    cwd: '/repo/kodama',
    text: '开始处理',
  })
  const progress = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-a',
    cwd: '/repo/kodama',
    text: '正在修改工作台界面',
  })

  assert.equal(started.event.taskProgress.percent, 5)
  assert.equal(progress.event.taskProgress.status, 'running')
  assert.ok(progress.event.taskProgress.percent >= 50)
  assert.equal(progress.state.tasks.length, 1)
  assert.equal(progress.state.tasks[0].sessions.length, 1)
  assert.equal(progress.state.tasks[0].currentStep, '正在修改工作台界面')
})

test('a meaningful session title replaces the initial cwd fallback', () => {
  const { board } = fixture()
  board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-title',
    cwd: '/Users/demo/code',
    text: '正在读取',
  })
  board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-title',
    sessionTitle: '升级桌宠任务工作台',
    cwd: '/Users/demo/code',
    text: '正在实现',
  })

  assert.equal(board.getState().tasks[0].title, '升级桌宠任务工作台')
})

test('Feishu bridge system prompts use a readable task title', () => {
  const { board } = fixture()
  board.record({
    type: 'task_started',
    source: 'lark',
    sessionId: 'lark-session',
    larkBridge: true,
    prompt: '你是通过飞书机器人被调用的 Codex。请用中文简洁回答。',
    text: '开始处理',
  })

  assert.equal(board.getState().tasks[0].title, '飞书消息处理')
})

test('multiple sessions can be manually grouped under one task', () => {
  const { board } = fixture()
  const first = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-a',
    sessionTitle: '实现任务模型',
    text: '正在写代码',
  })
  const second = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-b',
    sessionTitle: '补充任务界面',
    text: '正在改界面',
  })
  const taskId = first.event.taskProgress.taskId

  const grouped = board.assignSession({
    sessionKey: second.event.taskProgress.sessionKey,
    taskId,
  })

  assert.equal(grouped.ok, true)
  assert.equal(grouped.state.tasks.length, 1)
  assert.deepEqual(
    grouped.state.tasks[0].sessions.map(session => session.key).sort(),
    ['local:session:session-a', 'local:session:session-b'],
  )
  assert.equal(grouped.state.tasks[0].sessionCount, 2)

  board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-b',
    sessionTitle: '补充任务界面（新标题）',
    text: '继续调整界面',
  })
  assert.equal(board.getState().tasks[0].title, '实现任务模型')
})

test('user task progress stays independent from its sessions', () => {
  const { board } = fixture()
  const first = board.record({
    type: 'task_done',
    source: 'local',
    sessionId: 'session-a',
    sessionTitle: '今日发布',
    text: '代码已完成',
  })
  const second = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-b',
    sessionTitle: '验证安装包',
    text: '正在跑测试',
  })
  board.assignSession({
    sessionKey: second.event.taskProgress.sessionKey,
    taskId: first.event.taskProgress.taskId,
  })

  const task = board.getState().tasks[0]
  assert.equal(task.status, 'running')
  assert.equal(task.doneSessions, 1)
  assert.equal(task.runningSessions, 1)
  assert.equal(task.progress, 0)

  const updated = board.setTaskProgress({
    taskId: task.id,
    progress: 45,
  })
  assert.equal(updated.ok, true)
  assert.equal(updated.state.tasks[0].progress, 45)

  board.record({
    type: 'task_done',
    source: 'local',
    sessionId: 'session-b',
    sessionTitle: '验证安装包',
    text: '验证完成',
  })
  const sessionsDone = board.getState().tasks[0]
  assert.equal(sessionsDone.doneSessions, 2)
  assert.equal(sessionsDone.progress, 45)
  assert.equal(sessionsDone.status, 'running')

  const completed = board.setTaskProgress({
    taskId: task.id,
    progress: 100,
  })
  assert.equal(completed.state.tasks[0].progress, 100)
  assert.equal(completed.state.tasks[0].status, 'done')
})

test('a completed session restarting resets its live progress', () => {
  const { board } = fixture()
  board.record({
    type: 'task_done',
    source: 'local',
    sessionId: 'session-reused',
    text: '上一轮完成',
  })
  const restarted = board.record({
    type: 'task_started',
    source: 'local',
    sessionId: 'session-reused',
    sessionTitle: '继续完善任务',
    text: '开始新一轮',
  })

  assert.equal(restarted.event.taskProgress.status, 'running')
  assert.equal(restarted.event.taskProgress.percent, 5)
})

test('a terminal event without text exposes a completed current step', () => {
  const { board } = fixture()
  const completed = board.record({
    type: 'task_done',
    source: 'local',
    sessionId: 'session-complete',
  })

  assert.equal(completed.event.taskProgress.currentStep, '已完成')
  assert.equal(completed.state.tasks[0].sessions[0].steps.at(-1).text, '已完成')
})

test('non-terminal sessions can never display as 100 percent complete', () => {
  const { board } = fixture()
  const result = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-explicit-100',
    percent: 100,
    text: '仍在收尾',
  })

  assert.equal(result.event.taskProgress.status, 'running')
  assert.equal(result.event.taskProgress.percent, 92)
})

test('a new named group can be created while moving a session', () => {
  const { board } = fixture()
  const recorded = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-a',
    text: '正在整理需求',
  })

  const result = board.assignSession({
    sessionKey: recorded.event.taskProgress.sessionKey,
    title: '桌宠工作台升级',
  })

  assert.equal(result.ok, true)
  assert.equal(result.state.tasks.length, 1)
  assert.equal(result.state.tasks[0].title, '桌宠工作台升级')
})

test('an empty custom group remains available as a drop target', () => {
  const { board } = fixture()
  const result = board.createGroup({ title: '商业化需求' })
  const task = result.state.tasks.find(item => item.id === result.taskId)

  assert.equal(result.ok, true)
  assert.equal(task.customGroup, true)
  assert.equal(task.status, 'idle')
  assert.equal(task.sessionCount, 0)
})

test('sessions can leave a group and deleting a group returns sessions to loose tasks', () => {
  const { board } = fixture()
  const group = board.createGroup({ title: '机器人桥接器' })
  const sessions = ['session-a', 'session-b'].map(sessionId => board.record({
    type: 'task_progress',
    source: 'local',
    sessionId,
    sessionTitle: `会话 ${sessionId}`,
    text: '正在实现',
  }))
  for (const recorded of sessions) {
    board.assignSession({
      sessionKey: recorded.event.taskProgress.sessionKey,
      taskId: group.taskId,
    })
  }

  const detached = board.detachSession({
    sessionKey: sessions[1].event.taskProgress.sessionKey,
  })
  assert.equal(detached.ok, true)
  assert.equal(detached.state.tasks.find(task => task.id === group.taskId).sessionCount, 1)

  const deleted = board.deleteGroup({ taskId: group.taskId })
  assert.equal(deleted.ok, true)
  assert.equal(deleted.state.tasks.some(task => task.id === group.taskId), false)
  assert.equal(deleted.state.tasks.filter(task => task.customGroup !== true).length, 2)
  assert.deepEqual(
    deleted.state.tasks.flatMap(task => task.sessions.map(session => session.id)).sort(),
    ['session-a', 'session-b'],
  )
})

test('sessions can be hidden from compact task surfaces without losing progress', () => {
  const { board } = fixture()
  const recorded = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-hide',
    text: '正在验证',
  })
  const hidden = board.setSessionIgnored({
    sessionKey: recorded.event.taskProgress.sessionKey,
    ignored: true,
  })

  assert.equal(hidden.ok, true)
  assert.equal(hidden.state.tasks[0].sessions[0].ignored, true)
  assert.equal(hidden.state.tasks[0].sessions[0].progress, 75)

  const shown = board.setSessionIgnored({
    sessionKey: recorded.event.taskProgress.sessionKey,
    ignored: false,
  })
  assert.equal(shown.state.tasks[0].sessions[0].ignored, false)
})

test('custom groups persist a bounded todo checklist', () => {
  const { board } = fixture()
  const group = board.createGroup({ title: '商业化需求' })
  const first = board.addTodo({ taskId: group.taskId, text: '确认上线范围' })
  const firstTodo = first.state.tasks.find(task => task.id === group.taskId).todos[0]
  board.addTodo({ taskId: group.taskId, text: '补充回归用例' })

  const completed = board.updateTodo({
    taskId: group.taskId,
    todoId: firstTodo.id,
    done: true,
  })
  let task = completed.state.tasks.find(item => item.id === group.taskId)
  assert.equal(task.todoCount, 2)
  assert.equal(task.openTodoCount, 1)
  assert.equal(task.todos.find(todo => todo.id === firstTodo.id).done, true)

  const removed = board.deleteTodo({
    taskId: group.taskId,
    todoId: task.todos.find(todo => todo.id !== firstTodo.id).id,
  })
  task = removed.state.tasks.find(item => item.id === group.taskId)
  assert.equal(task.todoCount, 1)
  assert.equal(task.openTodoCount, 0)
})

test('subagent sessions inherit the parent session task', () => {
  const { board } = fixture()
  const parent = board.record({
    type: 'task_started',
    source: 'local',
    sessionId: 'parent-session',
    sessionTitle: '完成发布',
    text: '开始',
  })
  const child = board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'parent-session',
    agentTranscriptPath: '/tmp/agent-child.jsonl',
    agent: '测试 Agent',
    text: '正在验证',
  })

  assert.equal(child.event.taskProgress.taskId, parent.event.taskProgress.taskId)
  assert.equal(child.state.tasks[0].sessions.length, 2)
})

test('an unkeyed completion attaches only when one matching session is active', () => {
  const { board } = fixture()
  board.record({
    type: 'task_started',
    source: 'local',
    sessionId: 'session-only',
    cwd: '/repo/kodama',
    text: '开始',
  })
  const completed = board.record({
    type: 'task_done',
    source: 'local',
    cwd: '/repo/kodama',
    text: '完成',
  })

  assert.equal(completed.ok, true)
  assert.equal(completed.state.tasks.length, 1)
  assert.equal(completed.state.tasks[0].status, 'done')
})

test('an ambiguous unkeyed completion is not invented as a separate task', () => {
  const { board } = fixture()
  for (const sessionId of ['session-a', 'session-b']) {
    board.record({
      type: 'task_started',
      source: 'local',
      sessionId,
      cwd: '/repo/shared',
      text: '开始',
    })
  }
  const completed = board.record({
    type: 'task_done',
    source: 'local',
    cwd: '/repo/shared',
    text: '完成',
  })

  assert.equal(completed.ok, false)
  assert.equal(completed.ignored, true)
  assert.equal(completed.state.tasks.length, 2)
})

test('task board persists bounded, redacted progress data', () => {
  const { board, file } = fixture()
  board.record({
    type: 'task_progress',
    source: 'local',
    sessionId: 'session-secret',
    text: 'curl --token sk-secret --password hunter2',
    url: 'https://example.com/result?access_token=private-token',
  })
  board.flush()

  const raw = readFileSync(file, 'utf8')
  assert.doesNotMatch(raw, /sk-secret|hunter2|private-token/)
  assert.match(raw, /•••/)
})

test('session keys distinguish parent and child sessions', () => {
  assert.equal(
    sessionKeyForEvent({ source: 'local', sessionId: 'abc' }),
    'local:session:abc',
  )
  assert.equal(
    sessionKeyForEvent({
      source: 'local',
      sessionId: 'abc',
      agentTranscriptPath: '/tmp/child.jsonl',
    }),
    'local:agent:/tmp/child.jsonl',
  )
})
