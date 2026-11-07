const path = require('node:path')
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

module.exports = { browsersPath }
