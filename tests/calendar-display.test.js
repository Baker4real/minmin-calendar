const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const chinaHolidays = require('../utils/chinaHolidays')
const util = require('../utils/util')

test('formatPredictDisplay returns a compact date with weekday', () => {
  assert.deepEqual(util.formatPredictDisplay('2026-06-24'), {
    date: '06月24日',
    weekday: '周三'
  })
  assert.deepEqual(util.formatPredictDisplay(null), { date: '--', weekday: '' })
  assert.deepEqual(util.formatPredictDisplay('--'), { date: '--', weekday: '' })
  assert.deepEqual(util.formatPredictDisplay('2026-02-31'), { date: '--', weekday: '' })
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

test('holiday and workday tags read in both densities and never displace the today ring', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  // 标签行只看「非空格」，不看密度：清爽密度同样能看到节日名与「班」
  const tagLine = wxml.match(/<view wx:if="{{!item\.isEmpty}}" class="day-tag-line">/)
  assert.ok(tagLine, 'expected the day-tag-line to render for both densities')
  assert.doesNotMatch(tagLine[0], /calendarDensity/)
  // 农历文字仍只在完整密度出现，清爽密度不带回农历
  assert.match(wxml, /calendarDensity == 'full'\}\}" class="day-lunar"/)

  // 标签的显示条件与今天无关：今天是节日/调休时，短标记与今日光圈同时在
  const holidayTag = /<text wx:if="{{item\.holidayName}}"[^>]*>/.exec(wxml)
  assert.ok(holidayTag, 'expected the holiday tag binding')
  assert.doesNotMatch(holidayTag[0], /isToday/)
  const workdayTag = /<text wx:elif="{{item\.isWorkday}}"[^>]*>/.exec(wxml)
  assert.ok(workdayTag, 'expected the workday tag binding')
  assert.doesNotMatch(workdayTag[0], /isToday/)

  // 节日/调休的格子底必须让位给今天：玫瑰底 + 薰衣草内描边只在非今天格子上染色
  assert.match(wxss, /\.day-cell\.holiday:not\(\.today\)\s*\{/)
  assert.match(wxss, /\.day-cell\.workday:not\(\.today\)\s*\{/)
  assert.match(wxss, /\.day-cell\.today\s*\{[\s\S]*?inset 0 0 0 3rpx rgba\(196,\s*160,\s*210,\s*0\.55\)/)
})

test('legend symbols mirror the real today ring and holiday tag forms', () => {
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  const todaySymbol = wxss.match(/\.legend-row\.today \.legend-symbol\s*\{([^}]+)\}/)
  assert.ok(todaySymbol, 'expected a dedicated today legend symbol rule')
  assert.match(todaySymbol[1], /background:\s*rgba\(232,\s*144,\s*158,\s*0\.16\)/)
  assert.match(todaySymbol[1], /box-shadow:\s*inset 0 0 0 3rpx rgba\(196,\s*160,\s*210,\s*0\.55\)/)

  const holidaySymbol = wxss.match(/\.legend-row\.holiday \.legend-symbol\s*\{([^}]+)\}/)
  assert.ok(holidaySymbol, 'expected a dedicated holiday legend symbol rule')
  assert.match(holidaySymbol[1], /border-radius:\s*var\(--radius-sm\)/)
  // 字号沿用 .legend-symbol 的 caption 角色（26rpx），节日图例不再缩小
  assert.doesNotMatch(holidaySymbol[1], /font-size/)
})

test('memory list heart matches the calendar heart glyph system', () => {
  const memoryWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/memory/memory.wxml'), 'utf8')
  const memoryWxss = fs.readFileSync(path.join(__dirname, '..', 'pages/memory/memory.wxss'), 'utf8')
  const indexWxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  assert.match(indexWxml, /class="mark memory-mark">♥</)
  assert.match(memoryWxml, /class="memory-heart">♥</)
  assert.doesNotMatch(memoryWxml, /class="memory-heart">❤/)
  assert.match(memoryWxss, /\.memory-heart\s*\{[^}]*color:\s*#F0C4C0/i)
})

test('index day actions use the themed in-page action sheet', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.doesNotMatch(js, /wx\.showActionSheet/)
  assert.doesNotMatch(js, /wx\.showModal/)
  assert.match(wxml, /day-action-sheet/)
  assert.match(wxml, /day-detail-list/)
  assert.match(wxss, /\.day-action-sheet/)
  assert.match(wxss, /\.day-detail-list/)
  assert.match(wxss, /\.sheet-close\s*{[\s\S]*width:\s*88rpx[\s\S]*height:\s*88rpx/)
  assert.match(wxss, /\.sheet-action\.compact\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /prefers-reduced-motion:\s*reduce/)
})

test('index month title opens a themed year-month jump sheet', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.doesNotMatch(js, /wx\.show(?:ActionSheet|Modal|DatePicker|Picker)/)
  assert.match(js, /monthPickerVisible:\s*false/)
  assert.match(js, /JUMP_YEAR_MIN\s*=\s*2001/)
  assert.match(js, /JUMP_YEAR_MAX\s*=\s*2035/)
  assert.match(js, /buildJumpYearState\(/)
  assert.match(js, /openMonthPicker\(\)\s*{[\s\S]*buildJumpYearState/)
  assert.match(js, /shiftJumpYear\(e\)\s*{[\s\S]*dataset\.delta/)
  assert.match(js, /selectJumpMonth\(e\)\s*{[\s\S]*dataset\.month[\s\S]*year:\s*this\.data\.jumpYear[\s\S]*monthPickerVisible:\s*false/)
  assert.doesNotMatch(js, /confirmMonthJump/)
  assert.match(js, /jumpToToday\(\)\s*{[\s\S]*new Date\(\)[\s\S]*monthPickerVisible:\s*false[\s\S]*renderCalendar/)
  assert.match(js, /closeMonthPicker\(\)\s*{[\s\S]*monthPickerVisible:\s*false/)
  assert.doesNotMatch(js, /buildMonthJumpYears|shiftJumpYears|selectJumpYear|jumpYears/)

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
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(js, /CALENDAR_DENSITY_STORAGE_KEY\s*=\s*'calendarDensity'/)
  assert.match(js, /calendarDensity:\s*'compact'/)
  assert.match(js, /getSavedCalendarDensity\(\)\s*{[\s\S]*getStorageSync\(CALENDAR_DENSITY_STORAGE_KEY\)[\s\S]*return 'compact'/)
  // 从设置 tab 返回时 onShow 重读偏好，切换即刻生效
  assert.match(js, /onShow\(\)\s*{[\s\S]*calendarDensity:\s*this\.getSavedCalendarDensity\(\)/)
  // 切换控件已迁往设置页，首页不再持有 setter
  assert.doesNotMatch(js, /setCalendarDensity/)

  assert.doesNotMatch(wxml, /density-control/)
  assert.match(wxml, /class="calendar-grid calendar-density-\{\{calendarDensity\}\}"/)
  // 农历文字只属完整密度；节日/调休标签行两密度都渲染（issue #72 清爽日历可读节日与调休）
  assert.match(wxml, /wx:if="\{\{!item\.isEmpty && calendarDensity == 'full'\}\}" class="day-lunar"/)
  assert.match(wxml, /wx:if="\{\{!item\.isEmpty\}\}" class="day-tag-line"/)

  assert.match(wxss, /\.calendar-density-compact\s+\.day-cell\s*\{[\s\S]*height:\s*140rpx/)
})

test('settings page hosts the calendar density control with a quiet rose selected state', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/settings/settings.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/settings/settings.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/settings/settings.wxss'), 'utf8')

  assert.match(js, /CALENDAR_DENSITY_STORAGE_KEY\s*=\s*'calendarDensity'/)
  assert.match(js, /calendarDensity:\s*'compact'/)
  assert.match(js, /onShow\(\)\s*{[\s\S]*getSavedCalendarDensity/)
  assert.match(js, /setCalendarDensity\(e\)\s*{[\s\S]*dataset\.density[\s\S]*calendarDensity/)
  assert.match(js, /setStorageSync\(CALENDAR_DENSITY_STORAGE_KEY,\s*density\)/)
  assert.match(js, /density !== 'compact' && density !== 'full'/)

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

test('settings density control validates and persists the preference', async () => {
  const storage = new Map()
  const harness = loadSettingsHarness()

  try {
    global.wx.getStorageSync = key => (storage.has(key) ? storage.get(key) : '')
    global.wx.setStorageSync = (key, value) => storage.set(key, value)

    harness.page.setCalendarDensity({ currentTarget: { dataset: { density: 'full' } } })
    assert.equal(harness.page.data.calendarDensity, 'full')
    assert.equal(storage.get('calendarDensity'), 'full')

    // 非法值不落地、不改状态
    harness.page.setCalendarDensity({ currentTarget: { dataset: { density: 'huge' } } })
    assert.equal(harness.page.data.calendarDensity, 'full')
    assert.equal(storage.size, 1)

    // 重新进入设置页时读出已持久化的偏好
    await harness.page.onShow()
    assert.equal(harness.page.data.calendarDensity, 'full')
  } finally {
    harness.teardown()
  }
})

test('index exposes calendar meaning and monthly recap sheets', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(js, /buildHomeCalendarState/)
  assert.doesNotMatch(js, /buildCalendarDays\(/)
  assert.doesNotMatch(js, /buildMonthlyRecap\(/)
  assert.doesNotMatch(js, /buildDayMeanings\(/)
  assert.doesNotMatch(js, /calendarInsights/)
  assert.doesNotMatch(js, /CALENDAR_LEGEND_ITEMS/)
  assert.match(js, /openLegendSheet\(\)/)
  assert.match(js, /openPredictionSheet\(\)/)
  assert.match(js, /openMonthlyRecap\(\)/)
  assert.match(js, /copyMonthlyRecap\(\)/)
  assert.doesNotMatch(js, /dayDetailsByDate:\s*\{\}/)
  assert.match(js, /selectedDayDetail:\s*this\._dayDetail\(date\)/)

  // issue #105：图例/预测说明/小结入口从常驻工具条收进月份标题旁的「…」菜单，
  // 菜单项经 onMonthMenuTap 分发到既有打开函数；预测说明同时仍可从合并状态卡直接打开
  assert.doesNotMatch(wxml, /meaning-toolbar/)
  assert.match(wxml, /monthMenuMounted/)
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

test('index sync feedback stays tied to real record changes without blocking calendar interaction', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(js, /refreshing:\s*false/)
  assert.match(js, /hasLoadedHomeData:\s*false/)
  assert.match(js, /syncStatusVisible:\s*false/)
  assert.match(js, /canRefreshInBackground\(\)/)
  assert.doesNotMatch(js, /showSyncStatus\('正在同步'\)|syncStatusText:\s*'正在同步'/)
  assert.match(js, /_syncState\s*=\s*{/)
  assert.match(js, /_startLoad\(background\)/)
  assert.match(js, /_resolveLoad\(requestId, snapshot, background\)/)
  assert.doesNotMatch(js, /_hasPendingRecordChangeSync/)
  assert.match(js, /_mergeRecordChange\(/)
  assert.match(js, /hideSyncStatus\(\)/)
  assert.match(js, /applyRecordChange\(change = \{\}\)/)

  assert.match(wxml, /loading && !hasLoadedHomeData/)
  assert.match(wxml, /sync-pill/)
  assert.match(wxml, /content-refreshing/)

  assert.match(wxss, /\.sync-pill\s*{[\s\S]*position:\s*fixed/)
  assert.match(wxss, /\.sync-pill\s*{[\s\S]*z-index:\s*50/)
  assert.match(wxss, /\.sync-pill\s*{[\s\S]*pointer-events:\s*none/)
  assert.match(wxss, /prefers-reduced-motion:\s*reduce[\s\S]*\.sync-pill/)
})

test('home calendar state is the only public seam for calendar markers', () => {
  const root = path.join(__dirname, '..')
  const homeState = fs.readFileSync(path.join(root, 'utils/homeCalendarState.js'), 'utf8')

  assert.equal(fs.existsSync(path.join(root, 'utils/calendarCells.js')), false)
  assert.doesNotMatch(homeState, /require\(['"]\.\/calendarCells['"]\)/)
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

test('period list delegates load failure copy to the shared record command helper', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/period/period.js'), 'utf8')

  assert.match(js, /recordCommands\.runRecordListLoad\(/)
  assert.match(js, /retryableTitle:\s*'加载失败，请检查网络'/)
  assert.match(js, /failureTitle:\s*'加载失败'/)
})

test('home page consumes RoomDataClient outcomes instead of legacy room-code and list wrappers', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  assert.match(js, /cloud\.createRoomDataClient\(\)/)
  assert.match(js, /roomRecordsSnapshot\.loadHomeRecordsSnapshot\(\{\s*client\s*\}\)/)
  assert.match(js, /roomRecordsSnapshot\.loadHomeRecordsSnapshot\(\{\s*client\s*\}\)/)
  assert.match(js, /_resolveLoad\(requestId, snapshot, background\)/)
  assert.match(js, /applyRoomStatusOutcome\(/)
  assert.match(js, /handleRoomStatusAction\(\)/)
  assert.doesNotMatch(js, /cloud\.getRoomCode\(\)/)
  assert.doesNotMatch(js, /cloud\.getPeriods\(\)/)
  assert.doesNotMatch(js, /cloud\.getMemories\(\)/)
  assert.match(wxml, /roomStatusTitle/)
  assert.match(wxml, /roomStatusDesc/)
  assert.match(wxml, /handleRoomStatusAction/)
})

test('index status-card keeps only layout overrides over premium-card glass', () => {
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')
  const match = wxss.match(/(?:^|\r?\n)\.status-card\s*\{([\s\S]*?)\r?\n\}/m)
  assert.ok(match, 'expected a top-level .status-card rule')
  const block = match[1]

  assert.match(block, /margin-top\s*:/)
  assert.match(block, /padding\s*:/)
  assert.doesNotMatch(block, /background/)
  assert.doesNotMatch(block, /backdrop-filter/)
  assert.doesNotMatch(block, /border/)
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

function loadSettingsHarness() {
  const repoRoot = path.join(__dirname, '..')
  const absolutePagePath = path.join(repoRoot, 'pages/settings/settings.js')
  const absoluteMocks = new Map([
    [path.join(repoRoot, 'utils/cloud.js'), {}],
    [path.join(repoRoot, 'utils/room.js'), {
      getRoomCode() {
        return ''
      },
      getVerifiedActiveRoom: async () => null
    }],
    [
      path.join(repoRoot, 'utils/roomAccessOutcome.js'),
      { buildRoomDisplayState: () => ({ roomCode: '', roomCodeDisplay: '未绑定' }) }
    ],
    [path.join(repoRoot, 'utils/settingsFlow.js'), {}],
    [path.join(repoRoot, 'utils/safeArea.js'), { getSafeTop: () => 0, getSafeBottom: () => 0, getNavBarHeight: () => 44, getCapsuleRightInset: () => 94 }]
  ])
  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered

  delete require.cache[require.resolve(absolutePagePath)]
  global.wx = {
    getStorageSync: () => '',
    setStorageSync() {},
    navigateTo() {},
    showModal() {}
  }
  global.Page = config => { registered = config }
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (absoluteMocks.has(resolved)) return absoluteMocks.get(resolved)
    return originalLoad.apply(this, arguments)
  }
  require(absolutePagePath)
  Module._load = originalLoad

  const page = {
    data: { ...(registered.data || {}) },
    setData(update, callback) {
      this.data = { ...this.data, ...update }
      if (typeof callback === 'function') callback()
    }
  }
  for (const [key, value] of Object.entries(registered)) {
    if (key !== 'data') page[key] = typeof value === 'function' ? value.bind(page) : value
  }
  return {
    page,
    teardown() {
      Module._load = originalLoad
      global.Page = originalPage
      global.wx = originalWx
      delete require.cache[require.resolve(absolutePagePath)]
    }
  }
}
