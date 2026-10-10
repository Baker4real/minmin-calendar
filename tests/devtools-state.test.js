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
  t.after(() => fs.rmSync(localAppData, { recursive: true, force: true }))
  const [dataDir] = userDataDirs(ide, localAppData)
  const asarHash = crypto.createHash('md5').update('D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\resources\\app.asar').digest('hex')
  assert.equal(path.basename(path.dirname(dataDir)), asarHash)

  const loaded = { projectpath: 'D:\\agents\\projects\\demo', packOptions: { ignore: [{ value: 'tests', type: 'folder' }], include: [] } }
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'localstorage_aa.json'), JSON.stringify({ ...loaded, projectpath: 'D:\\agents\\projects\\other' }))
  fs.writeFileSync(path.join(dataDir, 'localstorage_bb.json'), JSON.stringify(loaded))
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
