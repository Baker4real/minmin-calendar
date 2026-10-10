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
