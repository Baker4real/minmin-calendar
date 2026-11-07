const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { auroraPeakHex, contrastRatio, meetsContrast } = require('./contrast')

test('white on black is the WCAG 21:1 reference pair and meets 4.5:1', () => {
  assert.equal(contrastRatio('#FFFFFF', '#000000'), 21)
  assert.equal(meetsContrast('#FFFFFF', '#000000'), true)
})

test('white on rose #E8909E fails the 4.5:1 guardrail', () => {
  assert.equal(meetsContrast('#FFFFFF', '#E8909E'), false)
})

test('the aurora peak lays every bloom at full strength over the brightest base stop', () => {
  const css = `
    .page::before { background: linear-gradient(180deg, #000000 0%, #202020 60%, #101010 100%); }
    .aurora-bloom-a { background: radial-gradient(closest-side, rgba(255,255,255,0.5), rgba(255,255,255,0)); }
    .aurora-bloom-b { background: radial-gradient(closest-side, rgba(0,0,0,0.1), rgba(0,0,0,0.25) 40%, rgba(0,0,0,0)); }
    .page.page-hidden .aurora-bloom-a { animation-play-state: paused; }
  `
  // 最亮色标 #202020 叠满 bloom-a 的 50% 白 = #909090；bloom-b 只会让这里变暗，最亮处没有它
  assert.equal(auroraPeakHex(css), '#909090')
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
  // 两个编辑页共用 app.wxss 的同一条规则
  const color = declarationOf('app.wxss', '.field-error', 'color')
  assert.equal(color, WARNING_RED, 'field errors must reuse the warning red')
  for (const surface of stackSurfaces([['app.wxss', '.premium-card']])) {
    const card = toHex(surface)
    const ratio = contrastRatio(color, card)
    assert.ok(ratio >= 4.5, `.field-error ${color} on ${card} is ${ratio.toFixed(2)}:1, below 4.5:1`)
  }
})

test('the light heart stays the happy-time color on memory rows', () => {
  assert.equal(wxssRuleBody('pages/settings/settings.wxss', '.menu-heart'), null)
  assert.equal(declarationOf('pages/memory/memory.wxss', '.memory-heart', 'color'), LIGHT_HEART)
})

test('in-progress duration chip text clears 4.5:1 on the list-card composite', () => {
  // 进行中胶囊叠在经期列表卡上：背景 → 玻璃卡（回退海军 + 8% 白）→ 胶囊底
  const color = declarationOf('pages/period/period.wxss', '.item-duration.ongoing', 'color')
  const fill = cssColor(declarationOf('pages/period/period.wxss', '.item-duration.ongoing', 'background'))
  for (const card of stackSurfaces([['app.wxss', '.premium-card']])) {
    const surface = composite(card, fill, fill.a)
    const ratio = contrastRatio(paint(color, surface), toHex(surface))
    assert.ok(
      ratio >= 4.5,
      `in-progress duration chip ${color} on ${toHex(surface)} is ${ratio.toFixed(2)}:1, below 4.5:1`
    )
  }
})

// issue #158：周期概览卡是玫瑰 → 薰衣草渐变叠在玻璃回退上。标签在画布、玻璃回退
// 和渐变两端的合成面上都要 ≥4.5:1，颜色走现有 --text-secondary 档，不另写透明度
test('cycle overview labels clear 4.5:1 on canvas, glass fallback and both gradient ends', () => {
  const file = 'pages/period/period.wxss'
  const layers = backgroundLayers(exactDeclaration(file, '.cycle-card', 'background'))
  assert.equal(layers.length, 2, 'the cycle card paints one gradient over one base color')
  const base = layerPaint(layers[1])
  const stops = gradientStops(layers[0])
  assert.equal(stops.length, 2, 'the cycle card gradient has a rose end and a lavender end')
  // 画布之外还有极光最亮处（issue #163）：卡面下面是哪一块背景都要过线
  const surfaces = grounds().flatMap(([groundName, ground]) => {
    const fallbackSurface = composite(ground, base, base.a)
    return [
      [groundName, ground],
      [`glass fallback ${layers[1]} on ${groundName}`, fallbackSurface],
      ...stops.map(stop => [`gradient end ${stop.source} on ${groundName}`, composite(fallbackSurface, stop, stop.a)])
    ]
  })

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
// 并在实际合成表面上 ≥4.5:1。stacks 列出元素可能落在的表面栈：自下而上叠在背景上
// （画布和极光最亮处各算一次，issue #163），空栈就是背景本身。只登记关键文字，
// 其余文字保留逐元素调校的透明度（DESIGN.md）。
const REMINDER_ROW = [['pages/index/index.wxss', '.reminder-card'], ['pages/index/index.wxss', '.reminder-card::before']]
const KEY_ASSIST_TEXT = [
  { file: 'pages/period/period.wxss', selector: '.item-note', stacks: [[['app.wxss', '.premium-card']]], note: '经期列表行的作者与备注' },
  { file: 'pages/period/period.wxss', selector: '.memory-note', stacks: [[['app.wxss', '.premium-card']], []], note: '欢乐时光行的作者与备注；刷新失败说明行在画布上' },
  { file: 'pages/period/period.wxss', selector: '.month-excerpt', stacks: [[['app.wxss', '.premium-card']]], note: '收起月份卡的备注摘要' },
  { file: 'pages/period/period.wxss', selector: '.empty-state', stacks: [[['pages/period/period.wxss', '.empty-state']]], note: '记录 tab 空态引导与加载失败标题' },
  { file: 'pages/period/edit/edit.wxss', selector: '.form-hint', stacks: [[['app.wxss', '.premium-card']]], note: '经期状态的后果、天数与时长确认' },
  { file: 'pages/index/index.wxss', selector: '.reminder-text', stacks: [REMINDER_ROW], note: '首页提醒行的下一步说明' },
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

// issue #163：内容画在极光之上。直接压在背景上的文字和叠在半透明行上的文字，在画布和极光最亮处
// 都要 ≥4.5:1。那几条半透明行（提醒、刷新重试、记录分段、绑定页错误条与重试）因此都叠在
// var(--glass-fallback) 上，淡白或淡红只是上面的一层平涂。上面关键辅助文字表里登记过的不重复。
const TEXT_ON_AURORA = [
  { file: 'pages/index/index.wxss', selector: '.partner-welcome', stacks: [[]], note: '首页配对欢迎条' },
  { file: 'pages/index/index.wxss', selector: '.month-summary', stacks: [[]], note: '首页本月小结行' },
  { file: 'pages/index/index.wxss', selector: '.refresh-retry-text', stacks: [[['pages/index/index.wxss', '.refresh-retry'], ['pages/index/index.wxss', '.refresh-retry::before']]], note: '首页刷新失败重试行' },
  { file: 'pages/index/index.wxss', selector: '.reminder-title', stacks: [REMINDER_ROW], note: '首页提醒行标题' },
  { file: 'pages/index/index.wxss', selector: '.empty-guide-text', stacks: [[['pages/index/index.wxss', '.empty-guide']]], note: '首页空态引导' },
  { file: 'pages/index/index.wxss', selector: '.no-room-title', stacks: [[]], note: '未绑定与加载失败标题' },
  { file: 'pages/period/period.wxss', selector: '.segment-option', stacks: [[['pages/period/period.wxss', '.segment-control']]], note: '记录 tab 分段未选项' },
  { file: 'pages/period/period.wxss', selector: '.segment-option.active', stacks: [[['pages/period/period.wxss', '.segment-control'], ['pages/period/period.wxss', '.segment-option.active']]], note: '记录 tab 分段选中项' },
  { file: 'pages/period/period.wxss', selector: '.list-retry-text', stacks: [[]], note: '记录 tab 刷新失败重试行' },
  { file: 'pages/settings/settings.wxss', selector: '.settings-group-title', stacks: [[]], note: '设置分组标题' },
  { file: 'pages/bind/bind.wxss', selector: '.hero-title', stacks: [[]], note: '绑定页大标题' },
  { file: 'pages/bind/bind.wxss', selector: '.hero-desc', stacks: [[]], note: '绑定页说明' },
  { file: 'pages/bind/bind.wxss', selector: '.error-msg', stacks: [[['pages/bind/bind.wxss', '.error-msg']]], note: '绑定页错误条' },
  { file: 'pages/bind/bind.wxss', selector: '.error-retry', stacks: [[['pages/bind/bind.wxss', '.error-retry'], ['pages/bind/bind.wxss', '.error-retry::before']]], note: '绑定页校验失败重试' },
  // 这几条行按下时平涂层加深，按下的那一刻文字也要读得清
  { file: 'pages/index/index.wxss', selector: '.refresh-retry-text', stacks: [[['pages/index/index.wxss', '.refresh-retry'], ['pages/index/index.wxss', '.refresh-retry.refresh-retry-hover::before']]], note: '首页刷新失败重试行（按下）' },
  { file: 'pages/index/index.wxss', selector: '.reminder-text', stacks: [[['pages/index/index.wxss', '.reminder-card'], ['pages/index/index.wxss', '.reminder-card.reminder-card-hover::before']]], note: '首页提醒行说明（按下）' },
  { file: 'pages/bind/bind.wxss', selector: '.error-retry', stacks: [[['pages/bind/bind.wxss', '.error-retry'], ['pages/bind/bind.wxss', '.error-retry.error-retry-hover::before']]], note: '绑定页校验失败重试（按下）' }
]

test('text on the aurora and on translucent rows clears 4.5:1 at the aurora brightest point', () => {
  const failures = []
  for (const item of TEXT_ON_AURORA) {
    const text = layerPaint(exactDeclaration(item.file, item.selector, 'color'))
    for (const surface of item.stacks.flatMap(stackSurfaces)) {
      const ratio = contrastOn(text, surface)
      if (ratio < 4.5) failures.push(`${item.note} ${item.selector} on ${toHex(surface)} = ${ratio.toFixed(2)}:1`)
    }
  }
  assert.deepEqual(failures, [])
})

// 背景两处：画布，和极光最亮处（基底最亮色标叠满三个色团，见 tests/contrast.js）
function grounds() {
  return [
    ['canvas', hex(pageCanvas())],
    ['aurora peak', hex(auroraPeakHex(readSource('app.wxss')))]
  ]
}

// 表面栈自下而上叠在背景上；渐变层在每个色标处各算一次
function stackSurfaces(stack) {
  let surfaces = grounds().map(([, ground]) => ground)
  for (const [file, selector] of stack) {
    const layers = backgroundLayers(surfaceFill(file, selector)).reverse()
    for (const layer of layers) {
      const paints = layer.startsWith('linear-gradient(') ? gradientStops(layer) : [layerPaint(layer)]
      surfaces = surfaces.flatMap(surface => paints.map(paintLayer => composite(surface, paintLayer, paintLayer.a)))
    }
  }
  return [...new Map(surfaces.map(surface => [toHex(surface), surface])).values()]
}

// 表面的填充：background 简写；按压着色要能过渡的平涂伪元素只写 background-color（issue #145）
function surfaceFill(relativePath, selector) {
  const body = exactRuleBody(relativePath, selector)
  for (const property of ['background', 'background-color']) {
    const decl = new RegExp(`(?:^|\\s)${property}\\s*:\\s*([^;]+);`).exec(body)
    if (decl) return decl[1].trim()
  }
  assert.fail(`expected background or background-color on ${selector}`)
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

function exactRuleBody(relativePath, selector) {
  const css = readSource(relativePath).replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  assert.ok(match, `expected exact rule ${selector}`)
  return match[1]
}

function exactDeclaration(relativePath, selector, property) {
  const decl = new RegExp(`(?:^|\\s)${property}\\s*:\\s*([^;]+);`).exec(exactRuleBody(relativePath, selector))
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
