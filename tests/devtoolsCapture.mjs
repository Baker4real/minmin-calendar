// 按需视觉证据采集：用微信开发者工具自动化（miniprogram-automator）打开本仓库项目并截图。
// 本脚本不进 npm test（它驱动本机 GUI 工具），只在小屏目检证据需要落盘时手动运行。
// 前置条件：
//   1) 微信开发者工具已登录（本机安装于「D:\Program Files (x86)\Tencent\微信web开发者工具」）；
//   2) IDE「设置 → 安全设置 → 服务端口」已开启；
//   3) 已在仓库根执行过 npm install（miniprogram-automator 是根 devDependency）。
// 先 npm run devtools:preflight；连接失败与 MCP 备用路径见 docs/devtools-verification.md。
// 两步用法（项目根目录）：
//   第一步，起 automation 端口（必须带 --trust-project，否则 CLI 首开可能停在 preparing）：
//     "<IDE 目录>/cli.bat" auto --project "<仓库根>" --auto-port 9420 --trust-project
//   第二步，连接并截图：
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --states all
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --states 'home,home:day-detail,bind:join-filled'
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --pages pages/period/period --tap-text 欢乐时光
//   PowerShell 下逗号列表要加引号，否则会被拆成数组。
// 具名状态（--states，逗号分隔，all = 全部；home:month+N / home:month-N 按需翻月）：
//   home、home:bottom、home:month-picker、home:day、home:day-detail、home:tools、home:legend、
//   home:prediction、home:recap、records:period、records:memory、period:new、memory:new、settings、
//   bind:create、bind:join、bind:join-filled、bind:created、bind:check-failed。
//   bind:* 先临时 mock wx.switchTab 挡住已绑定时的自动跳转，再用 setData 切换视图态，房间码用假值
//   ABC123，不写任何云端数据；结束时还原 mock。其余状态展示房间里的真实记录：截图落在
//   .scratch/screenshots/（git-ignored），不要上传或入库。
// 说明：automator.launch 自拉起（cliPath 直连）在 Node >=18.20 会因 .bat spawn 安全限制失败，
// 因此一律走上面「先 cli.bat auto、后 --ws 连接」的两步形态。导航到当前所在页时 automator 不会
// 返回，所以每个状态先离开当前页再进入目标页，保证拿到全新的页面实例。
// 模拟器视口跟随 IDE 当前选择的机型；320px 截图需先在 IDE 模拟器里手动切小屏机型再重跑。

import { mkdirSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import automator from 'miniprogram-automator'
import { probeEndpoint } from './tools/devtoolsPreflight.mjs'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '').replace(/-/g, '')] = process.argv[i + 1]
}

const projectPath = path.resolve(import.meta.dirname, '..')
const outDir = args.out || path.join(projectPath, '.scratch', 'screenshots')
const FAKE_ROOM_CODE = 'ABC123'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

if (!args.ws) throw new Error('Pass --ws after npm run devtools:preflight; see docs/devtools-verification.md for MCP fallback')
await probeEndpoint(args.ws)
// Automator has no cancellation API for a pending connection. Bound the CLI lifetime.
const connectDeadline = setTimeout(() => {
  console.error('Automator handshake timed out after 15s; use MCP fallback in docs/devtools-verification.md')
  process.exit(1)
}, 15000)
let miniProgram
try { miniProgram = await automator.connect({ wsEndpoint: args.ws }) }
finally { clearTimeout(connectDeadline) }

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      miniProgram.disconnect()
      reject(new Error(`${label} timed out after ${ms}ms; disconnected`))
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function currentPath() {
  const page = await withTimeout(miniProgram.currentPage(), 10000, 'currentPage')
  return page ? page.path : ''
}

async function screenshot(file) {
  const deadline = Date.now() + 10000
  let ready = false
  while (Date.now() < deadline) {
    const page = await withTimeout(miniProgram.currentPage(), 3000, 'screenshot currentPage')
    const element = page && await withTimeout(page.$('.page'), 3000, 'page root')
    if (element) {
      const size = await withTimeout(element.size(), 3000, 'page size')
      if (size.width > 0 && size.height > 0) { ready = true; break }
    }
    await sleep(200)
  }
  if (!ready) throw new Error('No rendered page root before screenshot')
  const info = await withTimeout(miniProgram.systemInfo(), 10000, 'systemInfo')
  if (!(info.windowWidth > 0 && info.windowHeight > 0)) throw new Error('Missing actual viewport dimensions')
  await withTimeout(miniProgram.screenshot({ path: file }), 20000, 'screenshot')
  const evidence = { file, route: await currentPath(), viewport: { width: info.windowWidth, height: info.windowHeight }, capturedAt: new Date().toISOString() }
  appendFileSync(path.join(outDir, 'captures.jsonl'), JSON.stringify(evidence) + '\n')
  console.log(`captured ${info.windowWidth}x${info.windowHeight}: ${file}`)
}

// 进入目标页的全新实例：已在目标页时先绕到另一页，避免同页导航挂起。
async function goto(route, settle = 2500) {
  const target = route.replace(/^\//, '')
  if ((await currentPath()) === target) {
    const detour = target === 'pages/settings/settings' ? '/pages/index/index' : '/pages/settings/settings'
    await withTimeout(miniProgram.reLaunch(detour), 20000, `reLaunch ${detour}`)
    await sleep(800)
  }
  await withTimeout(miniProgram.reLaunch('/' + target), 20000, `reLaunch ${target}`)
  await sleep(settle)
  return withTimeout(miniProgram.currentPage(), 10000, 'currentPage')
}

async function tapSelector(page, selector, settle = 1000) {
  const element = await withTimeout(page.$(selector), 10000, `find ${selector}`)
  if (!element) throw new Error(`element not found: ${selector}`)
  await withTimeout(element.tap(), 10000, `tap ${selector}`)
  await sleep(settle)
}

async function tapText(page, selector, wanted, settle = 1100) {
  const candidates = await withTimeout(page.$$(selector), 10000, `find ${selector}`)
  for (const element of candidates) {
    const text = await withTimeout(element.text(), 10000, 'element text')
    if (text && text.includes(wanted)) {
      await withTimeout(element.tap(), 10000, `tap ${wanted}`)
      await sleep(settle)
      return
    }
  }
  throw new Error(`"${wanted}" not found among ${candidates.length} ${selector} elements`)
}

async function home() {
  return goto('/pages/index/index', 3000)
}

async function homeTool(label) {
  const page = await home()
  await tapSelector(page, '.nav-tool')
  await tapText(page, '.sheet-action', label)
}

async function bindView(data) {
  await withTimeout(miniProgram.mockWxMethod('switchTab', { errMsg: 'switchTab:ok' }), 10000, 'mock switchTab')
  try {
    const page = await goto('/pages/bind/bind', 3000)
    await withTimeout(page.setData({
      bound: false,
      revealed: true,
      verifying: false,
      tab: 'create',
      joinCode: '',
      errorMsg: '',
      checkFailed: false,
      needUnbind: false,
      justCreated: false,
      homeJumpFailed: false,
      ...data
    }), 10000, 'bind fixture')
    await sleep(900)
  } catch (error) {
    await withTimeout(miniProgram.restoreWxMethod('switchTab'), 10000, 'restore switchTab')
    throw error
  }
}

const STATES = {
  home: async () => { await home() },
  'home:bottom': async () => { await home(); await withTimeout(miniProgram.pageScrollTo(3000), 10000, 'scroll'); await sleep(900) },
  'home:month-picker': async () => { await tapSelector(await home(), '.month-title-trigger') },
  'home:day': async () => { await tapSelector(await home(), '.day-cell.today') },
  'home:day-detail': async () => {
    // 有记录的今天会直接打开详情，不再经过「查看详情」。
    await tapSelector(await home(), '.day-cell.today')
  },
  'home:tools': async () => { await tapSelector(await home(), '.nav-tool') },
  'home:legend': async () => { await homeTool('图例') },
  'home:prediction': async () => { await homeTool('预测说明') },
  'home:recap': async () => { await homeTool('本月小结') },
  'records:period': async () => { await tapText(await goto('/pages/period/period', 3000), '.segment-option', '经期', 1500) },
  'records:memory': async () => { await tapText(await goto('/pages/period/period', 3000), '.segment-option', '欢乐时光', 2500) },
  'period:new': async () => { await goto('/pages/period/edit/edit', 2000) },
  'memory:new': async () => { await goto('/pages/memory/edit/edit', 2000) },
  settings: async () => { await goto('/pages/settings/settings', 3000) },
  'bind:create': async () => { await bindView({}) },
  'bind:join': async () => { await bindView({ tab: 'join' }) },
  'bind:join-filled': async () => { await bindView({ tab: 'join', joinCode: FAKE_ROOM_CODE.slice(0, 4) }) },
  'bind:created': async () => { await bindView({ bound: true, roomCode: FAKE_ROOM_CODE, justCreated: true }) },
  'bind:check-failed': async () => { await bindView({ errorMsg: '网络不太稳定，请重试', checkFailed: true }) }
}

function resolveState(name) {
  if (STATES[name]) return STATES[name]
  const flip = name.match(/^home:month([+-])(\d+)$/)
  if (flip) {
    const method = flip[1] === '+' ? 'nextMonth' : 'prevMonth'
    const times = Number(flip[2])
    return async () => {
      const page = await home()
      for (let i = 0; i < times; i++) {
        await withTimeout(page.callMethod(method), 10000, method)
        await sleep(500)
      }
      await sleep(800)
    }
  }
  return null
}

function fileNameFor(name) {
  return name.replace(/:/g, '_').replace(/\+/g, 'plus') + '.png'
}

async function captureStates(list) {
  const failures = []
  for (const name of list) {
    const run = resolveState(name)
    if (!run) {
      failures.push(`${name}: unknown state`)
      continue
    }
    try {
      await run()
      const file = path.join(outDir, fileNameFor(name))
      await screenshot(file)
    } catch (error) {
      failures.push(`${name}: ${error.message}`)
      console.log(`failed ${name}: ${error.message}`)
    } finally {
      if (name.startsWith('bind:')) {
        try { await withTimeout(miniProgram.restoreWxMethod('switchTab'), 10000, 'restore switchTab') }
        catch (error) {
          failures.push(`${name}: mock cleanup failed: ${error.message}; refresh the simulator to reset its runtime`)
          break
        }
      }
    }
  }
  return failures
}

async function capturePages() {
  const pages = (args.pages || 'pages/index/index')
    .split(',')
    .map(page => page.trim())
    .filter(Boolean)
  for (const route of pages) {
    const page = await goto('/' + route, 1200)
    if (args.taptext) await tapText(page, args.tapscope || '.segment-option', args.taptext, 3000)
    const file = path.join(outDir, route.replace(/\//g, '_') + (args.taptext ? '_tapped.png' : '.png'))
    await screenshot(file)
  }
  return []
}

let failures = []
try {
  mkdirSync(outDir, { recursive: true })
  if (args.states) {
    const list = args.states === 'all'
      ? Object.keys(STATES)
      : args.states.split(',').map(name => name.trim()).filter(Boolean)
    failures = await captureStates(list)
    // 收尾回到首页的全新实例，模拟器留在当月。
    if (!failures.some(failure => failure.includes('mock cleanup failed'))) {
      try { await home() } catch (error) { failures.push(`return home: ${error.message}`) }
    }
  } else {
    failures = await capturePages()
  }
} finally {
  miniProgram.disconnect()
}
if (failures.length) {
  console.log(`${failures.length} state(s) failed:\n  ${failures.join('\n  ')}`)
  process.exitCode = 1
}
