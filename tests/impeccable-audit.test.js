const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const repo = path.resolve(__dirname, '..')
const cli = path.join(repo, 'tests', 'impeccableAudit.mjs')
let modulePromise

function loadModule() {
  modulePromise ||= import(pathToFileURL(cli).href)
  return modulePromise
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: repo, encoding: 'utf8' })
}

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minmin-impeccable-audit-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  for (const directory of ['pages/index', 'pages/bind', 'pages/settings', 'pages/period/edit', 'pages/memory/edit', 'tests', 'utils', 'docs']) {
    fs.mkdirSync(path.join(root, directory), { recursive: true })
  }
  fs.writeFileSync(path.join(root, 'DESIGN.md'), [
    '## Colors',
    '',
    'Use the rose token for the compact 今天 capsule and preserve the aurora atmosphere.'
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'docs/motion-and-interaction.md'), [
    '## Motion',
    '',
    'Keep pageEnter on --duration-enter and provide a prefers-reduced-motion alternative.'
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'app.wxss'), [
    '.page { animation: pageEnter 240ms ease both; }',
    '@keyframes pageEnter { from { opacity: 0; } }',
    '.day-cell.today { color: var(--rose); }'
  ].join('\n'))
  fs.writeFileSync(path.join(root, 'pages/index/index.wxml'), '<view class="day-cell today"><text class="day-num">7</text></view>')
  fs.writeFileSync(path.join(root, 'pages/index/index.wxss'), '.day-cell { transition: transform 160ms ease; }')
  fs.writeFileSync(path.join(root, 'pages/index/index.js'), 'Page({})')
  fs.writeFileSync(path.join(root, 'tests/calendar-display.test.js'), '// .day-cell.today')
  for (const file of ['pages/bind/bind.wxss', 'pages/settings/settings.wxss', 'pages/period/period.wxss', 'pages/period/edit/edit.wxss', 'pages/memory/memory.wxss', 'pages/memory/edit/edit.wxss']) {
    fs.writeFileSync(path.join(root, file), '')
  }
  for (const file of ['app.js', 'app.json']) fs.writeFileSync(path.join(root, file), '')
  return root
}

test('calendar summary selects bounded design, source, motion and test evidence', async t => {
  const root = project(t)
  const { buildAuditSummary } = await loadModule()
  const summary = buildAuditSummary({ projectPath: root, component: 'calendar' })

  assert.equal(summary.component, 'calendar')
  assert.equal(summary.designSections[0].heading, 'Colors')
  assert.ok(summary.designSections[0].matches[0].excerpt.length < 500)
  assert.equal(summary.componentStatus.find(item => item.selector === 'today').status, 'statically-referenced')
  assert.equal(summary.componentStatus.find(item => item.selector === 'period-band').status, 'not-found-in-selected-sources')
  assert.deepEqual(summary.motion.map(item => item.type), ['transition'])
  assert.deepEqual(summary.tests.map(item => item.file), ['tests/calendar-display.test.js'])
  assert.equal(summary.evidence.status, 'not-captured')
})

test('past eight matching sections, the summary keeps the ones matching the most terms, in document order', async t => {
  const root = project(t)
  // 只用本文件已有的两个日历关键词，免得这个测试文件自己挤进真实仓库日历摘要的相关测试
  const passingMentions = Array.from({ length: 9 }, (_, index) => [`## Note ${index + 1}`, '', 'A passing mention of 今天.', ''])
  fs.writeFileSync(path.join(root, 'DESIGN.md'), [
    ...passingMentions.flat(),
    '## 日历格状态',
    '',
    '今天 is drawn by .day-cell.today.'
  ].join('\n'))
  const { buildAuditSummary } = await loadModule()
  const headings = buildAuditSummary({ projectPath: root, component: 'calendar' }).designSections.map(section => section.heading)

  assert.deepEqual(headings, ['Note 1', 'Note 2', 'Note 3', 'Note 4', 'Note 5', 'Note 6', 'Note 7', '日历格状态'])
})

test('capture summaries classify current, stale and historical evidence without trusting file names', async t => {
  const root = project(t)
  const { buildAuditSummary } = await loadModule()
  const { fingerprintRuntimeSources } = await import(pathToFileURL(path.join(repo, 'tests/tools/captureEvidence.mjs')).href)
  const capture = path.join(root, 'captures.jsonl')
  const current = fingerprintRuntimeSources(root).fingerprint
  const records = [
    { file: 'current.png', route: 'pages/index/index:calendar', state: 'home', source: { fingerprint: current } },
    { file: 'stale.png', route: 'pages/index/index', state: 'home', source: { fingerprint: '0'.repeat(64) } },
    { file: 'legacy.png', route: 'pages/index/index', state: 'home' },
    { file: 'other.png', route: 'pages/settings/settings', state: 'settings', source: { fingerprint: current } }
  ]
  fs.writeFileSync(capture, records.map(record => JSON.stringify(record)).join('\n'))
  const summary = buildAuditSummary({ projectPath: root, component: 'calendar', captureFile: capture })

  assert.deepEqual(summary.evidence.counts, { current: 1, stale: 1, 'historical-unbound': 1 })
  assert.equal(summary.evidence.entries.length, 3)
  assert.equal(summary.evidence.entries[0].classification, 'current')
  assert.equal(summary.evidence.entries[2].classification, 'historical-unbound')
})

test('motion summary includes related keyframes and inline declarations across every component', async t => {
  const root = project(t)
  const { buildAuditSummary, listAuditComponents } = await loadModule()
  const motion = buildAuditSummary({ projectPath: root, component: 'motion' })
  // 动效规则从 DESIGN.md 下沉到了 docs/motion-and-interaction.md，摘要要从那里取段落
  assert.ok(motion.designSections.some(section => section.file === 'docs/motion-and-interaction.md' && section.heading === 'Motion'))
  assert.ok(motion.motion.some(item => item.type === 'keyframes' && item.selector === '@keyframes pageEnter'))
  assert.ok(motion.motion.some(item => item.type === 'animation' && item.selector === '.page'))

  for (const { id } of listAuditComponents()) {
    const summary = buildAuditSummary({ projectPath: root, component: id })
    assert.equal(summary.component, id)
    assert.equal(summary.evidence.currentFingerprint.length, 64)
  }
})

test('component CLI fails closed on unknown components, missing sources and malformed captures', async t => {
  const root = project(t)
  const unknown = run(['--project', root, '--component', 'not-a-component'])
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /Unknown component/)

  fs.rmSync(path.join(root, 'pages/index/index.wxss'))
  const missing = run(['--project', root, '--component', 'calendar'])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Audit source missing: pages\/index\/index.wxss/)

  const restored = project(t)
  const capture = path.join(restored, 'captures.jsonl')
  fs.writeFileSync(capture, '{not-json}\n')
  const malformed = run(['--project', restored, '--component', 'calendar', '--captures', capture])
  assert.equal(malformed.status, 1)
  assert.match(malformed.stderr, /Invalid capture evidence at .*captures.jsonl:1/)
})

test('real repository exposes component choices and a machine-readable calendar summary', () => {
  const list = run(['--list-components'])
  assert.equal(list.status, 0, list.stderr)
  assert.deepEqual(JSON.parse(list.stdout).components.map(item => item.id), ['calendar', 'atmosphere', 'typography', 'sheets', 'feedback', 'motion'])

  const result = run(['--component', 'calendar'])
  assert.equal(result.status, 0, result.stderr)
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.component, 'calendar')
  assert.ok(summary.designSections.some(section => section.heading.includes('日历格状态')))
  assert.ok(summary.componentStatus.some(item => item.selector === 'today' && item.evidence.length))
  // 只核对相关测试的结构，不点名文件：测试迁移、合并或新增都会改变谁排进前几名
  assert.ok(summary.tests.length > 0)
  for (const item of summary.tests) {
    assert.match(item.file, /^tests\/[^/]+\.test\.js$/)
    assert.ok(fs.existsSync(path.join(repo, item.file)), item.file)
    assert.ok(item.matchedTerms.length > 0, item.file)
  }
  const termCounts = summary.tests.map(item => item.matchedTerms.length)
  assert.deepEqual(termCounts, [...termCounts].sort((a, b) => b - a))
  assert.ok(summary.evidence.currentFingerprint)
})
