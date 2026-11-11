const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { installDependencies, checkDependencies, buildReport } = require('./tools/dependencyTools.cjs')

function fixture(t, lock) {
  const scratch = path.join(__dirname, '..', '.scratch')
  fs.mkdirSync(scratch, { recursive: true })
  const root = fs.mkdtempSync(path.join(scratch, 'dependencies-test-'))
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function command(stdout, stderr = '', status = 0, error) {
  return (_executable, _args, options) => {
    fs.writeSync(options.stdio[1], stdout)
    fs.writeSync(options.stdio[2], stderr)
    return { status, error }
  }
}

const cleanLock = { name: 'fixture', lockfileVersion: 3, packages: { '': { devDependencies: { tool: '1.0.0' } }, 'node_modules/tool': { version: '1.0.0' } } }
const cleanAudit = { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } }
const options = { npmCli: __filename }

test('fresh dependency installation rejects warnings even when npm exits successfully', t => {
  const root = fixture(t, cleanLock)
  const result = installDependencies(root, { ...options, spawnSync: command('found 0 vulnerabilities', 'npm warn deprecated phin@3.7.1: unsupported') })
  assert.equal(result.status, 'failed')
  assert.equal(result.warningCount, 1)
  assert.match(fs.readFileSync(result.logs.stderr, 'utf8'), /phin/)
})

test('clean install preserves its lock and rejects blocked install scripts or lock drift', t => {
  const root = fixture(t, cleanLock)
  assert.equal(installDependencies(root, { ...options, spawnSync: command('found 0 vulnerabilities') }).status, 'passed')
  assert.equal(installDependencies(root, { ...options, spawnSync: command('', 'npm warn install-scripts blocked because not covered by allowScripts') }).status, 'failed')
  const result = installDependencies(root, { ...options, spawnSync: (...args) => {
    fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ ...cleanLock, unexpected: true }))
    return command('installed')(...args)
  } })
  assert.equal(result.status, 'failed')
  assert.match(result.summary, /lock/i)
})

test('dependency audit distinguishes known vulnerabilities from transport or malformed reports', t => {
  const root = fixture(t, cleanLock)
  assert.equal(checkDependencies(root, { ...options, spawnSync: command(JSON.stringify(cleanAudit)) }).status, 'passed')
  const vulnerable = { ...cleanAudit, vulnerabilities: { tool: { name: 'tool', severity: 'high', via: [] } }, metadata: { vulnerabilities: { total: 1 } } }
  assert.equal(checkDependencies(root, { ...options, spawnSync: command(JSON.stringify(vulnerable), '', 1) }).status, 'failed')
  assert.equal(checkDependencies(root, { ...options, spawnSync: command('{"error":{"code":"ENETUNREACH"}}', '', 1) }).status, 'error')
  assert.equal(checkDependencies(root, { ...options, spawnSync: command('<network error>', '', 1) }).status, 'error')
  assert.equal(checkDependencies(root, { ...options, spawnSync: command('', '', null, new Error('timed out')) }).status, 'error')
})

test('a deprecated locked package fails the gate even with a zero-vulnerability audit', t => {
  const lock = structuredClone(cleanLock)
  lock.packages['node_modules/tool'].deprecated = 'unsupported'
  const root = fixture(t, lock)
  const result = checkDependencies(root, { ...options, spawnSync: command(JSON.stringify(cleanAudit)) })
  assert.equal(result.status, 'failed')
  assert.equal(result.deprecatedCount, 1)
})

test('dependency projection deduplicates cycles and identifies shortest paths and direct impact', () => {
  const lock = { packages: {
    '': { devDependencies: { automator: '1', other: '1' } },
    'node_modules/automator': { version: '1', dependencies: { jimp: '1' } },
    'node_modules/other': { version: '1', dependencies: { jimp: '1' } },
    'node_modules/jimp': { version: '1', dependencies: { phin: '1', other: '1' } },
    'node_modules/phin': { version: '1', deprecated: 'unsupported' }
  } }
  const report = buildReport({ lock, audit: cleanAudit, names: ['phin'] })
  assert.equal(report.rows.length, 1)
  assert.deepEqual(report.rows[0].chain, ['automator@1', 'jimp@1', 'phin@1'])
  assert.deepEqual(report.rows[0].directDependents, ['automator', 'other'])
  assert.equal(report.rows[0].deprecated, 'unsupported')
})

test('dependency advisories apply only to the installed locations listed by npm audit', () => {
  const lock = { packages: {
    '': { devDependencies: { a: '1', b: '1' } },
    'node_modules/a': { version: '1', dependencies: { dep: '2' } },
    'node_modules/b': { version: '1', dependencies: { dep: '1' } },
    'node_modules/dep': { version: '2', dependencies: {} },
    'node_modules/b/node_modules/dep': { version: '1', dependencies: {} }
  } }
  const audit = { ...cleanAudit, metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {
    dep: { name: 'dep', severity: 'high', nodes: ['node_modules/b/node_modules/dep'], via: ['advisory'] }
  } }
  const issues = buildReport({ lock, audit })
  assert.equal(issues.rows.length, 1)
  assert.equal(issues.rows[0].version, '1')
  assert.deepEqual(issues.rows[0].directDependents, ['b'])
  const explicit = buildReport({ lock, audit, names: ['dep'] })
  assert.equal(explicit.rows.find(row => row.version === '2').severity, null)
})

test('dependency projection follows local file links and caps its complete serialized output', () => {
  const lock = { packages: {
    '': { devDependencies: { jimp: 'file:tests/tools/image' } },
    'node_modules/jimp': { resolved: 'tests/tools/image', link: true },
    'tests/tools/image': { name: '@minmin/image', version: '1', dependencies: {} }
  } }
  for (let i = 0; i < 200; i++) {
    const name = `image-plugin-${i}`
    lock.packages['tests/tools/image'].dependencies[name] = '1'
    lock.packages[`node_modules/${name}`] = { version: '1', deprecated: 'x'.repeat(300) }
  }
  const report = buildReport({ lock, audit: cleanAudit, maxBytes: 6000 })
  assert.ok(report.rows.length > 0)
  assert.ok(report.omittedRows > 0)
  assert.ok(Buffer.byteLength(JSON.stringify(report)) <= 6000)
  assert.equal(report.rows[0].chain[0], 'jimp@1')
  assert.deepEqual(report.rows[0].directDependents, ['jimp'])
})
