const util = require('./util')

const ONGOING_PERIOD_NOTICE = '已有进行中的经期，继续编辑它'

// 显式状态优先；旧记录只有严格合法的结束日期才算已知结束。
function getPeriodStatus(period = {}) {
  if (isPeriodStatus(period.status)) return period.status
  return util.isValidDateString(period.endDate) ? 'known-end' : 'unknown-end'
}

function projectPeriodRange(period, today) {
  if (!period || !util.isValidDateString(period.startDate)) return null
  const end = period.endDate
  if (end !== undefined && end !== null && end !== '' && !util.isValidDateString(end)) return null
  const status = getPeriodStatus(period)
  if (status === 'ongoing') {
    if (!util.isValidDateString(today) || period.startDate > today) return null
    return { startDate: period.startDate, endDate: today, status }
  }
  if (status === 'unknown-end') {
    return { startDate: period.startDate, endDate: period.startDate, status }
  }
  if (!util.isValidDateString(end)) return null
  const range = util.normalizeDateRange(period)
  return range ? { startDate: range.startDate, endDate: range.endDate, status } : null
}

// 只在覆盖这一天的记录里选择：进行中优先，同类取开始日最晚的一条。
function getPeriodOnDate(periods, date, today) {
  if (!util.isValidDateString(date)) return null
  let owner = null
  records(periods).forEach(record => {
    const range = projectPeriodRange(record, today)
    if (!range || date < range.startDate || date > range.endDate) return
    if (!owner || prefers(record, owner.record)) {
      owner = {
        record,
        status: range.status,
        day: util.daysBetween(util.parseDate(range.startDate), util.parseDate(date)) + 1
      }
    }
  })
  return owner
}

// month 与日历相同，从 0 开始；先裁到所看月份，再收集并集。
function getMonthCoverage(periods, year, month, today) {
  const dates = new Set()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  if (!util.isValidDateString(monthStart)) return { dates, count: 0 }
  const monthEnd = util.formatDate(new Date(year, month + 1, 0))
  records(periods).forEach(record => {
    const range = projectPeriodRange(record, today)
    if (!range) return
    const start = range.startDate > monthStart ? range.startDate : monthStart
    const end = range.endDate < monthEnd ? range.endDate : monthEnd
    if (start > end) return
    const date = util.parseDate(start)
    while (util.formatDate(date) <= end) {
      dates.add(util.formatDate(date))
      date.setDate(date.getDate() + 1)
    }
  })
  return { dates, count: dates.size }
}

// 新记录入口先重开进行中，即使所选日不在它的投影里；否则打开归属记录或按所选日新建。
function decidePeriodRecordForDate(periods, date, { today = '' } = {}) {
  const ongoing = records(periods).reduce((chosen, record) => {
    if (!record || getPeriodStatus(record) !== 'ongoing' || !util.isValidDateString(record.startDate)) return chosen
    return !chosen || prefers(record, chosen) ? record : chosen
  }, null)
  if (ongoing) return { action: 'open', reason: 'ongoing', record: ongoing, startDate: ongoing.startDate, notice: ONGOING_PERIOD_NOTICE }
  const owner = getPeriodOnDate(periods, date, today)
  if (owner) return { action: 'open', reason: 'coverage', record: owner.record, startDate: owner.record.startDate, notice: '' }
  return { action: 'create', reason: '', record: null, startDate: date, notice: '' }
}

function prefers(candidate, current) {
  const candidateOngoing = getPeriodStatus(candidate) === 'ongoing'
  const currentOngoing = getPeriodStatus(current) === 'ongoing'
  if (candidateOngoing !== currentOngoing) return candidateOngoing
  return candidate.startDate > current.startDate
}

function records(periods) {
  return Array.isArray(periods) ? periods : []
}

function isPeriodStatus(value) {
  return value === 'ongoing' || value === 'unknown-end' || value === 'known-end'
}

module.exports = {
  getPeriodStatus,
  projectPeriodRange,
  getPeriodOnDate,
  getMonthCoverage,
  decidePeriodRecordForDate
}
