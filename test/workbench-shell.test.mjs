import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const [html, main, preload, renderer] = await Promise.all([
  readFile(new URL('../src/renderer/lark-workbench.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main/preload.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/renderer.js', import.meta.url), 'utf8'),
])

test('the workbench exposes every manager as a tab in one document', () => {
  const tabs = ['messages', 'tasks', 'work-items', 'bridge', 'agenda', 'knowledge', 'settings']
  for (const tab of tabs) {
    assert.match(html, new RegExp(`data-workbench-tab="${tab}"`))
    assert.match(html, new RegExp(`data-workbench-page="${tab}"`))
  }
  assert.match(html, /src="\.\/bridge-tasks\.js"/)
  assert.match(html, /src="\.\/manage\.js"/)
})

test('legacy Bridge and settings entry points reuse the unified workbench window', () => {
  assert.match(main, /function createBridgeTasksWindow\(\) \{\s*return createLarkWorkbenchWindow\(\{ tab: 'bridge' \}\)/)
  assert.match(main, /function openManageWindow\(\) \{\s*return createLarkWorkbenchWindow\(\{ tab: 'settings' \}\)/)
  assert.match(preload, /onWorkbenchNavigate/)
})

test('task edit buttons navigate to the centered task workspace', () => {
  assert.match(renderer, /openUnifiedWorkbench\('tasks', editTask\.dataset\.agentTaskEdit\)/)
  assert.match(renderer, /openUnifiedWorkbench\('tasks', userTask\.dataset\.openUserTask \|\| userTask\.dataset\.userTaskId\)/)
  assert.doesNotMatch(renderer, /expanded \? agentTaskEditorHtml/)
})
