const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

// issue #57：交互语义护栏 —— 每个用户可点控件都有明确角色与可读名称；
// 选中/禁用/隐藏状态用 aria 表达且与视觉状态同条件绑定，不与可操作状态冲突；
// 日历格继续朗读完整领域语义，空白格保持隐藏。
// issue #77：标记各管一件事 —— 可见符号与句子的语义也在此钉住：
// 哪个标记在场、哪个控件可用、显示哪句话；不断言私有结构。

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

function parseAttrs(raw) {
  const attrs = {}
  ATTR_PATTERN.lastIndex = 0
  let attrMatch
  while ((attrMatch = ATTR_PATTERN.exec(raw))) {
    attrs[attrMatch[1]] = attrMatch[2] ?? attrMatch[3] ?? ''
  }
  return attrs
}

function parseWxmlForest(wxml) {
  const source = wxml.replace(/<!--[\s\S]*?-->/g, '')
  const pattern = /<\/?([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g
  const roots = []
  const stack = []
  let match
  while ((match = pattern.exec(source))) {
    const token = match[0]
    const tag = match[1]
    if (token.startsWith('</')) {
      while (stack.length && stack[stack.length - 1].tag !== tag) stack.pop()
      stack.pop()
      continue
    }
    const parent = stack[stack.length - 1]
    const node = { tag, attrs: parseAttrs(match[2] || ''), children: [], parent: parent || null }
    if (parent) parent.children.push(node)
    else roots.push(node)
    if (match[3] !== '/') stack.push(node)
  }
  return roots
}

function walkForest(nodes, visit) {
  for (const node of nodes) {
    visit(node)
    walkForest(node.children, visit)
  }
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
  assert.equal(byHandler('quickPeriod', 'quick-btn').attrs['aria-label'], '{{periodQuickAriaLabel}}')
  assert.equal(byHandler('quickMemory', 'quick-btn').attrs['aria-label'], '记欢乐时光')
  assert.match(readPage('pages/index/index.wxml'), /class="quick-text">记欢乐时光</)

  // 弹层遮罩本身是可点的「关闭」操作，必须带角色与可读名称
  assert.equal(byHandler('closeMonthPicker', 'day-sheet-mask').attrs['aria-label'], '关闭月份选择')
  assert.equal(byHandler('closeDayActions', 'day-sheet-mask').attrs['aria-label'], '关闭当日操作')
  assert.equal(byHandler('closeInfoSheet', 'day-sheet-mask').attrs['aria-label'], '关闭面板')

  // 四个 sheet 的 × 关闭按钮（月份跳转 / 日操作 / 信息面板 / 月份工具菜单）
  const closeButtons = elements.filter((element) => classTokens(element).includes('sheet-close'))
  assert.equal(closeButtons.length, 4)
  for (const button of closeButtons) {
    assert.equal(button.attrs['aria-role'], 'button')
    assert.equal(button.attrs['aria-label'], '关闭')
  }

  // 日操作弹层与详情模式的补记操作
  const dayActions = elements
    .filter((element) => element.attrs.bindtap === 'onDayActionTap')
    .map((element) => element.attrs['aria-label'])
  assert.deepEqual(dayActions, ['记经期', '记欢乐时光', '查看详情', '补记经期', '补记欢乐时光'])
  const indexWxml = readPage('pages/index/index.wxml')
  assert.match(indexWxml, /sheet-action-title">记经期</)
  assert.match(indexWxml, /sheet-action-title">记欢乐时光</)
  assert.match(indexWxml, /sheet-action-title">补记经期</)
  assert.match(indexWxml, /sheet-action-title">补记欢乐时光</)

  // 月份格点一下即跳转，不再有确认按钮
  const jumpOption = byHandler('selectJumpMonth', 'jump-option')
  assert.equal(jumpOption.attrs['aria-role'], 'radio')
  assert.equal(jumpOption.attrs['aria-label'], '选择{{item.label}}')
  assert.equal(byHandler('confirmMonthJump', 'jump-confirm'), undefined)

  // 复制小结
  const copyRecap = byHandler('copyMonthlyRecap', 'copy-recap')
  assert.equal(copyRecap.attrs['aria-role'], 'button')
  assert.equal(copyRecap.attrs['aria-label'], '复制小结')

  // 图例 / 预测说明 / 小结收进月份标题旁的「…」菜单（issue #105）：触发器与菜单项都是命名按钮
  assert.equal(byHandler('openMonthMenu', 'month-menu-trigger').attrs['aria-role'], 'button')
  assert.equal(byHandler('openMonthMenu', 'month-menu-trigger').attrs['aria-label'], '打开工具菜单')
  assert.equal(byHandler('closeMonthMenu', 'day-sheet-mask').attrs['aria-label'], '关闭工具菜单')
  const menuItems = elements.filter((element) => element.attrs.bindtap === 'onMonthMenuTap')
  assert.deepEqual(
    menuItems.map((element) => element.attrs['aria-label']),
    ['打开日历图例', '查看经期预测', '查看本月小结']
  )
  for (const item of menuItems) {
    assert.equal(item.attrs['aria-role'], 'button')
  }

  // 周期提醒卡：朗读标题与说明，并说明点按动作
  const reminder = byHandler('onReminderTap', 'reminder-card')
  assert.equal(reminder.attrs['aria-role'], 'button')
  assert.equal(reminder.attrs['aria-label'], '{{item.title}}，{{item.text}}，点按记录')
})

// issue #134：遮罩和面板是兄弟。遮罩单独作为「关闭」朗读，面板里的控件不包在这个按钮里。
test('sheet mask and panel are siblings so only the mask is announced as close', () => {
  const forest = parseWxmlForest(readPage('pages/index/index.wxml'))
  const masks = []
  walkForest(forest, (node) => {
    if (classTokens(node).includes('day-sheet-mask')) masks.push(node)
  })
  assert.equal(masks.length, 4)

  const labels = []
  for (const mask of masks) {
    assert.equal(mask.attrs['aria-role'], 'button')
    labels.push(mask.attrs['aria-label'])
    assert.equal(mask.children.length, 0, `${mask.attrs['aria-label']} must not wrap panel controls`)

    const host = mask.parent
    assert.ok(host, `${mask.attrs['aria-label']} needs a sibling panel`)
    assert.equal(host.attrs['aria-role'], undefined)
    assert.equal(host.attrs['aria-label'], undefined)
    const panel = host.children.find((child) => classTokens(child).includes('sheet-slide'))
    assert.ok(panel, `${mask.attrs['aria-label']} panel should be a sibling`)
    assert.equal(panel.attrs['aria-role'], undefined)
    assert.notEqual(panel, mask)
    const named = []
    walkForest(panel.children, (node) => {
      if (node.attrs['aria-label']) named.push(node.attrs['aria-label'])
    })
    assert.ok(named.length > 0, `${mask.attrs['aria-label']} panel controls stay reachable`)
    assert.ok(named.includes('关闭'), `${mask.attrs['aria-label']} keeps its own close control`)
  }
  assert.deepEqual(labels.sort(), ['关闭工具菜单', '关闭当日操作', '关闭月份选择', '关闭面板'])
})

test('merged status card names the prediction region and keeps the record count non-interactive', () => {
  const elements = collectElements(readPage('pages/index/index.wxml'))
  const predictRegion = elements.find((element) =>
    element.attrs.bindtap === 'openPredictionSheet' && classTokens(element).includes('predict-item'))
  const divider = elements.find((element) => classTokens(element).includes('stat-divider'))
  const statusCard = elements.find((element) => classTokens(element).includes('status-card'))
  const figure = elements.find((element) => classTokens(element).includes('status-figure'))

  // issue #70：预测区有日期读月日+星期，无日期读固定暂无文案
  assert.ok(predictRegion, 'expected the status-card prediction region to be a tap target')
  assert.equal(predictRegion.attrs['aria-role'], 'button')
  assert.equal(
    predictRegion.attrs['aria-label'],
    "{{nextPredictWeekday ? '查看经期预测，' + nextPredictDisplay + ' ' + nextPredictWeekday : '查看经期预测，暂无下次日期'}}"
  )

  // issue #105：条数是现状展示不是入口——记录列表由「记录」tab 分段承接，卡上无跳转
  assert.ok(figure, 'expected the plain record-count figure')
  assert.equal(figure.attrs.bindtap, undefined)
  assert.equal(figure.attrs['aria-role'], undefined)
  assert.equal(figure.attrs['aria-label'], undefined)

  // 分隔线与整张状态卡都不是按钮
  assert.equal(divider.attrs.bindtap, undefined)
  assert.equal(divider.attrs['aria-role'], undefined)
  assert.equal(statusCard.attrs.bindtap, undefined)
  assert.equal(statusCard.attrs['aria-role'], undefined)

  // 卡内超期进行中提醒保留原有动作与朗读名
  const ongoing = elements.find((element) => element.attrs.bindtap === 'onOngoingReminderTap')
  assert.equal(ongoing.attrs['aria-role'], 'button')
  assert.equal(
    ongoing.attrs['aria-label'],
    '{{ongoingCompletionReminder.title}}，{{ongoingCompletionReminder.text}}，点按去补填'
  )
})

test('first-screen loading spinner and sync status changes are perceivable', () => {
  // issue #106：首屏加载指示与同步状态不再只有视觉信号——
  // spinner 有朗读名；同步胶囊是 status 角色，朗读名与 syncStatusText 同源，
  // showSyncStatus 每次改写文本（index-page.test.js 钉住）即产生可朗读的状态变化
  const elements = collectElements(readPage('pages/index/index.wxml'))

  const spinner = elements.find((element) => classTokens(element).includes('loading-spinner'))
  assert.ok(spinner, 'expected the first-screen loading spinner')
  assert.equal(spinner.attrs['aria-label'], '正在加载')

  const pill = elements.find((element) => classTokens(element).includes('sync-pill'))
  assert.ok(pill, 'expected the sync status pill')
  assert.equal(pill.attrs['aria-role'], 'status')
  assert.equal(pill.attrs['aria-label'], '{{syncStatusText}}')
  const syncText = elements.find((element) => classTokens(element).includes('sync-text'))
  assert.ok(syncText, 'expected the sync status text element')
})

test('bind page controls are named, tab switch exposes checked state, inert states read as disabled', () => {
  const elements = collectElements(readPage('pages/bind/bind.wxml'))
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))

  const createTab = byHandler('switchTab', 'tab')
  assert.equal(createTab.attrs['aria-role'], 'radio')
  assert.equal(createTab.attrs['aria-checked'], "{{tab==='create'}}")

  // issue #84：房间码文本回归纯展示——无点按、无控件角色与名称；复制键是唯一复制入口
  const boundCode = elements.find((element) => classTokens(element).includes('bound-code'))
  assert.equal(boundCode.attrs.bindtap, undefined)
  assert.equal(boundCode.attrs['aria-role'], undefined)
  assert.equal(boundCode.attrs['aria-label'], undefined)
  assert.equal(
    elements.filter((element) => element.attrs.bindtap === 'copyRoomCode').length,
    1,
    'the copy button must be the only copy entry on the bind page'
  )
  assert.equal(byHandler('copyRoomCode', 'copy-btn').attrs['aria-role'], 'button')
  assert.equal(byHandler('copyRoomCode', 'copy-btn').attrs['aria-label'], '复制房间码')
  assert.equal(byHandler('goHome', 'btn-premium').attrs['aria-role'], 'button')
  assert.equal(byHandler('unbind', 'btn-danger').attrs['aria-label'], '解除绑定')
  assert.equal(byHandler('createRoom', 'btn-premium').attrs['aria-label'], '创建我的房间')
  assert.equal(byHandler('joinRoom', 'btn-premium').attrs['aria-label'], '加入房间')
})

// issue #140：原生分享按钮没有 bindtap，仍要按按钮朗读，读屏名是「发给 TA」。
test('bind page share button exposes a button role and the send-to-partner name', () => {
  const elements = collectElements(readPage('pages/bind/bind.wxml'))
  const shareButton = elements.find((element) => element.attrs['open-type'] === 'share')
  assert.ok(shareButton, 'expected the native share button')
  assert.equal(shareButton.tag, 'button')
  assert.equal(shareButton.attrs['aria-role'], 'button')
  assert.equal(shareButton.attrs['aria-label'], '发给 TA')
})

test('record list rows, retry affordances and settings menu entries announce their action', () => {
  const period = collectElements(readPage('pages/period/period.wxml'))
  const memory = collectElements(readPage('pages/memory/memory.wxml'))
  const settings = collectElements(readPage('pages/settings/settings.wxml'))
  const byHandler = (elements, handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))

  // 经期行读屏名称带状态：日期走统一显示格式，进行中/结束日期不详由 rangeSummary 表达
  assert.equal(byHandler(period, 'editPeriod', 'list-item').attrs['aria-label'], '编辑经期记录 {{item.rangeSummary}}')
  assert.equal(byHandler(period, 'loadData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')
  assert.equal(byHandler(memory, 'editMemory', 'list-item').attrs['aria-label'], '编辑 {{item.dateLabel}} 的欢乐时光')
  assert.equal(byHandler(memory, 'loadData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')

  assert.equal(byHandler(settings, 'copyRoomCode', 'copy-btn').attrs['aria-label'], '复制房间码')
  assert.equal(byHandler(settings, 'goMemory', 'menu-item'), undefined)
  assert.equal(byHandler(settings, 'exportData', 'menu-item').attrs['aria-label'], '导出数据')
  assert.equal(byHandler(settings, 'clearData', 'menu-item').attrs['aria-label'], '重新同步房间')
  assert.equal(byHandler(settings, 'openHelp', 'menu-item').attrs['aria-label'], '使用说明')

  // 密度偏好：选中态用 aria-checked 表达（与 active 类同条件，由选中态镜像测试兜底）
  const densityOptions = settings.filter((element) => classTokens(element).includes('density-option'))
  assert.equal(densityOptions.length, 2)
  for (const option of densityOptions) {
    assert.equal(option.attrs['aria-role'], 'radio')
    assert.ok(option.attrs['aria-checked'], 'density option must expose aria-checked')
  }
})

test('record tab segment control reads as a radio group with a perceivable checked state', () => {
  const elements = collectElements(readPage('pages/period/period.wxml'))

  // 组容器有可读名
  const group = elements.find((element) => classTokens(element).includes('segment-control'))
  assert.ok(group, 'expected the segment control group')
  assert.equal(group.attrs['aria-label'], '记录分类')

  // 两个分段选项都是 radio，选中态与 active 类同条件（镜像护栏逐字符兜底，此处钉住朗读名）
  const options = elements.filter((element) => classTokens(element).includes('segment-option'))
  assert.equal(options.length, 2)
  const bySegment = (segment) => options.find((element) => element.attrs['data-segment'] === segment)

  const periodOption = bySegment('period')
  assert.equal(periodOption.attrs['aria-role'], 'radio')
  assert.equal(periodOption.attrs['aria-label'], '经期记录')
  assert.equal(periodOption.attrs['aria-checked'], "{{segment === 'period'}}")

  const memoryOption = bySegment('memory')
  assert.equal(memoryOption.attrs['aria-role'], 'radio')
  assert.equal(memoryOption.attrs['aria-label'], '欢乐时光')
  assert.equal(memoryOption.attrs['aria-checked'], "{{segment === 'memory'}}")

  // 欢乐时光分段内的行与重试入口沿用独立页的朗读文案
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || classTokens(element).includes(cls)))
  assert.equal(byHandler('editMemory', 'list-item').attrs['aria-label'], '编辑 {{item.dayLabel}} 的欢乐时光')
  assert.equal(byHandler('loadMemoryData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')
  assert.equal(byHandler('addMemory', 'btn-premium').attrs['aria-label'], '记欢乐时光')
  assert.match(readPage('pages/period/period.wxml'), />＋ 记欢乐时光</)
  assert.match(readPage('pages/memory/memory.wxml'), />＋ 记欢乐时光</)

  // 月份卡头（issue #109）：点按切换展开/收起，按 button 朗读；
  // 读屏名「YYYY年M月，N 条欢乐时光，已展开/已收起」由分组数据绑定，
  // aria-expanded 与展开状态同条件；不用 active 条件类（单选语义才配 aria-checked）
  const monthHeader = elements.find((element) => classTokens(element).includes('month-header'))
  assert.ok(monthHeader, 'expected the memory month card header')
  assert.equal(monthHeader.attrs.bindtap, 'toggleMonth')
  assert.equal(monthHeader.attrs['aria-role'], 'button')
  assert.equal(monthHeader.attrs['aria-label'], '{{group.ariaLabel}}')
  assert.equal(monthHeader.attrs['aria-expanded'], '{{group.expanded}}')
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
  // issue #100：经期状态是单选组，按 radio 朗读且选中项带 checked 状态；
  // 按 aria-label 前缀区分——状态组与经量组共用 flow-chip 类，不能按类名取第一个
  const statusChip = periodEdit.find((element) =>
    (element.attrs['aria-label'] || '').startsWith('经期状态'))
  assert.equal(statusChip.attrs['aria-role'], 'radio')
  assert.equal(statusChip.attrs['aria-checked'], '{{status === item.value}}')
  // 经量（可再点取消的单选）与症状（多选）保持 checkbox
  const flowChip = periodEdit.find((element) =>
    (element.attrs['aria-label'] || '').startsWith('经量'))
  assert.equal(flowChip.attrs['aria-role'], 'checkbox')
  const symptomChip = periodEdit.find((element) => classTokens(element).includes('symptom-chip'))
  assert.equal(symptomChip.attrs['aria-role'], 'checkbox')
})

// ===== issue #77：标记各管一件事（可见符号与句子语义） =====

function wxssRuleBody(relativePath, selector) {
  const css = readPage(relativePath).replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // :active 与 hover-class 可以写在同一条规则里，选择器后面先是逗号再是 `{`。
  const match = new RegExp(`(?:^|[},\\s])${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`).exec(css)
  return match ? match[1] : null
}

test('brand, about and settings menu no longer use the red-heart emoji', () => {
  // 品牌：绑定页大标题旁的心与设置资料卡的心改为文本字形，颜色走色板（wxss）
  const bindWxml = readPage('pages/bind/bind.wxml')
  const settingsWxml = readPage('pages/settings/settings.wxml')
  assert.match(bindWxml, /class="hero-icon">♥</, 'bind hero heart is the text glyph')
  assert.doesNotMatch(settingsWxml, /profile-avatar|menu-heart/)
  assert.doesNotMatch(bindWxml, /❤/)
  assert.doesNotMatch(settingsWxml, /❤/)

  // 关于：弹窗文案里不再有红色心形表情（内容唯一来源在 settings.js）
  assert.doesNotMatch(readPage('pages/settings/settings.js'), /❤/)

  // 设置页不再放重复的欢乐时光入口，菜单也不再挂装饰心
  for (const emoji of ['🔑', '🗓️', '📤', '🗑️', 'ℹ️']) {
    assert.equal(settingsWxml.includes(emoji), false, `settings menu keeps only markers, found ${emoji}`)
  }
})

test('homepage no-room heart is the registered rose text glyph', () => {
  // issue #106：无房间态与绑定页 hero、设置资料卡同款（issue #77 模式）——
  // ♥ 文本字形，颜色显式走色板玫瑰（emoji 自带红色随表情一起退场）
  const indexWxml = readPage('pages/index/index.wxml')
  assert.match(indexWxml, /class="no-room-icon">♥</, 'no-room heart is the text glyph')
  assert.doesNotMatch(indexWxml, /❤/)

  const iconRule = wxssRuleBody('pages/index/index.wxss', '.no-room-icon')
  assert.ok(iconRule, 'expected .no-room-icon rule in index.wxss')
  assert.match(iconRule, /color:\s*#E8909E/i, 'the glyph heart takes the palette rose')
})

test('make-up record wording uses the happy-time family across app markup', () => {
  // issue #106：补录动作不再叫「补记忆」，与列表/编辑页/设置入口同一族「欢乐时光」叫法
  for (const file of PAGE_WXML) {
    assert.doesNotMatch(readPage(file), /补记忆/, `${file} keeps the happy-time family wording`)
  }
})

test('no decorative emoji hearts or warning emoji remain in app markup', () => {
  // issue #106 验收：app 标记里不再有装饰性 emoji 心或警示 emoji；
  // ♥（U+2665 文本字形）是登记的标记符号，不在此列
  for (const file of PAGE_WXML) {
    assert.doesNotMatch(
      readPage(file),
      /❤|🧡|💛|💚|💙|💜|🖤|🤍|🤎|💔|❣|💕|💞|💓|💗|💖|💘|💝|💟|⚠/,
      `${file} must not use emoji hearts or warning emoji`
    )
  }
})

test('happy-time list rows show only the light heart, no second rose dot', () => {
  // 玫瑰圆点只表经期：欢乐时光列表行不再有时间轴玫瑰点
  assert.equal(wxssRuleBody('pages/memory/memory.wxss', '.list-item::before'), null,
    'memory rows must not draw the rose timeline dot')
  assert.match(readPage('pages/memory/memory.wxss'), /\.memory-heart\s*\{[^}]*color:\s*#F0C4C0/i)

  // 行内唯一标记是浅色心
  assert.match(readPage('pages/memory/memory.wxml'), /class="memory-heart">♥</)
})

test('bind success is stated in rose text without a green checkmark', () => {
  const wxml = readPage('pages/bind/bind.wxml')
  const boundCard = wxml.slice(wxml.indexOf('wx:if="{{bound}}"'), wxml.indexOf('wx:else'))
  assert.match(boundCard, /class="bound-status">已绑定房间</,
    'the bound screen states success in plain text')
  assert.doesNotMatch(wxml, /✅|✔|💚/, 'no green-check glyph anywhere on the bind page')

  // 成功用玫瑰文字表达（绑定页色板没有绿色）；
  // issue #104：紫粉试点退役，成功标题回到主色玫瑰（海军卡面上 ≥4.5:1，对比度测试钉住）
  const boundStatus = wxssRuleBody('pages/bind/bind.wxss', '.bound-status')
  assert.ok(boundStatus, 'expected .bound-status rule')
  assert.match(boundStatus, /color:\s*(?:#E8909E|var\(--aurora-pink\))\s*;/i)
})

test('settings danger styling is only the bottom unbind row', () => {
  const settingsWxml = readPage('pages/settings/settings.wxml')
  assert.ok(!/class="menu-item danger"[^>]*bindtap="clearData"/.test(settingsWxml),
    'resync stays a plain row')
  assert.ok(/class="menu-item"[^>]*bindtap="exportData"/.test(settingsWxml),
    'export stays a plain menu row')
  assert.ok(/class="menu-item danger"[^>]*bindtap="unbind"/.test(settingsWxml),
    'unbind keeps the danger menu row')
  assert.ok(!/class="menu-item danger"[^>]*bindtap="(exportData|about|clearData|openHelp)"/.test(settingsWxml),
    'danger styling is reserved for unbind')
})

// ===== issue #81：输入焦点与非交互卡片的按压语义 =====

test('text inputs focus into the registered 1px solid outline without any glow', () => {
  // 房间码输入（绑定页）与经期/欢乐时光备注（编辑页）：
  // 基线边框本就是 1px solid，焦点只把描边换成实线主色；基线与焦点都不再有光晕
  // issue #104：绑定页描边色随紫粉试点退役回归玫瑰，与两个编辑页同族
  const inputs = [
    ['pages/bind/bind.wxss', '.code-input', /border-color:\s*(?:#E8909E|var\(--aurora-pink\))\s*;/i],
    ['pages/period/edit/edit.wxss', '.form-input', /border-color:\s*(?:#E8909E|var\(--aurora-pink\))\s*;/i],
    ['pages/memory/edit/edit.wxss', '.form-input', /border-color:\s*(?:#E8909E|var\(--aurora-pink\))\s*;/i]
  ]
  for (const [file, selector, focusOutline] of inputs) {
    const base = wxssRuleBody(file, selector)
    assert.ok(base, `expected ${selector} rule in ${file}`)
    assert.match(base, /border:\s*1px solid\s/,
      `${file} ${selector} keeps a 1px solid baseline border`)
    assert.doesNotMatch(base, /box-shadow\s*:/, `${file} ${selector} baseline must not glow`)

    const focus = wxssRuleBody(file, `${selector}:focus`)
    assert.ok(focus, `expected ${selector}:focus rule in ${file}`)
    assert.match(
      focus,
      focusOutline,
      `${file} ${selector}:focus must be the registered solid outline`
    )
    assert.doesNotMatch(focus, /box-shadow\s*:/, `${file} ${selector}:focus must not add a glow`)
  }
})

test('every tappable control carries a hover-class painted with its :active rule', () => {
  const { parseWxssRules, listWxssFiles } = require('./designTokens')
  const rules = []
  for (const file of listWxssFiles(repoRoot)) {
    rules.push(...parseWxssRules(fs.readFileSync(file, 'utf8')))
  }
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of collectElements(readPage(file))) {
      if (!isTapTarget(element)) continue
      const hover = element.attrs['hover-class'] || ''
      const stem = hover.endsWith('-hover') ? hover.slice(0, -'-hover'.length) : ''
      if (!stem || !classTokens(element).includes(stem)) {
        failures.push(`${file}: ${describe(element)} hover-class=${hover || '(missing)'}`)
        continue
      }
      const painted = rules.some((rule) =>
        rule.selectors.some((selector) => selector.includes(`.${hover}`)) &&
        rule.selectors.some((selector) => selector.includes(':active')))
      if (!painted) {
        failures.push(`${file}: hover-class ${hover} is not in an :active rule`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('glass cards are not press targets', () => {
  // 玻璃卡本身不可点（issue #113）。按压从基类拿掉，不再靠各页 transform:none 抵消。
  const card = wxssRuleBody('app.wxss', '.premium-card')
  assert.ok(card, 'expected .premium-card in app.wxss')
  assert.doesNotMatch(card, /transition\s*:/, 'glass card base must not keep a press transition')
  assert.equal(wxssRuleBody('app.wxss', '.premium-card:active'), null,
    'glass card base must not scale on press')
  for (const [file, selector] of [
    ['pages/settings/settings.wxss', '.profile-card:active'],
    ['pages/period/edit/edit.wxss', '.premium-card:active'],
    ['pages/memory/edit/edit.wxss', '.premium-card:active'],
    ['pages/bind/bind.wxss', '.premium-card:active']
  ]) {
    assert.equal(wxssRuleBody(file, selector), null,
      `${file} must not keep a page-level rule that only cancels card press scale`)
  }
})

test('untappable settings rows do not take menu press feedback', () => {
  // 房间码行没有 bindtap。分组标题不是菜单行。
  // 全局与设置页的列表/菜单 :active 只命中可点行（issue #113）。
  const menuRows = collectElements(readPage('pages/settings/settings.wxml'))
    .filter((element) => classTokens(element).includes('menu-item'))
  const inert = menuRows.filter((element) => !isTapTarget(element))
  assert.equal(inert.length, 3, 'settings has the room-code row, the member status row, and the version row')
  assert.ok(classTokens(inert[0]).includes('room-code-item'), 'the room-code row stays inert')
  assert.match(inert[1].attrs['wx:if'] || '', /roomMemberLabel/, 'the member status row stays inert')
  assert.equal(classTokens(inert[2]).includes('room-code-item'), false, 'the version row is the other inert row')
  for (const row of inert) {
    assert.ok(classTokens(row).includes('non-interactive'), `${describe(row)} needs the non-interactive modifier`)
  }
  for (const row of menuRows.filter(isTapTarget)) {
    assert.equal(classTokens(row).includes('non-interactive'), false, `${describe(row)} stays tappable`)
  }

  const app = readPage('app.wxss').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.match(app, /\.list-item:not\(\.non-interactive\):active/)
  assert.match(app, /\.menu-item:not\(\.non-interactive\):active/)
  assert.doesNotMatch(app, /(^|[^\w.-])\.list-item:active\s*[,{]/)
  assert.doesNotMatch(app, /(^|[^\w.-])\.menu-item:active\s*[,{]/)

  const settingsCss = readPage('pages/settings/settings.wxss').replace(/\/\*[\s\S]*?\*\//g, '')
  const pressBackground = wxssRuleBody(
    'pages/settings/settings.wxss',
    '.menu-item:not(.non-interactive):not(.danger):active'
  )
  assert.match(pressBackground || '', /background\s*:/, 'tappable menu rows keep the press background')
  assert.doesNotMatch(settingsCss, /(^|[^\w.-])\.menu-item:active\s*[,{]/)
})

test('buttons inside cards keep their registered press scale', () => {
  // 卡片不缩放不牵连卡内控件：经量/症状芯片、复制键、重试/去绑定仍按登记的 0.94–0.98 缩放
  const pressScale = (file, selector) => {
    const body = wxssRuleBody(file, `${selector}:active`)
    assert.ok(body, `expected ${selector}:active rule in ${file}`)
    const scale = /transform:\s*scale\(([\d.]+)\)/.exec(body)
    assert.ok(scale, `${file} ${selector}:active must keep a press scale`)
    return Number(scale[1])
  }
  // 经量/症状芯片共用一条 :active 规则（.flow-chip:active, .symptom-chip:active），经 .symptom-chip 锚定
  for (const [file, selector] of [
    ['pages/period/edit/edit.wxss', '.symptom-chip'],
    ['pages/settings/settings.wxss', '.copy-btn'],
    ['pages/settings/settings.wxss', '.room-action-btn'],
    ['pages/settings/settings.wxss', '.density-option']
  ]) {
    const scale = pressScale(file, selector)
    assert.ok(
      scale >= 0.94 && scale <= 0.98,
      `${file} ${selector}:active press scale ${scale} is outside the registered 0.94-0.98 band`
    )
  }
})
