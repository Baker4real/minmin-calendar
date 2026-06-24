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

test('getChineseDateMeta marks lunar text and 2026 official holidays', () => {
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
