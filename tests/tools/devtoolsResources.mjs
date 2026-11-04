import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findProjectState, userDataDirs } from './devtoolsState.mjs'
import { defaultIde } from './devtoolsCli.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const resources = ['WAServiceMainContext.js', 'WAAutoService.js', 'WAWebview.js']

export function contextFromLog(text, project) {
  let context = null, projectSeen = false
  const wanted = path.win32.resolve(project).toLowerCase()
  for (const line of text.split(/\r?\n/)) {
    const ready = line.match(/\[rt:[^,]+,win:(\w+)\].*project ready, projectpath=(.+)$/)
    if (ready) {
      if (path.win32.resolve(ready[2].trim()).toLowerCase() === wanted) { context = { winId: ready[1] }; projectSeen = true }
      else if (context?.winId === ready[1]) context = null
    }
    const address = line.match(/\[rt:[^,]+,win:(\w+)\].*AppCreated.*baseUrl: 'http:\/\/127\.0\.0\.1:(\d+)\/native\/(\w+)'/)
    if (context && address?.[1] === context.winId) context = { ...context, port: Number(address[2]), sid: address[3] }
  }
  return context?.port ? context : projectSeen ? { incomplete: true } : null
}

export function discoverContext(ide, project, dataDirs = userDataDirs(ide)) {
  const found = findProjectState(dataDirs, project)
  if (!found) return null
  const logsDir = path.join(path.dirname(found.file), '..', 'WeappLog', 'logs')
  if (!existsSync(logsDir)) return null
  const files = readdirSync(logsDir).filter(name => name.endsWith('.log')).map(name => path.join(logsDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).slice(0, 12)
  for (const file of files) {
    const context = contextFromLog(readFileSync(file, 'utf8'), project)
    if (context?.incomplete) return null
    if (context) return { ...context, source: path.basename(file) }
  }
  return null
}

export function classifyResource(status, sample, bytes, contentType = '') {
  if (/\[formatBackedProject\] no winId|no winId|cant find runtimeid by projectpath/i.test(sample)) return 'invalid-request'
  if (/config missing or md5 empty|not found in vendor contents map|does not exists online/i.test(sample)) return 'library-missing'
  if (status === 200 && bytes > 0 && /(?:javascript|ecmascript)/i.test(contentType)) return 'resource-ok'
  return 'unclassified-response'
}

export async function probeResources(context, version, { timeoutMs = 5000 } = {}) {
  if (!context || typeof context.winId !== 'string' || typeof context.sid !== 'string' || !/^\w+$/.test(context.winId) || !/^\w+$/.test(context.sid) || !Number.isInteger(context.port) || context.port < 1 || context.port > 65535) throw new Error('Resource request needs port, winId and sid from project context')
  if (typeof version !== 'string' || !version.trim()) throw new Error('Configured library version missing')
  const results = []
  for (const resource of resources) {
    const url = new URL(`http://127.0.0.1:${context.port}/__dev__/${resource}`)
    url.search = new URLSearchParams({ t: 'wechat', v: version, winId: context.winId, sid: context.sid }).toString()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
      let bytes = 0, sample = ''
      for await (const chunk of response.body) {
        bytes += chunk.length
        if (sample.length < 8192) sample += Buffer.from(chunk).toString('utf8').slice(0, 8192 - sample.length)
      }
      results.push({ resource, status: classifyResource(response.status, sample, bytes, response.headers.get('content-type') || ''), httpStatus: response.status, bytes })
    } catch (error) {
      results.push({ resource, status: error.name === 'TimeoutError' ? 'timeout' : 'unreachable' })
    }
  }
  return results
}

export async function diagnoseResources({ ide = defaultIde, project = root } = {}) {
  const context = discoverContext(ide, project)
  if (!context) return { status: 'context-unavailable', results: [] }
  const config = JSON.parse(readFileSync(path.join(project, 'project.config.json'), 'utf8'))
  const privateFile = path.join(project, 'project.private.config.json')
  const privateConfig = existsSync(privateFile) ? JSON.parse(readFileSync(privateFile, 'utf8')) : {}
  const version = privateConfig.libVersion || config.libVersion
  const results = await probeResources(context, version)
  return { status: results.every(result => result.status === 'resource-ok') ? 'resource-ok' : 'failed', context, version, results }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  diagnoseResources().then(result => { console.log(JSON.stringify(result, null, 2)); process.exitCode = result.status === 'resource-ok' ? 0 : 1 })
    .catch(error => { console.error(error.message); process.exitCode = 1 })
}
