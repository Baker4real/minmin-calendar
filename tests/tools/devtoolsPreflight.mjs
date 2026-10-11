import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findProjectState, findWatcherIgnore, staleConfig, summarizeQuality, userDataDirs } from './devtoolsState.mjs'

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
  const executable = path.join(ide, '微信开发者工具.exe')
  const entry = path.join(ide, 'resources/app.asar.unpacked/js/common/cli/index.js')
  if (!existsSync(executable) || !existsSync(entry)) throw new Error('DevTools CLI missing; use --ide with the installed directory')
  // Same official CLI bootstrap as cli.bat; avoids shell quoting and .bat spawn restrictions.
  const bootstrap = "const e=process.argv[1],a=process.argv.slice(2);process.argv=[process.execPath,'--ms-enable-electron-run-as-node',e,'--electron'].concat(a);require(e)"
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['-e', bootstrap, entry, 'islogin'], {
      cwd: ide, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', cwd: root }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    const timer = setTimeout(() => { child.kill(); reject(new Error('CLI islogin timed out; check service port, then use MCP preflight')) }, 10000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', code => {
      clearTimeout(timer)
      // Retain no raw login output: CLI implementations may include account data.
      if (code !== 0 || !/['"]?login['"]?\s*:\s*true/.test(output)) {
        reject(new Error(`CLI islogin did not confirm login (exit ${code}); check IDE login and Settings > Security > service port`))
      } else resolve()
    })
  })
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
  results.push(configResult)
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
