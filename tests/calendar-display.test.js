const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createMiniProgram } = require('./helpers/miniProgram')
const path = require('node:path')
const test = require('node:test')
const { parseWxssRules } = require('./designTokens')

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

// issue #196：首页的样式与标记只钉不变量（README「Verification」）。读屏语义归 interaction-semantics。

// 已退役的日历标记不再出现：经期圆点（.period-mark，经期改画色带）、图例独立符号（DESIGN：图例复用日历格标记类，
// 不另设 .legend-symbol / item.marker）、记经期动作的 ● 圆点与 .period-tone 色（issue #159，改画图例那段单日色带）
test('retired calendar marks stay out of the home page', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const rules = parseWxssRules(fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8'))

  assert.doesNotMatch(wxml, /period-mark|legend-symbol|\{\{item\.marker\}\}|●|period-tone/)
  assert.equal(rules.some(rule => rule.selectors.includes('.period-tone')), false, 'the dot tone is gone')
})

// DESIGN：触控高度至少 44px，750rpx 设计宽下盒高 ≥88rpx。这里只比下限，不钉具体尺寸
test('calendar, sheet, density and chip controls keep touch targets at or above the 88rpx floor', () => {
  const floor = 88
  for (const [file, selector, sides] of [
    ['pages/index/index.wxss', '.sheet-close', ['width', 'height']],
    ['pages/index/index.wxss', '.sheet-action.compact', ['min-height']],
    ['pages/index/index.wxss', '.month-title-trigger', ['min-height']],
    ['pages/index/index.wxss', '.jump-today', ['min-height']],
    ['pages/index/index.wxss', '.jump-year-step', ['min-height']],
    ['pages/index/index.wxss', '.jump-option', ['min-height']],
    ['pages/settings/settings.wxss', '.density-option', ['min-height']],
    ['pages/period/edit/edit.wxss', '.flow-chip', ['min-height']],
    ['pages/period/edit/edit.wxss', '.symptom-chip', ['min-height']]
  ]) {
    const decls = Object.assign({}, ...parseWxssRules(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'))
      .filter(rule => rule.selectors.includes(selector))
      .map(rule => rule.decls))
    for (const side of sides) {
      const size = /^(\d+(?:\.\d+)?)rpx$/.exec(decls[side] || '')
      assert.ok(
        size && Number(size[1]) >= floor,
        `${file} ${selector} ${side} is ${decls[side] || '(missing)'}, below the ${floor}rpx touch floor`
      )
    }
  }
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

function pickMeta(meta) {
  return {
    weekday: meta.weekday,
    lunarText: meta.lunarText,
    holidayName: meta.holidayName,
    isHoliday: meta.isHoliday,
    isWorkday: meta.isWorkday
  }
}
