// 把开发者工具的 IDE 日志收成一条时间线：编译、逻辑层（appservice）重载与启动、页面 webview 的创建和销毁、
// 调试面板加载，以及除已知噪音外的 WARN/ERROR。排查「重载后页面没了」这类问题时先看这些事件的先后。只读，输出脱敏。
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findProjectState, userDataDirs } from './devtoolsState.mjs'
import { createRedactor } from './mcpTransport.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const USAGE = 'Usage: devtoolsTimeline.mjs [--from HH:MM[:SS]] [--to HH:MM[:SS]] [--log file] [--ide directory]\nTimes without a date are today; a date is written 2026-11-07T20:27. Default: the last 10 minutes.'

// INFO 级只收这些事件（as of 开发者工具 2.02.2609250）。
const EVENTS = [
  '[SimulatorService] simulator app compile',
  '[appservice] restart appservice compile',
  '[appservice] appservice reload',
  '[appservice] simulator launch success',
  "webview created { name: 'WEBVIEW_PAGEFRAME|",
  "webview destroyed { name: 'WEBVIEW_PAGEFRAME|",
  '[devtools] webview loaded',
  '[devtools] webview page ready',
]
// 每次启动、编译或关窗都会出现、与排查无关的 WARN/ERROR；关窗只留 close-requested 一行。
const NOISE = /markDevLaunchEnv timingData not found|\[Fileutils\]|\[ideplugin\]|\[IdePluginManager\]|already registered|updateSimulatorCompileOptions: simulator not found|\[BackendInitEnv\] HELLO|\[backendManager\] received BACKEND_|SimulatorNativeAppMainService created|\[installSettingsBridges\] skipped|emitter is not found onVendorConfigChange|\[win-close-trace\] (?!close-requested)/
const RECORD = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2})\]\[(\w+)\]/

export function timelineEvents(logText, { from = -Infinity, to = Infinity } = {}) {
  const redact = createRedactor()
  const events = []
  for (const line of logText.split(/\r?\n/)) {
    const record = RECORD.exec(line)
    if (!record) continue // 多行记录的续行
    const at = new Date(`${record[1]}T${record[2]}`)
    const level = record[3]
    if (at < from || at > to || (level === 'INFO' ? !EVENTS.some(event => line.includes(event)) : NOISE.test(line))) continue
    // 正文在 [rt:N,win:sN] 之后；没有这个前缀的行，正文在 [时间][级别][版本][进程][调用方] 之后。
    const message = /\[rt:\d+,win:[^\]]*\]\s*(.*)$/.exec(line)?.[1] ?? line.replace(/^(\[[^\]]*\]){5}\s*/, '')
    events.push({ at, level, message: redact(message).replace(/\bo[\w-]{27}\b/g, '[openid]') })
  }
  return events
}

// 只给到分钟的 --to 包含这一整分钟，给到秒的包含这一整秒。
export function parseTime(value, { end = false, now = new Date() } = {}) {
  const match = /^(?:(\d{4})-(\d{2})-(\d{2})T)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new Error(`Use HH:MM[:SS] or YYYY-MM-DDTHH:MM[:SS], got ${value}\n${USAGE}`)
  const [year, month, day] = match[1] ? [+match[1], match[2] - 1, +match[3]] : [now.getFullYear(), now.getMonth(), now.getDate()]
  const at = new Date(year, month, day, +match[4], +match[5], +(match[6] ?? 0))
  return end ? new Date(at.getTime() + (match[6] === undefined ? 59999 : 999)) : at
}

function main() {
  const options = { ide: 'D:/Program Files (x86)/Tencent/微信web开发者工具' }
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].slice(2)
    if (!['from', 'to', 'log', 'ide'].includes(key) || !process.argv[i + 1]) throw new Error(USAGE)
    options[key] = process.argv[i + 1]
  }
  const to = options.to ? parseTime(options.to, { end: true }) : new Date()
  const from = options.from ? parseTime(options.from) : new Date(to.getTime() - 10 * 60000)
  let files = options.log ? [options.log] : null
  if (!files) {
    const found = findProjectState(userDataDirs(options.ide), root)
    if (!found) throw new Error('No project state under DevTools User Data; open the project in DevTools first, or pass --log <file>')
    const logsDir = path.join(path.dirname(found.file), '..', 'WeappLog', 'logs')
    // 一个日志文件对应开发者工具的一次运行；最后写入早于窗口的文件里不会有窗口内的事件。
    files = readdirSync(logsDir).filter(name => name.endsWith('.log')).map(name => path.join(logsDir, name))
      .filter(file => statSync(file).mtimeMs >= from.getTime())
  }
  const events = files.flatMap(file => timelineEvents(readFileSync(file, 'utf8'), { from, to })).sort((a, b) => a.at - b.at)
  console.log(`${events.length} events in ${files.length} log file(s) from ${from.toLocaleString('sv-SE')} to ${to.toLocaleString('sv-SE')}`)
  for (const { at, level, message } of events) {
    console.log(`${at.toLocaleTimeString('sv-SE')}.${String(at.getMilliseconds()).padStart(3, '0')} ${level.padEnd(5)} ${message.slice(0, 200)}`)
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(error.message); process.exitCode = 1 }
}
