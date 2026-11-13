const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createMiniProgram } = require('./helpers/miniProgram')
const path = require('node:path')
const test = require('node:test')

const chinaHolidays = require('../utils/chinaHolidays')
const util = require('../utils/util')

test('formatDisplayDate writes a date in the current year as month and day', () => {
  assert.equal(util.formatDisplayDate('2026-06-24', { today: '2026-10-10' }), '6月24日')
})

test('formatDisplayDate includes the year when the date is not in the current year', () => {
  assert.equal(util.formatDisplayDate('2025-06-24', { today: '2026-10-10' }), '2025年6月24日')
})

test('formatDisplayDate appends the weekday when a date needs it', () => {
  assert.equal(
    util.formatDisplayDate('2026-06-24', { today: '2026-10-10', withWeekday: true }),
    '6月24日 周三'
  )
  assert.equal(
    util.formatDisplayDate('2025-06-24', { today: '2026-10-10', withWeekday: true }),
    '2025年6月24日 周二'
  )
})

test('formatDisplayDateRange joins the two ends with an en dash', () => {
  assert.equal(
    util.formatDisplayDateRange('2026-09-26', '2026-10-01', { today: '2026-10-10' }),
    '9月26日–10月1日'
  )
})

test('formatDisplayDateRange puts a year on each end that is not the current year', () => {
  assert.equal(
    util.formatDisplayDateRange('2025-12-28', '2026-01-03', { today: '2026-10-10' }),
    '2025年12月28日–1月3日'
  )
  assert.equal(
    util.formatDisplayDateRange('2024-12-28', '2025-01-03', { today: '2026-10-10' }),
    '2024年12月28日–2025年1月3日'
  )
})

test('formatDisplayDate leaves an invalid date blank', () => {
  assert.equal(util.formatDisplayDate('2026-02-31', { today: '2026-10-10' }), '')
  assert.equal(util.formatDisplayDateRange('2026-06-01', '2026-02-31', { today: '2026-10-10' }), '')
})

test('isValidDateString rejects dates that only look valid', () => {
  assert.equal(util.isValidDateString('2026-02-28'), true)
  assert.equal(util.isValidDateString('2026-02-31'), false)
  assert.equal(util.isValidDateString(''), false)
  assert.equal(util.isValidDateString(null), false)
  assert.deepEqual(util.normalizeDateRange({ startDate: '2026-02-28', endDate: '2026-03-01' }), {
    startDate: '2026-02-28',
    endDate: '2026-03-01',
    hasEndDate: true
  })
  assert.equal(util.normalizeDateRange({ startDate: '2026-02-28', endDate: '2026-02-31' }), null)
  assert.equal(util.normalizeDateRange(null), null)
})

test('getChineseDateMeta marks lunar text and official holidays across years', () => {
  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2026-02-17')),
    {
      weekday: '周二',
      lunarText: '正月初一',
      holidayName: '春节',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2026-06-19')),
    {
      weekday: '周五',
      lunarText: '五月初五',
      holidayName: '端午',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2026-01-04')),
    {
      weekday: '周日',
      lunarText: '冬月十六',
      holidayName: '',
      isHoliday: false,
      isWorkday: true
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2025-01-29')),
    {
      weekday: '周三',
      lunarText: '正月初一',
      holidayName: '春节',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2027-02-06')),
    {
      weekday: '周六',
      lunarText: '正月初一',
      holidayName: '春节',
      isHoliday: true,
      isWorkday: false
    }
  )
})

test('getChineseDateMeta does not infer adjusted workdays beyond published holiday data', () => {
  assert.equal(chinaHolidays.PUBLISHED_HOLIDAY_START_YEAR, 2001)
  assert.equal(chinaHolidays.PUBLISHED_HOLIDAY_END_YEAR, 2026)
  assert.equal(chinaHolidays.hasPublishedHolidayYear(2026), true)
  assert.equal(chinaHolidays.hasPublishedHolidayYear(2027), false)

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2027-01-03')),
    {
      weekday: '周日',
      lunarText: '冬月廿六',
      holidayName: '',
      isHoliday: false,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2027-05-01')),
    {
      weekday: '周六',
      lunarText: '三月廿五',
      holidayName: '劳动节',
      isHoliday: true,
      isWorkday: false
    }
  )
})

test('published holiday data covers the current runtime year', () => {
  const currentYear = new Date().getFullYear()
  assert.ok(
    chinaHolidays.PUBLISHED_HOLIDAY_END_YEAR >= currentYear,
    `China holiday data ends at ${chinaHolidays.PUBLISHED_HOLIDAY_END_YEAR}; update published ranges for ${currentYear}`
  )
})

test('getChineseDateMeta uses all published State Council holiday arrangements', () => {
  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2001-05-07')),
    {
      weekday: '周一',
      lunarText: '四月十五',
      holidayName: '劳动节',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2001-04-30')),
    {
      weekday: '周一',
      lunarText: '四月初八',
      holidayName: '',
      isHoliday: false,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2007-05-06')),
    {
      weekday: '周日',
      lunarText: '三月二十',
      holidayName: '劳动节',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2007-04-05')),
    {
      weekday: '周四',
      lunarText: '二月十八',
      holidayName: '',
      isHoliday: false,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2006-12-31')),
    {
      weekday: '周日',
      lunarText: '冬月十二',
      holidayName: '',
      isHoliday: false,
      isWorkday: true
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2019-05-02')),
    {
      weekday: '周四',
      lunarText: '三月廿八',
      holidayName: '劳动节',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2020-02-02')),
    {
      weekday: '周日',
      lunarText: '正月初九',
      holidayName: '春节',
      isHoliday: true,
      isWorkday: false
    }
  )

  assert.deepEqual(
    pickMeta(util.getChineseDateMeta('2020-02-03')),
    {
      weekday: '周一',
      lunarText: '正月初十',
      holidayName: '',
      isHoliday: false,
      isWorkday: true
    }
  )
})

test('buildCalendarDays returns base date cells without app marker semantics', () => {
  const days = util.buildCalendarDays({
    year: 2026,
    month: 1,
    periods: [],
    memories: [{ date: '2026-02-17' }],
    nextPredict: null,
    today: '2026-02-17'
  })
  const springFestival = days.find(day => day.date === '2026-02-17')

  assert.equal(springFestival.holidayName, '春节')
  assert.equal(springFestival.lunarText, '正月初一')
  assert.equal('isToday' in springFestival, false)
  assert.equal('isPeriod' in springFestival, false)
  assert.equal('isMemory' in springFestival, false)
  assert.equal('isPredict' in springFestival, false)
})

test('index calendar only shows the heart mark for memories', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  assert.doesNotMatch(wxml, /item\.isToday\s*\|\|\s*item\.isMemory/)
  assert.match(wxml, /wx:if="{{item\.isMemory}}"/)
})

test('index calendar day cells speak composed aria labels and keep hidden cells silent', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const gridStart = wxml.indexOf('class="calendar-grid')
  const gridEnd = wxml.indexOf('class="quick-actions"')
  assert.ok(gridStart !== -1 && gridEnd > gridStart, 'expected the calendar grid block')
  const grid = wxml.slice(gridStart, gridEnd)

  assert.match(grid, /aria-label="\{\{item\.ariaLabel\}\}"/)
  assert.match(grid, /aria-hidden="\{\{item\.isEmpty\}\}"/)
  assert.doesNotMatch(grid, /aria-label="[^"{]/)
})

test('index calendar keeps marker and tag semantics explicit for each meaning', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  assert.match(wxml, /item\.isToday \? 'today' : ''/)
  assert.match(wxml, /item\.isPeriod \? 'period' : ''/)
  assert.match(wxml, /item\.isMemory \? 'memory' : ''/)
  assert.match(wxml, /item\.isPredict \? 'predict' : ''/)
  assert.match(wxml, /item\.isHoliday \? 'holiday' : ''/)
  assert.match(wxml, /item\.isWorkday \? 'workday' : ''/)
  assert.doesNotMatch(wxml, /class="mark period-mark"/)
  assert.match(wxml, /class="period-slot"[^>]*aria-hidden="true"/)
  assert.match(wxml, /wx:if="{{item\.periodSegment != 'none'}}" class="period-band"/)
  assert.match(wxml, /item\.periodSegment === 'start' \? 'period-start' : ''/)
  assert.match(wxml, /item\.periodSegment === 'middle' \? 'period-middle' : ''/)
  assert.match(wxml, /item\.periodSegment === 'end' \? 'period-end' : ''/)
  assert.match(wxml, /item\.periodSegment === 'single' \? 'period-single' : ''/)
  assert.match(wxml, /item\.periodOpenEnd \? 'period-open' : ''/)
  assert.match(wxml, /wx:if="{{item\.isMemory}}" class="mark memory-mark"/)
  assert.match(wxml, /wx:if="{{item\.holidayName}}" class="day-tag holiday-tag"/)
  assert.match(wxml, /wx:elif="{{item\.isWorkday}}" class="day-tag workday-tag"/)
})

test('holiday and workday tags read in both densities and stay outside the today capsule', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  // 标签行只看「非空格」，不看密度：清爽密度同样能看到节日名与「班」
  const tagLine = wxml.match(/<view wx:if="{{!item\.isEmpty}}" class="day-tag-line">/)
  assert.ok(tagLine, 'expected the day-tag-line to render for both densities')
  assert.doesNotMatch(tagLine[0], /calendarDensity/)
  // 农历文字仍只在完整密度出现，清爽密度不带回农历
  assert.match(wxml, /calendarDensity == 'full'\}\}" class="day-lunar"/)

  // 标签的显示条件与今天无关：今天是节日/调休时，短标记与今天胶囊同时在
  const holidayTag = /<text wx:if="{{item\.holidayName}}"[^>]*>/.exec(wxml)
  assert.ok(holidayTag, 'expected the holiday tag binding')
  assert.doesNotMatch(holidayTag[0], /isToday/)
  const workdayTag = /<text wx:elif="{{item\.isWorkday}}"[^>]*>/.exec(wxml)
  assert.ok(workdayTag, 'expected the workday tag binding')
  assert.doesNotMatch(workdayTag[0], /isToday/)

  // 节日是无底金字，没有整格金底；调休「班」仍是低调小标签。今天的胶囊只挂在日期上，标签在自己的行里。
  assert.doesNotMatch(wxss, /\.day-cell\.holiday[^{]*\{[^}]*background\s*:/)
  const holidayTagRule = wxss.match(/\.holiday-tag\s*\{([^}]+)\}/)
  assert.ok(holidayTagRule, 'expected .holiday-tag')
  assert.match(holidayTagRule[1], /color:\s*var\(--aurora-gold\)/)
  assert.doesNotMatch(holidayTagRule[1], /background\s*:/)
  const workdayTagRule = wxss.match(/\.workday-tag\s*\{([^}]+)\}/)
  assert.ok(workdayTagRule, 'expected .workday-tag')
  assert.match(workdayTagRule[1], /background:\s*rgba\(255,\s*255,\s*255,\s*0\.12\)/)
  assert.doesNotMatch(workdayTagRule[1], /aurora-gold|212,\s*165,\s*116/)
  // 调休格的低对比底在今天也照常铺：今天只在日期上加胶囊，不再整格让位（issue #162）
  assert.match(wxss, /\.day-cell\.workday\s*\{/)
  assert.doesNotMatch(wxss, /\.workday:not\(\.today\)/, 'today keeps the workday wash under its capsule')
  assert.match(wxss, /\.day-cell\.today \.day-num::before\s*\{/, 'today hangs a capsule on the date, including period days')
})

test('legend samples reuse the calendar cell marker classes', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const { buildHomeCalendarState } = require('../utils/homeCalendarState')
  const grid = wxml.slice(wxml.indexOf('class="calendar-grid'), wxml.indexOf('class="quick-actions"'))
  const legend = wxml.slice(wxml.indexOf('class="legend-list"'), wxml.indexOf('class="prediction-explanation"'))

  assert.match(legend, /class="legend-sample day-cell \{\{item\.cellClass\}\}"/)
  assert.match(legend, /class="\{\{part\.className\}\}"/)
  assert.doesNotMatch(legend, /legend-symbol|\{\{item\.marker\}\}/)

  const items = buildHomeCalendarState({ year: 2026, month: 7, today: '2026-08-10' }).legendItems
  for (const item of items) {
    for (const token of item.cellClass.split(/\s+/).filter(Boolean)) {
      assert.match(grid, new RegExp(`(?:^|[^\\w-])${token}(?:[^\\w-]|$)`))
    }
    for (const part of item.parts) {
      assert.match(grid, new RegExp(part.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    }
  }
})

// issue #159：首页「记经期」和当日弹层的经期动作画的是图例那段单日色带——同一组格子类、同一个色，
// 不再另有一套圆点；欢乐时光仍是浅色心
test('record-period actions draw the legend band sample instead of a dot', () => {
  const { parseWxssRules } = require('./designTokens')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const rules = parseWxssRules(fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8'))
  const quickPeriod = wxml.slice(wxml.indexOf('bindtap="quickPeriod"'), wxml.indexOf('bindtap="quickMemory"'))
  const actionsStart = wxml.indexOf('wx:for="{{selectedDayDetail.actions}}"')
  const dayActions = wxml.slice(actionsStart, wxml.indexOf('class="sheet-host"', actionsStart))

  // 两处引用同一个 WXML 模板画样本；样本标记只在模板里写一次
  const template = /<template name="periodBandSample">([\s\S]*?)<\/template>/.exec(wxml)
  assert.ok(template, 'one periodBandSample template draws the band sample')
  assert.match(template[1], /class="action-sample day-cell \{\{cellClass\}\}"/, 'the template draws the legend band sample')
  assert.match(template[1], /wx:for="\{\{parts\}\}"[^>]*class="\{\{part\.className\}\}"/, 'the template draws the sample parts')
  assert.equal(wxml.split('class="action-sample').length, 2, 'the sample markup lives only in the template')
  for (const [where, block] of [['quick period button', quickPeriod], ['day sheet period action', dayActions]]) {
    assert.match(block, /<template is="periodBandSample" data="\{\{\.\.\.periodBandSample\}\}"\s*\/>/, `${where} draws the shared band sample`)
    assert.doesNotMatch(block, /●|period-tone/, `${where} no longer draws a separate dot`)
  }
  assert.match(dayActions, /class="sheet-action-icon memory-tone">♥<\/text>/)
  assert.equal(rules.some(rule => rule.selectors.includes('.period-tone')), false, 'the dot tone is gone')

  // 色带的颜色只在 .period-band 一处：动作样本只改尺寸，不另上色、不调透明度。
  // 记录成功反馈在首页不可见时把日历格里的色带按在透明（issue #167，动效状态由 motion-performance 钉住），不算另一种颜色
  const paints = rules
    .filter(rule => rule.selectors.some(selector => /period-band|action-sample/.test(selector)))
    .filter(rule => !rule.selectors.every(selector => selector.includes('.record-feedback-')))
    .filter(rule => ['background', 'background-color', 'color', 'opacity', 'filter'].some(prop => prop in rule.decls))
    .map(rule => rule.selectors.join(', '))
  assert.deepEqual(paints, ['.period-band'])

  // 样本读作一段横向色带（宽高比 ≥ 1.5，不是圆点），放得进各自的圆盘，色带铺满样本，按压归外层按钮
  const decls = selector => {
    const rule = rules.find(candidate => candidate.selectors.includes(selector))
    assert.ok(rule, `expected ${selector}`)
    return rule.decls
  }
  const rpx = (selector, prop) => {
    const value = /^(\d+(?:\.\d+)?)rpx$/.exec(decls(selector)[prop] || '')
    assert.ok(value, `${selector} ${prop} should be an rpx length`)
    return Number(value[1])
  }
  const sample = decls('.action-sample.day-cell')
  assert.equal(sample['pointer-events'], 'none')
  assert.equal(sample.padding, '0')
  assert.equal(decls('.action-sample .period-band').height, '100%')
  for (const [plate, sized] of [['.quick-icon', '.action-sample.day-cell'], ['.sheet-action-icon', '.sheet-action-icon .action-sample.day-cell']]) {
    const width = rpx(sized, 'width')
    const height = rpx(sized, 'height')
    assert.ok(width / height >= 1.5, `${sized} ${width}×${height}rpx reads as a dot, not a band`)
    assert.ok(width < rpx(plate, 'width'), `${sized} ${width}rpx does not fit its ${plate} plate`)
  }
})

test('memory list heart matches the calendar heart glyph system', () => {
  const memoryWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/memory/memory.wxml'), 'utf8')
  const memoryWxss = fs.readFileSync(path.join(__dirname, '..', 'pages/memory/memory.wxss'), 'utf8')
  const indexWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  const periodWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/period/period.wxml'), 'utf8')
  assert.match(indexWxml, /class="mark memory-mark">♥</)
  assert.match(periodWxml, /class="memory-heart">♥</)
  assert.doesNotMatch(memoryWxml, /class="memory-heart"/)
  assert.match(memoryWxss, /\.memory-heart\s*\{[^}]*color:\s*#F0C4C0/i)
})

test('index day actions use the themed in-page action sheet', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(wxml, /day-action-sheet/)
  assert.match(wxml, /day-detail-list/)
  assert.match(wxss, /\.day-action-sheet/)
  assert.match(wxss, /\.day-detail-list/)
  assert.match(wxss, /\.sheet-close\s*{[\s\S]*width:\s*88rpx[\s\S]*height:\s*88rpx/)
  assert.match(wxss, /\.sheet-action\.compact\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /prefers-reduced-motion:\s*reduce/)
})

test('index month title opens a themed year-month jump sheet', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(wxml, /month-title-trigger/)
  assert.match(wxml, /bindtap="openMonthPicker"/)
  assert.match(wxml, /aria-label="选择年份和月份"/)
  assert.match(wxml, /calendar-jump-sheet/)
  assert.match(wxml, /jump-today/)
  assert.match(wxml, /bindtap="jumpToToday"/)
  assert.match(wxml, /aria-label="回到今天所在月份"/)
  assert.match(wxml, /jump-year-stepper/)
  assert.match(wxml, /jump-month-grid/)
  assert.doesNotMatch(wxml, /confirmMonthJump|jump-confirm/)
  assert.doesNotMatch(wxml, /jump-year-grid|year-option|jump-nav-btn/)

  assert.match(wxss, /\.month-title-trigger\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.calendar-jump-sheet/)
  assert.match(wxss, /\.jump-today\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.jump-year-step\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.jump-option\s*{[\s\S]*min-height:\s*88rpx/)
  assert.doesNotMatch(wxss, /\.jump-confirm/)
})

test('index calendar applies the persisted density without hosting the control', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.doesNotMatch(wxml, /density-control/)
  // 网格类名先带密度；清爽密度空间不足时几何账本再挂合并信息行的类（issue #153）
  assert.match(wxml, /class="calendar-grid calendar-density-\{\{calendarDensity\}\}\{\{calendarInfoMerged \? ' calendar-info-merged' : ''\}\}"/)
  // 农历文字只属完整密度；节日/调休标签行两密度都渲染（issue #72 清爽日历可读节日与调休）
  assert.match(wxml, /wx:if="\{\{!item\.isEmpty && calendarDensity == 'full'\}\}" class="day-lunar">\{\{item\.lunarCellText\}\}/)
  assert.doesNotMatch(wxml, /class="day-lunar">\{\{item\.lunarText\}\}/)
  assert.match(wxml, /wx:if="\{\{!item\.isEmpty\}\}" class="day-tag-line"/)

  assert.match(wxss, /\.calendar-density-compact\s+\.day-cell\s*\{[\s\S]*height:\s*var\(--calendar-row-height,\s*148rpx\)/)
})

test('settings page hosts the calendar density control with a quiet rose selected state', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/settings/settings.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/settings/settings.wxss'), 'utf8')

  assert.match(wxml, /density-control/)
  assert.match(wxml, /data-density="compact"[\s\S]*清爽/)
  assert.match(wxml, /data-density="full"[\s\S]*完整/)
  assert.match(wxml, /bindtap="setCalendarDensity"/)

  assert.match(wxss, /\.density-control\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(wxss, /\.density-option\s*{[\s\S]*min-height:\s*88rpx/)
  const selected = wxss.match(/\.density-option\.active\s*\{([^}]+)\}/)
  assert.ok(selected, 'expected .density-option.active in settings.wxss')
  assert.doesNotMatch(selected[1], /linear-gradient/)
  assert.match(selected[1], /color:\s*#E8909E/i)
  assert.match(selected[1], /border-color:\s*rgba\(232,\s*144,\s*158,/)
})

test('settings density defaults to compact, validates taps and persists both choices across entry', async (t) => {
  const app = createMiniProgram()
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.calendarDensity, 'compact')
  for (const density of ['full', 'compact']) {
    await app.dispatch(page, 'setCalendarDensity', { currentTarget: { dataset: { density } } })
    assert.equal(page.data.calendarDensity, density)
    assert.equal(app.storage.calendarDensity, density)
    await app.dispatch(page, 'setCalendarDensity', { currentTarget: { dataset: { density: 'huge' } } })
    assert.equal(page.data.calendarDensity, density)
    assert.equal(app.storage.calendarDensity, density)
    app.hide()
    app.show()
    await app.settle()
    assert.equal(page.data.calendarDensity, density)
  }
  app.wx.setStorageSync('calendarDensity', 'full')
  const later = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(later.data.calendarDensity, 'full')
  app.wx.setStorageSync('calendarDensity', 'huge')
  app.hide()
  app.show()
  await app.settle()
  assert.equal(later.data.calendarDensity, 'compact')
})

test('index exposes calendar meaning and monthly recap sheets', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  // issue #105：图例/预测说明/小结入口从常驻工具条收进月份标题旁的「…」菜单，
  // 菜单项经 onMonthMenuTap 分发到既有打开函数；预测说明同时仍可从合并状态卡直接打开
  assert.doesNotMatch(wxml, /meaning-toolbar/)
  assert.match(wxml, /toolsMenuMounted/)
  assert.match(wxml, /bindtap="openMonthMenu"/)
  assert.match(wxml, /data-action="legend"[^>]*bindtap="onMonthMenuTap"/)
  assert.match(wxml, /data-action="prediction"[^>]*bindtap="onMonthMenuTap"/)
  assert.match(wxml, /data-action="recap"[^>]*bindtap="onMonthMenuTap"/)
  assert.match(wxml, /bindtap="openPredictionSheet"/)
  assert.match(wxml, /calendar-info-sheet/)
  assert.match(wxml, /legend-list/)
  assert.match(wxml, /prediction-explanation/)
  assert.match(wxml, /monthly-recap/)
  assert.match(wxml, /copyMonthlyRecap/)
  assert.match(wxml, /selectedDayDetail\.meanings/)
  assert.match(wxml, /wx:for="{{selectedDayDetail\.periods}}"[\s\S]*wx:key="key"/)
  assert.match(wxml, /wx:for="{{selectedDayDetail\.memories}}"[\s\S]*wx:key="key"/)
  assert.match(wxml, /wx:for="{{predictionExplanation\.lineItems}}"[\s\S]*wx:key="key"/)
  assert.match(wxml, /wx:for="{{monthlyRecap\.highlightItems}}"[\s\S]*wx:key="key"/)
  assert.doesNotMatch(wxml, /wx:key="range"/)
  assert.doesNotMatch(wxml, /wx:key="note"/)
  assert.doesNotMatch(wxml, /wx:for="{{predictionExplanation\.lines}}"/)
  assert.doesNotMatch(wxml, /wx:for="{{monthlyRecap\.highlights}}"/)

  assert.doesNotMatch(wxss, /\.meaning-toolbar/)
  assert.match(wxss, /\.calendar-info-sheet/)
  assert.match(wxss, /\.monthly-recap/)
  assert.match(wxss, /\.detail-meaning/)
})

test('monthly recap sheet does not repeat the viewed month under the title', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const infoStart = wxml.indexOf('calendar-info-sheet')
  const info = wxml.slice(infoStart, wxml.indexOf('page-container', infoStart))
  const titleAt = info.indexOf('monthlyRecap.title')
  assert.ok(titleAt > 0, 'expected the recap title in the info sheet')
  const between = info.slice(titleAt, info.indexOf('sheet-subtitle', titleAt))
  assert.match(between, /infoSheetMode != 'recap'/)
})

test('prediction explanation and recap copy read as paragraphs, not tappable rows', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')
  const copyStart = wxml.indexOf('class="prediction-explanation"')
  const copy = wxml.slice(copyStart, wxml.indexOf('class="copy-recap"', copyStart))
  assert.ok(copyStart > 0)
  assert.doesNotMatch(copy, /bindtap/)

  for (const selector of ['.prediction-summary', '.explain-line', '.recap-summary', '.recap-highlight']) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const body = new RegExp(`(?:^|[\\n}])\\s*${escaped}\\s*\\{([^}]+)\\}`).exec(wxss)
    assert.ok(body, `expected ${selector}`)
    assert.doesNotMatch(body[1], /background/, `${selector} should not wear a button fill`)
    assert.doesNotMatch(body[1], /border/, `${selector} should not wear a button border`)
    assert.doesNotMatch(body[1], /min-height/, `${selector} should not reserve a tap height`)
  }
})

test('index sync feedback markup does not block calendar interaction', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(wxml, /loading && !hasLoadedHomeData/)
  assert.match(wxml, /sync-pill/)
  assert.match(wxml, /content-refreshing/)

  // 胶囊在顶栏标题槽的文档流里（narrow-screen-geometry 账本），不再浮在吸顶的月份标题上
  assert.doesNotMatch(wxss, /\.sync-pill\s*{[^}]*position:\s*fixed/)
  assert.doesNotMatch(wxss, /\.sync-pill\s*{[^}]*z-index:/)
  assert.match(wxss, /\.sync-pill\s*{[^}]*pointer-events:\s*none/)
  assert.match(wxss, /prefers-reduced-motion:\s*reduce[\s\S]*\.sync-pill/)
})

test('edit pages echo a display date and keep the picker value as ISO', () => {
  const period = fs.readFileSync(path.join(__dirname, '..', 'pages/period/edit/edit.wxml'), 'utf8')
  const memory = fs.readFileSync(path.join(__dirname, '..', 'pages/memory/edit/edit.wxml'), 'utf8')

  assert.match(period, /value="\{\{startDate\}\}"[\s\S]*?<text>\{\{startDateLabel\}\}<\/text>/)
  assert.match(period, /value="\{\{endDate\}\}"[\s\S]*?<text>\{\{endDateLabel\}\}<\/text>/)
  assert.doesNotMatch(period, /<text>\{\{startDate\}\}<\/text>/)
  assert.doesNotMatch(period, /<text>\{\{endDate\}\}<\/text>/)
  assert.match(memory, /value="\{\{date\}\}"[\s\S]*?<text>\{\{dateLabel\}\}<\/text>/)
  assert.doesNotMatch(memory, /<text>\{\{date\}\}<\/text>/)
})

test('period edit page exposes flow and symptom controls', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/period/edit/edit.wxml'), 'utf8')

  assert.match(wxml, /flow-options/)
  assert.match(wxml, /symptom-options/)
  assert.match(wxml, /toggleSymptom/)
})

test('period edit chips keep touch targets large enough', () => {
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/period/edit/edit.wxss'), 'utf8')

  assert.match(wxss, /\.flow-chip,\s*[\r\n]+\.symptom-chip\s*{[\s\S]*min-height:\s*88rpx/)
})

test('home Room status markup renders its explanation and recovery action', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  assert.match(wxml, /roomStatusTitle/)
  assert.match(wxml, /roomStatusDesc/)
  assert.match(wxml, /handleRoomStatusAction/)
})

test('home summary row is a plain row and does not bring back the nested status card', () => {
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')
  assert.doesNotMatch(wxss, /\.status-card\s*\{/)
  const match = wxss.match(/(?:^|\r?\n)\.month-summary\s*\{([\s\S]*?)\r?\n\}/m)
  assert.ok(match, 'expected a top-level .month-summary rule')
  assert.doesNotMatch(match[1], /backdrop-filter|premium-card/)
  assert.doesNotMatch(match[1], /(?:^|\s)background\s*:/)
})

function pickMeta(meta) {
  return {
    weekday: meta.weekday,
    lunarText: meta.lunarText,
    holidayName: meta.holidayName,
    isHoliday: meta.isHoliday,
    isWorkday: meta.isWorkday
  }
}
