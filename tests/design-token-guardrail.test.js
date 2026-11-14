const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  PALETTE_HEXES,
  definedRadiusTokens,
  findOffPaletteHexes,
  findOffPaletteHexesInInlineStyles,
  findOffTokenRadii,
  listWxmlFiles,
  listWxssFiles,
  parseWxssRules
} = require('./designTokens')
const { wxmlElementTree } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')

test('palette registry stays normalized six-digit hex', () => {
  for (const hex of PALETTE_HEXES) {
    assert.match(hex, /^#[0-9A-F]{6}$/)
  }
})

test('palette guardrail flags hex colors outside the DESIGN.md palette', () => {
  const violations = findOffPaletteHexes('.a { color: #9ED6AE; }\n.b { background: #123456; }')
  assert.deepEqual(violations.map((v) => v.normalized), ['#9ED6AE', '#123456'])
})

test('palette guardrail accepts registered colors regardless of case or shorthand', () => {
  const css = '.a { color: #e8909e; }\n.b { color: #fff; }\n.c { background: #0a0e27; }'
  assert.deepEqual(findOffPaletteHexes(css), [])
})

test('palette guardrail ignores hex-like text inside comments', () => {
  const css = '/* removed green #9ED6AE */\n.a { color: #E8909E; }'
  assert.deepEqual(findOffPaletteHexes(css), [])
})

test('every WXSS file uses only DESIGN.md palette hex colors', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const violation of findOffPaletteHexes(fs.readFileSync(file, 'utf8'))) {
      violations.push(`${relative}:${violation.line} ${violation.hex}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('inline-style guardrail flags off-palette hex in WXML style attributes', () => {
  const wxml = [
    `<view style="color: #9ED6AE">x</view>`,
    `<view style="color: {{done ? '#e8909e' : '#fff'}}">y</view>`
  ].join('\n')
  const violations = findOffPaletteHexesInInlineStyles(wxml)
  assert.deepEqual(violations.map((v) => v.normalized), ['#9ED6AE'])
})

test('inline-style guardrail ignores hex-like text outside style attributes', () => {
  const wxml = '<!-- #9ED6AE --><view class="a" data-note="#123456">#9ED6AE</view>'
  assert.deepEqual(findOffPaletteHexesInInlineStyles(wxml), [])
})

test('every WXML inline style uses only DESIGN.md palette hex colors', () => {
  const violations = []
  for (const file of listWxmlFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const violation of findOffPaletteHexesInInlineStyles(fs.readFileSync(file, 'utf8'))) {
      violations.push(`${relative}:${violation.line} ${violation.hex}`)
    }
  }
  assert.deepEqual(violations, [])
})

test('radius guardrail flags literal radii outside tokens', () => {
  const defined = new Set(['radius-md'])
  const css = [
    '.a { border-radius: 17rpx; }',
    '.b { border-radius: 50%; }',
    '.c { border-radius: 12rpx 12rpx 0 0; }'
  ].join('\n')
  const violations = findOffTokenRadii(css, defined)
  assert.deepEqual(violations.map((v) => v.component), ['17rpx', '50%', '12rpx', '12rpx'])
})

test('radius guardrail accepts tokens and zero resets', () => {
  const defined = new Set(['radius-card', 'radius-md'])
  const css = [
    '.a { border-radius: var(--radius-md); }',
    '.b { border-radius: var(--radius-card) var(--radius-card) 0 0; }',
    '.c { border-radius: 0; }',
    // 平涂层、柔光层跟宿主同一个圆角：inherit 取的是宿主的 token，宿主那条照样受检
    '.a::before { border-radius: inherit; }'
  ].join('\n')
  assert.deepEqual(findOffTokenRadii(css, defined), [])
})

test('radius guardrail flags tokens not defined in app.wxss', () => {
  const defined = new Set(['radius-md'])
  const violations = findOffTokenRadii('.a { border-radius: var(--radius-huge); }', defined)
  assert.deepEqual(violations.map((v) => v.component), ['var(--radius-huge)'])
})

test('radius guardrail flags a trailing literal radius without a semicolon', () => {
  const defined = new Set(['radius-md'])
  // 末位声明可以合法省略分号：border-radius: 18rpx } 同样必须被拦
  const css = '.a { border-radius: var(--radius-md); border-top-left-radius: 18rpx }'
  assert.deepEqual(findOffTokenRadii(css, defined).map((v) => v.component), ['18rpx'])
})

test('every WXSS file uses only registered radius tokens', () => {
  const appTokens = definedRadiusTokens(fs.readFileSync(path.join(repoRoot, 'app.wxss'), 'utf8'))
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const violation of findOffTokenRadii(fs.readFileSync(file, 'utf8'), appTokens)) {
      violations.push(`${relative}:${violation.line} ${violation.component}`)
    }
  }
  assert.deepEqual(violations, [])
})

// 间距阶梯：DESIGN.md spacing 节登记的 4/8/16/24/32/48px 名义刻度，token 以 rpx 记（数值 ×2）。
const SPACING_TOKENS = {
  '--space-xs': '8rpx',
  '--space-sm': '16rpx',
  '--space-md': '32rpx',
  '--space-lg': '48rpx',
  '--space-xl': '64rpx',
  '--space-xxl': '96rpx'
}

function appCustomProperties() {
  const tokens = {}
  for (const rule of parseWxssRules(fs.readFileSync(path.join(repoRoot, 'app.wxss'), 'utf8'))) {
    for (const [prop, value] of Object.entries(rule.decls)) {
      if (prop.startsWith('--')) tokens[prop] = value
    }
  }
  return tokens
}

test('app.wxss defines the shared spacing scale tokens and DESIGN.md registers them', () => {
  const tokens = appCustomProperties()
  const design = fs.readFileSync(path.join(repoRoot, 'DESIGN.md'), 'utf8')
  for (const [name, value] of Object.entries(SPACING_TOKENS)) {
    assert.equal(tokens[name], value, `${name} should be ${value}, got ${tokens[name]}`)
    assert.ok(design.includes(name), `DESIGN.md is missing the ${name} registration`)
  }
})

// 页面节奏角色（issue #164）：记录、欢乐时光、设置和两个编辑页共用一套留白。数值留在各页 WXSS，
// 这里按角色逐处比对，同一角色不许各页各写一个近似值。首页吸顶区与日历的槽位归几何账本
// （utils/calendarRowHeight.js），这里只登记它的页边距；绑定页是居中 hero 布局，不在表里。
const PAGE_RHYTHM_RPX = { gutter: 24, firstBlock: 24, blockGap: 20, rowInset: 30 }
const PAGE_RHYTHM_SITES = [
  ['gutter', 'pages/index/index.wxss', '.content', 'padding', 'x'],
  ['gutter', 'pages/index/index.wxss', '.home-sticky', 'padding', 'x'],
  ['gutter', 'pages/period/period.wxss', '.content', 'padding', 'x'],
  ['gutter', 'pages/memory/memory.wxss', '.content', 'padding', 'x'],
  ['gutter', 'pages/settings/settings.wxss', '.content', 'padding', 'x'],
  ['gutter', 'pages/period/edit/edit.wxss', '.content', 'padding', 'x'],
  ['gutter', 'pages/memory/edit/edit.wxss', '.content', 'padding', 'x'],
  ['firstBlock', 'pages/period/period.wxss', '.segment-control', 'margin', 'top'],
  ['firstBlock', 'pages/memory/memory.wxss', '.btn-premium', 'margin', 'top'],
  ['firstBlock', 'pages/settings/settings.wxss', '.content', 'padding', 'top'],
  ['firstBlock', 'pages/period/edit/edit.wxss', '.content', 'padding', 'top'],
  ['firstBlock', 'pages/memory/edit/edit.wxss', '.content', 'padding', 'top'],
  ['blockGap', 'pages/period/period.wxss', '.segment-control', 'margin', 'bottom'],
  ['blockGap', 'pages/period/period.wxss', '.cycle-card', 'margin', 'bottom'],
  ['blockGap', 'pages/period/period.wxss', '.btn-premium', 'margin', 'bottom'],
  ['blockGap', 'pages/period/period.wxss', '.month-card', 'margin', 'bottom'],
  ['blockGap', 'pages/memory/memory.wxss', '.btn-premium', 'margin', 'bottom'],
  ['blockGap', 'pages/period/edit/edit.wxss', '.btns', 'margin', 'top'],
  ['blockGap', 'pages/memory/edit/edit.wxss', '.btns', 'margin', 'top'],
  ['rowInset', 'pages/period/period.wxss', '.list-item', 'padding', 'x'],
  ['rowInset', 'pages/period/period.wxss', '.skeleton-item', 'padding', 'x'],
  ['rowInset', 'pages/period/period.wxss', '.month-header', 'padding', 'x'],
  // 刷新失败重试行站在列表行的位置上（经期与欢乐时光两段同一条行），按列表行的内边距
  ['rowInset', 'pages/period/period.wxss', '.list-retry', 'padding', 'x'],
  ['rowInset', 'pages/memory/memory.wxss', '.list-item', 'padding', 'x'],
  ['rowInset', 'pages/settings/settings.wxss', '.menu-item', 'padding', 'x'],
  ['rowInset', 'pages/settings/settings.wxss', '.density-menu-desc', 'padding', 'x'],
  ['rowInset', 'pages/settings/settings.wxss', '.density-control', 'margin', 'x'],
  ['rowInset', 'pages/settings/settings.wxss', '.room-code-actions', 'padding', 'x']
]

function splitBoxValue(value) {
  const parts = []
  let depth = 0
  let current = ''
  for (const ch of String(value).trim()) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (/\s/.test(ch) && depth === 0) {
      if (current) parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current) parts.push(current)
  return parts
}

function lengthRpx(raw, tokens) {
  const value = String(raw || '').trim()
  if (value === '0') return 0
  const token = /^var\((--[a-z0-9-]+)\)$/.exec(value)
  const resolved = token ? tokens[token[1]] : value
  const rpx = /^(\d+(?:\.\d+)?)rpx$/.exec(resolved || '')
  return rpx ? Number(rpx[1]) : NaN
}

// margin/padding 某一边的 rpx；side 为 x 时左右必须相等。没写这一边就是 0。
// 同一选择器的多条规则按出现顺序层叠（例如减弱动效块里只写 transition 的那条不清掉内边距）。
function boxSideRpx(file, selector, prop, side, tokens) {
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    .filter((candidate) => candidate.selectors.includes(selector))
  assert.ok(rules.length > 0, `expected ${selector} in ${file}`)
  const sides = { top: '0', right: '0', bottom: '0', left: '0' }
  for (const rule of rules) {
    if (rule.decls[prop]) {
      const parts = splitBoxValue(rule.decls[prop])
      const [top, right = top, bottom = top, left = right] = parts
      Object.assign(sides, { top, right, bottom, left })
    }
    for (const name of Object.keys(sides)) {
      if (rule.decls[`${prop}-${name}`]) sides[name] = rule.decls[`${prop}-${name}`]
    }
  }
  if (side === 'x') {
    const left = lengthRpx(sides.left, tokens)
    assert.equal(lengthRpx(sides.right, tokens), left, `${file} ${selector} ${prop} left and right differ`)
    return left
  }
  return lengthRpx(sides[side], tokens)
}

test('records, memory, settings and edit pages share one value per page-rhythm role', () => {
  const tokens = appCustomProperties()
  const drift = []
  for (const [role, file, selector, prop, side] of PAGE_RHYTHM_SITES) {
    const rpx = boxSideRpx(file, selector, prop, side, tokens)
    if (rpx !== PAGE_RHYTHM_RPX[role]) {
      drift.push(`${role}: ${file} ${selector} ${prop}-${side} is ${rpx}rpx, the role is ${PAGE_RHYTHM_RPX[role]}rpx`)
    }
  }
  assert.deepEqual(drift, [])
})

test('both record segments start their first block one block gap below the segment control', () => {
  // 相邻竖向外边距合并取大值：切到另一段时，第一块（周期概览卡 / 记欢乐时光按钮）不上下跳
  const tokens = appCustomProperties()
  const file = 'pages/period/period.wxss'
  const segmentBottom = boxSideRpx(file, '.segment-control', 'margin', 'bottom', tokens)
  for (const firstBlock of ['.cycle-card', '.btn-premium']) {
    const gap = Math.max(segmentBottom, boxSideRpx(file, firstBlock, 'margin', 'top', tokens))
    assert.equal(gap, PAGE_RHYTHM_RPX.blockGap, `${firstBlock} sits ${gap}rpx below the segment control`)
  }
})

test('the settings danger zone is set apart from the regular groups by a larger ladder gap', () => {
  // 外边距合并：只有比分组间距大，危险区的上外边距才真的拉开距离
  const tokens = appCustomProperties()
  const file = 'pages/settings/settings.wxss'
  const groupGap = boxSideRpx(file, '.settings-group', 'margin', 'bottom', tokens)
  const dangerGap = Math.max(groupGap, boxSideRpx(file, '.settings-danger-zone', 'margin', 'top', tokens))
  assert.ok(dangerGap > groupGap, `the danger zone sits ${dangerGap}rpx below the last group, no further than the ${groupGap}rpx group gap`)
  assert.ok(Object.values(SPACING_TOKENS).includes(`${dangerGap}rpx`), `${dangerGap}rpx is not a spacing ladder step`)
})

test('glass fallback fill has a single token source', () => {
  const tokens = appCustomProperties()
  assert.equal(tokens['--glass-fallback'], 'rgba(18,22,61,0.92)')

  const fallbackPattern = /rgba\(\s*18\s*,\s*22\s*,\s*61\s*,\s*0\.92\s*\)/
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const code = line.replace(/\/\*[\s\S]*?\*\//g, '')
      if (!fallbackPattern.test(code)) return
      if (relative === 'app.wxss' && code.includes('--glass-fallback')) return
      violations.push(`${relative}:${index + 1} hardcodes the glass fallback instead of var(--glass-fallback)`)
    })
  }
  assert.deepEqual(violations, [])
})

// issue #104：绑定页紫粉试点（issue #86–#89）结论是「不推广」，页面级 --bind-* token 与
// 例外色板整体退役；色板护栏回到 deny-by-default 单一 Aurora 色板（tests/designTokens.js），
// 绑定页任何紫粉字面量会被「every WXSS file uses only DESIGN.md palette hex colors」直接拒绝。

const CTA_FILL_SELECTORS = [
  ['app.wxss', '.btn-premium'],
  ['pages/settings/settings.wxss', '.copy-btn'],
  // issue #104：绑定页复制键回归玫瑰填充。创建/加入是分段控件，选中态不走实色填充（issue #145）。
  ['pages/bind/bind.wxss', '.copy-btn'],
  // issue #145：创建/加入是分段控件，选中态不走实色填充。issue #137：选月确认按钮已退役。
  ['pages/index/index.wxss', '.quick-btn'],
  ['pages/index/index.wxss', '.reminder-action'],
  ['pages/index/index.wxss', '.jump-option.active'],
  ['pages/index/index.wxss', '.copy-recap']
]

test('primary CTA rose fill comes from var(--aurora-pink) only', () => {
  for (const [relative, selector] of CTA_FILL_SELECTORS) {
    const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
    const rule = rules.find((candidate) => candidate.selectors.includes(selector))
    assert.ok(rule, `expected rule ${selector} in ${relative}`)
    assert.equal(
      rule.decls.background,
      'var(--aurora-pink)',
      `${relative} ${selector} fill must reference var(--aurora-pink)`
    )
  }
})

// issue #145：分段控件只有一种选中态。描边玫瑰弱选中，不用主按钮实色填充。
// 记录分类、设置页密度、绑定页创建/加入是全部分段控件。
const SEGMENTED_SELECTED = {
  color: '#E8909E',
  background: 'rgba(232,144,158,0.08)',
  'border-color': 'rgba(232,144,158,0.45)'
}
const SEGMENTED_CONTROLS = [
  ['pages/period/period.wxss', '.segment-option.active'],
  ['pages/settings/settings.wxss', '.density-option.active'],
  ['pages/bind/bind.wxss', '.tab.active']
]

test('segmented controls share one outlined-rose selected style', () => {
  for (const [relative, selector] of SEGMENTED_CONTROLS) {
    const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
    const rule = rules.find((candidate) => candidate.selectors.includes(selector))
    assert.ok(rule, `expected rule ${selector} in ${relative}`)
    for (const [prop, value] of Object.entries(SEGMENTED_SELECTED)) {
      assert.equal(rule.decls[prop], value, `${relative} ${selector} ${prop}`)
    }
  }
})

// issue #145：主按钮只有一种形状，圆角矩形 --radius-md。
// 选月确认、复制小结、提醒卡上的玫瑰操作是现在的胶囊；复制键与重试小按钮不是主按钮。
const PRIMARY_BUTTONS = [
  ['app.wxss', '.btn-premium'],
  ['pages/index/index.wxss', '.quick-btn'],
  ['pages/index/index.wxss', '.reminder-action'],
  ['pages/index/index.wxss', '.copy-recap']
]

test('primary buttons share the rounded-rectangle radius', () => {
  for (const [relative, selector] of PRIMARY_BUTTONS) {
    const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
    const rule = rules.find((candidate) => candidate.selectors.includes(selector))
    assert.ok(rule, `expected rule ${selector} in ${relative}`)
    assert.equal(
      rule.decls['border-radius'],
      'var(--radius-md)',
      `${relative} ${selector} must use --radius-md`
    )
  }
})

// issue #145：:active 与 hover-class 写在同一条规则里。hover 类重复它前面那个类名。
function cleanSelector(selector) {
  return selector.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
}

function hoverSelectorPairedWithActive(selector) {
  if (!selector.includes(':active')) return null
  const paired = selector.replace(
    /\.([A-Za-z_][\w-]*)((?::not\([^)]*\))*):active\b/g,
    '.$1$2.$1-hover'
  )
  if (paired === selector || paired.includes(':active')) return null
  return paired
}

test('every :active selector is paired with its hover-class in the same rule', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const rules = parseWxssRules(fs.readFileSync(file, 'utf8')).map((rule) => ({
      ...rule,
      selectors: rule.selectors.map(cleanSelector).filter(Boolean)
    }))
    for (const rule of rules) {
      for (const selector of rule.selectors) {
        const paired = hoverSelectorPairedWithActive(selector)
        if (!paired) {
          if (selector.includes(':active')) violations.push(`${relative} ${selector} has no hover-class pair`)
          continue
        }
        if (!rule.selectors.includes(paired)) {
          violations.push(`${relative} ${selector} is missing ${paired}`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

// issue #122：开发者工具按 hover-class 画按压，只写 :active 不画。每个可点控件（bindtap/catchtap，
// 弹层面板挡冒泡的 catchtap="noop" 除外）带 hover-class：自己的一个类名加 -hover，并写进 :active 规则。
function tapControls(nodes, found = []) {
  for (const node of nodes) {
    const handler = node.attrs.bindtap || node.attrs.catchtap
    if (handler && handler !== 'noop') found.push(node)
    tapControls(node.children, found)
  }
  return found
}

test('every tappable control carries its own hover-class, painted by an :active rule', () => {
  const activeClasses = new Set(listWxssFiles(repoRoot).flatMap((file) =>
    parseWxssRules(fs.readFileSync(file, 'utf8'))
      .filter((rule) => rule.selectors.some((selector) => selector.includes(':active')))
      .flatMap((rule) => rule.selectors.flatMap((selector) => selector.match(/\.[\w-]+/g) || []))))
  const violations = []
  for (const file of listWxmlFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const control of tapControls(wxmlElementTree(fs.readFileSync(file, 'utf8')))) {
      const label = `${relative} <${control.tag} class="${control.attrs.class || ''}">`
      const hover = control.attrs['hover-class'] || ''
      const stem = hover.endsWith('-hover') ? hover.slice(0, -'-hover'.length) : ''
      if (!stem || !control.classes.includes(stem)) {
        violations.push(`${label} hover-class=${hover || '(missing)'}`)
      } else if (!activeClasses.has(`.${hover}`)) {
        violations.push(`${label} hover-class ${hover} is in no :active rule`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

// issue #145：按压着色不能写在 background-image 上。渐变层不会插值，标称的过渡实际是瞬间切换。
test('press color does not ride a gradient image', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      if (!rule.selectors.some((selector) => selector.includes(':active'))) continue
      for (const prop of ['background', 'background-image']) {
        const value = rule.decls[prop]
        if (value && GRADIENT_FILL.test(value)) {
          violations.push(`${relative} ${rule.selectors.join(', ')} sets ${prop} to a gradient`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

// CTA 色义 deny-by-default（issue #59 review）：主操作填充只有 var(--aurora-pink) 一条路。
// 上面的钉点表只管已登记选择器；这里反向拦截——任何选择器的渐变填充与实色玫瑰字面量填充
// 默认拒绝。白名单里的渐变只有两类：装饰性渐变，以及叠在 var(--glass-fallback) 上的平涂 tint 图像层
// （issue #122）。平涂层两端色标相同，只为让颜色成为 background 的最后一层，海军回退才会画出来；
// 它不是装饰渐变，也不是新的 CTA 填充。任意新渐变仍然拒绝。
const GRADIENT_FILL_ALLOWLIST = new Set(
  [
    // 极光基底与三个色团、导航头辉光、卡缘高光、底部 sheet 面板、周期卡：装饰性渐变，非可操作填充
    ['app.wxss', '.page::before'],
    ['app.wxss', '.aurora-bloom-violet'],
    ['app.wxss', '.aurora-bloom-rose'],
    ['app.wxss', '.aurora-bloom-lavender'],
    ['app.wxss', '.header-gradient::before'],
    ['app.wxss', '.header-gradient::after'],
    ['app.wxss', '.premium-card::after'],
    ['pages/index/index.wxss', '.month-nav::before'],
    ['pages/index/index.wxss', '.calendar-jump-sheet'],
    ['pages/index/index.wxss', '.day-action-sheet'],
    ['pages/period/period.wxss', '.cycle-card'],
    // 平涂 tint 图像层叠在海军回退上。不是装饰渐变，也不是 CTA 填充。
    ['app.wxss', '.premium-card'],
    ['app.wxss', '.header-gradient'],
    ['pages/index/index.wxss', '.sync-pill'],
    ['pages/index/index.wxss', '.month-nav'],
    ['pages/index/index.wxss', '.nav-btn:active'],
    ['pages/index/index.wxss', '.week-header'],
    ['pages/index/index.wxss', '.calendar-grid'],
    // issue #162：图例样本格铺日历网格同一层玻璃
    ['pages/index/index.wxss', '.legend-sample.day-cell'],
    ['pages/bind/bind.wxss', '.tab-bar'],
    ['pages/bind/bind.wxss', '.code-input'],
    ['pages/bind/bind.wxss', '.error-msg'],
    ['pages/period/period.wxss', '.segment-control'],
    ['pages/period/period.wxss', '.skeleton-card'],
    ['pages/period/period.wxss', '.empty-state'],
    ['pages/period/edit/edit.wxss', '.form-picker'],
    ['pages/period/edit/edit.wxss', '.form-input'],
    ['pages/memory/memory.wxss', '.skeleton-card'],
    ['pages/memory/memory.wxss', '.empty-state'],
    ['pages/memory/edit/edit.wxss', '.form-picker'],
    ['pages/memory/edit/edit.wxss', '.form-input']
  ].map(([file, selector]) => `${file}::${selector}`)
)

const SOLID_ROSE_FILL_ALLOWLIST = new Set(
  [
    // 状态点/日历标记/卡片 rail：装饰性玫瑰实色小块，非可操作填充
    ['pages/index/index.wxss', '.sync-pill.syncing .sync-dot'],
    ['pages/index/index.wxss', '.reminder-card.due .reminder-rail'],
    ['pages/index/index.wxss', '.detail-rail'],
    ['pages/memory/memory.wxss', '.list-item::before']
  ].map(([file, selector]) => `${file}::${selector}`)
)

const GRADIENT_FILL = /(?:linear|radial|conic)-gradient\(/i
const SOLID_ROSE_FILL_LITERAL = /#e8909e\b|rgba?\(\s*232\s*,\s*144\s*,\s*158\s*(?:,\s*1(?:\.0*)?\s*)?\)/i

// `.nav-btn.nav-btn-hover` 是 `.nav-btn:active` 的微信 hover-class 写法，不是另一条规则。
function activeSelectorForHoverClass(selector) {
  if (!/\.([A-Za-z_][\w-]*)\.\1-hover\b/.test(selector)) return null
  return selector.replace(/\.([A-Za-z_][\w-]*)\.\1-hover\b/g, '.$1:active')
}

function fillAllowlisted(allowlist, relative, selector, selectors) {
  if (allowlist.has(`${relative}::${selector}`)) return true
  const activeSelector = activeSelectorForHoverClass(selector)
  if (!activeSelector || !selectors.includes(activeSelector)) return false
  return allowlist.has(`${relative}::${activeSelector}`)
}

function scanCtaFillDiscipline(relative, css) {
  const violations = []
  for (const rule of parseWxssRules(css)) {
    const fills = [rule.decls.background, rule.decls['background-image'], rule.decls['background-color']].filter(Boolean)
    if (fills.length === 0) continue
    for (const selector of rule.selectors) {
      const key = `${relative}::${selector}`
      if (fills.some((fill) => GRADIENT_FILL.test(fill)) && !fillAllowlisted(GRADIENT_FILL_ALLOWLIST, relative, selector, rule.selectors)) {
        violations.push(`${key} uses a gradient fill outside the gradient allowlist`)
      }
      if (fills.some((fill) => SOLID_ROSE_FILL_LITERAL.test(fill)) && !fillAllowlisted(SOLID_ROSE_FILL_ALLOWLIST, relative, selector, rule.selectors)) {
        violations.push(`${key} uses a literal solid rose fill instead of var(--aurora-pink)`)
      }
    }
  }
  return violations
}

test('CTA fill guardrail flags unregistered gradient and literal rose fills', () => {
  const offenders = [
    ['pages/index/index.wxss', '.evil-btn { background: linear-gradient(135deg, #C4A0D2, #0A0E27); }'],
    ['pages/bind/bind.wxss', '.evil-btn { background: #E8909E; }'],
    ['pages/bind/bind.wxss', '.evil-btn { background-color: rgb(232,144,158); }'],
    ['pages/bind/bind.wxss', '.evil-btn { background: rgba(232, 144, 158, 1); }'],
    // 渐变里裹玫瑰字面量会被两条通道同时拦（渐变 + 实色玫瑰）
    ['pages/bind/bind.wxss', '.evil-btn { background: linear-gradient(135deg, #E8909E, #C4A0D2); }']
  ]
  assert.equal(offenders.flatMap(([f, css]) => scanCtaFillDiscipline(f, css)).length, 6)

  // 已登记装饰例外与合规填充不误伤
  const legit = [
    ['pages/period/period.wxss', '.cycle-card { background: linear-gradient(135deg, rgba(232,144,158,0.18), rgba(196,160,210,0.12)), var(--glass-fallback); }'],
    // issue #104：绑定页选中 tab 收敛回 var(--aurora-pink) 玫瑰填充，var() 填充照旧不误伤
    ['pages/bind/bind.wxss', '.tab.active { background: var(--aurora-pink); }'],
    ['pages/period/edit/edit.wxss', '.flow-chip.active { background: rgba(232,144,158,0.92); }']
  ]
  assert.deepEqual(legit.flatMap(([f, css]) => scanCtaFillDiscipline(f, css)), [])
})

// :active 与 hover-class 并列是同一条已登记规则。组里多出来的未登记选择器仍然拒绝。
test('CTA fill guardrail rejects an unregistered selector grouped with an :active and hover-class pair', () => {
  const css = [
    '.nav-btn:active,',
    '.nav-btn.nav-btn-hover,',
    '.evil-btn {',
    '  background: linear-gradient(rgba(255,255,255,0.2), rgba(255,255,255,0.2)), var(--glass-fallback);',
    '}'
  ].join('\n')
  assert.deepEqual(scanCtaFillDiscipline('pages/index/index.wxss', css), [
    'pages/index/index.wxss::.evil-btn uses a gradient fill outside the gradient allowlist'
  ])
})

test('every WXSS fill stays inside the gradient and solid-rose deny-by-default allowlists', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    violations.push(...scanCtaFillDiscipline(relative, fs.readFileSync(file, 'utf8')))
  }
  assert.deepEqual(violations, [])
})

test('metadata gold in pages comes from var(--aurora-gold), never a literal', () => {
  const goldLiteral = /#D4A574/i
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    if (relative === 'app.wxss') continue
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const code = line.replace(/\/\*[\s\S]*?\*\//g, '')
      if (goldLiteral.test(code)) {
        violations.push(`${relative}:${index + 1} hardcodes #D4A574 instead of the gold token`)
      }
    })
  }
  assert.deepEqual(violations, [])
})

// issue #55：玫瑰 → 金渐变曾是 CTA 误用形态，随主操作统一实色玫瑰整体退役。
// issue #59：玫瑰 → 薰衣草渐变（--gradient-pink）同样无屏上引用，一并退役。
// 实色金 token --aurora-gold 保留，只服务预测/区间/确定性及日历元数据。
test('retired gradient tokens stay out of tokens and screens', () => {
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
  const app = stripComments(fs.readFileSync(path.join(repoRoot, 'app.wxss'), 'utf8'))
  for (const token of ['--gradient-gold', '--gradient-pink']) {
    assert.equal(app.includes(token), false, `app.wxss should no longer define ${token}`)
    for (const file of listWxssFiles(repoRoot)) {
      const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
      if (relative === 'app.wxss') continue
      assert.equal(
        stripComments(fs.readFileSync(file, 'utf8')).includes(`var(${token})`),
        false,
        `${relative} still references the retired ${token}`
      )
    }
  }
})

// 首页金语义白名单（issue #55）：实色金 token / 金 rgba tint / 金辉光只允许落在
// 预测、区间、确定性及日历元数据（节日/调休标签、同步状态点）相关规则上；
// CTA、导航 affordance 与工具图标不再用金。「预」的强调光晕仍是预测（issue #165）。
const INDEX_GOLD_ALLOWLIST = new Set([
  '.sync-dot',
  '.holiday-tag',
  '.predict-mark',
  '.calendar-days.calendar-emphasis-predict-a .predict-mark::after',
  '.calendar-days.calendar-emphasis-predict-b .predict-mark::after',
  '.reminder-rail',
  '.predict-date',
  '.detail-meaning.predict',
  '.detail-meaning.holiday',
  '.detail-meaning.predict .detail-meaning-title',
  '.detail-meaning.holiday .detail-meaning-title'
])

test('day detail record tags use rose and light pink, not gold', () => {
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxss'), 'utf8'))
  const colorOf = (selector) => {
    const rule = rules.find((item) => item.selectors.includes(selector))
    assert.ok(rule, `expected ${selector}`)
    return rule.decls.color || ''
  }
  assert.match(colorOf('.period-detail .detail-title'), /#E8909E|var\(--aurora-pink\)/)
  assert.match(colorOf('.memory-detail .detail-title'), /#F0C4C0/)
  assert.equal(INDEX_GOLD_ALLOWLIST.has('.detail-title'), false)
  assert.match(colorOf('.detail-meaning.predict .detail-meaning-title'), /var\(--aurora-gold\)/)
  assert.match(colorOf('.detail-meaning.holiday .detail-meaning-title'), /var\(--aurora-gold\)/)
})

test('home page reserves gold for prediction, range, certainty, and calendar metadata', () => {
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, 'pages/index/index.wxss'), 'utf8'))
  const violations = []
  for (const rule of rules) {
    const body = Object.values(rule.decls).join(';')
    if (!/aurora-gold|212,\s*165,\s*116/.test(body)) continue
    for (const selector of rule.selectors) {
      if (!INDEX_GOLD_ALLOWLIST.has(selector)) {
        violations.push(`${selector} uses gold outside prediction/range/certainty/metadata`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

// 阴影登记（区间登记制）：与 DESIGN.md「Shadow / overlay 登记」的区间一致；
// allow 为闭区间/精确值组合，区间内免逐值登记，区间外或表外颜色拒绝。
const SHADOW_COLOR_FAMILIES = [
  { name: 'black elevation', rgb: [0, 0, 0], allow: (a) => (a >= 0.12 && a <= 0.15) || a === 0.2 || a === 0.34 },
  { name: 'navy near-field', rgb: [10, 14, 39], allow: (a) => a >= 0.16 && a <= 0.35 },
  { name: 'rose glow', rgb: [232, 144, 158], allow: (a) => a >= 0.1 && a <= 0.45 },
  { name: 'soft pink glow', rgb: [240, 196, 192], allow: (a) => a >= 0.28 && a <= 0.32 },
  { name: 'gold glow', rgb: [212, 165, 116], allow: (a) => a >= 0.3 && a <= 0.5 },
  { name: 'warning glow', rgb: [249, 115, 115], allow: (a) => a === 0.38 },
  { name: 'inset highlight', rgb: [255, 255, 255], allow: (a) => a >= 0.09 && a <= 0.22 }
  // issue #162：今天的薰衣草描边改成胶囊与色带的 border，不再是阴影，阴影登记里没有薰衣草
]

function shadowColorAllowed(r, g, b, a) {
  return SHADOW_COLOR_FAMILIES.some(
    (family) => family.rgb[0] === r && family.rgb[1] === g && family.rgb[2] === b && family.allow(a)
  )
}

test('every box-shadow/text-shadow color stays inside the DESIGN.md shadow registry', () => {
  const violations = []
  const rgbaPattern = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g

  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      for (const prop of ['box-shadow', 'text-shadow']) {
        const value = rule.decls[prop]
        if (!value || value === 'none') continue
        const colors = [...value.matchAll(rgbaPattern)]
        if (colors.length === 0) {
          violations.push(`${relative} ${rule.selectors.join(', ')} ${prop}: no registered rgba color in ${value}`)
          continue
        }
        for (const color of colors) {
          const [r, g, b] = [Number(color[1]), Number(color[2]), Number(color[3])]
          const alpha = Number(color[4])
          if (!shadowColorAllowed(r, g, b, alpha)) {
            violations.push(
              `${relative} ${rule.selectors.join(', ')} ${prop}: rgba(${r},${g},${b},${alpha}) is outside the shadow registry`
            )
          }
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

// 选择器在一份 WXSS 里的声明，同一选择器的各条规则按出现顺序层叠（共享层的结构写在一组，光写在自己那条）
function declsFor(relative, selector) {
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
    .filter((item) => item.selectors.includes(selector))
  assert.ok(rules.length > 0, `expected ${relative} ${selector}`)
  return Object.assign({}, ...rules.map((rule) => rule.decls))
}

// issue #146：辉光只留在主按钮和复制键上。月份导航、加载圈、同步点不发光；
// 绑定页爱心只留一层字阴影。提醒和详情的彩色 rail 继续承载状态色。
// issue #166：主按钮和复制键的玫瑰光画在 ::before 柔光层上，按钮本身不带阴影（按压契约见 motion-performance）。
test('glow stays on primary buttons and the copy control', () => {
  const roseGlow = '0 4px 15px rgba(232,144,158,0.28)'
  for (const [relative, selector] of [
    ['app.wxss', '.btn-premium'],
    ['pages/settings/settings.wxss', '.copy-btn'],
    ['pages/bind/bind.wxss', '.copy-btn']
  ]) {
    assert.equal(declsFor(relative, `${selector}::before`)['box-shadow'], roseGlow, `${relative} ${selector} glow layer`)
    assert.equal(declsFor(relative, selector)['box-shadow'], undefined, `${relative} ${selector} itself carries no shadow`)
  }

  const monthNav = declsFor('pages/index/index.wxss', '.month-nav')['box-shadow'] || ''
  assert.doesNotMatch(monthNav, /232,\s*144,\s*158/)
  assert.equal(declsFor('app.wxss', '.loading-spinner')['box-shadow'], undefined)
  assert.equal(declsFor('pages/index/index.wxss', '.sync-dot')['box-shadow'], undefined)

  const heart = declsFor('pages/bind/bind.wxss', '.hero-icon')['text-shadow']
  assert.equal(heart, '0 0 18rpx rgba(240,196,192,0.32)')

  assert.equal(
    declsFor('pages/index/index.wxss', '.reminder-rail')['box-shadow'],
    '0 0 14rpx rgba(212,165,116,0.36)'
  )
  assert.equal(
    declsFor('pages/index/index.wxss', '.detail-rail')['box-shadow'],
    '0 0 16rpx rgba(232,144,158,0.35)'
  )

  const design = fs.readFileSync(path.join(repoRoot, 'DESIGN.md'), 'utf8')
  assert.match(design, /不可点元素不再发光/)
  assert.match(design, /0 0 18rpx rgba\(240,196,192,0\.32\)/)
})

// issue #168：辉光（不是 inset 的有色阴影：box-shadow、text-shadow 或 filter 的 drop-shadow）只在 DESIGN.md
// 「Shadow / overlay 登记」列出的几处。按压柔光层、选中态的静态玫瑰光、承载状态色的 rail 和三处情感装饰；
// 新加一处辉光先在那里登记，再加进这张表。黑、海军和白的投影与高光是 elevation，不在此列。
const REGISTERED_GLOWS = [
  // 按压柔光层（issue #166）
  'app.wxss .btn-premium::before',
  'pages/index/index.wxss .quick-btn::before',
  'pages/index/index.wxss .copy-recap::before',
  'pages/settings/settings.wxss .copy-btn::before',
  'pages/bind/bind.wxss .copy-btn::before',
  // 选中态的静态玫瑰光
  'pages/index/index.wxss .jump-option.active',
  'pages/period/edit/edit.wxss .flow-chip.active',
  'pages/period/edit/edit.wxss .symptom-chip.active',
  // 承载状态色的 rail
  'pages/index/index.wxss .reminder-rail',
  'pages/index/index.wxss .reminder-card.due .reminder-rail',
  'pages/index/index.wxss .detail-rail',
  'pages/index/index.wxss .memory-detail .detail-rail',
  // 情感装饰
  'pages/bind/bind.wxss .hero-icon',
  'pages/period/period.wxss .memory-heart',
  'pages/memory/memory.wxss .memory-heart',
  'pages/period/period.wxss .cycle-card'
]
const ELEVATION_RGB = new Set(['0,0,0', '10,14,39', '255,255,255'])

// 一个阴影值的各层：box-shadow / text-shadow 按顶层逗号分，filter 只取其中的 drop-shadow(...)
function shadowLayers(prop, value) {
  if (prop === 'filter') return [...value.matchAll(/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g)].map((match) => match[1])
  const layers = []
  let current = ''
  let depth = 0
  for (const ch of value) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      layers.push(current.trim())
      current = ''
    } else current += ch
  }
  layers.push(current.trim())
  return layers
}

function isGlowLayer(layer) {
  if (/\binset\b/.test(layer)) return false
  const color = /rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/.exec(layer)
  return Boolean(color) && !ELEVATION_RGB.has(color.slice(1, 4).join(','))
}

test('glows sit only on the places DESIGN.md registers', () => {
  const found = new Set()
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseWxssRules(fs.readFileSync(file, 'utf8'))) {
      for (const prop of ['box-shadow', 'text-shadow', 'filter']) {
        const value = rule.decls[prop]
        if (!value || value === 'none' || !shadowLayers(prop, value).some(isGlowLayer)) continue
        for (const selector of rule.selectors) found.add(`${relative} ${selector}`)
      }
    }
  }
  assert.deepEqual([...found].sort(), [...REGISTERED_GLOWS].sort())

  const design = fs.readFileSync(path.join(repoRoot, 'DESIGN.md'), 'utf8')
  for (const registered of [
    'drop-shadow(0 0 10px rgba(240,196,192,0.3))',
    '0 8px 32px rgba(232,144,158,0.15)',
    '`.jump-option.active`',
    '经期编辑页选中的状态、经量和症状芯片'
  ]) {
    assert.ok(design.includes(registered), `DESIGN.md Shadow / overlay registers ${registered}`)
  }
})
