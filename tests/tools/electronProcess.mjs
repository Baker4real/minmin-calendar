import { spawn, execFile } from 'node:child_process'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function electronEnvironment(mode, inherited = process.env) {
  if (!['gui', 'cli', 'inspect'].includes(mode)) throw new Error('Electron mode must be gui, cli or inspect')
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => key.toUpperCase() !== 'ELECTRON_RUN_AS_NODE'))
  if (mode === 'cli') env.ELECTRON_RUN_AS_NODE = '1'
  return env
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function bounded(promise, ms, message) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })]).finally(() => clearTimeout(timer))
}
async function stopOwned(child) {
  if (process.platform !== 'win32') { child.kill('SIGKILL'); return }
  await new Promise((resolve, reject) => {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    killer.once('error', reject)
    killer.once('exit', code => code === 0 ? resolve() : reject(new Error('Owned process cleanup failed')))
  })
}

// No single-instance handoff adoption: a preexisting window/inspector is never owned.
// The callback is bounded and must honor signal; this helper always closes its own child tree.
export async function withElectronSession({ executable, args = [], mode, inheritedEnv, cwd,
  timeoutMs = 15000, lifetimeMs = 30000, pollMs = 100, probe, spawnProcess = spawn, stopProcess = stopOwned }, work) {
  if (!executable || !Array.isArray(args) || !args.every(x => typeof x === 'string') || typeof probe !== 'function' || typeof work !== 'function' ||
      ![timeoutMs, lifetimeMs, pollMs].every(x => Number.isInteger(x) && x > 0 && x <= 60000)) throw new Error('Invalid bounded Electron session options')
  const child = spawnProcess(executable, args, { cwd, env: electronEnvironment(mode, inheritedEnv), windowsHide: true, stdio: 'ignore' })
  let exited = false, spawnError
  const closed = new Promise(resolve => { child.once('exit', () => { exited = true; resolve() }); child.once('error', error => { spawnError = error; exited = true; resolve() }) })
  const controller = new AbortController()
  try {
    const deadline = Date.now() + timeoutMs
    while (true) {
      if (exited) throw new Error(spawnError ? 'Electron failed to spawn' : 'Owned process exited or handed off to an existing instance')
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('Electron readiness timed out')
      const state = await bounded(Promise.resolve().then(() => probe({ pid: child.pid, signal: controller.signal })), remaining, 'Electron readiness timed out')
      if (exited) throw new Error('Owned process exited or handed off to an existing instance')
      if (state?.ready) {
        if (state.pid !== child.pid) throw new Error('Ready process identity differs from owned child')
        return await bounded(Promise.resolve().then(() => work({ pid: child.pid, signal: controller.signal, state })), lifetimeMs, 'Electron diagnostic lifetime timed out')
      }
      await delay(Math.min(pollMs, Math.max(1, deadline - Date.now())))
    }
  } finally {
    controller.abort()
    if (!exited) {
      await bounded(Promise.resolve().then(() => stopProcess(child)), 5000, 'Owned process cleanup timed out')
      await bounded(closed, 5000, 'Owned process did not exit after cleanup')
    }
  }
}

export async function inspectorReady(port, pid, signal) {
  let targets
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.any([signal, AbortSignal.timeout(500)]) })
    targets = await response.json()
  } catch { return { ready: false } }
  const target = Array.isArray(targets) && targets.find(t => typeof t.webSocketDebuggerUrl === 'string')
  if (!target) return { ready: false }
  const url = new URL(target.webSocketDebuggerUrl)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || Number(url.port) !== port || url.protocol !== 'ws:') throw new Error('Inspector endpoint identity invalid')
  return bounded(new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    let settled = false, timer
    const abort = () => done(reject, new Error('Inspector identity probe aborted or timed out'))
    const done = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); socket.close(); fn(value) }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) return abort()
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'process.pid', returnByValue: true } })))
    socket.addEventListener('error', () => done(reject, new Error('Inspector handshake failed')))
    socket.addEventListener('message', event => {
      try { const message = JSON.parse(event.data); if (message.id === 1) done(resolve, { ready: true, pid: message.result?.result?.value }) }
      catch { done(reject, new Error('Invalid inspector identity response')) }
    })
    socket.addEventListener('close', () => done(reject, new Error('Inspector closed before identity verification')))
    // close on timeout as well, rather than leaving a dangling debugger connection
    timer = setTimeout(abort, 900)
    timer.unref()
  }), 1000, 'Inspector identity probe timed out')
}
function windowReady(pid, expectedTitle, signal) {
  return new Promise((resolve, reject) => {
    execFile('pwsh', ['-NoProfile', '-File', path.join(import.meta.dirname, 'electronWindow.ps1'), '-TargetProcessId', String(pid), '-ExpectedTitle', expectedTitle],
      { windowsHide: true, timeout: 3000, maxBuffer: 1024, signal }, (error, stdout) => {
        if (error) return reject(new Error('Owned window probe failed'))
        try { resolve(JSON.parse(stdout)) } catch { reject(new Error('Invalid window readiness result')) }
      })
  })
}
async function main() {
  const mode = process.argv[2], opts = {}
  for (let i = 3; i < process.argv.length; i += 2) {
    if (!['--executable', '--title', '--args-file', '--port', '--timeout', '--hold-ms'].includes(process.argv[i]) || !process.argv[i + 1]) throw new Error('Use gui|inspect --executable absolute-path [--title exact-title] [--args-file json-array] [--port n] [--timeout ms] [--hold-ms ms]')
    opts[process.argv[i]] = process.argv[i + 1]
  }
  if (!['gui', 'inspect'].includes(mode) || !path.isAbsolute(opts['--executable'] || '')) throw new Error('Explicit GUI/inspect mode and executable required')
  const args = opts['--args-file'] ? JSON.parse(readFileSync(opts['--args-file'], 'utf8')) : []
  const port = Number(opts['--port'] || 9229)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid inspector port')
  if (args.some(x => /^--inspect/.test(x))) throw new Error('Use --port; raw inspector arguments are not accepted')
  if (mode === 'inspect') args.unshift(`--inspect=127.0.0.1:${port}`)
  if (mode === 'gui' && !opts['--title']) throw new Error('GUI readiness requires an exact observed title')
  const holdMs = Number(opts['--hold-ms'] || 1)
  const result = await withElectronSession({ executable: opts['--executable'], mode, args,
    timeoutMs: Number(opts['--timeout'] || 15000), lifetimeMs: Math.min(60000, holdMs + 5000),
    probe: ({ pid, signal }) => mode === 'inspect' ? inspectorReady(port, pid, signal) : windowReady(pid, opts['--title'], signal) }, async ({ pid }) => {
    if (!Number.isInteger(holdMs) || holdMs < 1 || holdMs > 55000) throw new Error('Hold time must be 1..55000 ms')
    await delay(holdMs)
    return { status: 'ready-and-closed', pid, mode }
  })
  console.log(JSON.stringify(result))
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
