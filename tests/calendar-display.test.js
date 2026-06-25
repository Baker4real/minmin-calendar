const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const util = require('../utils/util')

test('formatPredictDisplay returns a compact date with weekday', () => {
  assert.deepEqual(util.formatPredictDisplay('2026-06-24'), {
    date: '06月24日',
    weekday: '周三'
  })
  assert.deepEqual(util.formatPredictDisplay(null), { date: '--', weekday: '' })
  assert.deepEqual(util.formatPredictDisplay('--'), { date: '--', weekday: '' })
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

test('buildCalendarDays includes lunar and holiday metadata without conflating today and memories', () => {
  const days = util.buildCalendarDays({
    year: 2026,
    month: 1,
    periods: [],
    memories: [{ date: '2026-02-17' }],
    nextPredict: null,
    today: '2026-02-17'
  })
  const springFestival = days.find(day => day.date === '2026-02-17')

  assert.equal(springFestival.isToday, true)
  assert.equal(springFestival.isMemory, true)
  assert.equal(springFestival.holidayName, '春节')
  assert.equal(springFestival.lunarText, '正月初一')
})

test('buildCalendarDays marks the prediction range exactly when provided', () => {
  const days = util.buildCalendarDays({
    year: 2026,
    month: 7,
    periods: [],
    memories: [],
    nextPredict: '2026-08-10',
    predictionWindow: {
      rangeStart: '2026-08-09',
      rangeEnd: '2026-08-11'
    },
    today: '2026-08-01'
  })

  const predictedDates = days.filter(day => day.isPredict).map(day => day.date)
  assert.deepEqual(predictedDates, ['2026-08-09', '2026-08-10', '2026-08-11'])
})

test('index calendar only shows the heart mark for memories', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  assert.doesNotMatch(wxml, /item\.isToday\s*\|\|\s*item\.isMemory/)
  assert.match(wxml, /wx:if="{{item\.isMemory}}"/)
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
  assert.match(js, /jumpYears:\s*\[\]/)
  assert.match(js, /openMonthPicker\(\)\s*{[\s\S]*buildMonthJumpYears/)
  assert.match(js, /selectJumpYear\(e\)\s*{[\s\S]*dataset\.year/)
  assert.match(js, /selectJumpMonth\(e\)\s*{[\s\S]*dataset\.month/)
  assert.match(js, /confirmMonthJump\(\)\s*{[\s\S]*year:\s*this\.data\.jumpYear[\s\S]*month:\s*this\.data\.jumpMonth/)
  assert.match(js, /closeMonthPicker\(\)\s*{[\s\S]*monthPickerVisible:\s*false/)

  assert.match(wxml, /month-title-trigger/)
  assert.match(wxml, /bindtap="openMonthPicker"/)
  assert.match(wxml, /aria-label="选择年份和月份"/)
  assert.match(wxml, /calendar-jump-sheet/)
  assert.match(wxml, /jump-year-grid/)
  assert.match(wxml, /jump-month-grid/)
  assert.match(wxml, /bindtap="confirmMonthJump"/)

  assert.match(wxss, /\.month-title-trigger\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.calendar-jump-sheet/)
  assert.match(wxss, /\.jump-option\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.jump-confirm\s*{[\s\S]*min-height:\s*88rpx/)
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

test('period list shows a toast when loading records fails', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/period/period.js'), 'utf8')

  assert.match(js, /catch\(e\)\s*{[\s\S]*wx\.showToast\(\{\s*title:\s*'加载失败，请检查网络'/)
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
