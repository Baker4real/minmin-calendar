const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { contrastRatio } = require('./contrast')
const { parseWxssRules } = require('./designTokens')

// issue #57：可点击箭头与其他次要入口的对比度对齐「正文次级」基准 ——
// 未选中 tab `#7A7C8C` 在画布 `#0A0E27` 上达 4.5:1（tabbar-contrast 钉住），
// 箭头/次要入口按同一量级验收：各自表面上合成后的有效对比度 ≥ 4.5:1。

const repoRoot = path.join(__dirname, '..')
const MIN_SECONDARY_RATIO = 4.5

const readFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

const APP_WXSS = readFile('app.wxss')
const APP_TOKENS = Object.fromEntries(
  [...APP_WXSS.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)]
    .map((match) => [`--${match[1]}`, match[2].trim()])
)

function resolveVars(value) {
  return String(value).replace(/var\((--[a-z0-9-]+)\)/gi, (all, name) => {
    assert.ok(APP_TOKENS[name], `unknown token ${name}`)
    return APP_TOKENS[name]
  })
}

function parseColor(value) {
  const resolved = resolveVars(value).trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(resolved)
  if (hex) {
    let digits = hex[1]
    if (digits.length === 3) digits = [...digits].map((ch) => ch + ch).join('')
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
      a: 1
    }
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+)\s*)?\)$/i.exec(resolved)
  if (rgba) {
    return {
      r: Number.parseInt(rgba[1], 10),
      g: Number.parseInt(rgba[2], 10),
      b: Number.parseInt(rgba[3], 10),
      a: rgba[4] === undefined ? 1 : Number.parseFloat(rgba[4])
    }
  }
  throw new Error(`unsupported color: ${value}`)
}

function compositeOver(fg, bg) {
  return {
    r: fg.a * fg.r + (1 - fg.a) * bg.r,
    g: fg.a * fg.g + (1 - fg.a) * bg.g,
    b: fg.a * fg.b + (1 - fg.a) * bg.b,
    a: 1
  }
}

function toHex({ r, g, b }) {
  const channel = (n) => Math.round(n).toString(16).padStart(2, '0')
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase()
}

// 渐变对浅色文字的最不利点是梯度里最亮的色标；本仓 sheet 渐变的亮端都在第一个色标（玫瑰 tint）
function replaceGradientsWithFirstStop(text) {
  const needle = 'linear-gradient('
  let out = ''
  let cursor = 0
  for (;;) {
    const start = text.indexOf(needle, cursor)
    if (start === -1) {
      out += text.slice(cursor)
      break
    }
    out += text.slice(cursor, start)
    let depth = 0
    let end = start + needle.length - 1
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1
      else if (text[end] === ')') {
        depth -= 1
        if (depth === 0) break
      }
    }
    const inner = text.slice(start + needle.length, end)
    const firstStop = /rgba?\([^)]*\)|#[0-9a-f]{3,6}\b/i.exec(inner)
    assert.ok(firstStop, `gradient without a parseable first stop: ${inner}`)
    out += firstStop[0]
    cursor = end + 1
  }
  return out
}

// background 声明按「顶层在前」列层；返回各层颜色（顶层在前），渐变已折叠为首个色标
function backgroundLayers(decl) {
  const flat = replaceGradientsWithFirstStop(resolveVars(decl))
  return [...flat.matchAll(/rgba?\([^)]*\)|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)].map((match) => match[0])
}

const rulesCache = new Map()
function rulesFor(file) {
  if (!rulesCache.has(file)) rulesCache.set(file, parseWxssRules(readFile(file)))
  return rulesCache.get(file)
}

function declarationsFor(file, selector) {
  // 同名选择器可能出现在 @media（如 reduced-motion 兜底）中：按源码顺序级联合并
  let found = null
  for (const rule of rulesFor(file)) {
    if (rule.selectors.includes(selector)) found = { ...(found || {}), ...rule.decls }
  }
  assert.ok(found, `expected rule ${selector} in ${file}`)
  return found
}

function canvasColor() {
  const pageDecls = declarationsFor('app.wxss', 'page')
  assert.ok(pageDecls.background, 'expected a page canvas background')
  return parseColor(pageDecls.background)
}

function applySurface(bg, decl) {
  const layers = backgroundLayers(decl)
  let next = bg
  for (let i = layers.length - 1; i >= 0; i -= 1) {
    next = compositeOver(parseColor(layers[i]), next)
  }
  return next
}

function effectivePair(caseItem) {
  let bg = canvasColor()
  for (const [file, selector] of caseItem.surfaces) {
    const decl = declarationsFor(file, selector).background
    assert.ok(decl, `expected background on ${selector} (${file})`)
    bg = applySurface(bg, decl)
  }
  const own = declarationsFor(caseItem.file, caseItem.selector)
  if (own.background) bg = applySurface(bg, own.background)
  assert.ok(own.color, `expected color on ${caseItem.selector} (${caseItem.file})`)
  const fg = compositeOver(parseColor(own.color), bg)
  return { fg: toHex(fg), bg: toHex(bg) }
}

// 可点击箭头与次要入口矩阵：surfaces 自下而上列出元素背后的实际表面
const CASES = [
  { file: 'pages/period/edit/edit.wxss', selector: '.form-picker-arrow', surfaces: [['app.wxss', '.premium-card'], ['pages/period/edit/edit.wxss', '.form-picker']], note: '表单 picker 箭头（经期编辑）' },
  { file: 'pages/memory/edit/edit.wxss', selector: '.form-picker-arrow', surfaces: [['app.wxss', '.premium-card'], ['pages/memory/edit/edit.wxss', '.form-picker']], note: '表单 picker 箭头（记忆编辑）' },
  { file: 'pages/settings/settings.wxss', selector: '.menu-arrow', surfaces: [['app.wxss', '.premium-card']], note: '设置菜单箭头' },
  { file: 'pages/period/period.wxss', selector: '.item-arrow', surfaces: [['app.wxss', '.premium-card']], note: '经期列表行箭头' },
  { file: 'pages/memory/memory.wxss', selector: '.memory-arrow', surfaces: [['app.wxss', '.premium-card']], note: '欢乐时光列表行箭头' },
  { file: 'pages/index/index.wxss', selector: '.record-entry-arrow', surfaces: [['pages/index/index.wxss', '.record-entry']], note: '记录列表入口箭头' },
  { file: 'pages/index/index.wxss', selector: '.sheet-action-arrow', surfaces: [['pages/index/index.wxss', '.day-action-sheet'], ['pages/index/index.wxss', '.sheet-action']], note: '弹层操作行箭头' },
  { file: 'pages/index/index.wxss', selector: '.sheet-close', surfaces: [['pages/index/index.wxss', '.day-action-sheet']], note: '弹层关闭按钮' },
  { file: 'pages/index/index.wxss', selector: '.nav-btn', surfaces: [], note: '月份前后切换箭头' },
  { file: 'app.wxss', selector: '.nav-back', surfaces: [['app.wxss', '.nav-back-surface']], note: '导航返回箭头' },
  { file: 'pages/index/index.wxss', selector: '.month-title-caret', surfaces: [['pages/index/index.wxss', '.month-title-trigger']], note: '月份选择器 caret' },
  { file: 'pages/period/period.wxss', selector: '.empty-state', surfaces: [], note: '经期列表加载失败重试入口' },
  { file: 'pages/memory/memory.wxss', selector: '.empty-state', surfaces: [], note: '欢乐时光加载失败重试入口' },
  { file: 'pages/bind/bind.wxss', selector: '.bound-code', surfaces: [['app.wxss', '.premium-card']], note: '绑定页点按复制房间码' },
  { file: 'pages/bind/bind.wxss', selector: '.tab', surfaces: [['app.wxss', '.premium-card'], ['pages/bind/bind.wxss', '.tab-bar']], note: '绑定页未选中 tab' },
  { file: 'app.wxss', selector: '.btn-danger', surfaces: [], note: '危险操作（删除/解除绑定）' },
  // issue #77：设置清除本地数据行在点之前就是危险样式，红字在卡片表面上同样要读得清
  { file: 'pages/settings/settings.wxss', selector: '.menu-item.danger .menu-text', surfaces: [['app.wxss', '.premium-card']], note: '设置清除本地数据危险行文字' }
]

test('the 4.5:1 benchmark: unselected tab grey on canvas navy', () => {
  const ratio = contrastRatio('#7A7C8C', '#0A0E27')
  assert.ok(ratio >= MIN_SECONDARY_RATIO, `benchmark drifted: ${ratio.toFixed(2)}:1`)
})

test('every clickable arrow and secondary entry meets the secondary-text contrast floor on its real surface', () => {
  const failures = []
  for (const caseItem of CASES) {
    const { fg, bg } = effectivePair(caseItem)
    const ratio = contrastRatio(fg, bg)
    if (ratio < MIN_SECONDARY_RATIO) {
      failures.push(`${caseItem.note} ${caseItem.selector}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(failures, [])
})

test('picker and settings menu arrows ride the secondary text token, not the decorative tertiary', () => {
  for (const [file, selector] of [
    ['pages/settings/settings.wxss', '.menu-arrow'],
    ['pages/period/edit/edit.wxss', '.form-picker-arrow'],
    ['pages/memory/edit/edit.wxss', '.form-picker-arrow']
  ]) {
    assert.equal(
      declarationsFor(file, selector).color,
      'var(--text-secondary)',
      `${selector} in ${file} must use the secondary text token`
    )
  }
})
