const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadModule() {
  return import(pathToFileURL(path.join(__dirname, 'tools', 'captureEvidence.mjs')).href)
}

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minmin-capture-evidence-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'pages', 'index'), { recursive: true })
  fs.mkdirSync(path.join(root, 'utils'), { recursive: true })
  fs.writeFileSync(path.join(root, 'app.js'), 'App({})')
  fs.writeFileSync(path.join(root, 'app.json'), '{"pages":["pages/index/index"]}')
  fs.writeFileSync(path.join(root, 'app.wxss'), 'page {}')
  fs.writeFileSync(path.join(root, 'pages', 'index', 'index.wxml'), '<view>one</view>')
  fs.writeFileSync(path.join(root, 'utils', 'cycle.js'), 'module.exports = 1')
  return root
}

test('runtime source fingerprint follows app, pages and utils content only', async t => {
  const root = project(t)
  const { fingerprintRuntimeSources } = await loadModule()
  const first = fingerprintRuntimeSources(root)
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/)
  assert.equal(first.scope, 'app-pages-utils')

  fs.writeFileSync(path.join(root, 'README.md'), 'unrelated documentation')
  assert.equal(fingerprintRuntimeSources(root).fingerprint, first.fingerprint)
  fs.writeFileSync(path.join(root, 'pages', 'index', 'index.wxml'), '<view>two</view>')
  assert.notEqual(fingerprintRuntimeSources(root).fingerprint, first.fingerprint)
})

test('capture evidence binds state, density, viewport and source identity', async t => {
  const root = project(t)
  const { buildCaptureEvidence, classifyCaptureEvidence } = await loadModule()
  const evidence = buildCaptureEvidence({
    projectPath: root,
    file: 'home.png',
    route: 'pages/index/index',
    viewport: { width: 320, height: 568 },
    state: 'home:legend',
    density: 'compact',
    capturedAt: '2026-11-04T00:00:00.000Z'
  })

  assert.equal(evidence.captureToolVersion, 2)
  assert.equal(evidence.state, 'home:legend')
  assert.equal(evidence.density, 'compact')
  assert.deepEqual(evidence.viewport, { width: 320, height: 568 })
  assert.equal(classifyCaptureEvidence(evidence, evidence.source.fingerprint), 'runtime-unconfirmed')
  assert.equal(classifyCaptureEvidence(evidence, '0'.repeat(64)), 'stale')
})

test('a new compile challenge rejects an old loaded build and source drift', async t => {
  const root = project(t)
  const { prepareRuntimeProbe, confirmRuntimeProbe, removeRuntimeProbe, fingerprintRuntimeSources, buildCaptureEvidence, classifyCaptureEvidence } = await loadModule()
  const first = prepareRuntimeProbe(root)
  const load = require('node:module').createRequire(path.join(root, 'capture.cjs'))
  const firstLoaded = load('./utils/__captureProbe.js')
  removeRuntimeProbe(root, first)
  const second = prepareRuntimeProbe(root)
  assert.equal(load('./utils/__captureProbe.js'), firstLoaded, 'an old running loader still serves its cached build')
  assert.throws(() => confirmRuntimeProbe(root, second, load('./utils/__captureProbe.js')), /loaded build/)
  delete load.cache[load.resolve('./utils/__captureProbe.js')]
  const loaded = load('./utils/__captureProbe.js')
  const runtime = confirmRuntimeProbe(root, second, loaded)
  const evidence = buildCaptureEvidence({ projectPath: root, file: 'confirmed.png', runtime })
  assert.equal(classifyCaptureEvidence(evidence, fingerprintRuntimeSources(root).fingerprint), 'current')
  fs.writeFileSync(path.join(root, 'app.wxss'), 'page {color:red}')
  assert.throws(() => confirmRuntimeProbe(root, second, loaded), /source changed/)
  assert.equal(classifyCaptureEvidence(evidence, fingerprintRuntimeSources(root).fingerprint), 'stale')
  removeRuntimeProbe(root, second)
})

test('compile probe preparation never overwrites and cleanup refuses modified content', async t => {
  const root = project(t)
  const { prepareRuntimeProbe, removeRuntimeProbe } = await loadModule()
  const probe = prepareRuntimeProbe(root)
  assert.throws(() => prepareRuntimeProbe(root), /EEXIST/)
  fs.writeFileSync(path.join(root, probe.modulePath), 'module.exports = {changed:true}')
  assert.throws(() => removeRuntimeProbe(root, probe), /refusing cleanup/)
  assert.equal(fs.readFileSync(path.join(root, probe.modulePath), 'utf8'), 'module.exports = {changed:true}')
})

test('legacy screenshots without a source fingerprint are historical, not current', async t => {
  const { classifyCaptureEvidence } = await loadModule()
  const legacy = { file: 'old.png', route: 'pages/index/index', viewport: { width: 390, height: 844 } }
  assert.equal(classifyCaptureEvidence(legacy, '0'.repeat(64)), 'historical-unbound')
})
