const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const ide = 'D:/Program Files (x86)/Tencent/微信web开发者工具'

test('preflight finds the project state DevTools wrote and names the rules it has not loaded', async t => {
  const { userDataDirs, findProjectState, staleConfig } = await import('./tools/devtoolsState.mjs')
  const scratch = path.join(repoRoot, '.scratch', 'devtools-state-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const localAppData = fs.mkdtempSync(path.join(scratch, 'appdata-'))
  const [dataDir] = userDataDirs(ide, localAppData)
  const [other, demo] = ['localstorage_aa.json', 'localstorage_bb.json'].map(name => path.join(dataDir, name))
  // Remove exactly the files this test writes, then each emptied directory up to localAppData; no recursive delete.
  t.after(() => {
    for (const file of [other, demo]) fs.rmSync(file, { force: true })
    for (let dir = dataDir; dir.startsWith(localAppData); dir = path.dirname(dir)) if (fs.existsSync(dir)) fs.rmdirSync(dir)
  })
  const asarHash = crypto.createHash('md5').update('D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\resources\\app.asar').digest('hex')
  assert.equal(path.basename(path.dirname(dataDir)), asarHash)

  const loaded = { projectpath: 'D:\\agents\\projects\\demo', packOptions: { ignore: [{ value: 'tests', type: 'folder' }], include: [] } }
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(other, JSON.stringify({ ...loaded, projectpath: 'D:\\agents\\projects\\other' }))
  fs.writeFileSync(demo, JSON.stringify(loaded))
  const found = findProjectState(userDataDirs(ide, localAppData), 'd:/agents/projects/demo')
  assert.equal(path.basename(found.file), 'localstorage_bb.json')
  assert.equal(findProjectState(userDataDirs(ide, localAppData), 'D:\\agents\\projects\\missing'), null)

  const onDisk = { packOptions: { ignore: [{ value: 'tests', type: 'folder' }, { value: 'docs', type: 'folder' }], include: [] }, watchOptions: { ignore: ['.git', '.git/**/*'] } }
  assert.deepEqual(staleConfig(found.state, ['.git'], onDisk), [
    { name: 'packOptions.ignore', missing: ['folder:docs'], extra: [] },
    { name: 'watchOptions.ignore', missing: ['.git/**/*'], extra: [] },
  ])
  assert.deepEqual(staleConfig({ ...found.state, packOptions: onDisk.packOptions }, null, onDisk), [])
})

test('the watcher list comes from the last FileUtils block logged for the project', async () => {
  const { watcherIgnoreFromLog } = await import('./tools/devtoolsState.mjs')
  const block = (dir, items) => `[WARN] [Fileutils][#0] new FileUtils instance dirpath = ${dir} {\n  needReport: true,\n  ignore: [\n    ${items.map(item => `'${item}'`).join(',   ')}\n  ],\n  justWatcher: false\n}\n`
  const log = block('D:\\agents\\projects\\demo', ['.git']) + block('D:\\agents\\projects\\other', ['x']) + block('D:\\agents\\projects\\demo', ['.git', '.git/**/*'])
  assert.deepEqual(watcherIgnoreFromLog(log, 'D:\\agents\\projects\\demo'), ['.git', '.git/**/*'])
  assert.equal(watcherIgnoreFromLog(log, 'D:\\agents\\projects\\missing'), null)
})

test('the lifecycle log pairs each app launch with its first page, read from the most recently written simulator user', async t => {
  const { userDataDirs, readLifecycleLog, appLaunches } = await import('./tools/devtoolsState.mjs')
  const scratch = path.join(repoRoot, '.scratch', 'devtools-state-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const localAppData = fs.mkdtempSync(path.join(scratch, 'appdata-'))
  const [dataDir] = userDataDirs(ide, localAppData)
  const logDir = user => path.join(path.dirname(dataDir), 'WeappSimulator', 'WeappFileSystem', user, 'wxdemo', 'usr', 'miniprogramLog')
  const files = [
    [path.join(logDir('older-user'), 'log1'), '2026-11-7 9:0:0 [log] App onLaunch have been invoked\n2026-11-7 9:0:1 [log] page pages/stale/stale onLoad have been invoked\n', 1000],
    [path.join(logDir('live-user'), 'log2'), '2026-11-7 20:27:24 [log] App onLaunch have been invoked\n2026-11-7 20:27:24 [log] App onShow have been invoked\n', 3000],
    [path.join(logDir('live-user'), 'log1'), '2026-11-7 20:27:20 [log] App onLaunch have been invoked\n2026-11-7 20:27:21 [log] page pages/bind/bind onLoad have been invoked\n2026-11-7 20:27:21 [log] page pages/index/index onLoad have been invoked\n', 2000],
  ]
  // Remove exactly the files this test writes, then each directory it leaves empty up to localAppData; no recursive delete.
  t.after(() => {
    for (const [file] of files) fs.rmSync(file, { force: true })
    for (const [file] of files) {
      for (let dir = path.dirname(file); dir.startsWith(localAppData) && fs.existsSync(dir) && !fs.readdirSync(dir).length; dir = path.dirname(dir)) fs.rmdirSync(dir)
    }
  })
  for (const [file, text, mtime] of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
    fs.utimesSync(file, mtime, mtime)
  }

  assert.deepEqual(appLaunches(readLifecycleLog(userDataDirs(ide, localAppData), 'wxdemo')), [
    { at: new Date(2026, 10, 7, 20, 27, 20), page: 'pages/bind/bind' },
    { at: new Date(2026, 10, 7, 20, 27, 24), page: null },
  ])
  assert.equal(readLifecycleLog(userDataDirs(ide, localAppData), 'wxmissing'), '')
})

test('code quality summary lists failed items and the main package size', async () => {
  const { summarizeQuality } = await import('./tools/devtoolsState.mjs')
  const summary = summarizeQuality({
    lastScanTime: 1791644123921,
    result: [
      { name: 'PACKAGE_SIZE_LIMIT', text: '主包尺寸（不包含插件）应小于 1.5 M', success: false, detail: { __APP__: { size: 1975700 } } },
      { name: 'IMAGE_AND_AUDIO_LIMIT', text: '图片和音频资源大小应不超过 200 K', success: true },
    ],
  })
  assert.equal(summary.total, 2)
  assert.deepEqual(summary.failed, ['主包尺寸（不包含插件）应小于 1.5 M'])
  assert.equal(summary.mainPackageBytes, 1975700)
  assert.equal(summarizeQuality(undefined), null)
})
