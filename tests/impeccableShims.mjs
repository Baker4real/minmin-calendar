// 为 impeccable 检测器生成静态 HTML shim。检测器原生只扫描 pages/ 下的 .js，不识别 WXML/WXSS。
// 用法（项目根）：
//   node tests/impeccableShims.mjs                     # 输出到 .scratch/impeccable-shims/
//   node tests/impeccableShims.mjs --out <dir> --viewport 390
//   然后：<impeccable 启动器> detect --json .scratch/impeccable-shims
// 转换规则：
//   - 样式：先内联 app.wxss，再内联页面 .wxss，层叠顺序与小程序一致；rpx 按 viewport/750 换成 px；
//     page 选择器换成 body。
//   - 标签：view 等容器类 → div，text/icon → span，image → img；wxs/import/include/template 删除。
//   - 属性：保留 class、style、id、placeholder、maxlength、aria-*（aria-role → role），
//     丢弃 wx:*、bind*、catch*、hover-class、data-* 等小程序专属属性。
//   - {{ }}：三元表达式取第一个分支的字面量，其余 class 表达式取第一个字符串字面量，文字取「示例」，
//     style 取 0。
// 局限：wx:if / wx:elif / wx:else 的所有分支同时渲染，wx:for 只渲染一次，原生组件（picker、tabBar、
// 胶囊）没有等价物，:active 与 hover-class 不在静态分析范围。每个元素带 data-src="<wxml>:<行号>"，
// 发现项要回到源码逐条核对后再下结论。
// 已知伪影：shim 在仓库内时，检测器会拿 DESIGN.md frontmatter 的 rpx/rem 值比对换算后的 px，
// design-system-radius / design-system-font-size / design-system-color 多数由此产生，先按伪影处理；
// dark-glow、cramped-padding、nested-cards、side-tab、low-contrast 才是要逐条核对的信号。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
}

const repoRoot = path.resolve(import.meta.dirname, '..')
const outDir = path.resolve(repoRoot, args.out || '.scratch/impeccable-shims')
const viewport = Number(args.viewport || 390)
const rpxRatio = viewport / 750

const CONTAINER_TAGS = new Set([
  'view', 'scroll-view', 'swiper', 'swiper-item', 'picker', 'picker-view', 'picker-view-column',
  'label', 'form', 'navigator', 'movable-area', 'movable-view', 'cover-view', 'page-container',
  'page-meta', 'block'
])
const INLINE_TAGS = new Set(['text', 'icon', 'rich-text'])
const DROPPED_BLOCK_TAGS = new Set(['wxs', 'template'])
const DROPPED_VOID_TAGS = new Set(['import', 'include', 'wxs'])
const KEPT_ATTRS = new Set(['class', 'style', 'id', 'placeholder', 'maxlength', 'src', 'value'])

function read(rel) {
  return readFileSync(path.join(repoRoot, rel), 'utf8')
}

function convertWxss(css) {
  return css
    .replace(/@import[^;]*;/g, '')
    .replace(/(-?\d*\.?\d+)rpx/g, (_, n) => `${Math.round(Number(n) * rpxRatio * 100) / 100}px`)
    .replace(/(^|[\s,}])page(?=\s*[{,:])/g, '$1body')
}

function firstLiteral(expr) {
  const match = expr.match(/'([^']*)'|"([^"]*)"/)
  return match ? (match[1] ?? match[2]) : ''
}

function representative(expr, kind) {
  const trimmed = expr.trim()
  if (kind === 'class') {
    const ternary = trimmed.match(/\?\s*('([^']*)'|"([^"]*)")/)
    if (ternary) return ternary[2] ?? ternary[3] ?? ''
    return firstLiteral(trimmed)
  }
  if (kind === 'style') return '0'
  return '示例'
}

function fillMustache(value, kind) {
  return value.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => representative(expr, kind))
}

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function convertAttrs(raw, srcRef) {
  const out = []
  const attrPattern = /([:\w.-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'))?/g
  let match
  while ((match = attrPattern.exec(raw))) {
    const name = match[1]
    const value = match[3] ?? match[4] ?? ''
    if (name === 'aria-role') {
      out.push(`role="${escapeAttr(fillMustache(value, 'text'))}"`)
    } else if (name.startsWith('aria-')) {
      out.push(`${name}="${escapeAttr(fillMustache(value, 'text'))}"`)
    } else if (KEPT_ATTRS.has(name)) {
      const kind = name === 'class' ? 'class' : name === 'style' ? 'style' : 'text'
      out.push(`${name}="${escapeAttr(fillMustache(value, kind).replace(/\s+/g, ' ').trim())}"`)
    }
  }
  out.push(`data-src="${srcRef}"`)
  return out.join(' ')
}

function lineAt(source, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++
  return line
}

function convertWxml(source, wxmlRel) {
  // 注释换成等长空白，保持下标和行号不变。
  let text = source.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
  for (const tag of DROPPED_BLOCK_TAGS) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, 'g'), m => m.replace(/[^\n]/g, ' '))
  }

  const html = []
  let cursor = 0
  const tagPattern = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  let match
  while ((match = tagPattern.exec(text))) {
    html.push(fillMustache(text.slice(cursor, match.index), 'text'))
    cursor = tagPattern.lastIndex
    const [, closing, rawName, rawAttrs, selfClosing] = match
    const name = rawName.toLowerCase()
    if (DROPPED_VOID_TAGS.has(name)) continue
    let htmlTag = name
    if (CONTAINER_TAGS.has(name)) htmlTag = 'div'
    else if (INLINE_TAGS.has(name)) htmlTag = 'span'
    else if (name === 'image') htmlTag = 'img'
    if (closing) {
      if (htmlTag !== 'img' && htmlTag !== 'input') html.push(`</${htmlTag}>`)
      continue
    }
    const attrs = convertAttrs(rawAttrs, `${wxmlRel}:${lineAt(text, match.index)}`)
    const extra = name === 'block' ? ' style="display:contents"' : ''
    if (htmlTag === 'img' || htmlTag === 'input') {
      html.push(`<${htmlTag} ${attrs}${extra}>`)
    } else if (selfClosing) {
      html.push(`<${htmlTag} ${attrs}${extra}></${htmlTag}>`)
    } else {
      html.push(`<${htmlTag} ${attrs}${extra}>`)
    }
  }
  html.push(fillMustache(text.slice(cursor), 'text'))
  return html.join('')
}

const app = JSON.parse(read('app.json'))
const appCss = convertWxss(read('app.wxss'))
mkdirSync(outDir, { recursive: true })

const written = []
for (const route of app.pages) {
  const wxmlRel = `${route}.wxml`
  const wxssRel = `${route}.wxss`
  const body = convertWxml(read(wxmlRel), wxmlRel)
  let pageCss = ''
  try {
    pageCss = convertWxss(read(wxssRel))
  } catch {}
  const doc = [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta name="viewport" content="width=${viewport}">`,
    `<title>${route}</title>`,
    `<style>\n/* app.wxss */\n${appCss}\n/* ${wxssRel} */\n${pageCss}\n</style>`,
    '</head>',
    `<body>${body}</body>`,
    '</html>',
    ''
  ].join('\n')
  const file = path.join(outDir, route.replace(/^pages\//, '').replace(/\//g, '-') + '.html')
  writeFileSync(file, doc, 'utf8')
  written.push(path.relative(repoRoot, file))
}
console.log(`wrote ${written.length} shims to ${path.relative(repoRoot, outDir)}:`)
for (const file of written) console.log(`  ${file}`)
