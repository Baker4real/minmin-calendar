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
