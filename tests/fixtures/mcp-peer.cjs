const readline = require('node:readline')
const mode = process.argv[2]
const lines = readline.createInterface({ input: process.stdin })
lines.on('line', line => {
  const request = JSON.parse(line)
  if (request.id == null) return
  if (request.method === 'initialize') return reply(request.id, { protocolVersion: '2024-11-05', capabilities: {} })
  if (mode === 'timeout') return
  if (mode === 'exit') return process.exit(7)
  if (mode === 'rpc') return process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -1, message: 'test failure' } }) + '\n')
  if (mode === 'isError') return reply(request.id, { isError: true, content: [] })
  if (mode === 'structured') return reply(request.id, { structuredContent: { success: false } })
  if (mode === 'text') return reply(request.id, { content: [{ type: 'text', text: '{"success":false,"message":"test failure"}' }] })
  if (mode === 'redact') {
    process.stderr.write('test-')
    setTimeout(() => {
      process.stderr.write('credential\n')
      reply(request.id, { structuredContent: { success: true, token: 'other-credential', message: 'test-credential' } })
    }, 5)
    return
  }
  reply(request.id, { content: [{ type: 'text', text: 'ok' }] })
})
function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n') }
