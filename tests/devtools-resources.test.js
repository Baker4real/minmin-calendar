const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')

test('resource context follows the requested project and most recent window, not another project', async () => {
  const { contextFromLog } = await import('./tools/devtoolsResources.mjs')
  const ready = (win, project) => `[rt:0,win:${win}] [backend initEnv] project ready, projectpath=${project}`
  const created = (win, port) => `[rt:0,win:${win}] AppCreated baseUrl: 'http://127.0.0.1:${port}/native/${win}'`
  const lines = [ready('s0', 'D:\\project'), created('s0', 4567), ready('s1', 'D:\\other'), created('s1', 5678), ready('s2', 'D:\\project'), created('s2', 6789)]
  assert.deepEqual(contextFromLog(lines.join('\n'), 'D:/project'), { winId: 's2', port: 6789, sid: 's2' })
  assert.deepEqual(contextFromLog([...lines, ready('s2', 'D:\\other')].join('\n'), 'D:/project'), { incomplete: true })
  assert.equal(contextFromLog(created('s0', 4567), 'D:/project'), null)
})

test('a newer preparing project never falls back to an older working resource context', async () => {
  const { discoverContext } = await import('./tools/devtoolsResources.mjs')
  const scratch = path.join(__dirname, '..', '.scratch')
  fs.mkdirSync(scratch, { recursive: true })
  const dir = fs.mkdtempSync(path.join(scratch, 'wechat-context-'))
  const data = path.join(dir, 'WeappLocalData')
  const logs = path.join(dir, 'WeappLog', 'logs')
  fs.mkdirSync(data, { recursive: true })
  fs.mkdirSync(logs, { recursive: true })
  fs.writeFileSync(path.join(data, 'localstorage_abc.json'), JSON.stringify({ projectpath: 'D:\\project' }))
  fs.writeFileSync(path.join(logs, 'old.log'), "[rt:0,win:s0] project ready, projectpath=D:\\project\n[rt:0,win:s0] AppCreated baseUrl: 'http://127.0.0.1:45000/native/s0'")
  fs.utimesSync(path.join(logs, 'old.log'), 1, 1)
  fs.writeFileSync(path.join(logs, 'new.log'), '[rt:0,win:s1] project ready, projectpath=D:\\project')
  try { assert.equal(discoverContext('D:/ide', 'D:/project', [data]), null) }
  finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('HTTP 500 alone cannot distinguish invalid context from a missing library', async () => {
  const { classifyResource } = await import('./tools/devtoolsResources.mjs')
  assert.equal(classifyResource(500, '[formatBackedProject] no winId', 40), 'invalid-request')
  assert.equal(classifyResource(500, 'WAWebview.js not found in vendor contents map', 50), 'library-missing')
  assert.equal(classifyResource(500, 'Internal Server Error', 21), 'unclassified-response')
  assert.equal(classifyResource(200, '<html>error</html>', 18, 'text/html'), 'unclassified-response')
  assert.equal(classifyResource(200, 'code', 4, 'application/javascript'), 'resource-ok')
})

test('live HTTP probe supplies all context fields and retains only bounded metadata', async () => {
  const { probeResources } = await import('./tools/devtoolsResources.mjs')
  const seen = []
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost')
    seen.push(url)
    res.setHeader('Content-Type', 'application/javascript')
    res.end('/* private source should not be logged */')
  }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const results = await probeResources({ port: server.address().port, winId: 's2', sid: 's2' }, '3.16.1')
    assert.equal(results.length, 3)
    assert.ok(results.every(result => result.status === 'resource-ok' && !('body' in result)))
    assert.ok(seen.every(url => url.searchParams.get('winId') === 's2' && url.searchParams.get('sid') === 's2' && url.searchParams.get('v') === '3.16.1'))
    await assert.rejects(probeResources({ port: server.address().port }, '3.16.1'), /context/)
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('resource responses have a finite timeout including the body', async () => {
  const { probeResources } = await import('./tools/devtoolsResources.mjs')
  const server = http.createServer(() => {}).listen(0, '127.0.0.1')
  await once(server, 'listening')
  try {
    const results = await probeResources({ port: server.address().port, winId: 's0', sid: 's0' }, '3.16.1', { timeoutMs: 30 })
    assert.ok(results.every(result => result.status === 'timeout'))
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})
