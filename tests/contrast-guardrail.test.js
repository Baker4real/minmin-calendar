const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { contrastRatio, meetsContrast } = require('./contrast')

test('white on black is the WCAG 21:1 reference pair and meets 4.5:1', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21)
  assert.equal(meetsContrast('#FFFFFF', '#000000'), true)
})

test('white on rose #E8909E fails the 4.5:1 guardrail', () => {
  assert.equal(meetsContrast('#FFFFFF', '#E8909E'), false)
})

// ===== issue #77：颜色角色护栏 =====
// 不可点标题（导航标题、未绑定/加载失败标题、设置名称、绑定页大标题、年份数字）用中性文字色；
// 月份标题、经期数字与今天保持玫瑰；清除本地数据行在点之前就是警告红字 + 警告红描边。

const repoRoot = path.join(__dirname, '..')
const NEUTRAL_TITLE_COLOR = 'rgba(255,255,255,0.92)'
const ROSE = '#E8909E'
const LIGHT_HEART = '#F0C4C0'
const WARNING_RED = '#F97373'
const WARNING_RED_BORDER = 'rgba(249,115,115,0.28)'

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function wxssRuleBody(relativePath, selector) {
  const css = readSource(relativePath).replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  return match ? match[1] : null
}

function declarationOf(relativePath, selector, property) {
  const body = wxssRuleBody(relativePath, selector)
  assert.ok(body, `expected rule ${selector} in ${relativePath}`)
  const match = new RegExp(`(?:^|\\s)${property}\\s*:\\s*([^;]+);`).exec(body)
  return match ? match[1].trim() : undefined
}

test('non-interactive titles use the neutral text color, not rose', () => {
  // 导航标题：每个渲染 nav-title 的页面都在页面侧覆盖为中性（共享基类在 app.wxss）
  const NAV_TITLE_PAGES = [
    'pages/index/index.wxss',
    'pages/period/period.wxss',
    'pages/period/edit/edit.wxss',
    'pages/memory/memory.wxss',
    'pages/memory/edit/edit.wxss',
    'pages/settings/settings.wxss'
  ]
  for (const file of NAV_TITLE_PAGES) {
    assert.equal(
      declarationOf(file, '.nav-title', 'color'),
      NEUTRAL_TITLE_COLOR,
      `${file} nav title must be neutral`
    )
  }

  // 未绑定标题、绑定页大标题、选月年份数字
  assert.equal(declarationOf('pages/index/index.wxss', '.no-room-title', 'color'), NEUTRAL_TITLE_COLOR)
  assert.equal(declarationOf('pages/bind/bind.wxss', '.hero-title', 'color'), NEUTRAL_TITLE_COLOR)
  assert.equal(
    declarationOf('pages/index/index.wxss', '.jump-year-value', 'color'),
    'rgba(255,255,255,0.9)',
    'the year readout must be neutral'
  )

  // 加载失败标题：无独立颜色声明，继承 .empty-state 的中性白（不是玫瑰）
  for (const file of ['pages/period/period.wxss', 'pages/memory/memory.wxss']) {
    assert.equal(wxssRuleBody(file, '.load-failed-text'), null,
      `${file} load-failed title must not override the neutral empty-state color`)
    const emptyText = layerPaint(declarationOf(file, '.empty-state', 'color'))
    assert.deepEqual([emptyText.r, emptyText.g, emptyText.b], [1, 1, 1], `${file} empty-state text stays neutral white`)
  }

  // 设置分组标题
  assert.equal(declarationOf('pages/settings/settings.wxss', '.settings-group-title', 'color'), NEUTRAL_TITLE_COLOR)
})

// issue #159：记录动作上的经期标记改为图例色带样本，颜色随 .period-band（下一条测试钉住），不再有单独的玫瑰圆点
test('month title and today stay rose', () => {
  assert.equal(declarationOf('pages/index/index.wxss', '.month-title', 'color'), ROSE,
    'the month title opens the month picker, it keeps rose')
  assert.equal(declarationOf('pages/index/index.wxss', '.day-cell.today .day-num', 'color'), ROSE,
    "today's date stays rose")
})

test('period band stays a translucent rose and date numbers on it clear 4.5:1', () => {
  const band = declarationOf('pages/index/index.wxss', '.period-band', 'background')
  const parsed = /^rgba\(\s*232\s*,\s*144\s*,\s*158\s*,\s*(0\.\d+)\s*\)$/.exec(band)
  assert.ok(parsed, `period band must be rose at 18\u201324% opacity, got ${band}`)
  const alpha = Number(parsed[1])
  assert.ok(alpha >= 0.18 && alpha <= 0.24, `period band alpha ${alpha} is outside 0.18\u20130.24`)

  const grid = composite(
    composite(hex('#0A0E27'), hex('#12163D'), 0.92),
    { r: 1, g: 1, b: 1 },
    0.05
  )
  const rose = hex('#E8909E')
  const bandOnGrid = composite(grid, rose, alpha)
  // 经期今天不画胶囊、不铺整格底（calendar-micro-labels 钉住），日期直接落在色带上
  const todaySurface = bandOnGrid
  const holidaySurface = composite(composite(grid, hex('#D4A574'), 0.08), rose, alpha)

  const dayNum = exactDeclaration('pages/index/index.wxss', '.day-num', 'color')
  const todayOnBand = exactDeclaration('pages/index/index.wxss', '.day-cell.today.period .day-num', 'color')
  assert.ok(meetsContrast(paint(dayNum, bandOnGrid), toHex(bandOnGrid)))
  assert.ok(meetsContrast(paint(dayNum, holidaySurface), toHex(holidaySurface)))
  assert.ok(meetsContrast(paint(todayOnBand, todaySurface), toHex(todaySurface)))
  assert.ok(meetsContrast('#F0C4C0', toHex(todaySurface)), 'the memory heart must stay readable on the band')
})

// issue #162：今天胶囊只包住日期，「预」在胶囊外（几何由 calendar-micro-labels 钉住），今天落在预测窗口时
// 「预」照样直接落在日历网格面上
test('the in-cell 预 stays at least 4.5:1 on the grid, outside the today capsule', () => {
  const chip = cssLayer(exactDeclaration('pages/index/index.wxss', '.predict-mark', 'background'))
  const surface = composite(gridSurface(), chip.color, chip.alpha)
  const foreground = resolvePaint(exactDeclaration('pages/index/index.wxss', '.predict-mark', 'color'))
  const ratio = contrastRatio(foreground, toHex(surface))
  assert.ok(ratio >= 4.5, `预 on the grid ${toHex(surface)} is ${ratio.toFixed(2)}:1`)
})

// issue #162：今天胶囊是浅玫瑰底 + 薰衣草细描边 + 玫瑰数字。数字在胶囊合成面上 ≥4.5:1；
// 胶囊底和网格只差约 1.3:1，形状靠描边：描边叠在胶囊底上，对胶囊外的面 ≥3:1
const TODAY_CAPSULE = '.day-cell.today:not(.period) .day-num::before'

test('today capsule keeps the rose date at 4.5:1 and its lavender edge at 3:1 on the grid, the workday wash and the legend sample', () => {
  const file = 'pages/index/index.wxss'
  const fill = cssColor(exactDeclaration(file, TODAY_CAPSULE, 'background'))
  assert.deepEqual([fill.r, fill.g, fill.b].map(channel => Math.round(channel * 255)), [232, 144, 158], 'the capsule fill is a rose wash')
  const stroke = strokeColor(exactDeclaration(file, TODAY_CAPSULE, 'border'))
  assert.deepEqual([stroke.r, stroke.g, stroke.b].map(channel => Math.round(channel * 255)), [196, 160, 210], 'the capsule edge is lavender')
  const date = resolvePaint(exactDeclaration(file, '.day-cell.today .day-num', 'color'))
  // 今天是调休日时，胶囊叠在调休格的低对比底上
  const wash = cssColor(exactDeclaration(file, '.day-cell.workday', 'background'))
  const workdaySurface = composite(gridSurface(), wash, wash.a)
  // 图例的今天样本：遮罩 → 信息弹层（渐变每个色标各算一次）→ 图例行 → 样本格的网格玻璃底
  const legendSurfaces = stackSurfaces([
    [file, '.day-sheet-mask'],
    [file, '.day-action-sheet'],
    [file, '.legend-row'],
    [file, '.legend-sample.day-cell']
  ]).map(surface => [`legend sample ${toHex(surface)}`, surface])

  for (const [name, outside] of [['grid', gridSurface()], ['workday wash', workdaySurface], ...legendSurfaces]) {
    const capsule = composite(outside, fill, fill.a)
    const edge = composite(capsule, stroke, stroke.a)
    const dateRatio = contrastRatio(date, toHex(capsule))
    assert.ok(dateRatio >= 4.5, `today's date on the capsule over the ${name} ${toHex(capsule)} is ${dateRatio.toFixed(2)}:1`)
    const edgeRatio = contrastRatio(toHex(edge), toHex(outside))
    assert.ok(edgeRatio >= 3, `the capsule edge ${toHex(edge)} on the ${name} ${toHex(outside)} is ${edgeRatio.toFixed(2)}:1`)
  }
})

// 日历网格面：画布 → 玻璃回退海军 → 网格的 5% 白平涂层，层值都读 CSS
function gridSurface() {
  return stackSurfaces([['pages/index/index.wxss', '.calendar-grid']])[0]
}

// border 简写里的颜色（rgba）
function strokeColor(declared) {
  const color = /rgba\([^)]*\)/.exec(declared)
  assert.ok(color, `expected an rgba stroke, got ${declared}`)
  return cssColor(color[0])
}

test('settings clear-local-data uses warning-red text and warning-red border before any tap', () => {
  const wxss = 'pages/settings/settings.wxss'
  assert.equal(declarationOf(wxss, '.menu-item.danger .menu-text', 'color'), WARNING_RED)
  assert.equal(declarationOf(wxss, '.menu-item.danger', 'border'), `1px solid ${WARNING_RED_BORDER}`)
  // 不是第二种红：与 .btn-danger 家族同色
  assert.equal(declarationOf('app.wxss', '.btn-danger', 'color'), WARNING_RED)
  assert.equal(declarationOf('app.wxss', '.btn-danger', 'border'), `1px solid ${WARNING_RED_BORDER}`)
})

test('edit-form field errors reuse the one warning red and clear 4.5:1 on the form card', () => {
  // issue #156：字段错误是警示红族的一种形态，不另立一种红；红字直接落在表单玻璃卡上
  const canvas = hex(pageCanvas())
  const fallback = cssColor(tokenValue('--glass-fallback'))
  const glass = cssColor(tokenValue('--glass-bg'))
  const card = toHex(composite(composite(canvas, fallback, fallback.a), glass, glass.a))
  // 两个编辑页共用 app.wxss 的同一条规则
  const color = declarationOf('app.wxss', '.field-error', 'color')
  assert.equal(color, WARNING_RED, 'field errors must reuse the warning red')
  const ratio = contrastRatio(color, card)
  assert.ok(ratio >= 4.5, `.field-error ${color} on ${card} is ${ratio.toFixed(2)}:1, below 4.5:1`)
})

test('the light heart stays the happy-time color on memory rows', () => {
  assert.equal(wxssRuleBody('pages/settings/settings.wxss', '.menu-heart'), null)
  assert.equal(declarationOf('pages/memory/memory.wxss', '.memory-heart', 'color'), LIGHT_HEART)
})

test('in-progress duration chip text clears 4.5:1 on the list-card composite', () => {
  // 进行中胶囊叠在经期列表卡上：画布 → 玻璃卡（回退海军 + 8% 白）→ 胶囊底
  const color = declarationOf('pages/period/period.wxss', '.item-duration.ongoing', 'color')
  const fill = cssColor(declarationOf('pages/period/period.wxss', '.item-duration.ongoing', 'background'))
  const canvas = hex(pageCanvas())
  const fallback = cssColor(tokenValue('--glass-fallback'))
  const glass = cssColor(tokenValue('--glass-bg'))
  const card = composite(composite(canvas, fallback, fallback.a), glass, glass.a)
  const surface = composite(card, fill, fill.a)
  const ratio = contrastRatio(paint(color, surface), toHex(surface))
  assert.ok(
    ratio >= 4.5,
    `in-progress duration chip ${color} on ${toHex(surface)} is ${ratio.toFixed(2)}:1, below 4.5:1`
  )
})

// issue #158：周期概览卡是玫瑰 → 薰衣草渐变叠在玻璃回退上。标签在画布、玻璃回退
// 和渐变两端的合成面上都要 ≥4.5:1，颜色走现有 --text-secondary 档，不另写透明度
test('cycle overview labels clear 4.5:1 on canvas, glass fallback and both gradient ends', () => {
  const file = 'pages/period/period.wxss'
  const canvas = hex(pageCanvas())
  const layers = backgroundLayers(exactDeclaration(file, '.cycle-card', 'background'))
  assert.equal(layers.length, 2, 'the cycle card paints one gradient over one base color')
  const base = layerPaint(layers[1])
  const fallbackSurface = composite(canvas, base, base.a)
  const stops = gradientStops(layers[0])
  assert.equal(stops.length, 2, 'the cycle card gradient has a rose end and a lavender end')
  const surfaces = [
    ['canvas', canvas],
    [`glass fallback ${layers[1]}`, fallbackSurface],
    ...stops.map(stop => [`gradient end ${stop.source}`, composite(fallbackSurface, stop, stop.a)])
  ]

  const failures = []
  for (const selector of ['.card-label', '.cycle-label']) {
    const text = layerPaint(exactDeclaration(file, selector, 'color'))
    for (const [name, surface] of surfaces) {
      const ratio = contrastOn(text, surface)
      if (ratio < 4.5) failures.push(`${selector} on ${name} (${toHex(surface)}) = ${ratio.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(failures, [])

  for (const selector of ['.card-label', '.cycle-label']) {
    assert.equal(exactDeclaration(file, selector, 'color'), 'var(--text-secondary)',
      `${selector} rides the secondary text tier`)
  }
})

// issue #158：承载操作后果、记录内容或关键说明的辅助文字不弱于 --text-secondary 档，
// 并在实际合成表面上 ≥4.5:1。stacks 列出元素可能落在的表面栈：自下而上叠在画布上，
// 空栈就是画布本身。只登记关键文字，其余文字保留逐元素调校的透明度（DESIGN.md）。
const KEY_ASSIST_TEXT = [
  { file: 'pages/period/period.wxss', selector: '.item-note', stacks: [[['app.wxss', '.premium-card']]], note: '经期列表行的作者与备注' },
  { file: 'pages/period/period.wxss', selector: '.memory-note', stacks: [[['app.wxss', '.premium-card']], []], note: '欢乐时光行的作者与备注；刷新失败说明行在画布上' },
  { file: 'pages/period/period.wxss', selector: '.month-excerpt', stacks: [[['app.wxss', '.premium-card']]], note: '收起月份卡的备注摘要' },
  { file: 'pages/period/period.wxss', selector: '.empty-state', stacks: [[['pages/period/period.wxss', '.empty-state']]], note: '记录 tab 空态引导与加载失败标题' },
  { file: 'pages/period/edit/edit.wxss', selector: '.form-hint', stacks: [[['app.wxss', '.premium-card']]], note: '经期状态的后果、天数与时长确认' },
  { file: 'pages/period/edit/edit.wxss', selector: '.form-label', stacks: [[['app.wxss', '.premium-card']]], note: '经期编辑页的字段名' },
  { file: 'pages/memory/edit/edit.wxss', selector: '.form-label', stacks: [[['app.wxss', '.premium-card']]], note: '欢乐时光编辑页的字段名' },
  { file: 'pages/index/index.wxss', selector: '.reminder-text', stacks: [[['pages/index/index.wxss', '.reminder-card']]], note: '首页提醒行的下一步说明' },
  { file: 'pages/index/index.wxss', selector: '.no-room-desc', stacks: [[]], note: '未绑定与加载失败说明' }
]

// 不承载后果或内容的分组文字保留更安静的一档，不并入关键文字档，但仍 ≥4.5:1
const QUIET_ASSIST_TEXT = [
  { file: 'pages/period/edit/edit.wxss', selector: '.symptom-group-label', stacks: [[['app.wxss', '.premium-card']]], note: '症状分组标题（芯片自己说明内容）' }
]

test('key auxiliary text is no weaker than secondary text and clears 4.5:1 on its real surfaces', () => {
  const secondary = layerPaint('var(--text-secondary)')
  const failures = []
  for (const item of KEY_ASSIST_TEXT) {
    const text = layerPaint(exactDeclaration(item.file, item.selector, 'color'))
    for (const surface of item.stacks.flatMap(stackSurfaces)) {
      const ratio = contrastOn(text, surface)
      const secondaryRatio = contrastOn(secondary, surface)
      if (ratio < 4.5 || ratio + 1e-9 < secondaryRatio) {
        failures.push(`${item.note} ${item.selector} on ${toHex(surface)} = ${ratio.toFixed(2)}:1 (secondary ${secondaryRatio.toFixed(2)}:1)`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

// issue #164：编辑表单里字段名和字段下的说明是同一档辅助文字，直接引用 --text-secondary，不抄一份同值字面量
test('edit form field labels and hints ride the secondary text token', () => {
  for (const [file, selector] of [
    ['pages/period/edit/edit.wxss', '.form-label'],
    ['pages/period/edit/edit.wxss', '.form-hint'],
    ['pages/memory/edit/edit.wxss', '.form-label']
  ]) {
    assert.equal(exactDeclaration(file, selector, 'color'), 'var(--text-secondary)', `${file} ${selector}`)
  }
})

test('non-key grouping labels keep their quieter tier and still clear 4.5:1', () => {
  const secondary = layerPaint('var(--text-secondary)')
  for (const item of QUIET_ASSIST_TEXT) {
    const text = layerPaint(exactDeclaration(item.file, item.selector, 'color'))
    for (const surface of item.stacks.flatMap(stackSurfaces)) {
      const ratio = contrastOn(text, surface)
      assert.ok(ratio >= 4.5, `${item.note} ${item.selector} on ${toHex(surface)} = ${ratio.toFixed(2)}:1`)
      assert.ok(ratio < contrastOn(secondary, surface),
        `${item.note} ${item.selector} is not key text; keep its hand-tuned quieter tier`)
    }
  }
})

// 表面栈自下而上叠在画布上；渐变层在每个色标处各算一次
function stackSurfaces(stack) {
  let surfaces = [hex(pageCanvas())]
  for (const [file, selector] of stack) {
    const layers = backgroundLayers(exactDeclaration(file, selector, 'background')).reverse()
    for (const layer of layers) {
      const paints = layer.startsWith('linear-gradient(') ? gradientStops(layer) : [layerPaint(layer)]
      surfaces = surfaces.flatMap(surface => paints.map(paintLayer => composite(surface, paintLayer, paintLayer.a)))
    }
  }
  return [...new Map(surfaces.map(surface => [toHex(surface), surface])).values()]
}

function contrastOn(text, surface) {
  return contrastRatio(toHex(composite(surface, text, text.a)), toHex(surface))
}

// background 按顶层逗号分层，顶层在前；颜色只能是最后一层（DESIGN.md 玻璃叠层）
function backgroundLayers(declared) {
  const layers = []
  let depth = 0
  let start = 0
  for (let index = 0; index < declared.length; index += 1) {
    const char = declared[index]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      layers.push(declared.slice(start, index).trim())
      start = index + 1
    }
  }
  layers.push(declared.slice(start).trim())
  return layers
}

// 渐变层的各个色标（含 var() token）；角度与色标位置不参与取色
function gradientStops(layer) {
  const match = /^linear-gradient\(([\s\S]*)\)$/.exec(layer.trim())
  assert.ok(match, `expected a linear-gradient layer, got ${layer}`)
  return [...match[1].matchAll(/var\(--[a-z0-9-]+\)|rgba\([^)]*\)|#[0-9a-f]{6}\b/gi)]
    .map(stop => ({ ...layerPaint(stop[0]), source: stop[0] }))
}

// 单个颜色：token 先解析成 app.wxss 里的值；transparent 是零透明度
function layerPaint(value) {
  const trimmed = String(value).trim()
  const token = /^var\((--[a-z0-9-]+)\)$/i.exec(trimmed)
  if (token) return layerPaint(tokenValue(token[1]))
  if (trimmed === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  return cssColor(trimmed)
}

function pageCanvas() {
  const css = readSource('app.wxss').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = css.matchAll(/(?:^|[}\s])page\s*\{([^}]*)\}/g)
  for (const rule of rules) {
    const decl = /(?:^|\s)background\s*:\s*([^;]+);/.exec(rule[1])
    if (decl && /^#[0-9a-f]{6}$/i.test(decl[1].trim())) return decl[1].trim()
  }
  assert.fail('expected a solid page canvas background')
}

function tokenValue(name) {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(readSource('app.wxss'))
  assert.ok(match, `expected ${name} in app.wxss`)
  return match[1].trim()
}

function cssColor(value) {
  const resolved = String(value).trim()
  if (/^#[0-9a-f]{6}$/i.test(resolved)) return { ...hex(resolved), a: 1 }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/.exec(resolved)
  assert.ok(rgba, `expected a hex or rgba color, got ${value}`)
  return {
    r: Number(rgba[1]) / 255,
    g: Number(rgba[2]) / 255,
    b: Number(rgba[3]) / 255,
    a: Number(rgba[4])
  }
}

function exactDeclaration(relativePath, selector, property) {
  const css = readSource(relativePath).replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  assert.ok(match, `expected exact rule ${selector}`)
  const decl = new RegExp(`(?:^|\\s)${property}\\s*:\\s*([^;]+);`).exec(match[1])
  assert.ok(decl, `expected ${property} on ${selector}`)
  return decl[1].trim()
}

function hex(value) {
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16) / 255,
    g: Number.parseInt(match[1].slice(2, 4), 16) / 255,
    b: Number.parseInt(match[1].slice(4, 6), 16) / 255
  }
}

function composite(background, foreground, alpha) {
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha)
  }
}

function toHex(color) {
  const channel = (value) => Math.round(value * 255).toString(16).padStart(2, '0')
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`
}

function cssLayer(declared) {
  const value = declared.trim()
  if (value === 'transparent' || value === 'none') return { color: { r: 0, g: 0, b: 0 }, alpha: 0 }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(0?\.\d+|1(?:\.0*)?)\s*\)$/.exec(value)
  assert.ok(rgba, `expected a color layer, got ${value}`)
  return {
    color: {
      r: Number(rgba[1]) / 255,
      g: Number(rgba[2]) / 255,
      b: Number(rgba[3]) / 255
    },
    alpha: Number(rgba[4])
  }
}

function resolvePaint(declared) {
  const value = declared.trim()
  if (value.startsWith('var(')) {
    const name = value.slice(4, -1).trim()
    const match = new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})`, 'i').exec(readSource('app.wxss'))
    assert.ok(match, `expected ${name} in app.wxss`)
    return match[1]
  }
  assert.match(value, /^#[0-9a-f]{6}$/i)
  return value
}

function paint(declared, background) {
  const rgba = /^rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*(0?\.\d+|1(?:\.0*)?)\s*\)$/.exec(declared.trim())
  if (rgba) return toHex(composite(background, { r: 1, g: 1, b: 1 }, Number(rgba[1])))
  assert.match(declared.trim(), /^#[0-9a-f]{6}$/i)
  return declared.trim()
}
