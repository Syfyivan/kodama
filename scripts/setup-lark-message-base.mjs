#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const force = args.includes('--force')
const bindOnly = args.includes('--bind-only')
const resetSyncState = args.includes('--reset-sync-state')
const name = valueAfter('--name') || 'Kodama 飞书群消息归档'
const tableName = valueAfter('--table') || '最近群消息'
const suppliedTableId = valueAfter('--table-id') || ''
const folderToken = valueAfter('--folder-token') || process.env.KODAMA_LARK_BASE_FOLDER_TOKEN || ''
const suppliedBaseToken = valueAfter('--base-token') || ''
const dir = userDataDir()
const configFile = join(dir, 'kodama-lark-base-config.json')
const stateFile = join(dir, 'kodama-lark-base-state.json')
const previousConfig = readJsonFile(configFile)

const fields = [
  { field_name: '时间', type: 'datetime', style: { format: 'yyyy/MM/dd HH:mm' } },
  { field_name: '群名', type: 'text' },
  { field_name: '发送人', type: 'text' },
  { field_name: '内容', type: 'text' },
  { field_name: '来源', type: 'text' },
  { field_name: '类型', type: 'text' },
  { field_name: '消息ID', type: 'text' },
  { field_name: 'chat_id', type: 'text' },
  { field_name: 'sender_id', type: 'text' },
  { field_name: 'thread_id', type: 'text' },
  { field_name: '归档时间', type: 'datetime', style: { format: 'yyyy/MM/dd HH:mm' } },
]
const visibleFields = ['时间', '群名', '发送人', '内容', '来源', '类型']

function valueAfter(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : ''
}

function userDataDir() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'kodama')
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'kodama')
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'kodama')
}

function runLarkCli(cliArgs, { allowNoop = false } = {}) {
  try {
    const output = execFileSync('lark-cli', cliArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    process.stdout.write(output)
    return parseJson(output)
  } catch (error) {
    const output = String(error?.stderr || error?.stdout || '')
    const payload = parseJson(output)
    if (allowNoop && payload?.error?.code === 800070003) {
      process.stdout.write(output)
      return payload
    }
    throw error
  }
}

function parseJson(output) {
  const text = String(output || '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < start) return {}
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return {}
  }
}

function readJsonFile(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function syncTargetId(baseToken, tableId) {
  return createHash('sha256')
    .update(`${String(baseToken || '').trim()}\u0000${String(tableId || '').trim()}`)
    .digest('hex')
    .slice(0, 24)
}

function backupSyncState() {
  if (!existsSync(stateFile)) return ''
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = join(dir, `kodama-lark-base-state.${timestamp}.json.bak`)
  renameSync(stateFile, backupFile)
  return backupFile
}

function firstString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) return text
  }
  return ''
}

function baseTokenFrom(result) {
  return firstString(
    result?.data?.app?.app_token,
    result?.data?.base?.app_token,
    result?.data?.base?.base_token,
    result?.data?.app_token,
    result?.data?.base_token,
    result?.app?.app_token,
    result?.base?.app_token,
    result?.base?.base_token,
    result?.app_token,
    result?.base_token,
  )
}

function baseUrlFrom(result) {
  return firstString(
    result?.data?.base?.url,
    result?.data?.url,
    result?.base?.url,
    result?.url,
  )
}

function withTableParam(url, tableId) {
  const raw = String(url || '')
  const table = String(tableId || '')
  if (!raw || !table || /[?&]table=/.test(raw)) return raw
  return `${raw}${raw.includes('?') ? '&' : '?'}table=${encodeURIComponent(table)}`
}

function tableIdFrom(result) {
  return firstString(
    result?.data?.table?.table_id,
    result?.data?.table?.id,
    result?.data?.table_id,
    result?.table?.table_id,
    result?.table?.id,
    result?.table_id,
    tableName,
  )
}

function defaultViewIdFrom(result) {
  return firstString(
    result?.data?.table?.views?.[0]?.id,
    result?.data?.table?.views?.[0]?.view_id,
    result?.table?.views?.[0]?.id,
    result?.table?.views?.[0]?.view_id,
  )
}

function viewIdFromCreate(result) {
  return firstString(
    result?.data?.views?.[0]?.id,
    result?.data?.views?.[0]?.view_id,
    result?.views?.[0]?.id,
    result?.views?.[0]?.view_id,
  )
}

function fieldIdFromCreate(result) {
  return firstString(
    result?.data?.field?.id,
    result?.data?.field?.field_id,
    result?.field?.id,
    result?.field?.field_id,
  )
}

function firstViewIdFromList(result) {
  return firstString(
    result?.data?.items?.[0]?.view_id,
    result?.data?.items?.[0]?.id,
    result?.items?.[0]?.view_id,
    result?.items?.[0]?.id,
  )
}

function printConfig(config) {
  console.log('\nKodama Base config:')
  console.log(JSON.stringify({ ...config, baseToken: `${config.baseToken.slice(0, 8)}...` }, null, 2))
}

function visibleFieldsFrom(result) {
  const values = result?.data?.visible_fields
    || result?.visible_fields
    || []
  return Array.isArray(values) ? values.map(value => String(value || '').trim()).filter(Boolean) : []
}

function setVisibleFields(targetTableId, viewId, viewName, hiddenFieldIds) {
  if (!viewId) return
  const visibleArgs = [
    'base',
    '+view-set-visible-fields',
    '--as',
    'user',
    '--base-token',
    baseToken,
    '--table-id',
    targetTableId,
    '--view-id',
    viewId,
    '--json',
    JSON.stringify({ visible_fields: visibleFields }),
  ]
  if (dryRun) visibleArgs.push('--dry-run')
  runLarkCli(visibleArgs, { allowNoop: true })
  if (dryRun) return

  const current = runLarkCli([
    'base',
    '+view-get-visible-fields',
    '--as',
    'user',
    '--base-token',
    baseToken,
    '--table-id',
    targetTableId,
    '--view-id',
    viewId,
    '--format',
    'json',
  ])
  const visible = visibleFieldsFrom(current)
  const hiddenFieldNames = ['消息ID', 'chat_id', 'sender_id', 'thread_id', '归档时间']
  if (!hiddenFieldNames.some(fieldName => visible.includes(fieldName))) return
  if (!hiddenFieldIds.length) {
    throw new Error(`view ${viewName} still exposes internal fields and no field IDs are available`)
  }

  // lark-cli 1.0.78 can return 800070003 (no-op) without applying the
  // visible_fields mutation. Read back first, then use the equivalent raw API
  // only when the wrapper left internal fields visible.
  runLarkCli([
    'api',
    'PATCH',
    `/open-apis/bitable/v1/apps/${baseToken}/tables/${targetTableId}/views/${viewId}`,
    '--as',
    'user',
    '--data',
    JSON.stringify({
      view_name: viewName,
      property: { hidden_fields: hiddenFieldIds },
    }),
  ])
}

function configureReadableViews(targetTableId, tableCreateResult, hiddenFieldIds) {
  const defaultViewId = dryRun
    ? 'Grid View'
    : firstString(defaultViewIdFrom(tableCreateResult), firstViewIdFromList(runLarkCli([
      'base',
      '+view-list',
      '--as',
      'user',
      '--base-token',
      baseToken,
      '--table-id',
      targetTableId,
    ])))

  if (defaultViewId) {
    console.log('\nConfiguring view: 最近消息')
    const renameArgs = [
      'base',
      '+view-rename',
      '--as',
      'user',
      '--base-token',
      baseToken,
      '--table-id',
      targetTableId,
      '--view-id',
      defaultViewId,
      '--name',
      '最近消息',
    ]
    if (dryRun) renameArgs.push('--dry-run')
    runLarkCli(renameArgs)

    const sortArgs = [
      'base',
      '+view-set-sort',
      '--as',
      'user',
      '--base-token',
      baseToken,
      '--table-id',
      targetTableId,
      '--view-id',
      defaultViewId,
      '--json',
      JSON.stringify({ sort_config: [{ field: '时间', desc: true }] }),
    ]
    if (dryRun) sortArgs.push('--dry-run')
    runLarkCli(sortArgs)
    setVisibleFields(targetTableId, defaultViewId, '最近消息', hiddenFieldIds)
  }

  console.log('\nCreating view: 按群查看')
  const createGroupViewArgs = [
    'base',
    '+view-create',
    '--as',
    'user',
    '--base-token',
    baseToken,
    '--table-id',
    targetTableId,
    '--json',
    JSON.stringify({ view_name: '按群查看' }),
  ]
  if (dryRun) createGroupViewArgs.push('--dry-run')
  const groupViewResult = runLarkCli(createGroupViewArgs)
  const groupViewId = dryRun ? '按群查看' : viewIdFromCreate(groupViewResult)
  if (!groupViewId) return

  const groupArgs = [
    'base',
    '+view-set-group',
    '--as',
    'user',
    '--base-token',
    baseToken,
    '--table-id',
    targetTableId,
    '--view-id',
    groupViewId,
    '--json',
    JSON.stringify({ group_config: [{ field: '群名', desc: false }] }),
  ]
  if (dryRun) groupArgs.push('--dry-run')
  runLarkCli(groupArgs)

  const groupSortArgs = [
    'base',
    '+view-set-sort',
    '--as',
    'user',
    '--base-token',
    baseToken,
    '--table-id',
    targetTableId,
    '--view-id',
    groupViewId,
    '--json',
    JSON.stringify({ sort_config: [{ field: '时间', desc: true }] }),
  ]
  if (dryRun) groupSortArgs.push('--dry-run')
  runLarkCli(groupSortArgs)
  setVisibleFields(targetTableId, groupViewId, '按群查看', hiddenFieldIds)
}

const baseArgs = ['base', '+base-create', '--as', 'user', '--name', name, '--time-zone', 'Asia/Shanghai']
if (folderToken) baseArgs.push('--folder-token', folderToken)
if (dryRun) baseArgs.push('--dry-run')

if (!dryRun && existsSync(configFile) && !force) {
  console.log(`Kodama Base config already exists: ${configFile}`)
  console.log('Use --force to create a new Base and overwrite the local binding.')
  process.exit(0)
}

let baseResult = {}
let baseToken = suppliedBaseToken
let baseUrl = ''
if (bindOnly && (!suppliedBaseToken || !suppliedTableId)) {
  throw new Error('--bind-only requires --base-token and --table-id')
}
if (baseToken) {
  console.log(`Using Base: ${baseToken}`)
} else {
  console.log(`Creating Base: ${name}`)
  baseResult = runLarkCli(baseArgs)
  baseToken = dryRun ? 'dry-run-base-token' : baseTokenFrom(baseResult)
  baseUrl = dryRun ? '' : baseUrlFrom(baseResult)
}
if (!baseToken) {
  throw new Error('created base but could not find base token in lark-cli output')
}
if (!baseUrl && baseToken) baseUrl = `https://bytedance.larkoffice.com/base/${baseToken}`

let tableId = suppliedTableId
let tableResult = {}
if (tableId) {
  console.log(`\nUsing table: ${tableId}`)
} else {
  console.log(`\nCreating table: ${tableName}`)
  const tableArgs = ['base', '+table-create', '--as', 'user', '--base-token', baseToken, '--name', tableName]
  if (dryRun) tableArgs.push('--dry-run')
  tableResult = runLarkCli(tableArgs)
  tableId = dryRun ? tableName : tableIdFrom(tableResult)
}

if (!bindOnly) {
  const fieldIdsByName = new Map()
  for (const field of fields) {
    console.log(`\nCreating field: ${field.field_name}`)
    const fieldArgs = [
      'base',
      '+field-create',
      '--as',
      'user',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--json',
      JSON.stringify(field),
    ]
    if (dryRun) fieldArgs.push('--dry-run')
    const fieldResult = runLarkCli(fieldArgs)
    fieldIdsByName.set(field.field_name, dryRun ? field.field_name : fieldIdFromCreate(fieldResult))
  }

  const hiddenFieldIds = ['消息ID', 'chat_id', 'sender_id', 'thread_id', '归档时间']
    .map(fieldName => fieldIdsByName.get(fieldName))
    .filter(Boolean)
  configureReadableViews(tableId, tableResult, hiddenFieldIds)
}

const config = {
  enabled: true,
  baseToken,
  tableId,
  syncTargetId: syncTargetId(baseToken, tableId),
  tableName,
  baseName: name,
  url: withTableParam(baseUrl, tableId),
  createdAt: new Date().toISOString(),
}

if (dryRun) {
  printConfig(config)
  console.log('\nDry run only; no Kodama config was written.')
  process.exit(0)
}

if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
const targetChanged = Boolean(
  previousConfig.baseToken
  && (
    previousConfig.baseToken !== config.baseToken
    || previousConfig.tableId !== config.tableId
  ),
)
if (resetSyncState || targetChanged) {
  const backupFile = backupSyncState()
  if (backupFile) console.log(`\nBacked up the previous sync state to ${backupFile}`)
}
writeFileSync(configFile, JSON.stringify(config, null, 2))
printConfig(config)
console.log(`\nWrote ${configFile}`)
console.log('Restart Kodama, then check http://127.0.0.1:7766/pet/lark-base-sink')
