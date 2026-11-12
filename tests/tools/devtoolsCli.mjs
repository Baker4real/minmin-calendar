import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const defaultIde = 'D:/Program Files (x86)/Tencent/微信web开发者工具'
const root = fileURLToPath(new URL('../../', import.meta.url))
// Read-only cloud function queries. The official CLI also has deploy, inc-deploy and download; this entry never runs them.
const cloudReads = { 'cloud-list': 'list', 'cloud-info': 'info' }

export function cliArguments(command, project, port = 9420, { env, names } = {}) {
  const cloudRead = Object.hasOwn(cloudReads, command)
  if (!cloudRead && !['islogin', 'open', 'close', 'auto'].includes(command)) throw new Error('Command must be islogin, open, close, auto, cloud-list or cloud-info')
  if (command === 'islogin') return [command]
  if (typeof project !== 'string' || !/^(?:[A-Za-z]:[\\/]|\\\\)/.test(project)) throw new Error('Project must be an absolute Windows path')
  const projectArgs = ['--project', path.win32.normalize(project).replace(/[\\/]+$/, '')]
  if (cloudRead) {
    if (typeof env !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(env)) throw new Error('Cloud commands need --env <cloud environment id>')
    const args = ['cloud', 'functions', cloudReads[command], '--env', env]
    if (command === 'cloud-info') {
      if (!Array.isArray(names) || !names.length || !names.every(name => /^[A-Za-z][\w-]*$/.test(name))) throw new Error('cloud-info needs --names <function[,function]>')
      args.push('--names', ...names)
    }
    // The official CLI rejects a cloud query that names neither a project nor an appid.
    return [...args, ...projectArgs]
  }
  const args = [command, ...projectArgs]
  if (command === 'auto') {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid automator port')
    args.push('--auto-port', String(port), '--trust-project')
  }
  return args
}

// The official CLI exits 0 when a cloud query fails, so failure is read from its output. Progress lines are dropped.
// Its success symbol is ✔ off win32, under CI or with TERM=xterm-256color, and √ otherwise; a partial failure prints a warning symbol.
export function cloudAnswer(output) {
  const lines = output.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '').split(/\r?\n/)
  const start = lines.findIndex(line => line.startsWith('- query cloudfunctions'))
  const failed = !lines.some(line => /^[√✔] query cloudfunctions/.test(line))
  return { failed, text: lines.slice(start + 1).filter(line => !/^[-√✔] /.test(line)).join('\n').trim().slice(0, 2000) }
}

// Only the process started by this invocation and its children are stopped on timeout.
export function runBounded(executable, args, { timeoutMs = 10000, cwd, env, spawnProcess = spawn } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('Timeout must be 1..60000 ms')
  return new Promise(resolve => {
    let output = '', settled = false, timedOut = false
    const child = spawnProcess(executable, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ ...result, output })
    }
    const capture = chunk => { output = (output + chunk).slice(-16384) }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32' && child.pid) {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        killer.once('error', () => child.kill())
      } else child.kill('SIGKILL')
      finish({ status: 'timeout', exitCode: 124 })
    }, timeoutMs)
    child.once('error', () => finish({ status: 'spawn-error', exitCode: 1 }))
    child.once('close', code => finish({ status: timedOut ? 'timeout' : code === 0 ? 'ok' : 'failed', exitCode: timedOut ? 124 : code ?? 1 }))
  })
}

export async function runOfficialCli({ ide = defaultIde, command = 'islogin', project = root, port = 9420, timeoutMs = 10000, env, names } = {}) {
  const args = cliArguments(command, project, port, { env, names })
  const executable = path.join(ide, '微信开发者工具.exe')
  const entry = path.join(ide, 'resources/app.asar.unpacked/js/common/cli/index.js')
  if (!existsSync(executable) || !existsSync(entry)) throw new Error('Official CLI missing; specify --ide')
  const bootstrap = "const e=process.argv[1],a=process.argv.slice(2);process.argv=[process.execPath,'--ms-enable-electron-run-as-node',e,'--electron'].concat(a);require(e)"
  return runBounded(executable, ['-e', bootstrap, entry, ...args], {
    timeoutMs, cwd: ide, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', cwd: project },
  })
}

async function main() {
  const options = { command: process.argv[2] || 'islogin' }
  for (let i = 3; i < process.argv.length; i += 2) {
    const key = process.argv[i].slice(2)
    const value = process.argv[i + 1]
    if (!['ide', 'project', 'port', 'timeout', 'env', 'names'].includes(key) || !value) throw new Error('Options: --ide directory --project absolute-path --port number --timeout ms --env cloud-environment-id --names function,function')
    options[key === 'timeout' ? 'timeoutMs' : key] = ['port', 'timeout'].includes(key) ? Number(value) : key === 'names' ? value.split(',') : value
  }
  const result = await runOfficialCli(options)
  // Never print raw CLI output: login responses may contain account details.
  // The cloud queries are the exception: their answer is function metadata.
  const report = { command: options.command, status: result.status, exitCode: result.exitCode }
  if (Object.hasOwn(cloudReads, options.command) && result.status === 'ok') {
    const answer = cloudAnswer(result.output)
    if (answer.failed) Object.assign(report, { status: 'failed', exitCode: 1 })
    report.output = answer.text
  }
  console.log(JSON.stringify(report))
  process.exitCode = report.exitCode
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
