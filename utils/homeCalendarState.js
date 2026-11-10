const util = require('./util')
const cycle = require('./cycle')
const periodCoverage = require('./periodCoverage')
const calendarInsights = require('./calendarInsights')

// 单日经期色带样本：图例「经期记录」和首页「记经期」、当日弹层的经期动作画的是同一段色带（issue #159）
const PERIOD_BAND_SAMPLE = {
  cellClass: 'period period-single',
  parts: [{ kind: 'band', className: 'period-band', text: '' }]
}

const CALENDAR_LEGEND_ITEMS = [
  {
    key: 'today',
    title: '今天',
    text: '日期外的浅玫瑰色小胶囊表示今天，胶囊描着细薰衣草边；经期中的今天改在色带边缘描边。',
    cellClass: 'today',
    parts: [{ kind: 'num', className: 'day-num', text: '8' }]
  },
  {
    key: 'period',
    title: '经期记录',
    text: '连续的玫瑰色带表示这一天有经期记录。',
    ...PERIOD_BAND_SAMPLE
  },
  {
    key: 'memory',
    title: '欢乐时光',
    text: '爱心表示这一天留下了欢乐时光。',
    cellClass: '',
    parts: [{ kind: 'mark', className: 'mark memory-mark', text: '♥' }]
  },
  {
    key: 'predict',
    title: '下次可能开始的日子',
    text: '金色「预」表示下次可能开始的日子。',
    cellClass: '',
    parts: [{ kind: 'mark', className: 'mark predict-mark', text: '预' }]
  },
  {
    key: 'holiday',
    title: '节日',
    text: '金色文字写出当天的真实节日名称，如「中秋」。',
    cellClass: '',
    parts: [{ kind: 'tag', className: 'day-tag holiday-tag', text: '中秋' }]
  },
  {
    key: 'workday',
    title: '调休上班',
    text: '“班”表示官方调休上班日。',
    cellClass: '',
    parts: [{ kind: 'tag', className: 'day-tag workday-tag', text: '班' }]
  }
]

// periodsSynced / memoriesSynced：该集合在这个房间里是否成功同步过一次。没同步过时手里的列表不是事实，
// 状态行、本月小结与预测说明只说它未同步；经期没同步时也不预测（不画「预」、不给推迟提醒）。
// recordChange：这次投影带来的那条记录变化 { collection, mode, record, before }（before 是变化前的那个集合），
// 投影据此给出记录成功反馈 recordFeedback（日期 → memory / period，issue #167）；没有变化就是空表
function buildHomeCalendarState({
  year,
  month,
  periods = [],
  memories = [],
  today = util.formatDate(new Date()),
  roomPaired = false,
  periodsSynced = true,
  memoriesSynced = true,
  recordChange = null
}) {
  const prediction = cycle.predictNextPeriod(periodsSynced ? periods : [], { today })
  const predictionWindow = prediction.canPredict
    ? {
        rangeStart: prediction.rangeStart,
        rangeEnd: prediction.rangeEnd
      }
    : null
  const days = buildHomeCalendarDays({
    year,
    month,
    periods,
    memories,
    nextPredict: prediction.canPredict ? prediction.nextStart : null,
    predictionWindow,
    today
  })
  const monthlyRecap = calendarInsights.buildMonthlyRecap({
    year,
    month,
    periods,
    memories,
    prediction,
    today,
    periodsSynced,
    memoriesSynced
  })

  return {
    avgCycle: prediction.canPredict ? prediction.avgCycle : null,
    avgDuration: prediction.canPredict ? prediction.avgDuration : null,
    nextPredict: prediction.canPredict ? prediction.nextStart : null,
    nextPredictDisplay: prediction.canPredict ? prediction.nextDisplay : '--',
    nextPredictWeekday: prediction.canPredict ? prediction.nextWeekday : '',
    predictionRangeDisplay: prediction.canPredict ? prediction.rangeDisplay : '',
    predictionWindow,
    predictConfidence: prediction.canPredict ? prediction.confidenceText : null,
    predictionDetail: prediction,
    legendItems: CALENDAR_LEGEND_ITEMS,
    periodBandSample: PERIOD_BAND_SAMPLE,
    predictionExplanation: calendarInsights.buildPredictionExplanation(prediction, { periodsSynced }),
    homeStatus: cycle.buildHomeStatusLine(periods, { today, prediction, periodsSynced }),
    monthSummaryLine: monthlyRecap.summaryLine,
    cycleReminders: prediction.canPredict ? cycle.buildCycleReminders(prediction, periods, { today }) : [],
    monthlyRecap,
    days,
    recordFeedback: buildRecordFeedback(days, recordChange, { periods, memories, today }),
    dayDetailsByDate: buildDayDetailsByDate(days, periods, memories, today, roomPaired)
  }
}

// 记录成功反馈（issue #167）只认真正新增或完成的那条记录：新增的欢乐时光；新增的经期，或给没有结束日的经期
// （进行中、结束日期不详）填上结束日（ADR 0007：填写结束日期完成同一条记录）。
// 反馈落在当月显示这条记录的格子上：欢乐时光是那一天的 ♥，经期是它投影出的每一格色带
function buildRecordFeedback(days, change, { periods, memories, today }) {
  const marked = {}
  const id = recordIdentity(change && change.record)
  const after = !change ? null : change.collection === 'periods' ? periods : change.collection === 'memories' ? memories : null
  if (!id || !after) return marked
  const previous = (change.before || []).find(record => recordIdentity(record) === id) || null
  const saved = after.find(record => recordIdentity(record) === id) || null
  const kind = recordFeedbackKind(change.collection, previous, saved, change.mode)
  const band = kind === 'period' ? periodCoverage.projectPeriodRange(saved, today) : null
  days.forEach(day => {
    if (!day || day.isEmpty || !day.date) return
    if (kind === 'memory' && day.isMemory && day.date === saved.date) marked[day.date] = 'memory'
    if (band && day.isPeriod && isPeriodActiveOnDate(band, day.date)) marked[day.date] = 'period'
  })
  return marked
}

function recordFeedbackKind(collection, previous, saved, mode) {
  if (!saved) return ''
  if (collection === 'memories') return mode === 'add' && !previous ? 'memory' : ''
  if (mode === 'add') return previous ? '' : 'period'
  if (mode !== 'update' || !previous) return ''
  return periodCoverage.getPeriodStatus(previous) !== 'known-end' && periodCoverage.getPeriodStatus(saved) === 'known-end' ? 'period' : ''
}

function buildHomeCalendarDays({ year, month, periods = [], memories = [], nextPredict = null, predictionWindow = null, today = util.formatDate(new Date()) }) {
  const periodDates = periodCoverage.getMonthCoverage(periods, year, month, today).dates
  const memoryDates = new Set(memories
    .map(memory => memory.date)
    .filter(isDateString))
  const predictDates = collectPredictDates(nextPredict, year, month, predictionWindow)

  const days = util.buildCalendarDays({ year, month }).map(day => {
    if (!day || day.isEmpty) return { ...day, ariaLabel: '' }
    const isPeriod = periodDates.has(day.date)
    const owner = isPeriod ? periodCoverage.getPeriodOnDate(periods, day.date, today) : null
    const marked = {
      ...day,
      isToday: day.date === today,
      isPeriod,
      isOngoingPeriod: !!owner && owner.status === 'ongoing',
      isUnknownEndPeriod: !!owner && owner.status === 'unknown-end',
      isMemory: memoryDates.has(day.date),
      isPredict: predictDates.has(day.date) && !isPeriod,
      lunarCellText: lunarCellLabel(day.lunarText),
      periodDayCount: owner ? owner.day : 0
    }
    return { ...marked, ariaLabel: buildDayAriaLabel(marked, today) }
  })
  return applyPeriodSegments(days, today)
}

// 同一行里相邻的经期日连成一段；换行处不跨行相连，行首行尾因此收口。
// 开放端只打在进行中经期投影到今天的那一格。
function applyPeriodSegments(days, today) {
  const periodSlots = new Set()
  days.forEach((day, index) => {
    if (day && !day.isEmpty && day.isPeriod) periodSlots.add(index)
  })
  return days.map((day, index) => {
    if (!day || day.isEmpty || !day.isPeriod) {
      return { ...day, periodSegment: 'none', periodOpenEnd: false }
    }
    const row = Math.floor(index / 7)
    const prevContinues = index > 0 && periodSlots.has(index - 1) && Math.floor((index - 1) / 7) === row
    const nextContinues = periodSlots.has(index + 1) && Math.floor((index + 1) / 7) === row
    let periodSegment = 'single'
    if (prevContinues && nextContinues) periodSegment = 'middle'
    else if (nextContinues) periodSegment = 'start'
    else if (prevContinues) periodSegment = 'end'
    return {
      ...day,
      periodSegment,
      periodOpenEnd: Boolean(day.isOngoingPeriod && day.date === today)
    }
  })
}

function collectPredictDates(nextPredict, year, month, predictionWindow) {
  const predictDates = new Set()
  const startDate = predictionWindow && (predictionWindow.rangeStart || predictionWindow.startDate)
  const endDate = predictionWindow && (predictionWindow.rangeEnd || predictionWindow.endDate)

  if (isDateString(startDate) && isDateString(endDate) && startDate <= endDate) {
    let date = util.parseDate(startDate)
    const end = util.parseDate(endDate)
    while (date <= end) {
      if (date.getMonth() === month && date.getFullYear() === year) predictDates.add(util.formatDate(date))
      date.setDate(date.getDate() + 1)
    }
    return predictDates
  }

  if (!isDateString(nextPredict)) return predictDates

  const predictStart = util.parseDate(nextPredict)
  for (let i = 0; i < 5; i++) {
    const date = new Date(predictStart)
    date.setDate(date.getDate() + i)
    if (date.getMonth() === month && date.getFullYear() === year) {
      predictDates.add(util.formatDate(date))
    }
  }

  return predictDates
}

function isDateString(value) {
  return util.isValidDateString(value)
}

function buildDayDetailsByDate(days, periods, memories, today, roomPaired = false) {
  const details = {}
  const periodKeys = buildStableDetailKeys(periods, 'period', buildPeriodDetailFingerprint)
  const memoryKeys = buildStableDetailKeys(memories, 'memory', buildMemoryDetailFingerprint)

  days.forEach(day => {
    if (!day || day.isEmpty || !day.date) return

    const periodDetails = periods
      .map((period, index) => ({ period, range: periodCoverage.projectPeriodRange(period, today), index }))
      .filter(item => isPeriodActiveOnDate(item.range, day.date))
      .map(({ period, range, index }) => {
        const detail = cycle.decoratePeriod({
          ...period,
          startDate: range.startDate,
          endDate: range.endDate
        }, { today })
        const meta = []
        if (detail.flowLabel) meta.push(`经量 ${detail.flowLabel}`)
        if (detail.symptomText) meta.push(detail.symptomText)
        const authorLabel = cycle.recordAuthorLabel(period, { paired: roomPaired === true })
        return withAuthorLabel({
          key: periodKeys[index],
          recordId: recordIdentity(period),
          ...describePeriodDetail(range, authorLabel, today),
          metaText: meta.join(' · ')
        }, authorLabel)
      })

    const memoryDetails = memories
      .map((memory, index) => ({ memory, index }))
      .filter(({ memory }) => isDateString(memory.date) && memory.date === day.date)
      .map(({ memory, index }) => {
        const authorLabel = cycle.recordAuthorLabel(memory, { paired: roomPaired === true })
        return withAuthorLabel({
          key: memoryKeys[index],
          recordId: recordIdentity(memory),
          note: memory.note || '欢乐时光',
          ariaLabel: cycle.memoryEditAriaLabel({
            dateText: util.formatDisplayDate(memory.date, { today }),
            note: memory.note,
            authorLabel
          })
        }, authorLabel)
      })
    const meanings = buildDayMeanings(day).filter(isDayDetailSentence)

    details[day.date] = {
      meanings,
      periods: periodDetails,
      memories: memoryDetails,
      actions: buildDayRecordActions(day, today),
      futureNotice: buildFutureDayNotice(day, today),
      empty: !meanings.length && !periodDetails.length && !memoryDetails.length
    }
  })

  return details
}

function withAuthorLabel(row, authorLabel) {
  if (!authorLabel) return row
  return { ...row, authorLabel }
}

function recordIdentity(record) {
  if (!record) return ''
  return record._id || record.id || ''
}

function isDayDetailSentence(meaning) {
  return meaning.key === 'predict' || meaning.key === 'holiday' || meaning.key === 'workday'
}

// 经期的编辑动作只有一个名字（CONTEXT.md「Record names」）：当日动作和详情行读屏名共用
const PERIOD_EDIT_ACTION = '编辑这次经期'

function buildDayRecordActions(day, today) {
  if (!day.date || day.date > today) return []
  return [
    {
      key: 'period',
      label: day.isPeriod ? PERIOD_EDIT_ACTION : (day.date === today ? '记经期' : '补记经期')
    },
    {
      key: 'memory',
      label: day.date === today ? '记欢乐时光' : '补记欢乐时光'
    }
  ]
}

// 晚于今天的日子没有记录动作；当日弹层用这句持久说明给出下一步，不再只剩标题和关闭键
function buildFutureDayNotice(day, today) {
  if (!day.date || day.date <= today) return null
  return {
    title: '未来日期不能新增记录',
    text: '到了这一天，再来记经期或欢乐时光'
  }
}

function isPeriodActiveOnDate(range, date) {
  if (!range) return false
  return date >= range.startDate && date <= range.endDate
}

// 经期详情行：日期和状态各只算一次。进行中写「开始日至今天」，结束日期不详只写开始日、不用空白日期表达；
// 状态文字只取 cycle.PERIOD_STATUS_OPTIONS。可见行把进行中、结束日期不详写进括号（已结束不加），
// 读屏名（issue #157）说全三种状态并接上作者（作者只在房间已配对时有值），同一天的多条各自可辨
function describePeriodDetail(range, authorLabel, today) {
  const dates = range.status === 'unknown-end'
    ? util.formatDisplayDate(range.startDate, { today })
    : util.formatDisplayDateRange(range.startDate, range.endDate, { today })
  const status = periodStatusText(range.status)
  return {
    range: range.status === 'known-end' ? dates : `${dates}（${status}）`,
    ariaLabel: joinAriaParts([PERIOD_EDIT_ACTION, dates, status, authorLabel])
  }
}

function periodStatusText(status) {
  const option = cycle.PERIOD_STATUS_OPTIONS.find(item => item.value === status)
  return option ? option.label : ''
}

// 空的部分直接跳过，不留多余的逗号
function joinAriaParts(parts) {
  return parts.filter(Boolean).join('，')
}

function buildStableDetailKeys(records, type, buildFingerprint) {
  const occurrences = new Map()
  return records.map(record => {
    if (record && record._id) return `${type}:${record._id}`

    const fingerprint = encodeURIComponent(JSON.stringify(buildFingerprint(record || {})))
    const occurrence = occurrences.get(fingerprint) || 0
    occurrences.set(fingerprint, occurrence + 1)
    return `${type}:fallback:${fingerprint}:${occurrence}`
  })
}

function buildPeriodDetailFingerprint(period) {
  const range = util.normalizeDateRange(period) || {}
  const detail = cycle.decoratePeriod(period)
  return [
    range.startDate || '',
    range.endDate || '',
    detail.status || '',
    normalizeKeyText(period.note),
    detail.flow,
    detail.symptoms
  ]
}

function buildMemoryDetailFingerprint(memory) {
  return [memory.date || '', normalizeKeyText(memory.note)]
}

function normalizeKeyText(value) {
  return value === undefined || value === null ? '' : String(value)
}

function buildDayMeanings(day = {}) {
  const meanings = []
  if (day.isToday) {
    meanings.push({
      key: 'today',
      title: '今天',
      text: '这是今天，所以日历会重点高亮。'
    })
  }
  if (day.isPeriod) {
    meanings.push({
      key: 'period',
      title: '经期记录',
      text: day.isOngoingPeriod
        ? '这一天落在进行中的经期范围内（开始日至今天）。'
        : day.isUnknownEndPeriod
          ? '这一天是结束日期不详的经期记录的已知开始日。'
          : '这一天落在已记录的经期范围内。'
    })
  }
  if (day.isMemory) {
    meanings.push({
      key: 'memory',
      title: '欢乐时光',
      text: '这一天有一条欢乐时光记录。'
    })
  }
  if (day.isPredict) {
    meanings.push({
      key: 'predict',
      title: '下次可能开始的日子',
      text: '这一天是下次可能开始的日子。'
    })
  }
  if (day.holidayName) {
    meanings.push({
      key: 'holiday',
      title: '节日',
      text: `${day.holidayName}。`
    })
  } else if (day.isWorkday) {
    meanings.push({
      key: 'workday',
      title: '调休上班',
      text: '官方调休上班日。'
    })
  }
  return meanings
}

const DAY_ARIA_MEANING_TEXT = {
  today: '今天',
  'period-ongoing': '经期进行中',
  'period-unknown-end': '结束日期不详',
  memory: '欢乐时光',
  predict: '下次可能开始的日子',
  workday: '调休上班'
}

function buildDayAriaLabel(day, today) {
  if (!day || day.isEmpty || !day.date) return ''
  const parts = [util.formatDisplayDate(day.date, { today, withWeekday: true })]
  if (day.lunarText) parts.push(day.lunarText)
  buildDayMeanings(day).forEach(meaning => {
    if (meaning.key === 'holiday') {
      if (day.holidayName) parts.push(day.holidayName)
      return
    }
    if (meaning.key === 'period') {
      parts.push(`经期第${day.periodDayCount}天`)
      if (day.isOngoingPeriod) parts.push(DAY_ARIA_MEANING_TEXT['period-ongoing'])
      else if (day.isUnknownEndPeriod) parts.push(DAY_ARIA_MEANING_TEXT['period-unknown-end'])
      return
    }
    const text = DAY_ARIA_MEANING_TEXT[meaning.key]
    if (text) parts.push(text)
  })
  return parts.join(' ')
}

function lunarCellLabel(lunarText) {
  if (!lunarText) return ''
  if (lunarText.endsWith('初一')) return lunarText.slice(0, -2)
  return lunarText.slice(-2)
}

module.exports = {
  buildHomeCalendarState
}
