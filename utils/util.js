// 日期工具函数

const {
  PUBLISHED_HOLIDAY_START_YEAR,
  getPublishedHoliday,
  hasPublishedHolidayYear
} = require('./chinaHolidays')

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

function formatDisplayDate(dateStr, options = {}) {
  if (!isValidDateString(dateStr)) return ''
  const date = parseDate(dateStr)
  const today = resolveDisplayToday(options.today)
  const yearPrefix = date.getFullYear() === today.getFullYear() ? '' : `${date.getFullYear()}年`
  const text = `${yearPrefix}${date.getMonth() + 1}月${date.getDate()}日`
  return options.withWeekday ? `${text} ${WEEKDAYS[date.getDay()]}` : text
}

function formatDisplayDateRange(startStr, endStr, options = {}) {
  const start = formatDisplayDate(startStr, { today: options.today })
  const end = formatDisplayDate(endStr, { today: options.today })
  if (!start || !end) return ''
  return `${start}–${end}`
}

function resolveDisplayToday(today) {
  if (isValidDateString(today)) return parseDate(today)
  if (today instanceof Date && !Number.isNaN(today.getTime())) return today
  return new Date()
}

function getChineseDateMeta(dateStr) {
  const date = parseDate(dateStr)
  const lunar = solarToLunar(date)
  const publishedHoliday = getPublishedHoliday(dateStr)
  const officialHoliday = publishedHoliday && publishedHoliday.isOffDay
    ? publishedHoliday.name
    : getOfficialHolidayName(dateStr, lunar)

  return {
    weekday: WEEKDAYS[date.getDay()],
    weekdayIndex: date.getDay(),
    lunar,
    lunarText: formatLunarText(lunar),
    holidayName: officialHoliday,
    isHoliday: !!officialHoliday,
    isWorkday: publishedHoliday ? !publishedHoliday.isOffDay : false
  }
}

function buildCalendarDays({ year, month }) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const days = []
  for (let i = 0; i < firstDay; i++) days.push({ isEmpty: true })
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({
      day: d,
      date: dateStr,
      isEmpty: false,
      ...getChineseDateMeta(dateStr)
    })
  }

  return days
}

function getOfficialHolidayName(dateStr, lunar) {
  const year = parseDate(dateStr).getFullYear()
  if (hasPublishedHolidayYear(year) || year < PUBLISHED_HOLIDAY_START_YEAR) return ''
  return getStatutoryHolidayName(dateStr, lunar)
}

function getStatutoryHolidayName(dateStr, lunar) {
  const date = parseDate(dateStr)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  if (month === 1 && day === 1) return '元旦'
  if (isSpringFestivalDay(date, lunar)) return '春节'
  if (month === 4 && day === getQingmingDay(year)) return '清明'
  if (month === 5 && (day === 1 || (year >= 2025 && day === 2))) return '劳动节'
  if (!lunar.isLeap && lunar.month === 5 && lunar.day === 5) return '端午'
  if (!lunar.isLeap && lunar.month === 8 && lunar.day === 15) return '中秋'
  if (month === 10 && day >= 1 && day <= 3) return '国庆'
  return ''
}

function isSpringFestivalDay(date, lunar) {
  if (!lunar.isLeap && lunar.month === 1 && lunar.day >= 1 && lunar.day <= 3) return true
  if (date.getFullYear() < 2025) return false

  const nextDay = new Date(date)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextLunar = solarToLunar(nextDay)
  return !nextLunar.isLeap && nextLunar.month === 1 && nextLunar.day === 1
}

function getQingmingDay(year) {
  const shortYear = year % 100
  const coefficient = year >= 2000 ? 4.81 : 5.59
  return Math.floor(shortYear * 0.2422 + coefficient) - Math.floor((shortYear - 1) / 4)
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

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
}

function normalizeDateRange(range = {}) {
  if (!range) return null
  const { startDate, endDate } = range
  if (!isValidDateString(startDate)) return null

  const hasEndDate = typeof endDate === 'string' && endDate.length > 0
  if (hasEndDate && !isValidDateString(endDate)) return null

  const normalizedEndDate = hasEndDate ? endDate : startDate
  if (startDate > normalizedEndDate) return null

  return {
    startDate,
    endDate: normalizedEndDate,
    hasEndDate
  }
}

module.exports = {
  formatDate,
  parseDate,
  isValidDateString,
  normalizeDateRange,
  getDaysInMonth,
  getFirstDayOfMonth,
  daysBetween,
  formatDisplayDate,
  formatDisplayDateRange,
  getChineseDateMeta,
  buildCalendarDays
}
