// 按需视觉证据采集：用微信开发者工具自动化（miniprogram-automator）打开本仓库项目并截图。
// 本脚本不进 npm test（它驱动本机 GUI 工具），只在小屏目检证据需要落盘时手动运行。
// 前置条件：
//   1) 微信开发者工具已登录（本机安装于「D:\Program Files (x86)\Tencent\微信web开发者工具」）；
//   2) IDE「设置 → 安全设置 → 服务端口」已开启；
//   3) 已在仓库根执行过 npm install（miniprogram-automator 是根 devDependency）。
// 两步用法（项目根目录，bash/正斜杠）：
//   第一步，起 automation 端口（必须带 --trust-project，否则 CLI 首开项目会停在 preparing、
//   端口永不监听；若之前的尝试留下无响应的 IDE 实例，先 ./cli.bat quit 清一次再重试）：
//     "/d/Program Files (x86)/Tencent/微信web开发者工具/cli.bat" auto --project "$PWD" --auto-port 9420 --trust-project
//   第二步，连接并截图：
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420                                    # 默认截 pages/index/index
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --pages pages/index/index,pages/period/period
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --pages pages/period/period --tap-text 欢乐时光
//   --tap-text 在 reLaunch 后于 --tap-scope（默认 .segment-option）里找含该文字的元素点一下再截图，
//   用于切到目标分段：记录 tab 默认落在经期分段，月份卡在欢乐时光分段。
// 说明：automator.launch 自拉起（cliPath 直连）在 Node >=18.20 会因 .bat spawn 安全限制失败，
// 因此一律走上面「先 cli.bat auto、后 --ws 连接」的两步形态。2026-10-09 本机实测走通：首页、
// 记录 tab 经期分段与欢乐时光分段三张截图均正常渲染（约 375px 视口；320px 口径仍由
// narrow-screen-geometry 静态账本钉住，需要 320px 截图时先在 IDE 模拟器手动切小屏机型再重跑）。
// 截图落在 .scratch/screenshots/（git-ignored）。模拟器视口跟随 IDE 当前选择的机型。

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import automator from 'miniprogram-automator'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '').replace(/-/g, '')] = process.argv[i + 1]
}

const projectPath = path.resolve(import.meta.dirname, '..')
const outDir = args.out || path.join(projectPath, '.scratch', 'screenshots')
const pages = (args.pages || 'pages/index/index')
  .split(',')
  .map(page => page.trim())
  .filter(Boolean)

const miniProgram = args.ws
  ? await automator.connect({ wsEndpoint: args.ws })
  : await automator.launch({
      cliPath: args.cli || 'D:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
      projectPath,
      timeout: 60000,
    })

async function tapByText(scope, wantedText, pagePath) {
  const page = await miniProgram.currentPage()
  const candidates = await page.$$(scope)
  let target = null
  for (const element of candidates) {
    const text = await element.text()
    if (text && text.includes(wantedText)) target = element
  }
  if (!target) {
    console.log(`skip tap on ${pagePath}: "${wantedText}" not found among ${candidates.length} ${scope} elements`)
    return
  }
  await target.tap()
  await new Promise(resolve => setTimeout(resolve, 3000))
}

try {
  mkdirSync(outDir, { recursive: true })
  for (const page of pages) {
    await miniProgram.reLaunch('/' + page)
    await new Promise(resolve => setTimeout(resolve, 1200))
    if (args.taptext) await tapByText(args.tapscope || '.segment-option', args.taptext, page)
    const file = path.join(outDir, page.replace(/\//g, '_') + (args.taptext ? '_tapped.png' : '.png'))
    await miniProgram.screenshot({ path: file })
    console.log('captured:', file)
  }
} finally {
  if (args.ws) miniProgram.disconnect()
  else await miniProgram.close()
}
