const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

// issue #57：交互语义护栏 —— 每个用户可点控件都有明确角色与可读名称；
// 选中/禁用/隐藏状态用 aria 表达且与视觉状态同条件绑定，不与可操作状态冲突；
// 日历格继续朗读完整领域语义，空白格保持隐藏。

const repoRoot = path.join(__dirname, '..')

const PAGE_WXML = [
  'pages/index/index.wxml',
  'pages/bind/bind.wxml',
  'pages/period/period.wxml',
  'pages/period/edit/edit.wxml',
  'pages/memory/memory.wxml',
  'pages/memory/edit/edit.wxml',
  'pages/settings/settings.wxml'
]

function readPage(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

const TAG_PATTERN = /<([a-zA-Z][\w-]*)((?:\s+[a-zA-Z][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g
const ATTR_PATTERN = /([a-zA-Z][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

function collectElements(wxml) {
  const withoutComments = wxml.replace(/<!--[\s\S]*?-->/g, '')
  const elements = []
  let match
  TAG_PATTERN.lastIndex = 0
  while ((match = TAG_PATTERN.exec(withoutComments))) {
    const attrs = {}
    ATTR_PATTERN.lastIndex = 0
    let attrMatch
    while ((attrMatch = ATTR_PATTERN.exec(match[2]))) {
      attrs[attrMatch[1]] = attrMatch[2] ?? attrMatch[3] ?? ''
    }
    elements.push({ tag: match[1], attrs })
  }
  return elements
}

function describe(element) {
  return `<${element.tag} class="${element.attrs.class || ''}">`
}

function isTapTarget(element) {
  const handler = element.attrs.bindtap || element.attrs.catchtap
  // catchtap="noop" 只是阻止冒泡的 sheet 面板，不是用户可操作控件
  return Boolean(handler) && handler !== 'noop'
}

function normalizeExpr(expr) {
  return String(expr).replace(/\s+/g, ' ').trim()
}

function classTokens(element) {
  return String(element.attrs.class || '')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

// 抽取 {{cond ? 'active' : ''}} 形式的条件类绑定条件；单双引号等价接受
function conditionalClassCondition(classAttr, className) {
  const pattern = new RegExp(`\\{\\{([\\s\\S]*?)\\s*\\?\\s*(['"])${className}\\2\\s*:\\s*(['"])\\3\\s*\\}\\}`)
  const match = pattern.exec(classAttr)
  return match ? match[1].trim() : null
}

test('conditional class extraction accepts both quote styles', () => {
  // WXML 属性可被外层引号倒逼成另一种引号写法：'active' 与 "active" 等价，都不得漏网
  assert.equal(conditionalClassCondition("a {{ tab === 'x' ? 'active' : '' }}", 'active'), "tab === 'x'")
  assert.equal(conditionalClassCondition('a {{ tab === "x" ? "active" : "" }}', 'active'), 'tab === "x"')
  assert.equal(conditionalClassCondition('a {{ busy ? "disabled" : "" }}', 'disabled'), 'busy')
  assert.equal(conditionalClassCondition("a {{ busy ? 'disabled' : '' }}", 'disabled'), 'busy')
  assert.equal(conditionalClassCondition('a static-class', 'active'), null)
  assert.equal(conditionalClassCondition("a {{ cond ? 'other' : '' }}", 'active'), null)
})

test('every tap target exposes an explicit role and a readable name', () => {
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of collectElements(readPage(file))) {
      if (!isTapTarget(element)) continue
      if (!element.attrs['aria-role'] || !element.attrs['aria-label']) {
        failures.push(`${file}: ${describe(element)} bindtap/catchtap without aria-role + aria-label`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('pickers and text inputs expose accessible names', () => {
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of collectElements(readPage(file))) {
      if (element.attrs.bindchange && (!element.attrs['aria-role'] || !element.attrs['aria-label'])) {
        failures.push(`${file}: ${describe(element)} picker without aria-role + aria-label`)
      }
      if (element.attrs.bindinput && !element.attrs['aria-label']) {
        failures.push(`${file}: ${describe(element)} input without aria-label`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('selected state mirrors the active class condition via aria-checked', () => {
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of collectElements(readPage(file))) {
      const activeCondition = conditionalClassCondition(element.attrs.class || '', 'active')
      if (!activeCondition) continue
      const expected = `{{${normalizeExpr(activeCondition)}}}`
      const actual = element.attrs['aria-checked'] && normalizeExpr(element.attrs['aria-checked'])
      if (actual !== expected) {
        failures.push(`${file}: ${describe(element)} aria-checked=${actual || '(missing)'} expected ${expected}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('disabled and loading states cannot be confused with operable controls', () => {
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of collectElements(readPage(file))) {
      const classAttr = element.attrs.class || ''
      const disabledCondition = conditionalClassCondition(classAttr, 'disabled')
      if (disabledCondition) {
        const expected = `{{${normalizeExpr(disabledCondition)}}}`
        const actual = element.attrs['aria-disabled'] && normalizeExpr(element.attrs['aria-disabled'])
        if (actual !== expected) {
          failures.push(`${file}: ${describe(element)} aria-disabled=${actual || '(missing)'} expected ${expected}`)
        }
        continue
      }
      const tokens = classTokens(element)
      if ((tokens.includes('disabled') || tokens.includes('loading')) && element.attrs['aria-disabled'] !== 'true') {
        failures.push(`${file}: ${describe(element)} static disabled/loading without aria-disabled="true"`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('calendar day cells keep composed domain aria labels, a button role, and hidden empty cells', () => {
  const elements = collectElements(readPage('pages/index/index.wxml'))
  const dayCell = elements.find((element) => classTokens(element).includes('day-cell'))
  assert.ok(dayCell, 'expected the calendar day cell in index.wxml')
  assert.equal(dayCell.attrs['aria-role'], 'button')
  assert.equal(dayCell.attrs['aria-label'], '{{item.ariaLabel}}')
  assert.equal(dayCell.attrs['aria-hidden'], '{{item.isEmpty}}')
  // 空白格的领域语义由 utils/homeCalendarState.js 保证输出空串（home-calendar-state.test.js 钉住），
  // 这里钉住模板侧：hidden 绑定不变、aria 文案只来自 item.ariaLabel
  const wxml = readPage('pages/index/index.wxml')
  const gridStart = wxml.indexOf('class="calendar-grid')
  const gridEnd = wxml.indexOf('class="quick-actions"')
  const grid = wxml.slice(gridStart, gridEnd)
  assert.doesNotMatch(grid, /aria-label="[^"{]/)
})

test('month navigation, sheet dismiss, quick record and sheet actions are screen-reader identifiable', () => {
  const elements = collectElements(readPage('pages/index/index.wxml'))
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))

  assert.equal(byHandler('prevMonth', 'nav-btn').attrs['aria-label'], '上一个月')
  assert.equal(byHandler('nextMonth', 'nav-btn').attrs['aria-label'], '下一个月')
  assert.equal(byHandler('quickPeriod', 'quick-btn').attrs['aria-label'], '记经期')
  assert.equal(byHandler('quickMemory', 'quick-btn').attrs['aria-label'], '记录欢乐时光')

  // 弹层遮罩本身是可点的「关闭」操作，必须带角色与可读名称
  assert.equal(byHandler('closeMonthPicker', 'day-sheet-mask').attrs['aria-label'], '关闭月份选择')
  assert.equal(byHandler('closeDayActions', 'day-sheet-mask').attrs['aria-label'], '关闭当日操作')
  assert.equal(byHandler('closeInfoSheet', 'day-sheet-mask').attrs['aria-label'], '关闭面板')

  // 三个 sheet 的 × 关闭按钮
  const closeButtons = elements.filter((element) => classTokens(element).includes('sheet-close'))
  assert.equal(closeButtons.length, 3)
  for (const button of closeButtons) {
    assert.equal(button.attrs['aria-role'], 'button')
    assert.equal(button.attrs['aria-label'], '关闭')
  }

  // 日操作弹层与详情模式的补记操作
  const dayActions = elements
    .filter((element) => element.attrs.bindtap === 'onDayActionTap')
    .map((element) => element.attrs['aria-label'])
  assert.deepEqual(dayActions, ['记录经期', '记录欢乐时光', '查看详情', '补经期', '补记忆'])

  // 月份选择与确认
  const jumpOption = byHandler('selectJumpMonth', 'jump-option')
  assert.equal(jumpOption.attrs['aria-role'], 'radio')
  assert.equal(jumpOption.attrs['aria-label'], '选择{{item.label}}')
  assert.equal(byHandler('confirmMonthJump', 'jump-confirm').attrs['aria-role'], 'button')

  // 复制小结
  const copyRecap = byHandler('copyMonthlyRecap', 'copy-recap')
  assert.equal(copyRecap.attrs['aria-role'], 'button')
  assert.equal(copyRecap.attrs['aria-label'], '复制小结')

  // 图例 / 预测 / 小结次级工具
  assert.equal(byHandler('openLegendSheet', 'meaning-tool').attrs['aria-label'], '打开日历图例')
  assert.equal(byHandler('openPredictionSheet', 'meaning-tool').attrs['aria-label'], '查看经期预测')
  assert.equal(byHandler('openMonthlyRecap', 'meaning-tool').attrs['aria-label'], '查看本月小结')

  // 周期提醒卡：朗读标题与说明，并说明点按动作
  const reminder = byHandler('onReminderTap', 'reminder-card')
  assert.equal(reminder.attrs['aria-role'], 'button')
  assert.equal(reminder.attrs['aria-label'], '{{item.title}}，{{item.text}}，点按记录')
})

test('stats card halves are named buttons into the record list and the prediction sheet', () => {
  const elements = collectElements(readPage('pages/index/index.wxml'))
  const periodHalf = elements.find((element) =>
    element.attrs.bindtap === 'goPeriodList' && classTokens(element).includes('stat-item'))
  const predictHalf = elements.find((element) =>
    element.attrs.bindtap === 'openPredictionSheet' && classTokens(element).includes('predict-item'))
  const divider = elements.find((element) => classTokens(element).includes('stat-divider'))
  const statsCard = elements.find((element) => classTokens(element).includes('stats-card'))

  // issue #69：左半块读屏名称与卡上条数同源（含 0 条）
  assert.ok(periodHalf, 'expected the stats-card period half to be a tap target')
  assert.equal(periodHalf.attrs['aria-role'], 'button')
  assert.equal(periodHalf.attrs['aria-label'], '查看经期记录，共{{periods ? periods.length : 0}}条')

  // issue #70：右半块有日期读月日+星期，无日期读固定暂无文案
  assert.ok(predictHalf, 'expected the stats-card prediction half to be a tap target')
  assert.equal(predictHalf.attrs['aria-role'], 'button')
  assert.equal(
    predictHalf.attrs['aria-label'],
    "{{nextPredictWeekday ? '查看经期预测，' + nextPredictDisplay + ' ' + nextPredictWeekday : '查看经期预测，暂无下次日期'}}"
  )

  // 分隔线与整张统计卡都不是按钮
  assert.equal(divider.attrs.bindtap, undefined)
  assert.equal(divider.attrs['aria-role'], undefined)
  assert.equal(statsCard.attrs.bindtap, undefined)
  assert.equal(statsCard.attrs['aria-role'], undefined)
})

test('bind page controls are named, tab switch exposes checked state, inert states read as disabled', () => {
  const elements = collectElements(readPage('pages/bind/bind.wxml'))
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))

  const createTab = byHandler('switchTab', 'tab')
  assert.equal(createTab.attrs['aria-role'], 'radio')
  assert.equal(createTab.attrs['aria-checked'], "{{tab==='create'}}")

  assert.equal(byHandler('copyRoomCode', 'bound-code').attrs['aria-label'], '复制房间码')
  assert.equal(byHandler('goHome', 'btn-premium').attrs['aria-role'], 'button')
  assert.equal(byHandler('unbind', 'btn-danger').attrs['aria-label'], '解除绑定')
  assert.equal(byHandler('createRoom', 'btn-premium').attrs['aria-label'], '创建我的房间')
  assert.equal(byHandler('joinRoom', 'btn-premium').attrs['aria-label'], '加入房间')
})

test('record list rows, retry affordances and settings menu entries announce their action', () => {
  const period = collectElements(readPage('pages/period/period.wxml'))
  const memory = collectElements(readPage('pages/memory/memory.wxml'))
  const settings = collectElements(readPage('pages/settings/settings.wxml'))
  const byHandler = (elements, handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))

  assert.equal(byHandler(period, 'editPeriod', 'list-item').attrs['aria-label'], '编辑经期记录 {{item.startDate}} 至 {{item.endDate}}')
  assert.equal(byHandler(period, 'loadData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')
  assert.equal(byHandler(memory, 'editMemory', 'list-item').attrs['aria-label'], '编辑 {{item.date}} 的欢乐时光')
  assert.equal(byHandler(memory, 'loadData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')

  assert.equal(byHandler(settings, 'copyRoomCode', 'copy-btn').attrs['aria-label'], '复制房间码')
  assert.equal(byHandler(settings, 'goMemory', 'menu-item').attrs['aria-label'], '查看欢乐时光')
  assert.equal(byHandler(settings, 'exportData', 'menu-item').attrs['aria-label'], '导出数据')
  assert.equal(byHandler(settings, 'clearData', 'menu-item').attrs['aria-label'], '清除本地数据')
  assert.equal(byHandler(settings, 'about', 'menu-item').attrs['aria-label'], '关于')

  // 密度偏好：选中态用 aria-checked 表达（与 active 类同条件，由选中态镜像测试兜底）
  const densityOptions = settings.filter((element) => classTokens(element).includes('density-option'))
  assert.equal(densityOptions.length, 2)
  for (const option of densityOptions) {
    assert.equal(option.attrs['aria-role'], 'radio')
    assert.ok(option.attrs['aria-checked'], 'density option must expose aria-checked')
  }
})

test('edit pages name the save and delete operations and expose inert variants as disabled', () => {
  for (const file of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const elements = collectElements(readPage(file))
    const byHandler = (handler, cls) =>
      elements.find((element) =>
        element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))

    assert.equal(byHandler('goBack', 'nav-back').attrs['aria-label'], '返回')
    assert.equal(byHandler('save', 'btn-premium').attrs['aria-label'], '保存')
    assert.equal(byHandler('delete', 'btn-danger').attrs['aria-label'], '删除此记录')

    const inertButtons = elements.filter((element) => {
      const tokens = classTokens(element)
      return (tokens.includes('loading') || tokens.includes('disabled') ||
        (element.attrs.style || '').includes('opacity')) && !element.attrs.bindtap
    })
    assert.ok(inertButtons.length >= 3, `${file} should expose saving/deleting/disabled variants`)
    for (const button of inertButtons) {
      assert.equal(button.attrs['aria-disabled'], 'true', `${file} ${describe(button)} must read as disabled`)
    }
  }

  const periodEdit = collectElements(readPage('pages/period/edit/edit.wxml'))
  const flowChip = periodEdit.find((element) => classTokens(element).includes('flow-chip'))
  assert.equal(flowChip.attrs['aria-role'], 'checkbox')
  const symptomChip = periodEdit.find((element) => classTokens(element).includes('symptom-chip'))
  assert.equal(symptomChip.attrs['aria-role'], 'checkbox')
})
