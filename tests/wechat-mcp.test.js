const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { spawnSync } = require('node:child_process')
const peer = path.join(__dirname, 'fixtures/mcp-peer.cjs')

for (const [mode, expected] of [
  ['rpc', /MCP -1: test failure/],
  ['isError', /isError/],
  ['structured', /success:false/],
  ['text', /success:false/],
  ['timeout', /timed out/],
  ['exit', /bridge exited.*code=7/],
]) {
  test(`MCP rejects ${mode} failures`, async () => {
    const { McpClient } = await import('./tools/mcpTransport.mjs')
    const client = new McpClient(process.execPath, [peer, mode], { timeoutMs: 1500 })
    try {
      await client.initialize()
      await assert.rejects(client.call({ name: 'probe', arguments: {} }), expected)
    } finally { client.close() }
  })
}

test('MCP serial calls succeed without duplicating structured/text output', async () => {
  const { McpClient } = await import('./tools/mcpTransport.mjs')
  const client = new McpClient(process.execPath, [peer, 'ok'])
  try {
    await client.initialize()
    for (let i = 0; i < 2; i++) assert.equal((await client.call({ name: 'probe' })).content[0].text, 'ok')
  } finally { client.close() }
})

test('MCP logs redact tokens including stderr split across chunks', async () => {
  const { McpClient } = await import('./tools/mcpTransport.mjs')
  const logs = []
  const client = new McpClient(process.execPath, [peer, 'redact'], { secrets: ['test-credential'], log: entry => logs.push(entry) })
  try {
    await client.initialize()
    await client.call({ name: 'probe', arguments: { token: 'other-credential', note: 'test-credential' } })
    const log = JSON.stringify(logs)
    assert.doesNotMatch(log, /test-credential|other-credential/)
    assert.match(log, /REDACTED/)
  } finally { client.close() }
})

test('WeChat requests use native Windows project paths and reject invalid modes', async () => {
  const { normalizeRequest, parseArgs, findViewport } = await import('./tools/wechatMcp.mjs')
  assert.equal(normalizeRequest({ name: 'probe' }, 'D:/repo').arguments.project, 'D:\\repo')
  assert.equal(normalizeRequest({ name: 'simulator_screenshot' }, 'D:/repo/').arguments.project, 'D:\\repo')
  assert.throws(() => parseArgs(['--list', '--preflight']), /Choose one/)
  assert.throws(() => parseArgs(['--timeout', '0']), /positive integer/)
  assert.deepEqual(findViewport({ success: true, data: { windowWidth: 430, windowHeight: 932 } }), { width: 430, height: 932 })
  assert.equal(findViewport({ success: true }), null)
})

test('MCP redacts secret fields within JSON text content', async () => {
  const { createRedactor } = await import('./tools/mcpTransport.mjs')
  const redacted = createRedactor()({ content: [{ type: 'text', text: '{"token":"credential","data":"safe"}' }] })
  assert.doesNotMatch(JSON.stringify(redacted), /credential/)
  assert.match(JSON.stringify(redacted), /safe/)
})

test('MCP CLI exits nonzero with a concise diagnostic on invalid installation', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'tools/wechatMcp.mjs'), '--ide', path.join(__dirname, 'missing-ide')], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /FAIL Official WeChat/)
  assert.ok(result.stderr.length < 300)
})
