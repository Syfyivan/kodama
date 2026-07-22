import test from 'node:test'
import assert from 'node:assert/strict'
import {
  codexThreadTargetForDetectedHost,
  normalizeTerminalLauncher,
  orderAgentCandidates,
  isCmuxAppPath,
  isOrcaAppPath,
  selectOrcaTerminal,
  shouldPreferOrca,
  shouldUseDetectedHostBeforeLauncher,
  shouldTryCmux,
  statusMatchesTarget,
} from '../src/main/terminal-launcher.js'

test('agent discovery keeps app-hosted Codex processes as a fallback', () => {
  const appHosted = { pid: 1, tty: '??', command: '/Applications/ChatGPT.app/Contents/Resources/codex app-server' }
  const terminalHosted = { pid: 2, tty: 'ttys003', command: 'codex' }
  assert.deepEqual(orderAgentCandidates([appHosted]), [appHosted])
  assert.deepEqual(orderAgentCandidates([appHosted, terminalHosted]), [terminalHosted, appHosted])
})

test('terminal launcher preference normalizes to a safe default', () => {
  assert.equal(normalizeTerminalLauncher('orca'), 'orca')
  assert.equal(normalizeTerminalLauncher('ORCA'), 'orca')
  assert.equal(normalizeTerminalLauncher('cmux'), 'cmux')
  assert.equal(normalizeTerminalLauncher('warp'), 'auto')
  assert.equal(normalizeTerminalLauncher(''), 'auto')
})

test('terminal host detection recognizes cmux and Orca app paths', () => {
  assert.equal(isOrcaAppPath('/Applications/Orca.app'), true)
  assert.equal(isOrcaAppPath('/Applications/Orca.app/Contents/MacOS/Orca'), false)
  assert.equal(isCmuxAppPath('/Users/me/Applications/cmux.app'), true)
  assert.equal(isCmuxAppPath('/Applications/Orca.app'), false)
})

test('auto prefers Orca only when the live agent host is Orca', () => {
  assert.equal(shouldPreferOrca('auto', '/Applications/Orca.app'), true)
  assert.equal(shouldPreferOrca('auto', '/Applications/Terminal.app'), false)
  assert.equal(shouldPreferOrca('cmux', '/Applications/Orca.app'), false)
  assert.equal(shouldPreferOrca('orca', ''), true)
})

test('launcher fallback yields to a detected non-terminal host app', () => {
  assert.equal(shouldUseDetectedHostBeforeLauncher('orca', '/Applications/Codex.app'), true)
  assert.equal(shouldUseDetectedHostBeforeLauncher('orca', '/Applications/Terminal.app'), true)
  assert.equal(shouldUseDetectedHostBeforeLauncher('auto', '/Applications/ChatGPT.app'), true)
  assert.equal(shouldUseDetectedHostBeforeLauncher('orca', '/Applications/Orca.app'), false)
  assert.equal(shouldUseDetectedHostBeforeLauncher('auto', '/Applications/cmux.app'), false)
  assert.equal(shouldUseDetectedHostBeforeLauncher('cmux', '/Applications/ChatGPT.app'), false)
  assert.equal(shouldUseDetectedHostBeforeLauncher('orca', ''), false)
})

test('app-hosted Codex session keeps its exact desktop thread deep link', () => {
  const target = {
    kind: 'terminal-session',
    provider: 'codex',
    sessionId: '019f4ecd-3fbe-7383-8331-6c38161d8362',
  }

  assert.deepEqual(
    codexThreadTargetForDetectedHost(target, '/Applications/ChatGPT.app'),
    {
      kind: 'codex-thread',
      threadId: '019f4ecd-3fbe-7383-8331-6c38161d8362',
      url: 'codex://threads/019f4ecd-3fbe-7383-8331-6c38161d8362',
    },
  )
  assert.equal(
    codexThreadTargetForDetectedHost(target, '/Applications/cmux.app'),
    null,
  )
  assert.equal(
    codexThreadTargetForDetectedHost({ ...target, provider: 'claude' }, '/Applications/ChatGPT.app'),
    null,
  )
})

test('inactive Codex Desktop session keeps its exact thread without falling through to cmux', () => {
  const target = {
    kind: 'terminal-session',
    provider: 'codex',
    sessionId: '019f4ad6-506c-71a3-9484-6a53419c8ec4',
  }

  assert.deepEqual(
    codexThreadTargetForDetectedHost(target, '', { isDesktopTranscript: true }),
    {
      kind: 'codex-thread',
      threadId: '019f4ad6-506c-71a3-9484-6a53419c8ec4',
      url: 'codex://threads/019f4ad6-506c-71a3-9484-6a53419c8ec4',
    },
  )
  assert.equal(
    codexThreadTargetForDetectedHost(target, '/Applications/cmux.app', { isDesktopTranscript: true }),
    null,
  )
})

test('Orca preference disables cmux fallback', () => {
  assert.equal(shouldTryCmux('auto'), true)
  assert.equal(shouldTryCmux('cmux'), true)
  assert.equal(shouldTryCmux('orca'), false)
})

test('Orca terminal selection prefers provider session identity', () => {
  const terminals = [
    {
      handle: 'term_old',
      tabId: 'tab-old',
      leafId: 'leaf-old',
      worktreePath: '/repo',
      connected: true,
      lastOutputAt: 20,
    },
    {
      handle: 'term_exact',
      tabId: 'tab-exact',
      leafId: 'leaf-exact',
      worktreePath: '/repo',
      connected: true,
      lastOutputAt: 1,
    },
  ]
  const statuses = [
    {
      tabId: 'tab-exact',
      leafId: 'leaf-exact',
      providerSession: {
        id: 'claude-session',
        transcriptPath: '/Users/me/.claude/projects/session.jsonl',
      },
      receivedAt: 100,
    },
  ]
  const match = selectOrcaTerminal({
    sessionId: 'claude-session',
    fallbackPath: '/Users/me/.claude/projects/session.jsonl',
    cwd: '/repo',
  }, terminals, statuses)
  assert.equal(match?.terminal.handle, 'term_exact')
  assert.equal(match?.reason, 'provider-session')
})

test('Orca terminal selection falls back to the best worktree path match', () => {
  const terminals = [
    {
      handle: 'term_parent',
      worktreePath: '/repo',
      connected: true,
      lastOutputAt: 1,
    },
    {
      handle: 'term_other',
      worktreePath: '/other',
      connected: true,
      lastOutputAt: 100,
    },
  ]
  const match = selectOrcaTerminal({
    cwd: '/repo/packages/kodama',
  }, terminals, [])
  assert.equal(match?.terminal.handle, 'term_parent')
  assert.equal(match?.reason, 'worktree-path')
})

test('Orca provider session matching accepts session id or transcript path', () => {
  const status = {
    providerSession: {
      id: 'session-a',
      transcriptPath: '/tmp/session-a.jsonl',
    },
  }
  assert.equal(statusMatchesTarget(status, { sessionId: 'session-a' }), true)
  assert.equal(statusMatchesTarget(status, { fallbackPath: '/tmp/session-a.jsonl' }), true)
  assert.equal(statusMatchesTarget(status, { sessionId: 'session-b', fallbackPath: '/tmp/other.jsonl' }), false)
})
