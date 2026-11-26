import { readFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { appLaunches, readLifecycleLog, userDataDirs } from './devtoolsState.mjs'

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

// The lifecycle log distinguishes a dead launch from a page that logged onLoad but never registered.
export function launchResult(launches, now = Date.now()) {
  const name = 'Latest app launch loaded a page'
  const latest = launches.at(-1)
  if (!latest) return { name, skipped: true, error: 'no App onLaunch in the simulator lifecycle log; compile the project in DevTools first' }
  const launched = latest.at.toLocaleString('sv-SE')
  if (latest.page && latest.pageCodeRan) return { name, ok: true, note: `${latest.page}, launched ${launched}` }
  if (latest.page) return { name, ok: false, error: `launched ${launched}: ${latest.page} logged onLoad but its page code never ran (no wx call before it), so the page failed to register, e.g. console "module '…' is not defined"; ask the maintainer to close and reopen the project in DevTools, then rerun` }
  if (now - latest.at.getTime() < 5000) return { name, skipped: true, error: `launched ${launched}, no page logged yet; the log is written every 3 s, rerun in a few seconds` }
  return { name, ok: false, error: `launched ${launched} without loading a page; click 编译 in DevTools, then rerun` }
}

export function launchLines(launches, count = 5) {
  return launches.slice(-count).map(launch => {
    const pages = launch.pages.filter((page, i) => page !== launch.pages[i - 1])
    const reached = pages.length ? pages.join(' > ') : 'no page loaded'
    return `${launch.at.toLocaleString('sv-SE')} ${reached}${pages.length && !launch.pageCodeRan ? ' (page code never ran)' : ''}`
  })
}

export function checkLatestLaunch(ide, projectPath) {
  const { appid } = JSON.parse(readFileSync(path.join(projectPath, 'project.config.json'), 'utf8'))
  const launches = appLaunches(readLifecycleLog(userDataDirs(ide), appid))
  return { result: launchResult(launches), launches }
}

export async function readAutoHealth(ide, projectPath, endpoint) {
  const health = { endpoint: {}, launch: null }
  try {
    await probeEndpoint(endpoint)
    health.endpoint = { ok: true }
  } catch (error) {
    health.endpoint = { ok: false, error: error.message }
  }
  health.launch = checkLatestLaunch(ide, projectPath).result
  return health
}
