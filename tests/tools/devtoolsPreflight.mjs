import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findProjectState, findWatcherIgnore, staleConfig, summarizeQuality, userDataDirs } from './devtoolsState.mjs'
import { runOfficialCli } from './devtoolsCli.mjs'
import { checkLatestLaunch, launchLines, probeEndpoint } from './devtoolsLaunchHealth.mjs'
export { launchResult, launchLines, probeEndpoint } from './devtoolsLaunchHealth.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

const TRANSIENT_ISLOGIN_EXITS = new Set([4294967295, -1])

export async function checkLogin(ide, { runCli = runOfficialCli } = {}) {
  const first = await runCli({ ide, command: 'islogin' })
  if (first.status === 'ok' && /['"]?login['"]?\s*:\s*true/.test(first.output)) return {}
  if (TRANSIENT_ISLOGIN_EXITS.has(first.exitCode)) {
    const retry = await runCli({ ide, command: 'islogin' })
    if (retry.status === 'ok' && /['"]?login['"]?\s*:\s*true/.test(retry.output)) {
      return { note: `recovered on retry after exit ${first.exitCode}` }
    }
    throw new Error(`CLI islogin did not confirm login (${retry.status}, exit ${retry.exitCode} after retry from ${first.exitCode}); check IDE login and Settings > Security > service port`)
  }
  throw new Error(`CLI islogin did not confirm login (${first.status}, exit ${first.exitCode}); check IDE login and Settings > Security > service port`)
}

// 读开发者工具落盘的项目状态和监听器日志：已加载的配置是否与磁盘一致，以及最近一次代码质量结果。
export function checkLoadedConfig(ide) {
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
// Input: optional "DESKTOP_WINDOWS\t<N>" header followed by "<pid>\t<True|False>" lines per DevTools window
// titled with the project name.
export function projectWindowResult(output, projectName) {
  const name = 'DevTools project window'
  let desktopWindowCount = null
  const windows = []
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const [first, second] = line.split('\t')
    if (first === 'DESKTOP_WINDOWS') {
      desktopWindowCount = Number(second)
      continue
    }
    windows.push({ pid: first, minimized: second === 'True' })
  }
  if (!windows.length) {
    if (desktopWindowCount === 0) {
      return {
        name,
        skipped: true,
        error: 'shell-cannot-observe-desktop: this shell sees 0 desktop windows (MainWindowHandle=0 across all processes), so window visibility/minimization cannot be checked from here',
      }
    }
    return { name, skipped: true, error: `no DevTools window titled ${projectName}; open the project in DevTools first` }
  }
  const minimized = windows.filter(window => window.minimized).map(window => window.pid)
  return minimized.length
    ? { name, ok: false, error: `minimized (pid ${minimized.join(', ')}); ask the maintainer to restore the window, captures fail while it stays minimized` }
    : { name, ok: true }
}

// Match by process name and window title: the process that owns the project window may not expose its Path.
// Also emit total visible desktop windows across all processes so a non-interactive shell does not misreport
// an open DevTools project window as missing.
const WINDOW_SCRIPT = [
  `Add-Type -Namespace MinminPreflight -Name User32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool IsIconic(System.IntPtr h);'`,
  `"DESKTOP_WINDOWS\`t$(@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count)"`,
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

export function failedLaunchLines(launchCheck, launches) {
  return launchCheck.ok === false ? launchLines(launches) : []
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
    try {
      const extra = await check()
      results.push({ name, ok: true, ...(extra?.note ? { note: extra.note } : {}) })
    }
    catch (error) { results.push({ name, ok: false, error: error.message }) }
  }
  const connectionFailed = results.some(result => !result.ok)
  const { result: configResult, quality } = checkLoadedConfig(options.ide)
  const { result: launchCheck, launches } = checkLatestLaunch(options.ide, root)
  results.push(configResult, checkProjectWindow(), launchCheck)
  const out = path.join(root, '.scratch', 'devtools')
  mkdirSync(out, { recursive: true })
  const log = path.join(out, 'preflight.json')
  writeFileSync(log, JSON.stringify({ endpoint: options.ws, results, quality }, null, 2))
  for (const result of results) console.log(`${result.skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}${result.note ? ` (${result.note})` : ''}`)
  for (const line of failedLaunchLines(launchCheck, launches)) console.log(`INFO   launch ${line}`)
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
