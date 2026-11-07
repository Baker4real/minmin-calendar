const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { screenshotWithRetry } = require('./tools/navHitTest.cjs')
const { browsersPath } = require('./tools/playwrightBrowsers.cjs')

test('a linked worktree reuses the main checkout browsers; the main checkout and a non-git copy use their own', () => {
  const worktree = path.resolve('wt-149')
  assert.equal(browsersPath(worktree, () => 'D:/repo/.git\n'), path.join('D:/repo', '.scratch', 'browsers'))
  assert.equal(browsersPath(worktree, () => `${worktree}/.git\n`), path.join(worktree, '.scratch', 'browsers'))
  assert.equal(browsersPath(worktree, () => { throw new Error('not a git repository') }), path.join(worktree, '.scratch', 'browsers'))
})

test('coordinate-hit retries one transient screenshot failure', async () => {
  const calls = []
  const warnings = []
  const page = {
    async screenshot(options) {
      calls.push(options)
      if (calls.length === 1) throw new Error('Protocol error (Page.captureScreenshot): Unable to capture screenshot\n    at stack')
      return 'png'
    },
  }
  assert.equal(await screenshotWithRetry(page, { path: 'nav-320.png' }, { warn: message => warnings.push(message) }), 'png')
  assert.deepEqual(calls, [{ path: 'nav-320.png' }, { path: 'nav-320.png' }])
  assert.deepEqual(warnings, ['WARN screenshot attempt 1 failed (Protocol error (Page.captureScreenshot): Unable to capture screenshot); retrying'])
})

test('coordinate-hit still fails when the retry fails too', async () => {
  let calls = 0
  const page = { async screenshot() { calls++; throw new Error('Unable to capture screenshot') } }
  await assert.rejects(screenshotWithRetry(page, {}, { warn: () => {} }), /Unable to capture screenshot/)
  assert.equal(calls, 2)
})
