import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpClient, createRedactor } from './mcpTransport.mjs'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

export function normalizeRequest(request, project) {
  if (!request || typeof request.name !== 'string' || !request.name.trim()) throw new Error('Each request needs a tool name')
  if (request.arguments != null && (typeof request.arguments !== 'object' || Array.isArray(request.arguments))) throw new Error('Tool arguments must be an object')
  const args = { ...(request.arguments || {}) }
  if (args.project || project) args.project = path.win32.resolve(args.project || project)
  return { name: request.name, arguments: args }
}

function readToken() {
  if (process.env.WECHAT_MCP_TOKEN?.trim()) return Promise.resolve(process.env.WECHAT_MCP_TOKEN.trim())
  if (!process.stdin.isTTY) throw new Error('Set WECHAT_MCP_TOKEN through your controlled environment, or run in a terminal for hidden token input')
  process.stderr.write('WeChat MCP token (hidden): ')
  return new Promise((resolve, reject) => {
    let token = ''
    const oldRaw = process.stdin.isRaw
    const finish = (error) => {
      clearTimeout(timer)
      process.stdin.off('data', receive)
      process.stdin.setRawMode(oldRaw)
      process.stdin.pause()
      process.stderr.write('\n')
      if (error) reject(error)
      else if (!token.trim()) reject(new Error('Token is empty'))
      else resolve(token.trim())
    }
    const receive = chunk => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') return finish(new Error('Token input cancelled'))
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u007f' || char === '\b') token = token.slice(0, -1)
        else token += char
      }
    }
    const timer = setTimeout(() => finish(new Error('Token input timed out')), 60000)
    process.stdin.setRawMode(true)
    process.stdin.on('data', receive)
    process.stdin.resume()
  })
}

export function parseArgs(argv) {
  const options = { ide: 'D:/Program Files (x86)/Tencent/微信web开发者工具', project: repoRoot, timeout: 25000 }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (['--list', '--preflight', '--help'].includes(key)) options[key.slice(2)] = true
    else if (['--ide', '--project', '--requests', '--schema', '--timeout'].includes(key)) {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`)
      options[key.slice(2)] = value
    } else throw new Error(`Unknown option: ${key.split('=')[0]}`)
  }
  options.timeout = Number(options.timeout)
  if (!Number.isSafeInteger(options.timeout) || options.timeout < 1) throw new Error('--timeout must be a positive integer in milliseconds')
  if ([options.list, options.preflight, options.requests, options.schema].filter(Boolean).length > 1) throw new Error('Choose one of --list, --schema, --preflight, --requests')
  return options
}

function resultData(result) {
  if (result.structuredContent) return result.structuredContent
  for (const item of result.content || []) {
    if (item.type === 'text') {
      try { return JSON.parse(item.text) } catch { /* Try the next text block. */ }
    }
  }
  return null
}

export function findViewport(value) {
  if (typeof value === 'string') {
    try { return findViewport(JSON.parse(value)) } catch { return null }
  }
  if (!value || typeof value !== 'object') return null
  if (Number.isFinite(value.windowWidth) && Number.isFinite(value.windowHeight)) return { width: value.windowWidth, height: value.windowHeight }
  for (const nested of Object.values(value)) {
    const viewport = findViewport(nested)
    if (viewport) return viewport
  }
  return null
}

export async function main(argv = process.argv.slice(2)) {
  let client
  let redact = createRedactor([process.env.WECHAT_MCP_TOKEN])
  let logPath
  const interrupted = () => client?.close()
  try {
    const options = parseArgs(argv)
    if (options.help) {
      console.log('node tests/tools/wechatMcp.mjs [--preflight | --requests file.json | --list | --schema exact_tool_name] [--ide directory] [--project directory] [--timeout ms]\nToken: hidden terminal input or WECHAT_MCP_TOKEN; never pass tokens as arguments. Full redacted log: .scratch/devtools/mcp.jsonl, overwritten by each run.')
      return 0
    }
    const executable = path.join(options.ide, '微信开发者工具.exe')
    const entry = path.join(options.ide, 'resources/app.asar.unpacked/js/common/cli/skill-index.js')
    if (!existsSync(executable) || !existsSync(entry)) throw new Error('Official WeChat DevTools executable/skill entry missing; specify the installed directory with --ide')
    const requests = options.requests ? JSON.parse(readFileSync(path.resolve(options.requests), 'utf8')) : null
    const calls = options.requests ? (Array.isArray(requests) ? requests : [requests]).map(request => normalizeRequest(request, options.project)) : null
    if (calls && !calls.length) throw new Error('Request list is empty')
    const token = await readToken()
    redact = createRedactor([token])
    const logDir = path.join(repoRoot, '.scratch/devtools')
    mkdirSync(logDir, { recursive: true })
    logPath = path.join(logDir, 'mcp.jsonl')
    writeFileSync(logPath, '')
    const log = event => appendFileSync(logPath, JSON.stringify({ time: new Date().toISOString(), ...event }) + '\n')
    const bootstrap = "const e=process.argv[1],a=process.argv.slice(2);process.argv=[process.execPath,e,'--electron'].concat(a);require(e)"
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
    delete env.WECHAT_MCP_TOKEN
    client = new McpClient(executable, ['-e', bootstrap, entry, 'mcp', `--token=${token}`], {
      cwd: options.ide, env, timeoutMs: options.timeout, secrets: [token], log,
    })
    process.once('SIGINT', interrupted)
    process.once('SIGTERM', interrupted)
    await client.initialize()
    if (options.preflight) {
      const result = await client.call(normalizeRequest({ name: 'automation_runtime_info', arguments: { action: 'systemInfo' } }, options.project))
      const viewport = findViewport(resultData(result))
      if (!viewport) throw new Error('Runtime reachable but systemInfo did not report an actual viewport; inspect the log')
      console.log(`PASS MCP runtime: viewport ${viewport.width} x ${viewport.height}; project ${options.project}`)
    } else if (calls) {
      for (const call of calls) {
        await client.call(call)
        console.log(redact(`PASS ${call.name}`))
      }
    } else {
      const result = await client.request('tools/list')
      if (!Array.isArray(result.tools)) throw new Error('MCP tools/list returned no tool list')
      if (options.schema) {
        const tool = result.tools.find(tool => tool.name === options.schema)
        if (!tool) throw new Error(`Tool not found: ${options.schema}`)
        console.log(JSON.stringify(redact(tool), null, 2))
      } else console.log(result.tools.map(tool => tool.name).join('\n'))
    }
    return 0
  } catch (error) {
    console.error(redact(`FAIL ${error.message}`))
    return 1
  } finally {
    process.off('SIGINT', interrupted)
    process.off('SIGTERM', interrupted)
    client?.close()
    if (logPath) console.log(`Log: ${logPath}`)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main()
