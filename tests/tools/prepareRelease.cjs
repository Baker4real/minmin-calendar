const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { browsersPath } = require('./playwrightBrowsers.cjs')

const DEFAULT_TIMEOUT_MS = 600000

function targetRoot(root) {
  if (typeof root !== 'string' || !root.trim()) throw new TypeError('An explicit target root is required')
  root = path.resolve(root)
  if (!fs.statSync(root).isDirectory()) throw new Error('Target root must be a directory')
  fs.accessSync(path.join(root, 'package.json'))
  return root
}

function timeoutFor(options) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('timeoutMs must be a positive integer')
  return timeoutMs
}

// Run in a fresh process so Playwright reads the target's cache environment before it is loaded.
const readinessProbe = `
const path = require('node:path')
const root = process.argv[1]
console.log('Target root: ' + root)
console.log('Browser cache: ' + process.env.PLAYWRIGHT_BROWSERS_PATH)
async function main() {
  const { chromium } = require(path.join(root, 'node_modules', 'playwright'))
  const { version } = require(path.join(root, 'node_modules', 'playwright', 'package.json'))
  console.log('Playwright: ' + version)
  const browser = await chromium.launch({ headless: true, timeout: Number(process.argv[2]) })
  await browser.close()
  console.log('Default Chromium headless launch and close passed')
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1 })
`

function checkReadiness(root, options = {}) {
  root = targetRoot(root)
  const logDir = path.join(root, '.scratch', 'release-prepare')
  const timeoutMs = timeoutFor(options)
  const cachePath = browsersPath(root, cwd => {
    const result = (options.spawnSync ?? spawnSync)('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: timeoutMs,
    })
    if (result.status !== 0 || result.error) throw new Error('git common directory unavailable')
    return result.stdout
  })
  fs.mkdirSync(logDir, { recursive: true })
  const logs = { stdout: path.join(logDir, 'readiness.stdout.log'), stderr: path.join(logDir, 'readiness.stderr.log') }
  const stdout = fs.openSync(logs.stdout, 'w')
  const stderr = fs.openSync(logs.stderr, 'w')
  let result
  try {
    result = (options.spawnSync ?? spawnSync)(process.execPath, ['-e', readinessProbe, root, String(timeoutMs)], {
      cwd: root,
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: cachePath },
      stdio: ['ignore', stdout, stderr],
      timeout: timeoutMs,
    })
    if (result.error) fs.writeSync(stderr, `${result.error.message}\n`)
  } catch (error) {
    fs.writeSync(stderr, `${error.stack || error.message}\n`)
    result = { status: null, error }
  } finally {
    fs.closeSync(stdout)
    fs.closeSync(stderr)
  }
  const ready = result.status === 0 && !result.error
  return { root, cachePath, logDir, logs, ready, status: ready ? 'passed' : 'failed', summary: `Default Chromium headless launch and close ${ready ? 'passed' : 'failed'}` }
}

function prepareRelease(root, options = {}) {
  root = targetRoot(root)
  options = { ...options, timeoutMs: timeoutFor(options) }
  const logDir = path.join(root, '.scratch', 'release-prepare')
  fs.mkdirSync(logDir, { recursive: true })
  const steps = []
  const finish = step => {
    const result = {
      root, logDir, cachePath: step.cachePath ?? null, steps,
      ready: step.name === 'readiness' && step.ready === true,
      status: step.status, summary: step.summary,
      reportPath: path.join(logDir, 'result.json'),
    }
    fs.writeFileSync(result.reportPath, `${JSON.stringify(result, null, 2)}\n`)
    return result
  }
  if (!options.checkOnly) {
    const { installDependencies, runNpm } = require('./dependencyTools.cjs')
    const dependencies = { name: 'dependencies', ...installDependencies(root, { ...options, logDir }) }
    steps.push(dependencies)
    if (dependencies.status !== 'passed') return finish(dependencies)
    const browser = runNpm(root, ['run', 'browser:install'], { ...options, logDir, prefix: 'browser-install' })
    const installation = {
      name: 'browser-install',
      status: browser.error ? 'error' : browser.status === 0 ? 'passed' : 'failed',
      summary: browser.error ? 'Browser installation could not complete; see logs' : `Browser installation exited ${browser.status}`,
      logs: { stdout: browser.stdoutPath, stderr: browser.stderrPath },
    }
    steps.push(installation)
    if (installation.status !== 'passed') return finish(installation)
  }
  const readiness = { name: 'readiness', ...checkReadiness(root, options) }
  steps.push(readiness)
  return finish(readiness)
}

function main(argv = process.argv.slice(2)) {
  let root = process.cwd()
  const options = {}
  try {
    for (let index = 0; index < argv.length; index++) {
      const flag = argv[index]
      if (flag === '--check-only') options.checkOnly = true
      else if (flag === '--root' && argv[index + 1] && !argv[index + 1].startsWith('--')) root = argv[++index]
      else if (flag === '--timeout-ms' && argv[index + 1]) {
        options.timeoutMs = Number(argv[++index])
        if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms requires a positive integer')
      } else throw new Error('Use [--root <target>] [--check-only] [--timeout-ms <positive integer>]')
    }
    const result = prepareRelease(root, options)
    console.log(`${result.ready ? 'READY' : 'FAIL'} release:prepare${options.checkOnly ? ' (check-only)' : ''}: ${result.root}`)
    console.log(result.summary)
    console.log(`logs: ${result.logDir}; report: ${result.reportPath}`)
    return result.ready ? 0 : 1
  } catch (error) {
    console.error(`FAIL release:prepare: ${path.resolve(root)}: ${error.message.split(/\r?\n/)[0]}`)
    return 1
  }
}

if (require.main === module) process.exitCode = main()
module.exports = { prepareRelease, checkReadiness }
