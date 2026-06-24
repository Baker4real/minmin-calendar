// 日期工具函数

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const LUNAR_INFO = [
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5d0, 0x14573, 0x052d0, 0x0a9a8, 0x0e950, 0x06aa0,
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b5a0, 0x195a6,
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x055c0, 0x0ab60, 0x096d5, 0x092e0,
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  0x05aa0, 0x076a3, 0x096d0, 0x04bd7, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06b20, 0x1a6c4, 0x0aae0,
  0x0a2e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
  0x0d520
]

const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊']
const LUNAR_DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
]

// 2026 follows the State Council public holiday arrangement published in 2025.
const CHINA_PUBLIC_HOLIDAY_RANGES = [
  { name: '元旦', start: '2026-01-01', end: '2026-01-03' },
  { name: '春节', start: '2026-02-15', end: '2026-02-23' },
  { name: '清明', start: '2026-04-04', end: '2026-04-06' },
  { name: '劳动节', start: '2026-05-01', end: '2026-05-05' },
  { name: '端午', start: '2026-06-19', end: '2026-06-21' },
  { name: '中秋', start: '2026-09-25', end: '2026-09-27' },
  { name: '国庆', start: '2026-10-01', end: '2026-10-07' }
]

const CHINA_ADJUSTED_WORKDAYS = new Set([
  '2026-01-04',
  '2026-02-14',
  '2026-02-28',
  '2026-05-09',
  '2026-09-20',
  '2026-10-10'
])

function formatDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDate(str) {
  const parts = str.split('-')
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}

// 计算两个日期之间的天数
function daysBetween(d1, d2) {
  const t1 = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate())
  const t2 = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate())
  return Math.round((t2 - t1) / (24 * 60 * 60 * 1000))
}

function formatPredictDisplay(dateStr) {
  if (!isDateString(dateStr)) return { date: '--', weekday: '' }
  const date = parseDate(dateStr)
  return {
    date: `${String(date.getMonth() + 1).padStart(2, '0')}月${String(date.getDate()).padStart(2, '0')}日`,
    weekday: WEEKDAYS[date.getDay()]
  }
}

function getChineseDateMeta(dateStr) {
  const date = parseDate(dateStr)
  const lunar = solarToLunar(date)
  const officialHoliday = getOfficialHolidayName(dateStr)

  return {
    weekday: WEEKDAYS[date.getDay()],
    weekdayIndex: date.getDay(),
    lunar,
    lunarText: formatLunarText(lunar),
    holidayName: officialHoliday,
    isHoliday: !!officialHoliday,
    isWorkday: CHINA_ADJUSTED_WORKDAYS.has(dateStr)
  }
}

function buildCalendarDays({ year, month, periods = [], memories = [], nextPredict = null, predictionWindow = null, today = formatDate(new Date()) }) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const periodDates = collectPeriodDates(periods)
  const memoryDates = new Set(memories.map(m => m.date))
  const predictDates = collectPredictDates(nextPredict, year, month, predictionWindow)

  const days = []
  for (let i = 0; i < firstDay; i++) days.push({ isEmpty: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      day: d,
      date: dateStr,
      isToday: dateStr === today,
      isPeriod: periodDates.has(dateStr),
      isMemory: memoryDates.has(dateStr),
      isPredict: predictDates.has(dateStr),
      isEmpty: false,
      ...getChineseDateMeta(dateStr)
    })
  }

  return days
}

function collectPeriodDates(periods) {
  const periodDates = new Set()
  periods.forEach(p => {
    if (!isDateString(p.startDate)) return
    const endDate = isDateString(p.endDate) ? p.endDate : p.startDate
    let d = parseDate(p.startDate)
    const end = parseDate(endDate)
    while (d <= end) {
      periodDates.add(formatDate(d))
      d.setDate(d.getDate() + 1)
    }
  })
  return periodDates
}

function collectPredictDates(nextPredict, year, month, predictionWindow) {
  const predictDates = new Set()
  const startDate = predictionWindow && (predictionWindow.rangeStart || predictionWindow.startDate)
  const endDate = predictionWindow && (predictionWindow.rangeEnd || predictionWindow.endDate)

  if (isDateString(startDate) && isDateString(endDate)) {
    let d = parseDate(startDate)
    const end = parseDate(endDate)
    while (d <= end) {
      if (d.getMonth() === month && d.getFullYear() === year) predictDates.add(formatDate(d))
      d.setDate(d.getDate() + 1)
    }
    return predictDates
  }

  if (!isDateString(nextPredict)) return predictDates

  const pStart = parseDate(nextPredict)
  for (let i = 0; i < 5; i++) {
    const d = new Date(pStart)
    d.setDate(d.getDate() + i)
    if (d.getMonth() === month && d.getFullYear() === year) {
      predictDates.add(formatDate(d))
    }
  }

  return predictDates
}

function getOfficialHolidayName(dateStr) {
  const holiday = CHINA_PUBLIC_HOLIDAY_RANGES.find(item => dateStr >= item.start && dateStr <= item.end)
  return holiday ? holiday.name : ''
}

function solarToLunar(date) {
  let offset = daysBetween(new Date(1900, 0, 31), date)
  let lunarYear = 1900
  let yearDays = 0

  while (lunarYear < 2101 && offset > 0) {
    yearDays = getLunarYearDays(lunarYear)
    if (offset < yearDays) break
    offset -= yearDays
    lunarYear++
  }

  let leapMonthValue = getLeapMonth(lunarYear)
  const monthSegments = []
  for (let month = 1; month <= 12; month++) {
    monthSegments.push({ month, isLeap: false, days: getLunarMonthDays(lunarYear, month) })
    if (month === leapMonthValue) {
      monthSegments.push({ month, isLeap: true, days: getLeapDays(lunarYear) })
    }
  }

  for (let i = 0; i < monthSegments.length; i++) {
    const segment = monthSegments[i]
    if (offset < segment.days) {
      return {
        year: lunarYear,
        month: segment.month,
        day: offset + 1,
        isLeap: segment.isLeap
      }
    }
    offset -= segment.days
  }

  return {
    year: lunarYear,
    month: 12,
    day: 30,
    isLeap: false
  }
}

function getLunarYearDays(year) {
  let sum = 348
  const info = LUNAR_INFO[year - 1900]
  for (let mask = 0x8000; mask > 0x8; mask >>= 1) {
    if (info & mask) sum++
  }
  return sum + getLeapDays(year)
}

function getLeapMonth(year) {
  return LUNAR_INFO[year - 1900] & 0xf
}

function getLeapDays(year) {
  if (getLeapMonth(year)) {
    return (LUNAR_INFO[year - 1900] & 0x10000) ? 30 : 29
  }
  return 0
}

function getLunarMonthDays(year, month) {
  return (LUNAR_INFO[year - 1900] & (0x10000 >> month)) ? 30 : 29
}

function formatLunarText(lunar) {
  const monthName = `${lunar.isLeap ? '闰' : ''}${LUNAR_MONTH_NAMES[lunar.month - 1]}月`
  return `${monthName}${LUNAR_DAY_NAMES[lunar.day - 1]}`
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

module.exports = {
  formatDate,
  parseDate,
  getDaysInMonth,
  getFirstDayOfMonth,
  daysBetween,
  formatPredictDisplay,
  getChineseDateMeta,
  buildCalendarDays
}
