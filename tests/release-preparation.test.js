const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { spawnSync } = require('node:child_process')
const { prepareRelease, checkReadiness } = require('./tools/prepareRelease.cjs')
const { browsersPath } = require('./tools/playwrightBrowsers.cjs')

const repoRoot = path.resolve(__dirname, '..')

function targetFixture(t) {
  const scratch = path.join(repoRoot, '.scratch', 'release-preparation-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const root = fs.mkdtempSync(path.join(scratch, 'target-'))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'release-target', version: '1.0.0', private: true }))
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ name: 'release-target', version: '1.0.0', lockfileVersion: 3, packages: { '': { name: 'release-target', version: '1.0.0' } } }))
  t.after(() => {
    assert.equal(path.dirname(root), scratch)
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

test('readiness fails for a target without its own installed Playwright and retains target-bound diagnostics', t => {
  const root = targetFixture(t)
  const result = checkReadiness(root)
  assert.equal(result.ready, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.root, root)
  assert.equal(result.logDir, path.join(root, '.scratch', 'release-prepare'))
  assert.match(fs.readFileSync(result.logs.stderr, 'utf8'), /Cannot find module/)
  assert.ok(fs.readFileSync(result.logs.stdout, 'utf8').includes(root))
})

test('check-only rejects an empty target browser cache using the installed Playwright, without downloading', t => {
  const root = targetFixture(t)
  const modules = path.join(root, 'node_modules')
  fs.mkdirSync(modules)
  fs.symlinkSync(path.dirname(require.resolve('playwright/package.json')), path.join(modules, 'playwright'), 'junction')
  const children = []
  const result = checkReadiness(root, {
    timeoutMs: 15000,
    spawnSync(file, args, options) {
      if (file === 'git') return { status: 0, stdout: `${root}/.git\n` }
      children.push({ file, args, options })
      return spawnSync(file, args, options)
    },
  })
  assert.equal(result.cachePath, path.join(root, '.scratch', 'browsers'))
  assert.equal(result.ready, false)
  assert.match(fs.readFileSync(result.logs.stderr, 'utf8'), /executable doesn't exist/i)
  assert.equal(children.length, 1)
  assert.equal(children[0].file, process.execPath)
  assert.equal(children[0].options.env.PLAYWRIGHT_BROWSERS_PATH, result.cachePath)
})

test('an available full Chromium cannot make a cache without the default headless shell ready', t => {
  const root = targetFixture(t)
  const sourceCache = browsersPath(repoRoot)
  const executable = spawnSync(process.execPath, ['-e', "console.log(require('playwright').chromium.executablePath())"], {
    cwd: repoRoot, env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: sourceCache }, encoding: 'utf8', timeout: 10000,
  })
  assert.equal(executable.status, 0, executable.stderr)
  const executablePath = executable.stdout.trim()
  assert.equal(fs.existsSync(executablePath), true, 'browser:install supplies the full Chromium used by this cache fixture')
  const installation = path.relative(sourceCache, executablePath).split(path.sep)[0]
  const cachePath = path.join(root, '.scratch', 'browsers')
  fs.mkdirSync(cachePath, { recursive: true })
  fs.symlinkSync(path.join(sourceCache, installation), path.join(cachePath, installation), 'junction')
  const modules = path.join(root, 'node_modules')
  fs.mkdirSync(modules)
  fs.symlinkSync(path.dirname(require.resolve('playwright/package.json')), path.join(modules, 'playwright'), 'junction')
  const result = checkReadiness(root, {
    timeoutMs: 15000,
    spawnSync(file, args, options) {
      if (file === 'git') return { status: 0, stdout: `${root}/.git\n` }
      return spawnSync(file, args, options)
    },
  })
  assert.equal(result.ready, false)
  assert.match(fs.readFileSync(result.logs.stderr, 'utf8'), /chromium_headless_shell-/)
})

test('release preparation stops on a failed clean dependency install and preserves its diagnostics', t => {
  const root = targetFixture(t)
  const children = []
  const result = prepareRelease(root, {
    npmCli: __filename,
    timeoutMs: 1234,
    spawnSync(file, args, options) {
      children.push({ file, args, options })
      fs.writeSync(options.stdio[2], 'npm error ERESOLVE dependency conflict\n')
      return { status: 9, error: null }
    },
  })
  assert.equal(result.ready, false)
  assert.equal(result.status, 'error')
  assert.equal(result.root, root)
  assert.equal(result.steps.length, 1)
  assert.equal(result.steps[0].name, 'dependencies')
  assert.match(fs.readFileSync(result.steps[0].logs.stderr, 'utf8'), /ERESOLVE dependency conflict/)
  assert.equal(children.length, 1)
  assert.equal(children[0].options.cwd, root)
  assert.equal(children[0].options.timeout, 1234)
  assert.deepEqual(children[0].args.slice(1), ['ci', '--include=dev'])
})

test('a browser download error is propagated before readiness and cannot become a cache hit', t => {
  const root = targetFixture(t)
  const children = []
  const result = prepareRelease(root, {
    npmCli: __filename,
    spawnSync(file, args, options) {
      children.push({ file, args, options })
      if (args[1] === 'ci') return { status: 0, error: null }
      fs.writeSync(options.stdio[2], 'browser download failed: connection reset\n')
      return { status: 7, error: null }
    },
  })
  assert.equal(result.ready, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.steps.at(-1).name, 'browser-install')
  assert.match(fs.readFileSync(result.steps.at(-1).logs.stderr, 'utf8'), /connection reset/)
  assert.equal(children.length, 2)
  assert.deepEqual(children[1].args.slice(1), ['run', 'browser:install'])
  assert.equal(children[1].options.cwd, root)
})

for (const topology of ['linked worktree', 'independent clone', 'non-git copy']) {
  test(`successful subprocess results prepare only the explicit ${topology}, with target-bound logs and the correct cache`, t => {
    const root = targetFixture(t)
    const children = []
    const result = prepareRelease(root, {
      npmCli: __filename,
      spawnSync(file, args, options) {
        if (file === 'git') return topology === 'non-git copy'
          ? { status: 128, stdout: '' }
          : { status: 0, stdout: `${topology === 'linked worktree' ? repoRoot : root}/.git\n` }
        children.push({ file, args, options })
        return { status: 0, error: null }
      },
    })
    const cacheRoot = topology === 'linked worktree' ? repoRoot : root
    assert.equal(result.ready, true)
    assert.equal(result.status, 'passed')
    assert.equal(result.root, root)
    assert.equal(result.cachePath, path.join(cacheRoot, '.scratch', 'browsers'))
    assert.deepEqual(result.steps.map(step => step.name), ['dependencies', 'browser-install', 'readiness'])
    assert.deepEqual(children.map(child => child.args[0] === '-e' ? 'readiness' : child.args[1]), ['ci', 'run', 'readiness'])
    assert.ok(children.every(child => child.options.cwd === root && child.options.timeout === 600000))
    assert.equal(children.at(-1).options.env.PLAYWRIGHT_BROWSERS_PATH, result.cachePath)
    assert.equal(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).ready, true)
    for (const step of result.steps) {
      for (const log of Object.values(step.logs)) assert.equal(path.dirname(log), path.join(root, '.scratch', 'release-prepare'))
    }
  })
}

test('a readiness timeout cannot produce ready after both installers exit successfully', t => {
  const root = targetFixture(t)
  const children = []
  const result = prepareRelease(root, {
    npmCli: __filename,
    timeoutMs: 42,
    spawnSync(file, args, options) {
      if (file === 'git') return { status: 0, stdout: `${root}/.git\n` }
      children.push({ file, args, options })
      if (args[0] !== '-e') return { status: 0, error: null }
      return { status: null, error: new Error('spawnSync node ETIMEDOUT') }
    },
  })
  assert.equal(result.ready, false)
  assert.equal(result.status, 'failed')
  assert.equal(result.steps.at(-1).name, 'readiness')
  assert.match(fs.readFileSync(result.steps.at(-1).logs.stderr, 'utf8'), /ETIMEDOUT/)
  assert.ok(children.every(child => child.options.timeout === 42))
  assert.equal(JSON.parse(fs.readFileSync(result.reportPath, 'utf8')).ready, false)
})

test('public functions require an existing explicit target and a positive timeout before writing', t => {
  const root = targetFixture(t)
  const missing = path.join(root, 'missing-target')
  for (const run of [prepareRelease, checkReadiness]) {
    assert.throws(() => run(), /explicit target root/)
    assert.throws(() => run(missing, { checkOnly: true }), /ENOENT/)
    assert.throws(() => run(root, { checkOnly: true, timeoutMs: 0 }), /timeoutMs/)
  }
  assert.equal(fs.existsSync(missing), false)
  assert.equal(fs.existsSync(path.join(root, '.scratch')), false)
})

test('the CLI check-only mode fails early for the explicit target and prints only a short result and log paths', t => {
  const root = targetFixture(t)
  const result = spawnSync(process.execPath, [path.join(__dirname, 'tools', 'prepareRelease.cjs'), '--root', root, '--check-only', '--timeout-ms', '15000'], {
    cwd: repoRoot, encoding: 'utf8', timeout: 20000,
  })
  assert.equal(result.status, 1)
  assert.ok(result.stdout.includes(root))
  assert.match(result.stdout, /FAIL release:prepare \(check-only\)/)
  assert.match(result.stdout, /result\.json/)
  assert.doesNotMatch(result.stdout + result.stderr, /Cannot find module|node:internal|READY/)
  assert.equal(fs.existsSync(path.join(root, '.scratch', 'release-prepare', 'install.stdout.log')), false)
})
