import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

// 开发者工具把项目当前用于编译的配置和最近一次代码质量结果写进 User Data 下的项目状态 JSON（as of 2.02.2609231）。
// 目录名是 md5(<安装目录>\resources\app.asar)；更早的版本用 md5(<安装目录>)。
export function userDataDirs(ide, localAppData = process.env.LOCALAPPDATA || '') {
  const root = path.join(localAppData, '微信开发者工具', 'User Data')
  return [path.win32.resolve(ide, 'resources', 'app.asar'), path.win32.resolve(ide)]
    .map(source => path.join(root, createHash('md5').update(source).digest('hex'), 'WeappLocalData'))
}

export function findProjectState(dataDirs, projectRoot) {
  const wanted = path.win32.resolve(projectRoot).toLowerCase()
  for (const dir of dataDirs.filter(existsSync)) {
    for (const name of readdirSync(dir).filter(name => /^localstorage_[0-9a-f]+\.json$/.test(name))) {
      const file = path.join(dir, name)
      const text = readFileSync(file, 'utf8')
      if (!text.includes('"projectpath"')) continue
      let state
      try { state = JSON.parse(text) } catch { continue } // 其他项目的状态文件可能正被写入
      if (typeof state.projectpath === 'string' && path.win32.resolve(state.projectpath).toLowerCase() === wanted) return { file, state }
    }
  }
  return null
}

// 文件监听器只在打开项目时读 watchOptions.ignore，它实际用的列表只出现在 IDE 日志的 `new FileUtils instance` 块里。
export function watcherIgnoreFromLog(logText, projectpath) {
  const at = logText.lastIndexOf(`new FileUtils instance dirpath = ${projectpath} {`)
  if (at === -1) return null
  const open = logText.indexOf('ignore: [', at)
  const close = open === -1 ? -1 : logText.indexOf(']', open)
  return close === -1 ? null : [...logText.slice(open, close).matchAll(/'([^']*)'/g)].map(match => match[1])
}

export function findWatcherIgnore(logsDir, projectpath) {
  if (!existsSync(logsDir)) return null
  const logs = readdirSync(logsDir).filter(name => name.endsWith('.log')).map(name => path.join(logsDir, name))
  for (const file of logs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)) {
    const list = watcherIgnoreFromLog(readFileSync(file, 'utf8'), projectpath)
    if (list) return list
  }
  return null
}

const ruleKey = rule => (typeof rule === 'string' ? rule : `${rule.type}:${rule.value}`)

function diffRules(name, loaded = [], onDisk = []) {
  const inIde = new Set(loaded.map(ruleKey))
  const inFile = new Set(onDisk.map(ruleKey))
  const missing = [...inFile].filter(key => !inIde.has(key))
  const extra = [...inIde].filter(key => !inFile.has(key))
  return missing.length || extra.length ? { name, missing, extra } : null
}

// 列出开发者工具已加载、但与磁盘上 project.config.json 不一致的列表；watcherIgnore 为 null 时不比对 watchOptions。
export function staleConfig(state, watcherIgnore, config) {
  return [
    diffRules('packOptions.ignore', state.packOptions?.ignore, config.packOptions?.ignore),
    diffRules('packOptions.include', state.packOptions?.include, config.packOptions?.include),
    watcherIgnore && diffRules('watchOptions.ignore', watcherIgnore, config.watchOptions?.ignore),
  ].filter(Boolean)
}

export function summarizeQuality(codeQuality) {
  if (!codeQuality?.lastScanTime || !Array.isArray(codeQuality.result)) return null
  return {
    scannedAt: new Date(codeQuality.lastScanTime),
    total: codeQuality.result.length,
    failed: codeQuality.result.filter(item => item.success === false).map(item => item.text || item.name),
    mainPackageBytes: codeQuality.result.find(item => item.name === 'PACKAGE_SIZE_LIMIT')?.detail?.__APP__?.size,
  }
}

// 模拟器把基础库生命周期日志写在 profile 下的 WeappSimulator/WeappFileSystem/<微信用户>/<appid>/usr/miniprogramLog/log1..log5，
// 每 3 秒落盘一次（as of 基础库 3.18.0）。登录过几个微信号就有几个用户目录，最近写入的属于当前实例。
// 返回按写入先后拼接的日志文本，找不到时为空串；用户目录名是账号标识，不往外返回路径。
export function readLifecycleLog(dataDirs, appid) {
  let newest = []
  for (const fsRoot of dataDirs.map(dir => path.join(path.dirname(dir), 'WeappSimulator', 'WeappFileSystem')).filter(existsSync)) {
    for (const user of readdirSync(fsRoot)) {
      const dir = path.join(fsRoot, user, appid, 'usr', 'miniprogramLog')
      if (!existsSync(dir)) continue
      const files = readdirSync(dir).filter(name => /^log\d$/.test(name))
        .map(name => ({ file: path.join(dir, name), mtimeMs: statSync(path.join(dir, name)).mtimeMs }))
        .sort((a, b) => a.mtimeMs - b.mtimeMs)
      if (files.length && (!newest.length || files.at(-1).mtimeMs > newest.at(-1).mtimeMs)) newest = files
    }
  }
  return newest.map(entry => readFileSync(entry.file, 'utf8')).join('\n')
}

// 行形如 `2026-11-7 21:0:32 [log] page pages/bind/bind onLoad have been invoked`，月日时分秒都不补零。
// 每次 App onLaunch 配上它之后、下一次 onLaunch 之前的第一条页面 onLoad；page 为 null 表示这次启动没加载页面。
export function appLaunches(logText) {
  const launches = []
  for (const line of logText.split(/\r?\n/)) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{1,2}):(\d{1,2}) \[\w+\] (.*)$/.exec(line.trim())
    if (!match) continue
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number)
    if (match[7] === 'App onLaunch have been invoked') launches.push({ at: new Date(year, month - 1, day, hour, minute, second), page: null })
    const page = /^page (\S+) onLoad have been invoked$/.exec(match[7])
    if (page && launches.length && !launches.at(-1).page) launches.at(-1).page = page[1]
  }
  return launches
}
