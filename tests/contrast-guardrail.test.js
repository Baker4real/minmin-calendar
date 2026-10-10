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
// 月份标题、经期数字、今天与经期点保持玫瑰；清除本地数据行在点之前就是警告红字 + 警告红描边。

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

  // 加载失败标题：无独立颜色声明，继承 .empty-state 的中性色
  for (const file of ['pages/period/period.wxss', 'pages/memory/memory.wxss']) {
    assert.equal(wxssRuleBody(file, '.load-failed-text'), null,
      `${file} load-failed title must not override the neutral empty-state color`)
    assert.equal(declarationOf(file, '.empty-state', 'color'), 'rgba(255,255,255,0.5)')
  }

  // 设置分组标题
  assert.equal(declarationOf('pages/settings/settings.wxss', '.settings-group-title', 'color'), NEUTRAL_TITLE_COLOR)
})

test('month title, period figures, today and the period dot stay rose', () => {
  assert.equal(declarationOf('pages/index/index.wxss', '.month-title', 'color'), ROSE,
    'the month title opens the month picker, it keeps rose')
  assert.equal(declarationOf('pages/index/index.wxss', '.stat-num', 'color'), ROSE,
    'the period-record figure stays rose')
  assert.equal(declarationOf('pages/index/index.wxss', '.day-cell.today .day-num', 'color'), ROSE,
    "today's date stays rose")
  assert.equal(declarationOf('pages/index/index.wxss', '.period-mark', 'background'), ROSE,
    'the period dot stays rose')
})

test('settings clear-local-data uses warning-red text and warning-red border before any tap', () => {
  const wxss = 'pages/settings/settings.wxss'
  assert.equal(declarationOf(wxss, '.menu-item.danger .menu-text', 'color'), WARNING_RED)
  assert.equal(declarationOf(wxss, '.menu-item.danger', 'border'), `1px solid ${WARNING_RED_BORDER}`)
  // 不是第二种红：与 .btn-danger 家族同色
  assert.equal(declarationOf('app.wxss', '.btn-danger', 'color'), WARNING_RED)
  assert.equal(declarationOf('app.wxss', '.btn-danger', 'border'), `1px solid ${WARNING_RED_BORDER}`)
})

test('the light heart stays the happy-time color on memory rows', () => {
  assert.equal(wxssRuleBody('pages/settings/settings.wxss', '.menu-heart'), null)
  assert.equal(declarationOf('pages/memory/memory.wxss', '.memory-heart', 'color'), LIGHT_HEART)
})
