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
  assert.deepEqual(launchResult([{ at: new Date(2026, 10, 7, 20, 27, 20), page: null }, { at: launchedAt, page: 'pages/bind/bind' }], minuteLater), {
    name: 'Latest app launch loaded a page', ok: true, note: 'pages/bind/bind, launched 2026-11-07 20:27:24',
  })
  const noPage = launchResult([{ at: launchedAt, page: null }], minuteLater)
  assert.equal(noPage.ok, false)
  assert.match(noPage.error, /launched 2026-11-07 20:27:24 without loading a page; click 编译/)
  assert.equal(launchResult([{ at: launchedAt, page: null }], launchedAt.getTime() + 2000).skipped, true)
  assert.equal(launchResult([]).skipped, true)
})
