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
    '.c { border-radius: 0; }'
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
    // 极光背景、环境光斑、导航头辉光、卡缘高光、底部 sheet 面板、周期卡：装饰性渐变，非可操作填充
    ['app.wxss', '.page::before'],
    ['app.wxss', '.glow-orb-1'],
    ['app.wxss', '.glow-orb-2'],
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
    ['pages/bind/bind.wxss', '.tab-bar'],
    ['pages/bind/bind.wxss', '.code-input'],
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
// CTA、导航 affordance 与工具图标不再用金。
const INDEX_GOLD_ALLOWLIST = new Set([
  '.sync-dot',
  '.holiday-tag',
  '.predict-mark',
  '.predict-date',
  '.reminder-rail',
  '.detail-title',
  '.detail-meaning.predict',
  '.detail-meaning.holiday',
  '.prediction-summary'
])

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
  { name: 'inset highlight', rgb: [255, 255, 255], allow: (a) => a >= 0.09 && a <= 0.22 },
  { name: 'today ring lavender', rgb: [196, 160, 210], allow: (a) => a === 0.55 }
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

function declsFor(relative, selector) {
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, relative), 'utf8'))
  const rule = rules.find((item) => item.selectors.includes(selector))
  assert.ok(rule, `expected ${relative} ${selector}`)
  return rule.decls
}

// issue #146：辉光只留在主按钮和复制键上。月份导航、加载圈、同步点不发光；
// 绑定页爱心只留一层字阴影。提醒和详情的彩色 rail 继续承载状态色。
test('glow stays on primary buttons and the copy control', () => {
  const roseGlow = '0 4px 15px rgba(232,144,158,0.28)'
  assert.equal(declsFor('app.wxss', '.btn-premium')['box-shadow'], roseGlow)
  assert.equal(declsFor('pages/settings/settings.wxss', '.copy-btn')['box-shadow'], roseGlow)
  assert.equal(declsFor('pages/bind/bind.wxss', '.copy-btn')['box-shadow'], roseGlow)

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
