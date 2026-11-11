const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')

const DEFAULT_ROOT = path.resolve(__dirname, '../..')
const WARNING = /\bnpm\s+warn\b|\bdeprecated\b|install scripts blocked|not covered by allowScripts/i
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
const lockFile = root => path.join(root, 'package-lock.json')
const fingerprint = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

function runNpm(root, args, options = {}) {
  const logDir = options.logDir || path.join(root, '.scratch', 'dependencies')
  fs.mkdirSync(logDir, { recursive: true })
  const stdoutPath = path.join(logDir, `${options.prefix || args[0]}.stdout.log`)
  const stderrPath = path.join(logDir, `${options.prefix || args[0]}.stderr.log`)
  const stdout = fs.openSync(stdoutPath, 'w')
  const stderr = fs.openSync(stderrPath, 'w')
  try {
    const npmCli = options.npmCli || process.env.npm_execpath
    if (!npmCli) {
      const error = 'npm CLI unavailable; start this command through npm run'
      fs.writeSync(stderr, error)
      return { status: null, error, stdoutPath, stderrPath }
    }
    const result = (options.spawnSync || spawnSync)(process.execPath, [npmCli, ...args], {
      cwd: root, env: process.env, stdio: ['ignore', stdout, stderr],
      timeout: options.timeoutMs || 180000, windowsHide: true
    })
    if (result.error) fs.writeSync(stderr, `${result.error.message}\n`)
    return { status: result.status, error: result.error ? result.error.message : null, stdoutPath, stderrPath }
  } catch (error) {
    fs.writeSync(stderr, `${error.message}\n`)
    return { status: null, error: error.message, stdoutPath, stderrPath }
  } finally {
    fs.closeSync(stdout)
    fs.closeSync(stderr)
  }
}

function deprecatedPackages(lock) {
  if (!lock.packages || !lock.packages['']) throw new Error('Expected a root npm lockfile with packages')
  return Object.entries(lock.packages).filter(([, value]) => value.deprecated).map(([location, value]) => ({ location, reason: value.deprecated }))
}

function installDependencies(root, options = {}) {
  let result
  try {
    const before = fingerprint(lockFile(root))
    result = runNpm(root, ['ci', '--include=dev'], { ...options, prefix: 'install' })
    const logs = { stdout: result.stdoutPath, stderr: result.stderrPath }
    if (result.error || result.status !== 0) return { status: 'error', summary: `npm ci did not complete successfully (exit ${result.status}); see install logs`, exitCode: result.status, warningCount: 0, logs }
    const warningCount = [logs.stdout, logs.stderr].flatMap(file => fs.readFileSync(file, 'utf8').split(/\r?\n/)).filter(line => WARNING.test(line)).length
    const drift = before !== fingerprint(lockFile(root))
    const deprecatedCount = deprecatedPackages(readJson(lockFile(root))).length
    const failed = warningCount > 0 || deprecatedCount > 0 || drift
    return {
      status: failed ? 'failed' : 'passed',
      summary: drift ? 'npm ci changed package-lock.json' : failed ? 'Dependency installation emitted warnings or contains deprecated packages' : 'Clean npm ci; no dependency warnings; lockfile unchanged',
      warningCount, deprecatedCount, logs
    }
  } catch (error) {
    return { status: 'error', summary: `Dependency installation could not be verified: ${error.message}`, warningCount: 0, logs: result ? { stdout: result.stdoutPath, stderr: result.stderrPath } : {} }
  }
}

function checkDependencies(root, options = {}) {
  let result
  try {
    const lock = readJson(lockFile(root))
    const deprecatedCount = deprecatedPackages(lock).length
    result = runNpm(root, ['audit', '--json', '--include=dev'], { ...options, prefix: 'audit' })
    const sources = { lock: lockFile(root), audit: result.stdoutPath, stderr: result.stderrPath }
    if (result.error) return { status: 'error', summary: 'npm audit could not start or timed out; see audit logs', deprecatedCount, sources }
    const audit = readJson(result.stdoutPath)
    const total = audit.metadata?.vulnerabilities?.total
    if (audit.error || !Number.isSafeInteger(total) || total < 0 || !audit.vulnerabilities || ![0, 1].includes(result.status) || (total === 0 && result.status !== 0)) {
      return { status: 'error', summary: 'npm audit did not return a usable vulnerability report; see audit logs', deprecatedCount, sources }
    }
    const status = total || deprecatedCount ? 'failed' : 'passed'
    return { status, summary: `${total} vulnerabilities; ${deprecatedCount} deprecated locked packages`, vulnerabilities: total, deprecatedCount, sources, lock, audit }
  } catch (error) {
    return { status: 'error', summary: 'Dependency audit or lockfile could not be read as valid JSON; see audit logs', sources: result ? { lock: lockFile(root), audit: result.stdoutPath, stderr: result.stderrPath } : { lock: lockFile(root) } }
  }
}

function buildReport({ lock, audit, names = [], sources = {}, maxBytes = 6000 }) {
  const packages = lock.packages
  const resolve = (from, name) => {
    let directory = from
    while (true) {
      const candidate = path.posix.join(directory, 'node_modules', name)
      if (packages[candidate]) {
        const target = packages[candidate].link ? packages[candidate].resolved : candidate
        return packages[target] ? target : null
      }
      if (!directory) return null
      directory = path.posix.dirname(directory)
      if (directory === '.') directory = ''
    }
  }
  const dependencies = record => ({ ...record.dependencies, ...record.optionalDependencies, ...record.peerDependencies })
  const direct = { ...dependencies(packages['']), ...packages[''].devDependencies }
  const nodes = new Map()
  const impacts = new Map()
  for (const name of Object.keys(direct).sort()) {
    const start = resolve('', name)
    if (!start) continue
    const queue = [{ location: start, chain: [`${name}@${packages[start].version}`], name }]
    const seen = new Set()
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      if (seen.has(current.location)) continue
      seen.add(current.location)
      if (!impacts.has(current.location)) impacts.set(current.location, new Set())
      impacts.get(current.location).add(name)
      const previous = nodes.get(current.location)
      if (!previous || current.chain.length < previous.chain.length) nodes.set(current.location, current)
      for (const child of Object.keys(dependencies(packages[current.location])).sort()) {
        const location = resolve(current.location, child)
        if (location && !seen.has(location)) queue.push({ location, name: child, chain: [...current.chain, `${child}@${packages[location].version}`] })
      }
    }
  }
  const vulnerabilities = Object.values(audit.vulnerabilities || {})
  const rows = []
  for (const node of nodes.values()) {
    const record = packages[node.location]
    const advisory = vulnerabilities.find(value => value.nodes?.includes(node.location))
    if (names.length ? !names.includes(node.name) && !names.includes(record.name) : !record.deprecated && !advisory) continue
    const shorten = value => String(value).slice(0, 160)
    rows.push({
      name: shorten(node.name), version: record.version, severity: advisory?.severity || null,
      deprecated: record.deprecated ? shorten(record.deprecated) : null,
      via: (advisory?.via || []).slice(0, 3).map(value => shorten(typeof value === 'string' ? value : value.title)),
      chain: node.chain.length > 8 ? [...node.chain.slice(0, 3), '…', ...node.chain.slice(-4)] : node.chain,
      directDependents: [...impacts.get(node.location)].sort()
    })
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
  const report = { scope: 'root dependencies, including development dependencies; not cloudfunctions', vulnerabilities: audit.metadata.vulnerabilities.total, deprecatedPackages: deprecatedPackages(lock).length, matchedRows: rows.length, omittedRows: 0, sources, rows }
  while (Buffer.byteLength(JSON.stringify(report)) > maxBytes && rows.length) {
    rows.pop()
    report.omittedRows++
  }
  if (Buffer.byteLength(JSON.stringify(report)) > maxBytes) throw new Error('Dependency report metadata exceeds output budget')
  return report
}

function main(argv = process.argv.slice(2)) {
  const [action, ...names] = argv
  if (!['check', 'install', 'report'].includes(action) || (action !== 'report' && names.length) || names.some(name => name.startsWith('-'))) {
    console.error('Use npm run deps:check, deps:install or deps:report -- [package names]')
    return 2
  }
  const root = DEFAULT_ROOT
  const result = action === 'install' ? installDependencies(root) : checkDependencies(root)
  if (action === 'report' && result.audit) {
    console.log(JSON.stringify(buildReport({ lock: result.lock, audit: result.audit, names, sources: result.sources, maxBytes: 5999 })))
  } else {
    console.log(JSON.stringify({ status: result.status, summary: result.summary, warningCount: result.warningCount, deprecatedCount: result.deprecatedCount, sources: result.sources || result.logs }))
  }
  return result.status === 'passed' ? 0 : result.status === 'failed' ? 1 : 2
}

if (require.main === module) process.exitCode = main()
module.exports = { runNpm, installDependencies, checkDependencies, buildReport }
