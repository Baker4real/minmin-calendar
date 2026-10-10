const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

// 按微信开发者工具的打包规则算出会上传的文件，钉住代码质量扫描的两项预算。
// 口径（as of 2026-10-10，开发者工具 2.02.2609231）见 docs/devtools-verification.md「代码质量扫描口径」。

const repoRoot = path.join(__dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'project.config.json'), 'utf8'))

// 允许进包的根。小程序新增运行时目录时加在这里，其余目录写进 packOptions.ignore。
// project*.config.json 由开发者工具管理，随包上传。
const PACKAGE_ROOTS = ['app.js', 'app.json', 'app.wxss', 'sitemap.json', 'project.config.json', 'project.private.config.json', 'pages/', 'utils/', 'images/']
// 开发者工具内置的上传后缀白名单；.md、.mjs、.yml 等不在其中，不会上传。
const UPLOAD_EXTS = new Set(['.wxml', '.wxss', '.wxs', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.js', '.json', '.cer', '.mp3', '.aac', '.m4a', '.mp4', '.wav', '.ogg', '.silk', '.wasm', '.br', '.cur', '.ico', '.skel', '.crt', '.cert'])
// 「图片和音频资源」计入的后缀：整包这些文件的字节总和要小于 200 KB，不是单个文件上限。
const MEDIA_EXTS = new Set(['.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif', '.flac', '.m4a', '.ogg', '.ape', '.amr', '.wma', '.wav', '.mp3', '.mp4', '.aac', '.aiff', '.caf'])
const MEDIA_LIMIT = 200 * 1024
// 主包上限 1.5 MiB。这里按源文件字节估算，2026-10-10 比开发者工具实测高 0.65%；留 10% 余量吸收编译差异。
const MAIN_PACKAGE_BUDGET = 1.5 * 1024 * 1024 * 0.9
const DEFAULT_IGNORED_DIRS = new Set(['node_modules', '.git', '.svn'])

// 与开发者工具的 packOptions 规则同义：按小写路径匹配，folder 匹配目录前缀，prefix/suffix 匹配文件名。
function ignoredByPackOptions(relPath) {
  const file = '/' + relPath.toLowerCase()
  const base = file.slice(file.lastIndexOf('/') + 1)
  return config.packOptions.ignore.some(rule => {
    const value = rule.value.toLowerCase()
    switch (rule.type) {
      case 'folder': return file.startsWith('/' + value.replace(/^\/+|\/+$/g, '') + '/')
      case 'file': return file === '/' + value.replace(/^\/+/, '')
      case 'prefix': return base.startsWith(value)
      case 'suffix': return base.endsWith(value)
      default: throw new Error(`packOptions.ignore type "${rule.type}" is not modelled; extend tests/package-contents.test.js`)
    }
  })
}

function packagedFiles() {
  const cloudRoot = (config.cloudfunctionRoot || '').replace(/\/+$/, '')
  const files = []
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORED_DIRS.has(entry.name) && rel !== cloudRoot && !ignoredByPackOptions(`${rel}/`)) walk(rel)
      } else if (entry.isFile() && UPLOAD_EXTS.has(path.extname(entry.name).toLowerCase()) && !ignoredByPackOptions(rel)) {
        files.push({ rel, size: fs.statSync(path.join(repoRoot, rel)).size })
      }
    }
  }
  walk('')
  return files
}

const packaged = packagedFiles()

test('only mini program roots go into the upload package', () => {
  const paths = packaged.map(file => file.rel)
  for (const runtime of ['app.json', 'pages/index/index.wxml']) assert.ok(paths.includes(runtime), `${runtime} must stay in the package`)
  const unexpected = paths.filter(rel => !PACKAGE_ROOTS.some(root => (root.endsWith('/') ? rel.startsWith(root) : rel === root)))
  assert.deepEqual(unexpected, [], 'Add these paths to packOptions.ignore in project.config.json, or to PACKAGE_ROOTS if the mini program loads them at runtime')
})

test('images and audio in the package stay under the 200 KB code-quality budget', () => {
  const media = packaged.filter(file => MEDIA_EXTS.has(path.extname(file.rel).toLowerCase()))
  const total = media.reduce((sum, file) => sum + file.size, 0)
  assert.ok(total < MEDIA_LIMIT, `images and audio total ${total} B (limit ${MEDIA_LIMIT} B): ${media.map(file => file.rel).join(', ')}`)
})

test('the main package estimate keeps headroom under 1.5 MiB', () => {
  const total = packaged.filter(file => !file.rel.endsWith('.js.map')).reduce((sum, file) => sum + file.size, 0)
  assert.ok(total < MAIN_PACKAGE_BUDGET, `main package estimate ${total} B (budget ${Math.round(MAIN_PACKAGE_BUDGET)} B)`)
})
