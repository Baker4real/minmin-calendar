const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { sharedNodeModulesPath, workspaceRequire } = require('./tools/playwrightBrowsers.cjs')

const repoRoot = path.resolve(__dirname, '..')

function makeFixture(t) {
  const scratch = path.join(repoRoot, '.scratch', 'worktree-deps-tests')
  fs.mkdirSync(scratch, { recursive: true })
  const dir = fs.mkdtempSync(path.join(scratch, 'wt-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

test('linked worktree with matching lockfile reuses main checkout node_modules without local install', t => {
  const worktree = makeFixture(t)
  fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${path.join(repoRoot, '.git', 'worktrees', 'wt-demo')}\n`)
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(worktree, 'package.json'))
  fs.copyFileSync(path.join(repoRoot, 'package-lock.json'), path.join(worktree, 'package-lock.json'))

  const fakeCommonDir = () => `${path.join(repoRoot, '.git')}\n`
  assert.equal(sharedNodeModulesPath(worktree, fakeCommonDir), path.join(repoRoot, 'node_modules'))

  const req = workspaceRequire(worktree, fakeCommonDir)
  assert.ok(req.resolve('playwright/package.json').startsWith(path.join(repoRoot, 'node_modules')))
})

test('sharedNodeModulesPath refuses independent clones, non-git copies, local node_modules and modified lockfiles', t => {
  const fakeCommonDir = () => `${path.join(repoRoot, '.git')}\n`

  // Non-git copy (no .git file)
  const plain = makeFixture(t)
  fs.copyFileSync(path.join(repoRoot, 'package-lock.json'), path.join(plain, 'package-lock.json'))
  assert.equal(sharedNodeModulesPath(plain, fakeCommonDir), null)

  // Independent clone (.git is a directory)
  const clone = makeFixture(t)
  fs.mkdirSync(path.join(clone, '.git'))
  fs.copyFileSync(path.join(repoRoot, 'package-lock.json'), path.join(clone, 'package-lock.json'))
  assert.equal(sharedNodeModulesPath(clone, () => `${path.join(clone, '.git')}\n`), null)

  // Linked worktree with its own node_modules already present
  const localInstalled = makeFixture(t)
  fs.writeFileSync(path.join(localInstalled, '.git'), 'gitdir: fake\n')
  fs.mkdirSync(path.join(localInstalled, 'node_modules'))
  fs.copyFileSync(path.join(repoRoot, 'package-lock.json'), path.join(localInstalled, 'package-lock.json'))
  assert.equal(sharedNodeModulesPath(localInstalled, fakeCommonDir), null)

  // Linked worktree with a modified package-lock.json
  const drifted = makeFixture(t)
  fs.writeFileSync(path.join(drifted, '.git'), 'gitdir: fake\n')
  fs.writeFileSync(path.join(drifted, 'package-lock.json'), '{"name":"drifted","lockfileVersion":3}\n')
  assert.equal(sharedNodeModulesPath(drifted, fakeCommonDir), null)
})
