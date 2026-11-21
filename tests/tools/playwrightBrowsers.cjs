const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { execFileSync } = require('node:child_process')

function gitCommonDir(cwd) {
  return execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

// Playwright browsers are installed once, in the main checkout's .scratch/browsers. A linked git worktree reuses that
// copy, so it needs no download and no hard links (managed cleanup refuses hard-linked trees). A copy outside git
// keeps its own .scratch/browsers.
function browsersPath(root, commonDir = gitCommonDir) {
  let checkout = root
  try { checkout = path.dirname(commonDir(root).trim()) } catch {}
  return path.join(checkout, '.scratch', 'browsers')
}

// A linked git worktree (.git is a file) with an unchanged package-lock.json reuses the main checkout's node_modules
// instead of running `npm ci` inside the worktree. That avoids creating per-worktree `node_modules/jimp` junctions
// from `"jimp": "file:tests/tools/automator-image"`, so `git worktree remove` leaves zero residual directories.
function sharedNodeModulesPath(root, commonDir = gitCommonDir) {
  const localModules = path.join(root, 'node_modules')
  if (fs.existsSync(localModules)) return null
  const gitMarker = path.join(root, '.git')
  let gitStat
  try { gitStat = fs.statSync(gitMarker) } catch { return null }
  if (!gitStat.isFile()) return null

  let mainCheckout
  try { mainCheckout = path.dirname(commonDir(root).trim()) } catch { return null }
  if (path.resolve(mainCheckout) === path.resolve(root)) return null

  const mainModules = path.join(mainCheckout, 'node_modules')
  if (!fs.existsSync(mainModules)) return null

  const localLock = path.join(root, 'package-lock.json')
  const mainLock = path.join(mainCheckout, 'package-lock.json')
  if (!fs.existsSync(localLock) || !fs.existsSync(mainLock)) return null
  if (!fs.readFileSync(localLock).equals(fs.readFileSync(mainLock))) return null

  return mainModules
}

function workspaceRequire(root, commonDir = gitCommonDir) {
  const shared = sharedNodeModulesPath(root, commonDir)
  if (!shared) return createRequire(path.join(root, 'package.json'))
  return createRequire(path.join(path.dirname(shared), 'package.json'))
}

module.exports = { browsersPath, sharedNodeModulesPath, workspaceRequire }
