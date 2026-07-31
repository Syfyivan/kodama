import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const {
  larkPasteScript,
  selectLarkAppName,
} = require('../src/main/lark-draft-apply.js')

test('Lark draft application selects an installed allowlisted app', () => {
  assert.equal(selectLarkAppName(name => name === 'Feishu'), 'Feishu')
  assert.equal(selectLarkAppName(() => false), '')
})

test('Lark draft application only pastes and never sends', () => {
  const script = larkPasteScript('Lark', 0.8)
  assert.match(script, /tell application "Lark" to activate/)
  assert.match(script, /keystroke "v" using command down/)
  assert.doesNotMatch(script, /key code 36|return|enter/i)
  assert.throws(() => larkPasteScript('Terminal'), /unsupported/)
})
