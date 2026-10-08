// 按需视觉证据采集：用微信开发者工具自动化（miniprogram-automator）打开本仓库项目并截图。
// 本脚本不进 npm test（它驱动本机 GUI 工具），只在小屏目检证据需要落盘时手动运行。
// 前置条件：
//   1) 微信开发者工具已登录（本机安装于「D:\Program Files (x86)\Tencent\微信web开发者工具」）；
//   2) IDE「设置 → 安全设置 → 服务端口」已开启（automation 依赖该端口）；
//   3) 已在仓库根执行过 npm install（miniprogram-automator 是根 devDependency）。
// 两步用法（项目根目录，bash/正斜杠）：
//   第一步，起 automation 端口（等输出出现端口监听后再继续；若停在 Fetching AppID permissions，
//   多半是 IDE 弹了 GUI 对话框或服务端口未开，需要在 IDE 里人工处理一次）：
//     "/d/Program Files (x86)/Tencent/微信web开发者工具/cli.bat" auto --project "$PWD" --auto-port 9420
//   第二步，连接并截图：
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420                        # 默认截 pages/index/index
//     node tests/devtoolsCapture.mjs --ws ws://127.0.0.1:9420 --pages pages/index/index,pages/period/period
// 说明：automator.launch 自拉起（cliPath 直连）在 Node >=18.20 会因 .bat spawn 安全限制失败，
// 因此一律走上面「先 cli.bat auto、后 --ws 连接」的两步形态。2026-10-09 本机实测：IDE server
// 正常启动、AppID 识别成功，但 automation 端口未出现（停在 Fetching AppID permissions 之后的
// preparing 阶段），live 截图尚未打通——首次使用前先人工在 IDE 里走通一次。
// 截图落在 .scratch/screenshots/（git-ignored）。模拟器视口跟随 IDE 当前选择的机型：
// 需要 320px 宽证据时，先在 IDE 模拟器切到小屏机型再运行本脚本。

import { mkdir } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import automator from 'miniprogram-automator'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
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

try {
  mkdir(outDir, { recursive: true })
  for (const page of pages) {
    await miniProgram.reLaunch('/' + page)
    await new Promise(resolve => setTimeout(resolve, 1200))
    const file = path.join(outDir, page.replace(/\//g, '_') + '.png')
    await miniProgram.screenshot({ path: file })
    console.log('captured:', file)
  }
} finally {
  if (args.ws) miniProgram.disconnect()
  else await miniProgram.close()
}
