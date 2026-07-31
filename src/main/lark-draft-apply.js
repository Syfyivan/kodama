const LARK_APP_NAMES = Object.freeze(['Lark', 'Feishu', '飞书'])

function selectLarkAppName(appExists) {
  if (typeof appExists !== 'function') return ''
  return LARK_APP_NAMES.find(name => appExists(name)) || ''
}

function larkPasteScript(appName, delaySeconds = 1.1) {
  if (!LARK_APP_NAMES.includes(appName)) throw new Error('unsupported Lark app')
  const delay = Math.min(3, Math.max(0.3, Number(delaySeconds) || 1.1))
  return [
    `tell application "${appName}" to activate`,
    `delay ${delay}`,
    'tell application "System Events"',
    `  tell process "${appName}" to set frontmost to true`,
    '  keystroke "v" using command down',
    'end tell',
  ].join('\n')
}

module.exports = {
  LARK_APP_NAMES,
  larkPasteScript,
  selectLarkAppName,
}
