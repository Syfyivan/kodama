// `pnpm run check` — syntax-check every source file. Renderer files use ESM but
// have a .js extension (loaded via <script type="module">), so `node --check`
// would treat them as CommonJS; we copy those to a temp .mjs first.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolve file paths against the package root (one level up from scripts/), so
// `node check.mjs` works from any cwd — not just packages/kodama (otherwise every
// relative path 404s and the script silently "fails" all files).
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const CJS = [
  'src/main/index.js',
  'src/main/agent-event-context.js',
  'src/main/bridge-client.js',
  'src/main/preload.js',
  'src/main/codex-session-index.js',
  'src/main/custom-pet-styles.js',
  'src/main/hook-events.js',
  'src/main/knowledge-agent.js',
  'src/main/knowledge-hub.js',
  'src/main/lark-base-sink.js',
  'src/main/lark-assistant-cache.js',
  'src/main/lark-agenda.js',
  'src/main/lark-draft-apply.js',
  'src/main/lark-inbox.js',
  'src/main/lark-links.js',
  'src/main/lark-message-archive.js',
  'src/main/lark-web-preload.js',
  'src/main/lark-web-push.js',
  'src/main/terminal-launcher.js',
  'src/main/work-item-agent.js',
  'src/main/work-items.js',
  'src/main/agents/claude.js',
  'src/main/agents/codex.js',
  'src/main/agents/gemini.js',
  'src/main/agents/qwen.js',
  'src/main/agents/registry.js',
  'src/main/agents/trae.js',
  'src/main/token-usage.js',
  'src/main/pomodoro.js',
  'src/main/updater.js',
]
const ESM = [
  'src/renderer/renderer.js',
  'src/renderer/appearance-confirm.js',
  'src/renderer/bridge-tasks.js',
  'src/renderer/lark-workbench.js',
  'src/renderer/agent-sync.js',
  'src/renderer/manage.js',
  'src/renderer/accessories.js',
  'src/renderer/reactions.js',
  'src/renderer/growth.js',
  'src/renderer/onboarding.js',
  'src/renderer/pet-hitbox.js',
  'src/renderer/display-area.js',
  'src/renderer/token-feed.js',
  'src/renderer/config/accessories.js',
  'src/renderer/config/appearance.js',
  'src/renderer/config/ui-settings.js',
  'src/renderer/backends/gif.js',
  'src/renderer/config/pet-config.js',
  'src/renderer/config/render.local.example.js',
  'src/renderer/config/agent.local.example.js',
  'src/renderer/config/accessories.local.example.js',
  'scripts/setup-assets.mjs',
  'scripts/kodama-control.mjs',
  'scripts/setup-lark-message-base.mjs',
  'scripts/start-detached.mjs',
  'scripts/check.mjs',
]

const dir = mkdtempSync(join(tmpdir(), 'kodama-check-'))
let failed = 0

function check(file, asModule) {
  try {
    let target = resolve(ROOT, file)
    if (asModule && file.endsWith('.js')) {
      target = join(dir, file.replace(/[/\\]/g, '_') + '.mjs')
      writeFileSync(target, readFileSync(resolve(ROOT, file)))
    }
    execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' })
    console.log('ok   ', file)
  } catch (e) {
    failed += 1
    console.error('FAIL ', file, '\n', e.stderr?.toString() || e.message)
  }
}

for (const f of CJS) check(f, false)
for (const f of ESM) check(f, true)

console.log(`\n${failed ? `${failed} file(s) failed` : 'all files OK'}`)
process.exit(failed ? 1 : 0)
