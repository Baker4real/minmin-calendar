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
