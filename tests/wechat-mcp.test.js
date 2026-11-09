const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { spawnSync } = require('node:child_process')
const peer = path.join(__dirname, 'fixtures/mcp-peer.cjs')

for (const [mode, expected] of [
  ['rpc', /MCP -1: test failure/],
  ['isError', /tool returned isError "bridge refused"/],
  ['structured', /success:false \(no error fields; keys: success, data\)/],
  ['text', /success:false \{"message":"test failure"\}/],
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

async function failureMessage(mode, options = {}) {
  const { McpClient } = await import('./tools/mcpTransport.mjs')
  const client = new McpClient(process.execPath, [peer, mode], { timeoutMs: 1500, ...options })
  try {
    await client.initialize()
    await client.call({ name: 'probe', arguments: {} })
  } catch (error) { return error.message } finally { client.close() }
  assert.fail(`${mode} call should fail`)
}

test('MCP failure messages carry redacted error fields but not page data', async () => {
  const detailed = await failureMessage('detailed', { secrets: ['test-credential'] })
  assert.match(detailed, /probe: tool returned success:false \{"error":\{"code":42\},"errMsg":"not ready for \[REDACTED\]"\}/)
  const bare = await failureMessage('structured')
  for (const message of [detailed, bare]) assert.doesNotMatch(message, /page-data|internal-stack|test-credential/)
})

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

test('MCP preflight reads the console cache before asking the automator, and names a silent automator', async () => {
  const { preflight } = await import('./tools/wechatMcp.mjs')
  const client = runtime => {
    const calls = []
    return { calls, call: async request => {
      calls.push([request.name, request.arguments])
      if (request.name === 'get_simulator_console') return { content: [{ type: 'text', text: '1:["[info]","[system]","WeChatLib: 3.18.0"]' }] }
      return runtime()
    } }
  }
  const logs = []
  const healthy = client(async () => ({ structuredContent: { success: true, data: { windowWidth: 430, windowHeight: 932 } } }))
  await preflight(healthy, 'D:/repo', line => logs.push(line))
  assert.deepEqual(healthy.calls, [
    ['get_simulator_console', { command: 'grep -n -m 1 .', project: 'D:\\repo' }],
    ['automation_runtime_info', { action: 'systemInfo', project: 'D:\\repo' }],
  ])
  assert.deepEqual(logs, ['PASS MCP bridge: console cache readable; project D:/repo', 'PASS MCP runtime: viewport 430 x 932; project D:/repo'])

  const timeout = 'automation_runtime_info: tool returned success:false {"error":"timeout waiting for automator response"}; see the redacted log'
  const silent = client(async () => { throw new Error(timeout) })
  logs.length = 0
  await assert.rejects(preflight(silent, 'D:/repo', line => logs.push(line)), error => {
    assert.match(error.message, /^MCP runtime: simulator automator did not answer while the bridge and project did; rerun once/)
    assert.ok(error.message.includes(timeout))
    return true
  })
  assert.deepEqual(logs, ['PASS MCP bridge: console cache readable; project D:/repo'])
  await assert.rejects(preflight(client(async () => { throw new Error('automation_runtime_info: timed out') }), 'D:/repo', () => {}), /^Error: MCP runtime: automation_runtime_info: timed out$/)

  const refused = { calls: 0, call: async () => { refused.calls++; throw new Error('get_simulator_console: tool returned isError "bridge refused"; see the redacted log') } }
  await assert.rejects(preflight(refused, 'D:/repo', () => assert.fail('nothing passed')), /^Error: MCP bridge: get_simulator_console: tool returned isError/)
  assert.equal(refused.calls, 1)
})

test('WeChat token comes from WECHAT_MCP_TOKEN, then the local secret store, then a terminal only', async () => {
  const { readToken, readStoredToken, TOKEN_SECRET } = await import('./tools/wechatMcp.mjs')
  const unread = () => assert.fail('the store should not be read')
  assert.equal(await readToken({ env: { WECHAT_MCP_TOKEN: ' from-env ' }, readStored: unread }), 'from-env')
  assert.equal(await readToken({ env: {}, readStored: () => 'from-store', stdin: { isTTY: false } }), 'from-store')
  await assert.rejects(readToken({ env: {}, readStored: () => undefined, stdin: { isTTY: false } }), new RegExp(`'D:/Codex/\\.codex/scripts/Set-LocalSecret\\.ps1' -Name ${TOKEN_SECRET}`))

  // Nothing stored: nothing spawned. Stored: read through pwsh's stdout, the secret's name on its command line.
  const calls = []
  const run = (command, args) => {
    calls.push([command, ...args].join(' '))
    return { status: 0, stdout: 'stored-token\r\n', stderr: '' }
  }
  assert.equal(readStoredToken({ file: path.join(__dirname, 'missing.dpapi'), run }), undefined)
  assert.equal(calls.length, 0)
  assert.equal(readStoredToken({ file: __filename, run }), 'stored-token')
  assert.match(calls[0], /^pwsh .*Read-LocalSecret -Name wechat-devtools-mcp-token -AsPlainText$/)
  const refused = () => ({ status: 1, stdout: '', stderr: 'cannot decrypt\r\nat line 1' })
  assert.throws(() => readStoredToken({ file: __filename, run: refused }), /unreadable: cannot decrypt$/)
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
