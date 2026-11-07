import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appLaunches, findProjectState, findWatcherIgnore, readLifecycleLog, staleConfig, summarizeQuality, userDataDirs } from './devtoolsState.mjs'
import { runOfficialCli } from './devtoolsCli.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
export function probeEndpoint(endpoint, timeoutMs = 2500) {
  const url = new URL(endpoint)
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Use a local ws:// automator endpoint')
  }
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: url.hostname.replace(/[\[\]]/g, ''), port: Number(url.port || 80) })
    const finish = error => { socket.destroy(); error ? reject(error) : resolve() }
    socket.once('connect', () => finish())
    socket.once('error', finish)
    socket.setTimeout(timeoutMs, () => finish(new Error(`Automator port timed out: ${url.port}`)))
  })
}

async function checkLogin(ide) {
  const result = await runOfficialCli({ ide, command: 'islogin' })
  if (result.status !== 'ok' || !/['"]?login['"]?\s*:\s*true/.test(result.output)) {
    throw new Error(`CLI islogin did not confirm login (${result.status}, exit ${result.exitCode}); check IDE login and Settings > Security > service port`)
  }
}

// 读开发者工具落盘的项目状态和监听器日志：已加载的配置是否与磁盘一致，以及最近一次代码质量结果。
function checkLoadedConfig(ide) {
  const name = 'DevTools loaded project.config.json'
  const found = findProjectState(userDataDirs(ide), root)
  if (!found) return { result: { name, skipped: true, error: 'no project state under DevTools User Data; open the project in DevTools first' } }
  const configPath = path.join(root, 'project.config.json')
  const watcherIgnore = findWatcherIgnore(path.join(path.dirname(found.file), '..', 'WeappLog', 'logs'), found.state.projectpath)
  const stale = staleConfig(found.state, watcherIgnore, JSON.parse(readFileSync(configPath, 'utf8')))
  const result = stale.length
    ? { name, ok: false, error: `${stale.map(entry => `${entry.name} missing [${entry.missing.join(', ')}] extra [${entry.extra.join(', ')}]`).join('; ')}; close and reopen the project in DevTools` }
    : { name, ok: true }
  if (!watcherIgnore) result.note = 'watchOptions not compared: no FileUtils block for this project in DevTools logs'
  const quality = summarizeQuality(found.state.codeQuality)
  return { result, quality: quality && { ...quality, predatesConfig: quality.scannedAt.getTime() < statSync(configPath).mtimeMs } }
}

// A minimized project window keeps the CLI and automator answering while mp.screenshot() fails with
// "fail to capture screenshot" (2026-11-04), so the preflight reads the window state before a capture run.
// Input: one "<pid>\t<True|False>" line per DevTools window titled with the project name.
export function projectWindowResult(output, projectName) {
  const name = 'DevTools project window'
  const windows = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
    const [pid, minimized] = line.split('\t')
    return { pid, minimized: minimized === 'True' }
  })
  if (!windows.length) return { name, skipped: true, error: `no DevTools window titled ${projectName}; open the project in DevTools first` }
  const minimized = windows.filter(window => window.minimized).map(window => window.pid)
  return minimized.length
    ? { name, ok: false, error: `minimized (pid ${minimized.join(', ')}); ask the maintainer to restore the window, captures fail while it stays minimized` }
    : { name, ok: true }
}

// Match by process name and window title: the process that owns the project window may not expose its Path.
const WINDOW_SCRIPT = [
  `Add-Type -Namespace MinminPreflight -Name User32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);'`,
  "Get-Process -Name $env:MINMIN_DEVTOOLS_PROCESS -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -eq $env:MINMIN_DEVTOOLS_PROJECT } | ForEach-Object { \"$($_.Id)`t$([MinminPreflight.User32]::IsIconic($_.MainWindowHandle))\" }"
].join('; ')

function checkProjectWindow() {
  const name = 'DevTools project window'
  if (process.platform !== 'win32') return { name, skipped: true, error: 'window state is read on Windows only' }
  const projectName = JSON.parse(readFileSync(path.join(root, 'project.config.json'), 'utf8')).projectname
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', WINDOW_SCRIPT], {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
    env: { ...process.env, MINMIN_DEVTOOLS_PROCESS: '微信开发者工具', MINMIN_DEVTOOLS_PROJECT: projectName }
  })
  if (result.error || result.status !== 0) {
    return { name, skipped: true, error: `window probe failed: ${result.error ? result.error.message : String(result.stderr).trim().split(/\r?\n/)[0]}` }
  }
  return projectWindowResult(result.stdout, projectName)
}

// Right after DevTools starts, its second app-service reload can run App onLaunch and load no page (2026-11-07):
// the CLI and automator still answer, but page logic stays dead until the next compile. The lifecycle log is
// truncated to the second and written every 3 s, so a launch younger than 5 s without a page is only pending.
export function launchResult(launches, now = Date.now()) {
  const name = 'Latest app launch loaded a page'
  const latest = launches.at(-1)
  if (!latest) return { name, skipped: true, error: 'no App onLaunch in the simulator lifecycle log; compile the project in DevTools first' }
  const launched = latest.at.toLocaleString('sv-SE')
  if (latest.page) return { name, ok: true, note: `${latest.page}, launched ${launched}` }
  if (now - latest.at.getTime() < 5000) return { name, skipped: true, error: `launched ${launched}, no page logged yet; the log is written every 3 s, rerun in a few seconds` }
  return { name, ok: false, error: `launched ${launched} without loading a page; click 编译 in DevTools, then rerun` }
}

function checkLatestLaunch(ide) {
  const { appid } = JSON.parse(readFileSync(path.join(root, 'project.config.json'), 'utf8'))
  return launchResult(appLaunches(readLifecycleLog(userDataDirs(ide), appid)))
}

async function main() {
  const options = { ide: 'D:/Program Files (x86)/Tencent/微信web开发者工具', ws: 'ws://127.0.0.1:9420' }
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].slice(2)
    if (!['ide', 'ws'].includes(key) || !process.argv[i + 1]) throw new Error('Usage: devtoolsPreflight.mjs [--ide directory] [--ws ws://127.0.0.1:9420]')
    options[key] = process.argv[i + 1]
  }
  const results = []
  for (const [name, check] of [['CLI service/login', () => checkLogin(options.ide)], ['automator TCP', () => probeEndpoint(options.ws)]]) {
    try { await check(); results.push({ name, ok: true }) }
    catch (error) { results.push({ name, ok: false, error: error.message }) }
  }
  const connectionFailed = results.some(result => !result.ok)
  const { result: configResult, quality } = checkLoadedConfig(options.ide)
  results.push(configResult, checkProjectWindow(), checkLatestLaunch(options.ide))
  const out = path.join(root, '.scratch', 'devtools')
  mkdirSync(out, { recursive: true })
  const log = path.join(out, 'preflight.json')
  writeFileSync(log, JSON.stringify({ endpoint: options.ws, results, quality }, null, 2))
  for (const result of results) console.log(`${result.skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}${result.note ? ` (${result.note})` : ''}`)
  if (quality) {
    console.log(`INFO code quality scanned ${quality.scannedAt.toLocaleString()}: ${quality.total - quality.failed.length}/${quality.total} passed, main package ${quality.mainPackageBytes ?? 'unknown'} B`)
    for (const text of quality.failed) console.log(`INFO   failed: ${text}`)
    if (quality.predatesConfig) console.log('INFO   this scan predates project.config.json; rescan (代码质量 → 重新扫描) or upload to refresh it')
  }
  console.log(`Log: ${log}`)
  if (connectionFailed) console.error('Fallback: npm run devtools:mcp -- --preflight (existing IDE MCP token required). See docs/devtools-verification.md.')
  if (results.some(result => result.ok === false)) process.exitCode = 1
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
