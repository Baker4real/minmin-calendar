const assert = require('node:assert/strict')
const test = require('node:test')

test('CLI preserves native absolute project identity and does not use shell quoting', async () => {
  const { cliArguments } = await import('./tools/devtoolsCli.mjs')
  assert.deepEqual(cliArguments('auto', 'D:/项目 name/'), ['auto', '--project', 'D:\\项目 name', '--auto-port', '9420', '--trust-project'])
  assert.throws(() => cliArguments('open', 'relative'), /absolute/)
  assert.throws(() => cliArguments('upload', 'D:/project'), /Command/)
  assert.throws(() => cliArguments('auto', 'D:/project', 70000), /port/)
})

test('bounded process reports exit failure, output cap and timeout distinctly', async () => {
  const { runBounded } = await import('./tools/devtoolsCli.mjs')
  const failed = await runBounded(process.execPath, ['-e', 'process.stdout.write("x".repeat(20000));process.exitCode=7'])
  assert.equal(failed.status, 'failed')
  assert.equal(failed.exitCode, 7)
  assert.equal(failed.output.length, 16384)
  const timeout = await runBounded(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 100 })
  assert.equal(timeout.status, 'timeout')
  assert.equal(timeout.exitCode, 124)
  const missing = await runBounded('nonexistent-test-devtools-executable', [])
  assert.equal(missing.status, 'spawn-error')
})
