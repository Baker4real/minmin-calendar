import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

export function createRedactor(secrets = []) {
  const values = secrets.filter(Boolean).flatMap(value => [value, encodeURIComponent(value)])
  function text(value) {
    let output = String(value)
    for (const secret of values) output = output.replaceAll(secret, '[REDACTED]')
    return output.replace(/((?:--)?(?:token|password|secret|authorization|cookie)\s*[=:]\s*)([^\s,;]+)/gi, '$1[REDACTED]')
  }
  return function redact(value) {
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object') return JSON.stringify(redact(parsed))
      } catch { /* Non-JSON diagnostics are still scrubbed below. */ }
      return text(value)
    }
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
        /token|password|secret|authorization|cookie/i.test(key) ? '[REDACTED]' : redact(item)]))
    }
    return value
  }
}

// Fields that say why a tool failed. Everything else may be page data, so it stays in the redacted log.
const ERROR_FIELDS = ['code', 'errCode', 'errno', 'error', 'errMsg', 'message', 'msg', 'reason']
const SUMMARY_LIMIT = 300
const clip = text => text.length > SUMMARY_LIMIT ? `${text.slice(0, SUMMARY_LIMIT)}...` : text

function errorFields(value, nested = false) {
  const fields = {}
  for (const key of ERROR_FIELDS) {
    const item = value[key]
    if (item == null) continue
    if (typeof item !== 'object') fields[key] = item
    else if (!nested && !Array.isArray(item)) fields[key] = errorFields(item, true)
  }
  return fields
}

// A short summary for the FAIL line, so a failure can be classified without reading the log.
function summarize(value) {
  if (typeof value === 'string') {
    let parsed
    try { parsed = JSON.parse(value) } catch { /* Plain-text errors are shown as text. */ }
    if (parsed && typeof parsed === 'object') return summarize(parsed)
    return value.trim() ? JSON.stringify(clip(value.trim())) : ''
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  const fields = errorFields(value)
  if (Object.keys(fields).length) return clip(JSON.stringify(fields))
  return clip(`(no error fields; keys: ${Object.keys(value).join(', ')})`)
}

const withSummary = (reason, summary) => summary ? `${reason} ${summary}` : reason

export function toolFailure(result) {
  if (result?.isError) {
    const text = (result.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n')
    return withSummary('tool returned isError', summarize(text))
  }
  if (result?.structuredContent?.success === false) return withSummary('tool returned success:false', summarize(result.structuredContent))
  for (const item of result?.content || []) {
    if (item.type !== 'text') continue
    try {
      const parsed = JSON.parse(item.text)
      if (parsed?.success === false) return withSummary('tool text returned success:false', summarize(parsed))
    } catch { /* Ordinary text is a valid MCP result. */ }
  }
  return null
}

// MCP's stdio transport sends one JSON-RPC object per line.
export class McpClient {
  constructor(command, args, { timeoutMs = 25000, env = process.env, cwd, secrets = [], log = () => {} } = {}) {
    this.timeoutMs = timeoutMs
    this.redact = createRedactor(secrets)
    this.log = (event, value) => log({ event, value: this.redact(value) })
    this.nextId = 0
    this.pending = new Map()
    this.child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    this.lines = createInterface({ input: this.child.stdout })
    this.stderr = createInterface({ input: this.child.stderr })
    this.stderr.on('line', line => this.log('stderr', line))
    this.lines.on('line', line => {
      let response
      try { response = JSON.parse(line) } catch {
        this.log('non-rpc-stdout', line)
        return
      }
      this.log('response', response)
      const waiter = this.pending.get(response.id)
      if (!waiter) return
      clearTimeout(waiter.timer)
      this.pending.delete(response.id)
      if (response.error) waiter.reject(new Error(this.redact(`MCP ${response.error.code}: ${response.error.message}`)))
      else if (!Object.hasOwn(response, 'result')) waiter.reject(new Error('MCP response has no result'))
      else waiter.resolve(response.result)
    })
    this.child.on('error', error => this.fail(error))
    this.child.stdin.on('error', error => this.fail(error))
    this.child.on('exit', (code, signal) => this.fail(new Error(`MCP bridge exited (code=${code}, signal=${signal})`)))
  }

  fail(error) {
    this.failure ||= new Error(this.redact(error.message))
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(this.failure)
    }
    this.pending.clear()
  }

  request(method, params = {}) {
    if (this.failure) return Promise.reject(this.failure)
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error(`MCP ${method} timed out after ${this.timeoutMs}ms`))
        this.child.kill()
      }, this.timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      const request = { jsonrpc: '2.0', id, method, params }
      this.log('request', request)
      this.child.stdin.write(JSON.stringify(request) + '\n')
    })
  }

  async initialize() {
    await this.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'minmin-devtools', version: '1.0.0' } })
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  }

  async call(request) {
    const result = await this.request('tools/call', request)
    const failure = toolFailure(result)
    if (failure) throw new Error(this.redact(`${request.name}: ${failure}; see the redacted log`))
    return result
  }

  close() {
    this.fail(new Error('MCP bridge closed'))
    this.child.stdin.end()
    this.child.kill()
    this.lines.close()
    this.stderr.close()
  }
}
