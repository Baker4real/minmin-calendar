const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const repo = path.resolve(__dirname, '..')
const cli = path.join(repo, 'tests', 'impeccableDetect.mjs')
const stub = path.join(repo, 'tests', 'fixtures', 'impeccable-detector-stub.mjs')

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'minmin-impeccable-detector-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return {
    dir,
    out: path.join(dir, 'shims'),
    capture: path.join(dir, 'calls.jsonl')
  }
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })
}

test('WXML targets are converted into explicit HTML coverage before detection', t => {
  const { out, capture } = fixture(t)
  const result = run([
    '--target', 'pages',
    '--launcher', stub,
    '--out', out
  ], { IMPECCABLE_STUB_CAPTURE: capture })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const report = JSON.parse(result.stdout)
  // 源 WXML 含 include 片段（pages/shared/aurora.wxml），shim 只按 app.json 的页面路由各生成一页
  const wxmlCount = fs.readdirSync(path.join(repo, 'pages'), { recursive: true }).filter(file => file.endsWith('.wxml')).length
  const routeCount = JSON.parse(fs.readFileSync(path.join(repo, 'app.json'), 'utf8')).pages.length
  assert.equal(report.coverage.scanKind, 'wxml-shim')
  assert.equal(report.coverage.sourceWxml, wxmlCount)
  assert.equal(report.coverage.generatedHtml, routeCount)
  assert.deepEqual(report.coverage.extensions, ['.wxml', '.wxss'])
  assert.equal(report.findings.count, 0)

  const calls = fs.readFileSync(capture, 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(calls, [['detect', '--json', out]])
  assert.equal(fs.readdirSync(out).filter(file => file.endsWith('.html')).length, routeCount)
})

test('a target without recognizable WXML fails closed instead of reporting a clean scan', t => {
  const { out, capture } = fixture(t)
  const result = run([
    '--target', 'app.json',
    '--launcher', stub,
    '--out', out
  ], { IMPECCABLE_STUB_CAPTURE: capture })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /no WXML markup/i)
  assert.equal(fs.existsSync(capture), false)
})

test('detector findings keep exit 2 and return a bounded rule summary', t => {
  const { out, capture } = fixture(t)
  const result = run([
    '--target', 'pages',
    '--launcher', stub,
    '--out', out
  ], { IMPECCABLE_STUB_CAPTURE: capture, IMPECCABLE_STUB_FINDINGS: '1' })

  assert.equal(result.status, 2, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.equal(report.findings.count, 2)
  assert.deepEqual(report.findings.byRule, { 'dark-glow': 1, 'side-tab': 1 })
  assert.equal(report.findings.file, path.join(out, 'findings.json'))
  const saved = JSON.parse(fs.readFileSync(report.findings.file, 'utf8'))
  assert.equal(saved.length, 2)
})

test('Windows cmd launchers preserve detector arguments', { skip: process.platform !== 'win32' }, t => {
  const { out, capture } = fixture(t)
  const launcher = path.join(repo, 'tests', 'fixtures', 'impeccable-detector-stub.cmd')
  const result = run([
    '--target', 'pages',
    '--launcher', launcher,
    '--out', out
  ], { IMPECCABLE_STUB_CAPTURE: capture })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const calls = fs.readFileSync(capture, 'utf8').trim().split('\n').map(JSON.parse)
  assert.deepEqual(calls, [['detect', '--json', out]])
})
