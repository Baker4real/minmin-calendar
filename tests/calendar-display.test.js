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

test('index calendar keeps marker and tag semantics explicit for each meaning', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')

  assert.match(wxml, /item\.isToday \? 'today' : ''/)
  assert.match(wxml, /item\.isPeriod \? 'period' : ''/)
  assert.match(wxml, /item\.isMemory \? 'memory' : ''/)
  assert.match(wxml, /item\.isPredict \? 'predict' : ''/)
  assert.match(wxml, /item\.isHoliday \? 'holiday' : ''/)
  assert.match(wxml, /item\.isWorkday \? 'workday' : ''/)
  assert.match(wxml, /wx:if="{{item\.isPeriod}}" class="mark period-mark"/)
  assert.match(wxml, /wx:if="{{item\.isMemory}}" class="mark memory-mark"/)
  assert.match(wxml, /wx:if="{{item\.isPredict && !item\.isPeriod}}" class="mark predict-mark"/)
  assert.match(wxml, /wx:if="{{item\.holidayName}}" class="day-tag holiday-tag"/)
  assert.match(wxml, /wx:elif="{{item\.isWorkday}}" class="day-tag workday-tag"/)
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
  assert.match(js, /jumpToToday\(\)\s*{[\s\S]*new Date\(\)[\s\S]*monthPickerVisible:\s*false[\s\S]*renderCalendar/)
  assert.match(js, /closeMonthPicker\(\)\s*{[\s\S]*monthPickerVisible:\s*false/)

  assert.match(wxml, /month-title-trigger/)
  assert.match(wxml, /bindtap="openMonthPicker"/)
  assert.match(wxml, /aria-label="选择年份和月份"/)
  assert.match(wxml, /calendar-jump-sheet/)
  assert.match(wxml, /jump-today/)
  assert.match(wxml, /bindtap="jumpToToday"/)
  assert.match(wxml, /aria-label="回到今天所在月份"/)
  assert.match(wxml, /jump-year-grid/)
  assert.match(wxml, /jump-month-grid/)
  assert.match(wxml, /bindtap="confirmMonthJump"/)

  assert.match(wxss, /\.month-title-trigger\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.calendar-jump-sheet/)
  assert.match(wxss, /\.jump-today\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.jump-option\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.jump-confirm\s*{[\s\S]*min-height:\s*88rpx/)
})

test('index calendar density control defaults to full and remembers user preference', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(js, /CALENDAR_DENSITY_STORAGE_KEY\s*=\s*'calendarDensity'/)
  assert.match(js, /calendarDensity:\s*'full'/)
  assert.match(js, /getSavedCalendarDensity\(\)\s*{[\s\S]*getStorageSync\(CALENDAR_DENSITY_STORAGE_KEY\)[\s\S]*return 'full'/)
  assert.match(js, /setCalendarDensity\(e\)\s*{[\s\S]*dataset\.density[\s\S]*calendarDensity/)
  assert.match(js, /setStorageSync\(CALENDAR_DENSITY_STORAGE_KEY,\s*density\)/)
  assert.match(js, /density !== 'compact' && density !== 'full'/)

  assert.match(wxml, /density-control/)
  assert.match(wxml, /data-density="compact"[\s\S]*清爽/)
  assert.match(wxml, /data-density="full"[\s\S]*完整/)
  assert.match(wxml, /class="calendar-grid calendar-density-{{calendarDensity}}"/)
  assert.match(wxml, /wx:if="{{!item\.isEmpty && calendarDensity == 'full'}}" class="day-lunar"/)
  assert.match(wxml, /wx:if="{{!item\.isEmpty && calendarDensity == 'full'}}" class="day-tag-line"/)

  assert.match(wxss, /\.density-control\s*{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(wxss, /\.density-option\s*{[\s\S]*min-height:\s*88rpx/)
  assert.match(wxss, /\.calendar-density-compact\s+\.day-cell\s*{[\s\S]*height:\s*104rpx/)
})

test('index exposes calendar meaning and monthly recap sheets', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.js'), 'utf8')
  const wxml = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(__dirname, '..', 'pages/index/index.wxss'), 'utf8')

  assert.match(js, /buildHomeCalendarState/)
  assert.doesNotMatch(js, /buildCalendarDays\(/)
  assert.doesNotMatch(js, /buildMonthlyRecap\(/)
  assert.doesNotMatch(js, /buildDayMeanings\(/)
  assert.match(js, /openLegendSheet\(\)/)
  assert.match(js, /openPredictionSheet\(\)/)
  assert.match(js, /openMonthlyRecap\(\)/)
  assert.match(js, /copyMonthlyRecap\(\)/)
  assert.match(js, /dayDetailsByDate:\s*\{\}/)
  assert.match(js, /selectedDayDetail:\s*this\.data\.dayDetailsByDate\[date\]\s*\|\|\s*{[\s\S]*meanings:\s*\[\]/)

  assert.match(wxml, /meaning-toolbar/)
  assert.match(wxml, /bindtap="openLegendSheet"/)
  assert.match(wxml, /bindtap="openPredictionSheet"/)
  assert.match(wxml, /bindtap="openMonthlyRecap"/)
  assert.match(wxml, /calendar-info-sheet/)
  assert.match(wxml, /legend-list/)
  assert.match(wxml, /prediction-explanation/)
  assert.match(wxml, /monthly-recap/)
  assert.match(wxml, /copyMonthlyRecap/)
  assert.match(wxml, /selectedDayDetail\.meanings/)

  assert.match(wxss, /\.meaning-toolbar/)
  assert.match(wxss, /\.calendar-info-sheet/)
  assert.match(wxss, /\.monthly-recap/)
  assert.match(wxss, /\.detail-meaning/)
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
  assert.match(js, /client\.list\('periods'\)/)
  assert.match(js, /client\.list\('memories'\)/)
  assert.match(js, /applyRoomStatusOutcome\(/)
  assert.match(js, /handleRoomStatusAction\(\)/)
  assert.doesNotMatch(js, /cloud\.getRoomCode\(\)/)
  assert.doesNotMatch(js, /cloud\.getPeriods\(\)/)
  assert.doesNotMatch(js, /cloud\.getMemories\(\)/)
  assert.match(wxml, /roomStatusTitle/)
  assert.match(wxml, /roomStatusDesc/)
  assert.match(wxml, /handleRoomStatusAction/)
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
