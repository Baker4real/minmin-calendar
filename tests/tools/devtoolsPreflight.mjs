import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  const out = path.join(root, '.scratch', 'devtools')
  mkdirSync(out, { recursive: true })
  const log = path.join(out, `preflight-${Date.now()}.json`)
  writeFileSync(log, JSON.stringify({ endpoint: options.ws, results }, null, 2))
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}${result.error ? `: ${result.error}` : ''}`)
  console.log(`Log: ${log}`)
  if (results.some(result => !result.ok)) {
    console.error('Fallback: npm run devtools:mcp -- --preflight (existing IDE MCP token required). See docs/devtools-verification.md.')
    process.exitCode = 1
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
