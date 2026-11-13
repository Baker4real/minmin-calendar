const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { PRESS_SCALE_BAND, TOUCH_FLOOR_RPX, parseWxssRules } = require('./designTokens')
const { conditionalClassCondition, wxmlElementTree, wxmlOpeningTags } = require('./wxmlTemplate')

// issue #57：交互语义护栏 —— 每个用户可点控件都有明确角色与可读名称；
// 选中/禁用/隐藏状态用 aria 表达且与视觉状态同条件绑定，不与可操作状态冲突；
// 日历格继续朗读完整领域语义，空白格保持隐藏。
// issue #196：这里只钉不变量——读屏语义、触控下限、DESIGN 登记的按压缩放区间、已退役的符号。
// 在设计规则允许的范围内改一个间距、时长或色值就会变红的断言不放进来（README「Verification」）。

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

// include 等于把目标文件原样拷到这个位置（共享的极光标记就是这样进每个页面的）：
// 先展开再检查，护栏看到的是页面渲染出来的结构
function readPage(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    .replace(/<include src="\/([^"]+)"\s*\/>/g, (_, target) => readPage(target))
}

function walk(nodes, visit) {
  for (const node of nodes) {
    visit(node)
    walk(node.children, visit)
  }
}

// 页面渲染出的全部元素，按文档顺序
function elementsOf(relativePath) {
  const elements = []
  walk(wxmlElementTree(readPage(relativePath)), (node) => elements.push(node))
  return elements
}

// 一个选择器在样式表里的全部声明，后写的覆盖先写的
function declsOf(relativePath, selector) {
  return Object.assign({}, ...parseWxssRules(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'))
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.decls))
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

function rpx(value) {
  return /^\d+(?:\.\d+)?rpx$/.test(value || '') ? Number.parseFloat(value) : NaN
}

// DESIGN：Pressed 用 transform: scale(0.94–0.98)。只看写了缩放的按压，不要求每个控件都缩放
function assertPressScaleInBand(relativePath, selector) {
  const scale = /scale\(([\d.]+)\)/.exec(declsOf(relativePath, `${selector}:active`).transform || '')
  if (!scale) return
  const value = Number(scale[1])
  const [low, high] = PRESS_SCALE_BAND
  assert.ok(
    value >= low && value <= high,
    `${relativePath} ${selector}:active press scale ${value} is outside the registered ${low}-${high} band`
  )
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

test('both WXML tag readers read single- and double-quoted attributes alike', () => {
  const fragment = `<view class='row {{busy ? "disabled" : ""}}' bindtap="retry" aria-role='button'></view>`
  const expected = { class: 'row {{busy ? "disabled" : ""}}', bindtap: 'retry', 'aria-role': 'button' }
  assert.deepEqual(wxmlOpeningTags(fragment)[0].attrs, expected)
  assert.deepEqual(wxmlElementTree(fragment)[0].attrs, expected)
})

test('every tap target exposes an explicit role and a readable name', () => {
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of elementsOf(file)) {
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
    for (const element of elementsOf(file)) {
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
    for (const element of elementsOf(file)) {
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
    for (const element of elementsOf(file)) {
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
      if ((element.classes.includes('disabled') || element.classes.includes('loading')) && element.attrs['aria-disabled'] !== 'true') {
        failures.push(`${file}: ${describe(element)} static disabled/loading without aria-disabled="true"`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

// 读屏念「已禁用」的控件就是样式上的惰性变体：带 disabled / loading 类，不靠别的写法装成禁用。
// picker 被禁用时，读屏念的是 picker 本身（它带角色和名称），所以 aria-disabled 写在 picker 上、与 disabled 同一条件
test('controls read as disabled are the inert variants, and a disabled picker reads as disabled', () => {
  const failures = []
  for (const file of PAGE_WXML) {
    for (const element of elementsOf(file)) {
      if (element.attrs['aria-disabled'] === 'true' && !element.classes.includes('disabled') && !element.classes.includes('loading')) {
        failures.push(`${file}: ${describe(element)} reads as disabled but carries no disabled/loading class`)
      }
      if (element.tag === 'picker' && element.attrs.disabled && element.attrs['aria-role'] &&
        normalizeExpr(element.attrs['aria-disabled'] || '') !== normalizeExpr(element.attrs.disabled)) {
        failures.push(`${file}: <picker bindchange="${element.attrs.bindchange}"> disabled=${element.attrs.disabled} but aria-disabled=${element.attrs['aria-disabled'] || '(missing)'}`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('calendar day cells keep composed domain aria labels, a button role, and hidden empty cells', () => {
  const dayCell = elementsOf('pages/index/index.wxml').find((element) => element.classes.includes('day-cell'))
  assert.ok(dayCell, 'expected the calendar day cell in index.wxml')
  assert.equal(dayCell.attrs['aria-role'], 'button')
  assert.equal(dayCell.attrs['aria-label'], '{{item.ariaLabel}}')
  assert.equal(dayCell.attrs['aria-hidden'], '{{item.isEmpty}}')
  // 记录成功反馈只是格子上的一个类（issue #167）：读屏名、角色、隐藏和点按都不看它
  for (const [name, value] of Object.entries(dayCell.attrs)) {
    if (name !== 'class') assert.doesNotMatch(value, /recordFeedback/, `${name} must not depend on the record feedback`)
  }
})

test('month navigation, sheet dismiss, quick record and sheet actions are screen-reader identifiable', () => {
  const elements = elementsOf('pages/index/index.wxml')
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || element.classes.includes(cls)))

  assert.equal(byHandler('prevMonth', 'nav-btn').attrs['aria-label'], '上一个月')
  assert.equal(byHandler('nextMonth', 'nav-btn').attrs['aria-label'], '下一个月')
  assert.equal(byHandler('quickPeriod', 'quick-btn').attrs['aria-label'], '{{periodQuickAriaLabel}}')
  assert.equal(byHandler('quickMemory', 'quick-btn').attrs['aria-label'], '记欢乐时光')

  // 弹层遮罩本身是可点的「关闭」操作，必须带角色与可读名称；信息弹层按当前内容命名（issue #155）
  assert.equal(byHandler('closeMonthPicker', 'day-sheet-mask').attrs['aria-label'], '关闭月份选择')
  assert.equal(byHandler('closeDayActions', 'day-sheet-mask').attrs['aria-label'], '关闭当日操作')
  assert.equal(byHandler('closeInfoSheet', 'day-sheet-mask').attrs['aria-label'], '关闭{{infoSheetName}}')

  // 每个 sheet 的 × 关闭按钮
  for (const button of elements.filter((element) => element.classes.includes('sheet-close'))) {
    assert.equal(button.attrs['aria-role'], 'button')
    assert.equal(button.attrs['aria-label'], '关闭')
  }

  // 日操作弹层与详情模式的补记操作；issue #157：详情行读屏名由日历投影按记录拼好
  // （区间与状态或日期与备注摘要，配对后加作者），模板只绑定
  for (const action of elements.filter((element) => element.attrs.bindtap === 'onDayActionTap')) {
    assert.equal(action.attrs['aria-label'], '{{item.label}}')
  }
  for (const row of elements.filter((element) => element.attrs.bindtap === 'onDayRecordTap')) {
    assert.equal(row.attrs['aria-label'], '{{item.ariaLabel}}')
  }

  // 月份格是单选，点一下即跳转
  const jumpOption = byHandler('selectJumpMonth', 'jump-option')
  assert.equal(jumpOption.attrs['aria-role'], 'radio')
  assert.equal(jumpOption.attrs['aria-label'], '选择{{item.label}}')

  // 复制小结
  const copyRecap = byHandler('copyMonthlyRecap', 'copy-recap')
  assert.equal(copyRecap.attrs['aria-role'], 'button')
  assert.equal(copyRecap.attrs['aria-label'], '复制小结')

  // 图例 / 预测说明 / 小结收进月份标题旁的「…」菜单（issue #105）：触发器与菜单项都是命名按钮
  assert.equal(byHandler('openMonthMenu', 'nav-tool').attrs['aria-role'], 'button')
  assert.equal(byHandler('openMonthMenu', 'nav-tool').attrs['aria-label'], '打开工具菜单')
  assert.equal(byHandler('closeMonthMenu', 'day-sheet-mask').attrs['aria-label'], '关闭工具菜单')
  for (const item of elements.filter((element) => element.attrs.bindtap === 'onMonthMenuTap')) {
    assert.equal(item.attrs['aria-role'], 'button')
  }

  // 周期提醒卡：朗读标题与说明，并说明点按动作
  const reminder = byHandler('onReminderTap', 'reminder-card')
  assert.equal(reminder.attrs['aria-role'], 'button')
  assert.equal(reminder.attrs['aria-label'], '{{item.title}}，{{item.text}}，点按记录')
})

// issue #134：遮罩和面板是兄弟。遮罩单独作为「关闭」朗读，面板里的控件不包在这个按钮里。
test('sheet mask and panel are siblings so only the mask is announced as close', () => {
  const masks = elementsOf('pages/index/index.wxml').filter((node) => node.classes.includes('day-sheet-mask'))
  assert.ok(masks.length > 0, 'expected the sheet masks in index.wxml')

  for (const mask of masks) {
    const name = mask.attrs['aria-label']
    assert.equal(mask.attrs['aria-role'], 'button')
    assert.equal(mask.children.length, 0, `${name} must not wrap panel controls`)

    const host = mask.parent
    assert.ok(host, `${name} needs a sibling panel`)
    assert.equal(host.attrs['aria-role'], undefined)
    assert.equal(host.attrs['aria-label'], undefined)
    const panel = host.children.find((child) => child.classes.includes('sheet-slide'))
    assert.ok(panel, `${name} panel should be a sibling`)
    assert.equal(panel.attrs['aria-role'], undefined)
    assert.notEqual(panel, mask)
    const named = []
    walk(panel.children, (node) => {
      if (node.attrs['aria-label']) named.push(node.attrs['aria-label'])
    })
    assert.ok(named.length > 0, `${name} panel controls stay reachable`)
    assert.ok(named.includes('关闭'), `${name} keeps its own close control`)
  }
})

// issue #154：设置「使用说明」同首页弹层的结构——遮罩单独朗读为「关闭使用说明」，
// 面板标题行里有可见的「×」关闭键（读屏名「关闭」），触控尺寸不低于 88rpx。
test('settings help keeps a separately named mask and a visible close in its title row', () => {
  const masks = elementsOf('pages/settings/settings.wxml').filter((node) => node.classes.includes('help-mask'))
  assert.ok(masks.length > 0, 'expected the help mask in settings.wxml')

  for (const mask of masks) {
    assert.equal(mask.attrs['aria-role'], 'button')
    assert.equal(mask.attrs['aria-label'], '关闭使用说明')
    assert.equal(mask.children.length, 0, 'the mask must not wrap the help panel')

    const host = mask.parent
    assert.ok(host, 'the mask needs a sibling panel')
    assert.equal(host.attrs['aria-role'], undefined)
    assert.equal(host.attrs['aria-label'], undefined)
    const panel = host.children.find((child) => child.classes.includes('help-slide'))
    assert.ok(panel, 'the help panel should be the mask sibling')
    assert.equal(panel.attrs['aria-role'], undefined)

    const closes = []
    walk(panel.children, (node) => {
      if (node.classes.includes('sheet-close')) closes.push(node)
    })
    assert.ok(closes.length > 0, 'the help panel has a visible close')
    for (const close of closes) {
      assert.equal(close.attrs['aria-role'], 'button')
      assert.equal(close.attrs['aria-label'], '关闭')
      assert.ok(
        close.parent.children.some((node) => node.classes.includes('help-title')),
        'the close sits in the title row'
      )
    }
  }

  const close = declsOf('pages/settings/settings.wxss', '.sheet-close')
  for (const side of ['width', 'height']) {
    assert.ok(
      rpx(close[side]) >= TOUCH_FLOOR_RPX,
      `the help close ${side} is ${close[side] || '(missing)'}, below the ${TOUCH_FLOOR_RPX}rpx touch floor`
    )
  }
  assertPressScaleInBand('pages/settings/settings.wxss', '.sheet-close')
})

// ===== issue #155：首页弹层与设置帮助的读屏模态契约 =====
// 平台事实以微信官方文档为准（https://developers.weixin.qq.com/miniprogram/dev/component/aria-component.html）：
// 基础库 2.7.1 起只支持部分 ARIA 标签；非原生组件可以加 aria-hidden、aria-label 等标签；可设的 aria-role
// 参照 MDN「Widget Roles」，部分 role 在移动端可能无效（dialog 属 Window Roles，不在其中）。文档列出 aria-modal
// 却没说行为，也没有把读屏焦点移到某个 view 的能力。所以面板不写 dialog 角色，只按用途命名：
// 模态上下文由遮罩「关闭+名称」、面板名和被隐藏的背景给出，背景只靠 aria-hidden 隔离，不写 aria-modal 冒充模态。
const SHEET_PAGES = [
  {
    file: 'pages/index/index.wxml',
    maskClass: 'day-sheet-mask',
    slideClass: 'sheet-slide',
    titleRowClass: 'sheet-drag-zone',
    titleClass: 'sheet-title'
  },
  {
    file: 'pages/settings/settings.wxml',
    maskClass: 'help-mask',
    slideClass: 'help-slide',
    titleRowClass: 'help-head',
    titleClass: 'help-title'
  }
]

function sheetHosts(forest, maskClass) {
  const hosts = []
  walk(forest, (node) => {
    if (node.classes.includes(maskClass)) hosts.push(node.parent)
  })
  return hosts
}

test('every sheet panel is named by its purpose without a dialog role, closed by a mask of the same name', () => {
  for (const { file, maskClass, slideClass } of SHEET_PAGES) {
    const hosts = sheetHosts(wxmlElementTree(readPage(file)), maskClass)
    assert.ok(hosts.length > 0, `${file}: expected its sheets`)
    for (const host of hosts) {
      // 读屏顺序固定：先是遮罩（关闭这一层），再是面板；宿主里没有别的可读节点
      const [mask, slide, ...rest] = host.children
      assert.deepEqual(rest, [], `${file}: a sheet host holds only its mask and its panel`)
      assert.ok(mask.classes.includes(maskClass), `${file}: the mask is read first`)
      assert.ok(slide.classes.includes(slideClass), `${file}: the panel follows the mask`)
      assert.equal(slide.children.length, 1, `${file}: the slide wraps one panel`)

      const [panel] = slide.children
      assert.equal(panel.attrs['aria-role'], undefined, `${file}: ${describe(panel)} claims no role WeChat does not list`)
      const name = panel.attrs['aria-label']
      assert.ok(name, `${file}: ${describe(panel)} needs a readable name`)
      assert.equal(mask.attrs['aria-role'], 'button')
      assert.equal(mask.attrs['aria-label'], `关闭${name}`, `${file}: the mask closes the panel by its name`)
    }
  }
})

// issue #166：内容错相只动标题行下面的内容块。面板里先是标题行（标题和关闭键都在这里，随面板一起到），
// 再是唯一的内容块 .sheet-body，面板的其余内容都在它里面；读屏顺序因此仍是标题、关闭、内容。
test('every sheet panel keeps its title and close in a title row above one content tier', () => {
  for (const { file, maskClass, titleRowClass, titleClass } of SHEET_PAGES) {
    for (const host of sheetHosts(wxmlElementTree(readPage(file)), maskClass)) {
      const [panel] = host.children[1].children
      const name = panel.attrs['aria-label']
      const [titleRow, body, ...rest] = panel.children
      assert.deepEqual(rest, [], `${file} ${name}: the panel holds a title row and one content tier`)
      assert.ok(titleRow.classes.includes(titleRowClass), `${file} ${name}: the title row comes first`)
      assert.ok(body && body.classes.includes('sheet-body'), `${file} ${name}: the content tier follows the title row`)

      const inTitleRow = []
      walk(titleRow.children, (node) => inTitleRow.push(...node.classes))
      assert.ok(inTitleRow.includes(titleClass), `${file} ${name}: the title arrives with the panel`)
      assert.ok(inTitleRow.includes('sheet-close'), `${file} ${name}: the close arrives with the panel`)
      const inBody = []
      walk(body.children, (node) => inBody.push(...node.classes))
      assert.equal(inBody.includes('sheet-close'), false, `${file} ${name}: the close is not staggered`)
      assert.equal(inBody.includes(titleClass), false, `${file} ${name}: the title is not staggered`)
    }
  }
})

test('no page claims WeChat honors aria-modal', () => {
  for (const file of PAGE_WXML) {
    assert.doesNotMatch(readPage(file), /aria-modal/, `${file} must not rely on aria-modal`)
  }
})

// 背景隔离：页面根下除弹层宿主、装饰极光、减弱动效探针和返回拦截外，每一块都与 page-obscured 同一状态
// aria-hidden。打开弹层的触发器都在这些块里：弹层盖住时一起静音，卸载后随背景回到原位置、原名称。
// 弹层宿主直接挂在页面根下，不在任何被隐藏的块里。
const SHEET_TRIGGERS = {
  'pages/index/index.wxml': [
    ['openMonthPicker', 'month-title-trigger'],
    ['onDayTap', 'day-cell'],
    ['openMonthMenu', 'nav-tool'],
    ['openPredictionSheet', 'home-status'],
    ['openMonthlyRecap', 'month-summary']
  ],
  'pages/settings/settings.wxml': [
    ['openHelp', 'menu-item']
  ]
}

test('a sheet silences the page behind it, and every trigger returns with that page', () => {
  for (const { file, maskClass } of SHEET_PAGES) {
    const forest = wxmlElementTree(readPage(file))
    const root = forest.find((node) => node.classes.includes('page'))
    assert.ok(root, `${file}: expected the page root`)
    assert.equal(root.attrs['aria-hidden'], undefined, `${file}: the page root itself stays readable`)

    const hosts = []
    const regions = []
    for (const child of root.children) {
      if (child.tag === 'wxs' || child.tag === 'page-container') continue
      if (child.children.some((node) => node.classes.includes(maskClass))) {
        hosts.push(child)
        continue
      }
      if (child.attrs['aria-hidden'] === 'true') continue
      regions.push(child)
      assert.equal(
        child.attrs['aria-hidden'],
        '{{pageObscured}}',
        `${file}: ${describe(child)} must go silent while a sheet covers it`
      )
    }
    assert.ok(regions.length >= 2, `${file}: expected the navbar and the content to be background regions`)
    assert.equal(hosts.length, sheetHosts(forest, maskClass).length, `${file}: every sheet host sits at the page root`)
    for (const host of hosts) {
      assert.equal(host.attrs['aria-hidden'], undefined, `${file}: a sheet host is never hidden with the page`)
    }

    const regionOf = (node) => {
      let current = node
      while (current.parent && current.parent !== root) current = current.parent
      return current
    }
    for (const [handler, cls] of SHEET_TRIGGERS[file]) {
      const triggers = []
      walk([root], (node) => {
        if (node.attrs.bindtap === handler && node.classes.includes(cls)) triggers.push(node)
      })
      assert.ok(triggers.length > 0, `${file}: expected the ${handler} trigger`)
      for (const trigger of triggers) {
        assert.equal(trigger.attrs['aria-role'], 'button', `${file}: ${handler} trigger is a button`)
        assert.ok(trigger.attrs['aria-label'], `${file}: ${handler} trigger keeps a readable name`)
        assert.ok(regions.includes(regionOf(trigger)), `${file}: ${handler} trigger comes back with the page`)
      }
    }
  }

  // 图例、预测说明、本月小结从工具菜单交接：入口在「工具菜单」面板里，原触发器是顶栏「工具」
  const entries = []
  walk(wxmlElementTree(readPage('pages/index/index.wxml')), (node) => {
    if (node.attrs.bindtap === 'onMonthMenuTap') entries.push(node)
  })
  assert.ok(entries.length > 0, 'expected the tool menu entries')
  for (const entry of entries) {
    let panel = entry
    while (panel && !(panel.parent && panel.parent.classes.includes('sheet-slide'))) panel = panel.parent
    assert.ok(panel, `${entry.attrs['aria-label']} lives inside a sheet panel`)
    assert.equal(panel.attrs['aria-label'], '工具菜单')
  }
})

test('home status line, month summary and the ongoing reminder read as named buttons', () => {
  const elements = elementsOf('pages/index/index.wxml')
  const statusLine = elements.find((element) =>
    element.attrs.bindtap === 'openPredictionSheet' && element.classes.includes('home-status'))
  const summary = elements.find((element) => element.classes.includes('month-summary'))

  assert.ok(statusLine, 'expected the status line to open the prediction sheet')
  assert.equal(statusLine.attrs['aria-role'], 'button')
  assert.equal(statusLine.attrs['aria-label'], '{{homeStatus.text}}')
  assert.ok(summary, 'expected the month summary row')
  assert.equal(summary.attrs['aria-role'], 'button')

  // 卡内超期进行中提醒保留原有动作与朗读名
  const ongoing = elements.find((element) => element.attrs.bindtap === 'onOngoingReminderTap')
  assert.equal(ongoing.attrs['aria-role'], 'button')
  assert.equal(
    ongoing.attrs['aria-label'],
    '{{ongoingCompletionReminder.title}}，{{ongoingCompletionReminder.text}}，点按去补填'
  )
})

test('bind page controls are named, tab switch exposes checked state, inert states read as disabled', () => {
  const elements = elementsOf('pages/bind/bind.wxml')
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || element.classes.includes(cls)))

  const createTab = byHandler('switchTab', 'tab')
  assert.equal(createTab.attrs['aria-role'], 'radio')
  assert.equal(createTab.attrs['aria-checked'], "{{tab==='create'}}")

  assert.equal(byHandler('copyRoomCode', 'copy-btn').attrs['aria-role'], 'button')
  assert.equal(byHandler('copyRoomCode', 'copy-btn').attrs['aria-label'], '复制房间码')
  assert.equal(byHandler('goHome', 'btn-premium').attrs['aria-role'], 'button')
  assert.equal(byHandler('goHome', 'btn-ghost').attrs['aria-role'], 'button')
  assert.equal(byHandler('goHome', 'btn-ghost').attrs['aria-label'], '进入应用')
  assert.equal(byHandler('unbind', 'btn-danger').attrs['aria-label'], '解除绑定')
  assert.equal(byHandler('createRoom', 'btn-premium').attrs['aria-label'], '创建我的房间')
  assert.equal(byHandler('joinRoom', 'btn-premium').attrs['aria-label'], '加入房间')
})

// issue #140：原生分享按钮没有 bindtap，仍要按按钮朗读，读屏名是「发给 TA」。
test('bind page share button exposes a button role and the send-to-partner name', () => {
  const shareButton = elementsOf('pages/bind/bind.wxml').find((element) => element.attrs['open-type'] === 'share')
  assert.ok(shareButton, 'expected the native share button')
  assert.equal(shareButton.tag, 'button')
  assert.equal(shareButton.attrs['aria-role'], 'button')
  assert.equal(shareButton.attrs['aria-label'], '发给 TA')
})

test('record list rows, retry affordances and settings menu entries announce their action', () => {
  const period = elementsOf('pages/period/period.wxml')
  const settings = elementsOf('pages/settings/settings.wxml')
  const byHandler = (elements, handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || element.classes.includes(cls)))

  // 经期行读屏名称带状态：日期走统一显示格式，进行中/结束日期不详由 rangeSummary 表达
  assert.equal(byHandler(period, 'editPeriod', 'list-item').attrs['aria-label'], '编辑经期记录 {{item.rangeSummary}}')
  assert.equal(byHandler(period, 'loadData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')
  // issue #157：欢乐时光月份行的读屏名由月份分组按记录拼好（日期、备注摘要、配对后的作者），模板只绑定
  assert.equal(byHandler(period, 'editMemory', 'list-item').attrs['aria-label'], '{{item.ariaLabel}}')

  assert.equal(byHandler(settings, 'copyRoomCode', 'copy-btn').attrs['aria-label'], '复制房间码')
  assert.equal(byHandler(settings, 'exportData', 'menu-item').attrs['aria-label'], '导出数据')
  assert.equal(byHandler(settings, 'clearData', 'menu-item').attrs['aria-label'], '重新同步房间')
  assert.equal(byHandler(settings, 'openHelp', 'menu-item').attrs['aria-label'], '使用说明')

  // 密度偏好是单选：选中态用 aria-checked 表达（与 active 类同条件，由选中态镜像测试兜底）
  for (const option of settings.filter((element) => element.classes.includes('density-option'))) {
    assert.equal(option.attrs['aria-role'], 'radio')
    assert.ok(option.attrs['aria-checked'], 'density option must expose aria-checked')
  }
})

test('record tab segment control reads as a radio group with a perceivable checked state', () => {
  const elements = elementsOf('pages/period/period.wxml')
  const byHandler = (handler, cls) =>
    elements.find((element) =>
      element.attrs.bindtap === handler && (!cls || element.classes.includes(cls)))

  // 两个分段选项都是 radio，选中态与 active 类同条件（镜像护栏逐字符兜底，此处钉住朗读名）
  const bySegment = (segment) => elements.find((element) =>
    element.classes.includes('segment-option') && element.attrs['data-segment'] === segment)

  const periodOption = bySegment('period')
  assert.equal(periodOption.attrs['aria-role'], 'radio')
  assert.equal(periodOption.attrs['aria-label'], '经期记录')
  assert.equal(periodOption.attrs['aria-checked'], "{{segment === 'period'}}")

  const memoryOption = bySegment('memory')
  assert.equal(memoryOption.attrs['aria-role'], 'radio')
  assert.equal(memoryOption.attrs['aria-label'], '欢乐时光')
  assert.equal(memoryOption.attrs['aria-checked'], "{{segment === 'memory'}}")

  // 欢乐时光分段内的行读屏名来自月份分组数据（issue #157），重试入口沿用独立页的朗读文案
  assert.equal(byHandler('editMemory', 'list-item').attrs['aria-label'], '{{item.ariaLabel}}')
  assert.equal(byHandler('loadMemoryData', 'empty-state').attrs['aria-label'], '加载失败，点按重试')
  assert.equal(byHandler('addMemory', 'btn-premium').attrs['aria-label'], '记欢乐时光')

  // 年份标题与月份卡头（issue #109）：点按切换展开/收起，按 button 朗读；
  // 读屏名「YYYY年M月，N 条欢乐时光，已展开/已收起」由分组数据绑定，
  // aria-expanded 与展开状态同条件；不用 active 条件类（单选语义才配 aria-checked）
  const yearHeader = byHandler('togglePeriodYear', 'period-year-title')
  assert.ok(yearHeader)
  assert.equal(yearHeader.attrs['aria-role'], 'button')
  assert.equal(yearHeader.attrs['aria-label'], '{{yearGroup.ariaLabel}}')
  assert.equal(yearHeader.attrs['aria-expanded'], '{{yearGroup.expanded}}')
  for (const handler of ['toggleMonth', 'togglePeriodMonth']) {
    const monthHeader = byHandler(handler, 'month-header')
    assert.ok(monthHeader, `expected the ${handler} month header`)
    assert.equal(monthHeader.attrs['aria-role'], 'button')
    assert.equal(monthHeader.attrs['aria-label'], '{{group.ariaLabel}}')
    assert.equal(monthHeader.attrs['aria-expanded'], '{{group.expanded}}')
  }
})

test('edit pages name the save and delete operations and expose inert variants as disabled', () => {
  for (const file of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const elements = elementsOf(file)
    const byHandler = (handler, cls) =>
      elements.find((element) =>
        element.attrs.bindtap === handler && (!cls || element.classes.includes(cls)))

    assert.equal(byHandler('goBack', 'nav-back').attrs['aria-label'], '返回')
    assert.equal(byHandler('save', 'btn-premium').attrs['aria-label'], '保存')
    assert.equal(byHandler('delete', 'btn-danger').attrs['aria-label'], '删除此记录')

    const inertButtons = elements.filter((element) =>
      (element.classes.includes('loading') || element.classes.includes('disabled') ||
        (element.attrs.style || '').includes('opacity')) && !element.attrs.bindtap)
    assert.ok(inertButtons.length >= 3, `${file} should expose saving/deleting/disabled variants`)
    for (const button of inertButtons) {
      assert.equal(button.attrs['aria-disabled'], 'true', `${file} ${describe(button)} must read as disabled`)
    }
  }

  const periodEdit = elementsOf('pages/period/edit/edit.wxml')
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
  const symptomChip = periodEdit.find((element) => element.classes.includes('symptom-chip'))
  assert.equal(symptomChip.attrs['aria-role'], 'checkbox')
})

// ===== issue #77 / #106：已退役的符号与叫法不再出现 =====

test('brand, about and settings menu no longer use the red-heart emoji', () => {
  // 品牌：绑定页大标题旁的心与设置资料卡的心改为文本字形；资料卡头像与菜单装饰心一起退场
  const bindWxml = readPage('pages/bind/bind.wxml')
  const settingsWxml = readPage('pages/settings/settings.wxml')
  assert.doesNotMatch(settingsWxml, /profile-avatar|menu-heart/)
  assert.doesNotMatch(bindWxml, /❤/)
  assert.doesNotMatch(settingsWxml, /❤/)

  // 设置页不再放重复的欢乐时光入口，菜单也不再挂装饰图标
  for (const emoji of ['🔑', '🗓️', '📤', '🗑️', 'ℹ️']) {
    assert.equal(settingsWxml.includes(emoji), false, `settings menu keeps only markers, found ${emoji}`)
  }
})

test('make-up record wording uses the happy-time family across app markup', () => {
  // issue #106：补录动作不再叫「补记忆」（CONTEXT：记忆一词已退役），与列表/编辑页/设置入口同一族「欢乐时光」叫法
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

test('happy-time list rows draw no second rose dot', () => {
  // 玫瑰圆点只表经期：欢乐时光列表行不再有时间轴玫瑰点
  const rules = parseWxssRules(fs.readFileSync(path.join(repoRoot, 'pages/memory/memory.wxss'), 'utf8'))
  assert.equal(rules.some((rule) => rule.selectors.includes('.list-item::before')), false,
    'memory rows must not draw the rose timeline dot')
})

test('bind page shows no green checkmark', () => {
  // 绑定成功用玫瑰文字表达，绑定页色板没有绿色，绿色对勾字形已退役
  assert.doesNotMatch(readPage('pages/bind/bind.wxml'), /✅|✔|💚/, 'no green-check glyph anywhere on the bind page')
})

// ===== 装饰层与卡内控件 =====

// 顶栏光斑和极光（基底、色团容器、每个色团）都是纯装饰，点按穿过它们落到下面的控件（issue #163）：
// 装饰层一旦接住点按，下面控件的可点区域就被吃掉，触控目标落到下限以下
test('ambient decorations cannot intercept taps on page controls', () => {
  for (const selector of [
    '.header-gradient::before',
    '.header-gradient::after',
    '.page::before',
    '.aurora',
    '.aurora-bloom'
  ]) {
    assert.equal(declsOf('app.wxss', selector)['pointer-events'], 'none', `${selector} must let taps reach navigation controls`)
  }
})

test('buttons inside cards press within the registered 0.94-0.98 band', () => {
  // 卡片不缩放不牵连卡内控件：经量/症状芯片、复制键、重试/去绑定、密度选项按下时的缩放落在 DESIGN 登记的区间里。
  // 经量/症状芯片共用一条 :active 规则（.flow-chip:active, .symptom-chip:active），经 .symptom-chip 锚定
  for (const [file, selector] of [
    ['pages/period/edit/edit.wxss', '.symptom-chip'],
    ['pages/settings/settings.wxss', '.copy-btn'],
    ['pages/settings/settings.wxss', '.room-action-btn'],
    ['pages/settings/settings.wxss', '.density-option']
  ]) {
    assertPressScaleInBand(file, selector)
  }
})
