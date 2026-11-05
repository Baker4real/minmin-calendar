const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

// 仓库和 issue 都是公开的，开发者工具截图默认带着真实房间的记录。
// images/ 以外每张入库的图都登记在这里，写明图里是什么、为什么没有真实记录。
// 证据规则见 docs/agents/issue-tracker.md「Close and evidence fallbacks」。

const repoRoot = path.join(__dirname, '..')
// 小程序自己的图标，随包上传。
const APP_IMAGE_ROOT = 'images/'
const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|svg|bmp|heic)$/i
const ALLOWED_IMAGES = {
  'docs/evidence/issue-122/press-danger-row.png': '设置页按住解除绑定的那一行，没有记录数据',
  // #149–#152：430×932 模拟器里换上替身房间（房间码 ABC123、替身经期与欢乐时光）后的裁剪图，不是真实房间。
  'docs/evidence/issue-149/welcome-bar-shown-430x932.png': '替身房间配对后首次进首页：欢迎条在状态行下、周头上；「经期第 3 天」来自替身记录',
  'docs/evidence/issue-149/welcome-bar-gone-on-return-430x932.png': '离开首页再回来，欢迎条已移除；状态行来自替身记录',
  'docs/evidence/issue-149/bind-created-share-primary-430x932.png': '刚创建房间：「发给 TA」是主按钮、「进入应用」是次按钮；房间码 ABC123 是替身码',
  'docs/evidence/issue-149/bind-bound-enter-primary-430x932.png': '已绑定房间且跳首页失败：「进入应用」是主按钮；房间码 ABC123 是替身码',
  'docs/evidence/issue-150/export-confirm-430x932.png': '导出确认弹窗的文案，没有记录数据',
  'docs/evidence/issue-150/export-copied-toast-430x932.png': '选「复制 JSON」后的「已复制到剪贴板」提示（模拟复制），背后是设置页，没有记录数据',
  'docs/evidence/issue-151/periods-failed-retry-row-430x932.png': '只有经期同步失败时的行内重试，没有记录数据',
  'docs/evidence/issue-151/periods-failed-nav-pill-430x932.png': '同步胶囊占据顶栏标题位，月份与状态行完整；替身房间，状态行没有记录数据',
  'docs/evidence/issue-151/periods-unsynced-prediction-sheet-430x932.png': '经期从未同步时预测说明只说暂不预测，没有记录数据',
  'docs/evidence/issue-152/future-plain-sheet-430x932.png': '未来普通日弹层：说明还没到这一天、不给记录动作，没有记录数据',
  'docs/evidence/issue-152/future-predicted-sheet-430x932.png': '未来「预」日弹层：先说预测再说明未到；预测日来自替身记录',
  'docs/evidence/issue-152/future-holiday-sheet-430x932.png': '未来节日（元旦）弹层，没有记录数据',
  'docs/evidence/issue-152/today-sheet-430x932.png': '今天的弹层：记经期、记欢乐时光两个动作，没有记录数据',
  'docs/evidence/issue-152/past-sheet-430x932.png': '过去日期弹层：补记经期、补记欢乐时光两个动作，没有记录数据',
  'docs/evidence/issue-152/empty-state-430x932.png': '零记录替身房间的首页引导，没有记录数据',
}

// 读 index 而不是工作区：提交钩子里跑时，读到的正是这次要提交的文件。
function trackedImages() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(file => IMAGE_FILE.test(file))
}

test('every tracked image outside images/ is allowlisted with what it shows', () => {
  const unlisted = trackedImages().filter(file => !file.startsWith(APP_IMAGE_ROOT) && !Object.hasOwn(ALLOWED_IMAGES, file))
  assert.deepEqual(unlisted, [], 'add each new image to ALLOWED_IMAGES with a note saying it holds no real records')
})

test('every allowlisted image is still tracked and has a note', () => {
  const tracked = new Set(trackedImages())
  for (const [file, note] of Object.entries(ALLOWED_IMAGES)) {
    assert.ok(tracked.has(file), `${file} is allowlisted but no longer tracked`)
    assert.ok(note.trim(), `${file} needs a note`)
  }
})
