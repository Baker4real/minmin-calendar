const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')

function fake() {
  const child = new EventEmitter(), calls = []
  child.pid = 123
  child.kill = () => { calls.push('kill'); child.emit('exit', 0); return true }
  const spawnProcess = (file, args, opts) => { calls.push({ file, args, opts }); return child }
  return { child, calls, spawnProcess }
}
test('Electron child environments isolate GUI and inspector from inherited Node mode', async () => {
  const { electronEnvironment } = await import('./tools/electronProcess.mjs')
  const env = { ELECTRON_RUN_AS_NODE: '1', electron_run_as_node: '1', KEEP: 'x' }
  assert.deepEqual(electronEnvironment('gui', env), { KEEP: 'x' })
  assert.deepEqual(electronEnvironment('inspect', env), { KEEP: 'x' })
  assert.deepEqual(electronEnvironment('cli', env), { KEEP: 'x', ELECTRON_RUN_AS_NODE: '1' })
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1')
})
test('owned Electron session requires the spawned PID to become ready and closes in finally', async () => {
  const { withElectronSession } = await import('./tools/electronProcess.mjs')
  const h = fake()
  const result = await withElectronSession({ executable: 'electron', mode: 'gui', spawnProcess: h.spawnProcess,
    probe: async () => ({ pid: 123, ready: true }), stopProcess: async c => c.kill() }, async info => info.pid)
  assert.equal(result, 123)
  assert.equal(h.calls.filter(x => x === 'kill').length, 1)
  assert.equal(h.calls[0].opts.env.ELECTRON_RUN_AS_NODE, undefined)
})
test('an existing instance or failed callback never becomes a new owned session', async () => {
  const { withElectronSession } = await import('./tools/electronProcess.mjs')
  for (const mode of ['wrong-pid', 'callback']) {
    const h = fake()
    await assert.rejects(withElectronSession({ executable: 'electron', mode: 'inspect', spawnProcess: h.spawnProcess,
      probe: async () => ({ pid: mode === 'wrong-pid' ? 555 : 123, ready: true }), stopProcess: async c => c.kill() }, async () => { throw new Error('callback failed') }), /identity|callback/)
    assert.equal(h.calls.filter(x => x === 'kill').length, 1)
  }
})
test('a real headless Node inspector is identified by its process and closed after diagnostics', async () => {
  const { createServer } = require('node:net')
  const { withElectronSession, inspectorReady } = await import('./tools/electronProcess.mjs')
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  let ownedPid
  await withElectronSession({ executable: process.execPath, mode: 'inspect', args: [`--inspect=127.0.0.1:${port}`, '-e', 'setInterval(()=>{},1000)'],
    timeoutMs: 5000, probe: ({ pid, signal }) => inspectorReady(port, pid, signal) }, async ({ pid }) => { ownedPid = pid })
  assert.ok(ownedPid > 0)
  assert.throws(() => process.kill(ownedPid, 0), /ESRCH/)
})

test('readiness timeout and early single-instance exit are distinct and bounded', async () => {
  const { withElectronSession } = await import('./tools/electronProcess.mjs')
  const h = fake()
  await assert.rejects(withElectronSession({ executable: 'electron', mode: 'gui', timeoutMs: 20, pollMs: 2,
    spawnProcess: h.spawnProcess, probe: async () => ({ ready: false }), stopProcess: async c => c.kill() }, async () => {}), /timed out/)
  assert.ok(h.calls.includes('kill'))
  const exited = fake()
  await assert.rejects(withElectronSession({ executable: 'electron', mode: 'gui', spawnProcess: exited.spawnProcess,
    probe: async () => { exited.child.emit('exit', 0); return { ready: true, pid: 123 } }, stopProcess: async c => c.kill() }, async () => {}), /exited|handed off/)
  assert.ok(!exited.calls.includes('kill'))
})
