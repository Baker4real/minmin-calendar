const assert = require('node:assert/strict')
const net = require('node:net')
const { once } = require('node:events')
const test = require('node:test')

test('automator preflight distinguishes a listening port from a closed port', async () => {
  const { probeEndpoint } = await import('./tools/devtoolsPreflight.mjs')
  const server = net.createServer(socket => socket.end())
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const endpoint = `ws://127.0.0.1:${server.address().port}`
  try { await probeEndpoint(endpoint) }
  finally { await new Promise(resolve => server.close(resolve)) }
  await assert.rejects(probeEndpoint(endpoint), /ECONNREFUSED/)
  assert.throws(() => probeEndpoint('ws://example.com:9420'), /local/)
})

test('preflight fails while the project window is minimized, because captures fail then even with CLI and automator up', async () => {
  const { projectWindowResult } = await import('./tools/devtoolsPreflight.mjs')
  assert.deepEqual(projectWindowResult('50236\tFalse\r\n', 'minmin-calendar'), { name: 'DevTools project window', ok: true })
  const minimized = projectWindowResult('50236\tTrue\r\n', 'minmin-calendar')
  assert.equal(minimized.ok, false)
  assert.match(minimized.error, /minimized \(pid 50236\)/)
  assert.equal(projectWindowResult('', 'minmin-calendar').skipped, true)
})

test('preflight fails when the latest app launch loaded no page, because page logic stays dead until the next compile', async () => {
  const { launchResult } = await import('./tools/devtoolsPreflight.mjs')
  const launchedAt = new Date(2026, 10, 7, 20, 27, 24)
  const minuteLater = launchedAt.getTime() + 60000
  const none = { page: null, pages: [], pageCodeRan: false }
  assert.deepEqual(launchResult([{ at: new Date(2026, 10, 7, 20, 27, 20), ...none }, { at: launchedAt, page: 'pages/bind/bind', pages: ['pages/bind/bind'], pageCodeRan: true }], minuteLater), {
    name: 'Latest app launch loaded a page', ok: true, note: 'pages/bind/bind, launched 2026-11-07 20:27:24',
  })
  const noPage = launchResult([{ at: launchedAt, ...none }], minuteLater)
  assert.equal(noPage.ok, false)
  assert.match(noPage.error, /launched 2026-11-07 20:27:24 without loading a page; click 编译/)
  assert.equal(launchResult([{ at: launchedAt, ...none }], launchedAt.getTime() + 2000).skipped, true)
  assert.equal(launchResult([]).skipped, true)
})

test('preflight fails when the first page logged onLoad but its code never ran, because a page that failed to register still logs onLoad', async () => {
  const { launchResult } = await import('./tools/devtoolsPreflight.mjs')
  const at = new Date(2026, 10, 8, 23, 30, 31)
  const dead = launchResult([{ at, page: 'pages/bind/bind', pages: ['pages/bind/bind'], pageCodeRan: false }], at.getTime() + 60000)
  assert.equal(dead.ok, false)
  assert.match(dead.error, /launched 2026-11-08 23:30:31: pages\/bind\/bind logged onLoad but its page code never ran/)
  assert.match(dead.error, /close and reopen the project in DevTools/)
})

test('a failing launch check lists the recent launches with the pages each one reached', async () => {
  const { launchLines } = await import('./tools/devtoolsPreflight.mjs')
  assert.deepEqual(launchLines([
    { at: new Date(2026, 10, 8, 18, 29, 0), page: 'pages/bind/bind', pages: ['pages/bind/bind'], pageCodeRan: true },
    { at: new Date(2026, 10, 8, 18, 29, 46), page: 'pages/bind/bind', pages: ['pages/bind/bind', 'pages/bind/bind', 'pages/index/index'], pageCodeRan: true },
    { at: new Date(2026, 10, 8, 22, 8, 43), page: 'pages/bind/bind', pages: ['pages/bind/bind'], pageCodeRan: false },
    { at: new Date(2026, 10, 8, 22, 9, 0), page: null, pages: [], pageCodeRan: false },
  ], 3), [
    '2026-11-08 18:29:46 pages/bind/bind > pages/index/index',
    '2026-11-08 22:08:43 pages/bind/bind (page code never ran)',
    '2026-11-08 22:09:00 no page loaded',
  ])
})
