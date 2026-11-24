const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadModule() {
  return import(pathToFileURL(path.join(__dirname, 'tools', 'runtimeProbe.mjs')).href)
}

function project(t, initialText) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minmin-runtime-probe-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'utils'), { recursive: true })
  const config = path.join(root, 'project.private.config.json')
  fs.writeFileSync(config, initialText)
  return { root, config, proof: path.join(root, '.scratch', 'runtime-probe.json') }
}

test('runtime probe prepare disables unused-file filtering and clean restores only that setting', async t => {
  const { root, config, proof } = project(t, '{\n  "setting": { "ignoreDevUnusedFiles": true, "urlCheck": true }\n}\n')
  const { runtimeProbeCommand } = await loadModule()
  const prepared = runtimeProbeCommand('prepare', proof, root)
  assert.equal(prepared.privateConfigRestore.ignoreDevUnusedFiles, true)
  let current = JSON.parse(fs.readFileSync(config, 'utf8'))
  assert.equal(current.setting.ignoreDevUnusedFiles, false)
  assert.equal(current.setting.urlCheck, true)
  assert.ok(fs.existsSync(path.join(root, 'utils', '__captureProbe.js')))

  current.setting.urlCheck = false
  fs.writeFileSync(config, JSON.stringify(current, null, 2) + '\n')
  const cleaned = runtimeProbeCommand('clean', proof, root)
  assert.equal(cleaned.privateConfigRestored, true)
  current = JSON.parse(fs.readFileSync(config, 'utf8'))
  assert.equal(current.setting.ignoreDevUnusedFiles, true)
  assert.equal(current.setting.urlCheck, false, 'unrelated private changes made during the probe survive cleanup')
  assert.equal(fs.existsSync(proof), false)
  assert.equal(fs.existsSync(path.join(root, 'utils', '__captureProbe.js')), false)
})

test('runtime probe leaves an already-unfiltered private config byte-for-byte unchanged', async t => {
  const original = '{\n  "setting": { "ignoreDevUnusedFiles": false, "urlCheck": true }\n}\n'
  const { root, config, proof } = project(t, original)
  const { runtimeProbeCommand } = await loadModule()
  const prepared = runtimeProbeCommand('prepare', proof, root)
  assert.equal(prepared.privateConfigRestore, null)
  assert.equal(fs.readFileSync(config, 'utf8'), original)
  const cleaned = runtimeProbeCommand('clean', proof, root)
  assert.equal(cleaned.privateConfigRestored, false)
  assert.equal(fs.readFileSync(config, 'utf8'), original)
})

test('a failed prepare never changes private config when a probe already exists', async t => {
  const original = '{"setting":{"ignoreDevUnusedFiles":true}}\n'
  const { root, config, proof } = project(t, original)
  fs.writeFileSync(path.join(root, 'utils', '__captureProbe.js'), 'module.exports = {}')
  const { runtimeProbeCommand } = await loadModule()
  assert.throws(() => runtimeProbeCommand('prepare', proof, root), /EEXIST/)
  assert.equal(fs.readFileSync(config, 'utf8'), original)
  assert.equal(fs.existsSync(proof), false)
})
