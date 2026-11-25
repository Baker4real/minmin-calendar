// R2 自有日期面板：草稿只在确定时交回表单，所有取消路径都丢弃草稿。
const { createSheetLifecycle, sheetPageDecorator } = require('./sheetLifecycle')
const { registeredSheetInteractions } = require('./confirmationSheet')
const util = require('./util')

const DEFAULT_MIN_DATE = '1900-01-01'
const decorate = sheetPageDecorator({
  phaseKeys: ['confirmationPhase', 'datePickerPhase'],
  mountedKeys: ['confirmationMounted', 'datePickerMounted']
})

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatParts({ year, month, day }) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() + 1 !== parts.month || date.getUTCDate() !== parts.day) return null
  return parts
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function options(values, suffix) {
  return values.map(value => ({ value, label: `${value}${suffix}` }))
}

function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

function clampParts(parts, min, max) {
  const value = formatParts(parts)
  if (value < formatParts(min)) return min
  if (value > formatParts(max)) return max
  return parts
}

function buildRangeState(parts, min, max) {
  const selected = clampParts(parts, min, max)
  const years = options(range(min.year, max.year), '年')
  const firstMonth = selected.year === min.year ? min.month : 1
  const lastMonth = selected.year === max.year ? max.month : 12
  const months = options(range(firstMonth, lastMonth), '月')
  const firstDay = selected.year === min.year && selected.month === min.month ? min.day : 1
  const lastDay = selected.year === max.year && selected.month === max.month
    ? max.day
    : daysInMonth(selected.year, selected.month)
  const days = options(range(firstDay, lastDay), '日')
  return {
    datePickerDraft: formatParts(selected),
    datePickerYears: years,
    datePickerMonths: months,
    datePickerDays: days,
    datePickerValue: [
      years.findIndex(item => item.value === selected.year),
      months.findIndex(item => item.value === selected.month),
      days.findIndex(item => item.value === selected.day)
    ],
    datePickerYearAria: `年份，${selected.year}年`,
    datePickerMonthAria: `月份，${selected.month}月`,
    datePickerDayAria: `日，${selected.day}日`,
    datePickerConfirmAria: `确定，${selected.year}年${selected.month}月${selected.day}日`
  }
}

function readDatePickerWindowWidth() {
  try {
    if (typeof wx === 'undefined') return null
    if (typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (info && Number.isFinite(info.windowWidth) && info.windowWidth > 0) return info.windowWidth
    }
    if (typeof wx.getSystemInfoSync === 'function') {
      const legacy = wx.getSystemInfoSync()
      if (legacy && Number.isFinite(legacy.windowWidth) && legacy.windowWidth > 0) return legacy.windowWidth
    }
  } catch (e) {
    // 查询失败使用 44px 单行兜底。
  }
  return null
}

function datePickerGeometry(windowWidth) {
  const rowHeight = Number.isFinite(windowWidth) && windowWidth > 0
    ? Math.round(windowWidth * 88 / 750)
    : 44
  return {
    datePickerRowHeight: rowHeight,
    datePickerHeight: rowHeight * 5,
    datePickerMaskHeight: rowHeight * 2,
    datePickerIndicatorTop: rowHeight * 2
  }
}

function buildDatePickerContent({ label, value, minDate, maxDate }) {
  const max = parseDate(maxDate) || parseDate(util.formatDate(new Date()))
  let min = parseDate(minDate) || parseDate(DEFAULT_MIN_DATE)
  if (formatParts(min) > formatParts(max)) min = max
  const initial = parseDate(value) || min
  return {
    datePickerName: label,
    datePickerTitle: label,
    datePickerSubtitle: '选择年、月、日',
    ...datePickerGeometry(readDatePickerWindowWidth()),
    ...buildRangeState(initial, min, max),
    datePickerPicking: false,
    _datePickerMin: min,
    _datePickerMax: max
  }
}

function stalePickEvent(event, pick) {
  if (!pick || !event || !Number.isFinite(event.timeStamp)) return false
  const boundary = Number.isFinite(pick.startedAt) ? pick.startedAt : pick.openedAt
  return Number.isFinite(boundary) && event.timeStamp < boundary
}

function emptyDatePickerContent() {
  return {
    datePickerName: '',
    datePickerTitle: '',
    datePickerSubtitle: '',
    datePickerDraft: '',
    datePickerYears: [],
    datePickerMonths: [],
    datePickerDays: [],
    datePickerValue: [0, 0, 0],
    ...datePickerGeometry(),
    datePickerYearAria: '',
    datePickerMonthAria: '',
    datePickerDayAria: '',
    datePickerPicking: false,
    datePickerConfirmAria: ''
  }
}

function datePickerSheetData() {
  return {
    datePickerVisible: false,
    datePickerMounted: false,
    datePickerPhase: 'closed',
    ...emptyDatePickerContent(),
    datePickerDragClear: { token: 0, action: '', sheet: 'datePicker' }
  }
}

function datePickerSheet(page) {
  if (page._datePickerSheet) return page._datePickerSheet
  const lifecycle = createSheetLifecycle({
    visibleKey: 'datePickerVisible',
    mountedKey: 'datePickerMounted',
    phaseKey: 'datePickerPhase',
    decorate
  })
  let confirmDraft = null
  let range = null
  let activePick = null
  let confirmBarrier = null
  let pickGeneration = 0

  function settlePick(pick) {
    if (activePick !== pick || !pick.ended || pick.changePending) return
    // Retain the ended pick: a late final change still belongs to this generation and must relock.
    page.setData({ datePickerPicking: Boolean(confirmBarrier) })
  }

  function leave(extra = {}) {
    confirmBarrier = null
    activePick = null
    lifecycle.leave(page, () => {
      confirmDraft = null
      range = null
      page.setData(emptyDatePickerContent())
    }, { ...extra, datePickerPicking: false })
  }

  const interactions = registeredSheetInteractions(page, {
    name: 'datePicker',
    phaseKey: 'datePickerPhase',
    dragClearKey: 'datePickerDragClear',
    close: (detailPage, extra) => leave(extra),
    isMounted: detailPage => lifecycle.isMounted(detailPage)
  })

  page._datePickerSheet = {
    open(config) {
      confirmBarrier = null
      activePick = {
        generation: ++pickGeneration,
        openedAt: Number.isFinite(config.openedAt) ? config.openedAt : null,
        startedAt: null,
        gesture: false,
        ended: true,
        changed: false,
        changePending: false,
        endBarrierPending: false
      }
      confirmDraft = config.onConfirm
      const content = buildDatePickerContent(config)
      range = { min: content._datePickerMin, max: content._datePickerMax }
      delete content._datePickerMin
      delete content._datePickerMax
      lifecycle.open(page, content)
    },
    pickStart(event) {
      if (!range || !lifecycle.isMounted(page) || page.data.datePickerPhase === 'leaving') return
      const openedAt = activePick ? activePick.openedAt : null
      // A new gesture supersedes an uncommitted confirm barrier as well as the prior pick.
      confirmBarrier = null
      activePick = {
        generation: ++pickGeneration,
        openedAt,
        startedAt: event && Number.isFinite(event.timeStamp) ? event.timeStamp : null,
        gesture: true,
        ended: false,
        changed: false,
        changePending: false,
        endBarrierPending: false
      }
      page.setData({ datePickerPicking: true })
    },
    pickEnd(event) {
      const pick = activePick
      if (!pick || stalePickEvent(event, pick) || !lifecycle.isMounted(page) || page.data.datePickerPhase === 'leaving') return
      pick.ended = true
      if (pick.changed && !pick.changePending) {
        settlePick(pick)
        return
      }
      if (pick.endBarrierPending) return
      pick.endBarrierPending = true
      // No millisecond delay: immediate-change supplies real changes at release; this render
      // barrier is the no-change fallback, and object identity keeps old picks from settling new ones.
      page.setData({ datePickerPicking: true }, () => {
        pick.endBarrierPending = false
        if (activePick !== pick || !pick.ended || pick.changePending) return
        settlePick(pick)
      })
    },
    change(indexes, event) {
      const pick = activePick
      if (!range || !pick || !lifecycle.isMounted(page) || stalePickEvent(event, pick) || !Array.isArray(indexes) || indexes.length !== 3 || page.data.datePickerPhase === 'leaving') return
      const year = page.data.datePickerYears[Number(indexes[0])]
      const month = page.data.datePickerMonths[Number(indexes[1])]
      const day = page.data.datePickerDays[Number(indexes[2])]
      if (!year || !month || !day) return
      const candidate = {
        year: year.value,
        month: month.value,
        day: Math.min(day.value, daysInMonth(year.value, month.value))
      }
      pick.changed = true
      pick.changePending = true
      page.setData({ ...buildRangeState(candidate, range.min, range.max), datePickerPicking: Boolean(confirmBarrier || pick.gesture) }, () => {
        if (activePick !== pick) return
        pick.changePending = false
        if (pick.ended) settlePick(pick)
      })
    },
    confirm() {
      if (!lifecycle.isMounted(page) || page.data.datePickerPhase === 'leaving' || page.data.datePickerPicking || confirmBarrier || !activePick || !activePick.ended) return
      const barrier = { pick: activePick, generation: activePick.generation }
      confirmBarrier = barrier
      const renderAndCommit = () => {
        if (confirmBarrier !== barrier) return
        page.setData({ datePickerPicking: true }, () => {
          if (confirmBarrier !== barrier || activePick !== barrier.pick || activePick.generation !== barrier.generation || !lifecycle.isMounted(page) || page.data.datePickerPhase === 'leaving') return
          // A change dispatched before this barrier may still be rendering. Wait for its callback,
          // then read the final draft in this same callback so no native event can interleave before commit.
          if (barrier.pick.changePending) {
            renderAndCommit()
            return
          }
          const commit = confirmDraft
          const draft = page.data.datePickerDraft
          confirmDraft = null
          confirmBarrier = null
          leave()
          if (commit) commit(draft)
        })
      }
      renderAndCommit()
    },
    cancel() {
      confirmDraft = null
      leave()
    },
    dragRelease(detail) {
      interactions.dragRelease(page, detail)
    },
    dragCancel(detail) {
      interactions.dragCancel(page, detail)
    },
    systemBack() {
      interactions.systemBack(page)
    },
    unload() {
      confirmBarrier = null
      activePick = null
      confirmDraft = null
      range = null
      lifecycle.dismissPatch()
    }
  }
  return page._datePickerSheet
}

module.exports = { datePickerSheetData, datePickerSheet }
