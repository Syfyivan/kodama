import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const [html, petHtml, main, preload, renderer, petCss, workbenchRenderer, workbenchCss, manage] = await Promise.all([
  readFile(new URL('../src/renderer/lark-workbench.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/main/preload.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/renderer.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/style.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/lark-workbench.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/lark-workbench.css', import.meta.url), 'utf8'),
  readFile(new URL('../src/renderer/manage.js', import.meta.url), 'utf8'),
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

test('task actions use a centered workbench dialog instead of unsupported browser prompts', () => {
  assert.match(html, /<dialog id="agent-task-dialog"/)
  assert.match(html, /<form id="agent-task-dialog-form"/)
  assert.match(workbenchCss, /\.agent-task-dialog::backdrop/)
  assert.match(workbenchRenderer, /agentTaskDialog\.showModal\(\)/)
  assert.match(workbenchRenderer, /createAgentTaskButton\.addEventListener\('click', \(\) => createAgentTask\(\)\)/)
  assert.doesNotMatch(workbenchRenderer, /window\.(?:prompt|confirm)\(/)
  assert.doesNotMatch(renderer, /window\.(?:prompt|confirm)\(/)
})

test('opening the workbench releases the full-screen pet overlay mouse capture', () => {
  assert.match(renderer, /async function openUnifiedWorkbench[\s\S]*?togglePanel\(false\)[\s\S]*?setIgnoreMouse\(true, \{ forward: true \}\)/)
  assert.match(main, /function setPetOverlayInteractionSuspended\(suspended\)/)
  assert.match(main, /larkWorkbenchWin = new BrowserWindow\(\{[\s\S]*?acceptFirstMouse: true/)
  assert.match(main, /showLarkWorkbenchWindow\(\)[\s\S]*?setPetOverlayInteractionSuspended\(true\)/)
  assert.match(main, /larkWorkbenchWin\.setAlwaysOnTop\(true, 'screen-saver', 2\)/)
  assert.match(main, /larkWorkbenchWin\.on\('blur',[\s\S]*?setPetOverlayInteractionSuspended\(false\)/)
  assert.match(main, /larkWorkbenchWin\.on\('closed',[\s\S]*?setPetOverlayInteractionSuspended\(false\)/)
})

test('task workspace keeps every task and session inside one bounded column', () => {
  assert.match(workbenchCss, /\.agent-task-list\s*\{[\s\S]*?overflow-x:\s*hidden;/)
  assert.match(workbenchCss, /\.agent-task-card\s*\{[\s\S]*?max-width:\s*860px;/)
  assert.match(workbenchCss, /\.agent-session-list\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/)
  assert.match(workbenchCss, /\.agent-session-card\s*\{[\s\S]*?min-width:\s*0;/)
})

test('desktop task bubbles nest compact sessions under their user task', () => {
  assert.match(renderer, /class="bubble-task-session-list"/)
  assert.match(renderer, /class="bubble-card bubble-loose-session-group"/)
  assert.match(renderer, /data-bubble-session-visibility=/)
  assert.match(renderer, /data-agent-session-drag-handle=/)
  assert.match(renderer, /window\.pet\.assignAgentSession[\s\S]*?sessionKey,[\s\S]*?taskId,/)
  assert.match(renderer, /clearAgentSessionDragUi\(\)/)
  assert.match(petCss, /\.bubble-task-session\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto;/)
  assert.match(petCss, /#bubble\.is-session-dragging \.bubble-user-task\.drop-active/)
  assert.match(petCss, /#bubble\s*\{[\s\S]*?width:\s*min\(292px,[\s\S]*?max-height:\s*min\(44vh,\s*280px\);/)
})

test('desktop task bubbles follow pet opacity and can be hidden without deleting task data', () => {
  assert.match(html, /小人与气泡透明度/)
  assert.doesNotMatch(html, /id="taskBubbleOpacity"/)
  assert.match(html, /id="taskBubblesVisible"/)
  assert.doesNotMatch(manage, /id: 'taskBubbleOpacity'/)
  assert.match(manage, /const SWITCHES = \[[^\]]*'taskBubblesVisible'/)
  assert.doesNotMatch(renderer, /--task-bubble-opacity/)
  assert.match(renderer, /uiSettings\.taskBubblesVisible\s*\?\s*userTaskBubbleTasks\(\)\s*:\s*\[\]/)
  assert.match(renderer, /data-hide-task-bubbles/)
  assert.match(renderer, /function looseSessionBubbleHtml[\s\S]*?data-open-user-task=""[\s\S]*?data-hide-task-bubbles="1"/)
  assert.match(petCss, /#bubble\s*\{[\s\S]*?opacity:\s*var\(--pet-opacity\)/)
  assert.match(main, /taskBubblesVisible: state\.taskBubblesVisible !== false/)
  assert.match(main, /taskBubblesVisible \? '隐藏任务气泡' : '显示任务气泡'/)
})

test('hidden task bubbles switch the pet into an independent dialogue and motion mode', () => {
  assert.match(petHtml, /id="pet-dialogue"[^>]*aria-live="polite"/)
  assert.match(renderer, /isActiveCompanionMode\(uiSettings\)/)
  assert.match(renderer, /backend\?\.playMotion\?\.\(moment\.motion, 'normal'\)/)
  assert.match(renderer, /showPetDialogue\(moment\.text\)/)
  assert.match(petCss, /#pet-dialogue\s*\{[\s\S]*?opacity:\s*var\(--pet-opacity\)/)
  assert.match(petCss, /body\[data-companion-active="true"\] #pet-gif\[data-state="idle"\]/)
  assert.match(petCss, /#pet-gif\[data-frame-animation="true"\][^{]*\{[^}]*animation:\s*none\s*!important/)
  for (const action of ['thinking', 'eating', 'blink', 'hop', 'stretch', 'sway', 'wave', 'doze', 'nod']) {
    assert.match(petCss, new RegExp(`#pet-gif\\[data-state="${action}"\\]`))
    assert.match(petCss, new RegExp(`@keyframes kodama-${action}`))
  }
})

test('every size control uses the compact 12% to 75% range and 42% default', () => {
  assert.match(petHtml, /id="setting-pet-scale"[^>]*min="12"[^>]*max="75"/)
  assert.match(html, /id="petScale"[^>]*min="12"[^>]*max="75"/)
  assert.match(main, /petScale:\s*0\.42/)
  for (const scale of ['0.15', '0.28', '0.42', '0.65']) {
    const escapedScale = scale.replace('.', '\\.')
    assert.match(main, new RegExp(`setPetScale\\(${escapedScale}\\)`))
  }
})

test('performance mode is available in both the pet panel and the unified settings page', () => {
  assert.match(petHtml, /id="setting-performance-mode"/)
  assert.match(html, /id="performanceMode"/)
  for (const mode of ['balanced', 'realtime', 'saver']) {
    assert.match(petHtml, new RegExp(`data-performance-mode="${mode}"`))
    assert.match(html, new RegExp(`data-v="${mode}"`))
  }
  assert.match(manage, /\['triggerMode', 'edgeMode', 'performanceMode'\]/)
})
