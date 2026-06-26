const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const calendarInsights = require('../../utils/calendarInsights')

Page({
  data: {
    year: 0, month: 0, days: [],
    weekDays: ['日','一','二','三','四','五','六'],
    jumpMonths: [
      { value: 0, label: '1月' },
      { value: 1, label: '2月' },
      { value: 2, label: '3月' },
      { value: 3, label: '4月' },
      { value: 4, label: '5月' },
      { value: 5, label: '6月' },
      { value: 6, label: '7月' },
      { value: 7, label: '8月' },
      { value: 8, label: '9月' },
      { value: 9, label: '10月' },
      { value: 10, label: '11月' },
      { value: 11, label: '12月' }
    ],
    jumpYears: [],
    jumpYear: 0,
    jumpMonth: 0,
    monthPickerVisible: false,
    periods: [], memories: [],
    avgCycle: null,
    avgDuration: null,
    nextPredict: null,
    nextPredictDisplay: '--',
    nextPredictWeekday: '',
    predictionRangeDisplay: '',
    predictionWindow: null,
    predictConfidence: null,
    predictionDetail: null,
    predictionExplanation: calendarInsights.buildPredictionExplanation(null),
    cycleReminders: [],
    legendItems: calendarInsights.CALENDAR_LEGEND_ITEMS,
    infoSheetVisible: false,
    infoSheetMode: '',
    monthlyRecap: null,
    dayActionSheetVisible: false,
    daySheetMode: 'actions',
    selectedDate: '',
    selectedDateSubtitle: '',
    selectedDayDetail: null,
    loading: true, noRoom: false
  },

  onLoad() {
    const now = new Date()
    this.setData({ year: now.getFullYear(), month: now.getMonth() })
  },

  onShow() {
    const roomCode = cloud.getRoomCode()
    if (!roomCode) {
      this.setData({ noRoom: true, loading: false })
      return
    }
    this.setData({ noRoom: false })
    // 并发防护：如果已有加载中的请求，复用其 Promise
    if (!this._loadingPromise) {
      this._loadingPromise = this.loadData()
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [periods, memories] = await Promise.all([
        cloud.getPeriods(),
        cloud.getMemories()
      ])
      this.setData({ periods, memories })
      this.calcStats(periods)
      // ⚠️ 关键修复：数据加载后重新渲染日历网格
      this.renderCalendar()
    } catch (e) {
      console.error('load error', e)
      wx.showToast({ title: '数据加载失败，请检查网络', icon: 'none' })
    }
    this.setData({ loading: false })
    this._loadingPromise = null
  },

  calcStats(periods) {
    const prediction = cycle.predictNextPeriod(periods)
    if (!prediction.canPredict) {
      this.setData({
        avgCycle: null,
        avgDuration: null,
        nextPredict: null,
        nextPredictDisplay: '--',
        nextPredictWeekday: '',
        predictionRangeDisplay: '',
        predictionWindow: null,
        predictConfidence: null,
        predictionDetail: prediction,
        predictionExplanation: calendarInsights.buildPredictionExplanation(prediction),
        cycleReminders: []
      })
      return
    }

    this.setData({
      avgCycle: prediction.avgCycle,
      avgDuration: prediction.avgDuration,
      nextPredict: prediction.nextStart,
      nextPredictDisplay: prediction.nextDisplay,
      nextPredictWeekday: prediction.nextWeekday,
      predictionRangeDisplay: prediction.rangeDisplay,
      predictionWindow: {
        rangeStart: prediction.rangeStart,
        rangeEnd: prediction.rangeEnd
      },
      predictConfidence: prediction.confidenceText,
      predictionDetail: prediction,
      predictionExplanation: calendarInsights.buildPredictionExplanation(prediction),
      cycleReminders: cycle.buildCycleReminders(prediction, periods)
    })
  },

  renderCalendar() {
    const { year, month, periods, memories, predictionWindow } = this.data
    const today = util.formatDate(new Date())
    const days = util.buildCalendarDays({ year, month, periods, memories, nextPredict: this.data.nextPredict, predictionWindow, today })
    this.setData({ days })
  },

  prevMonth() {
    let { year, month } = this.data
    month--; if (month < 0) { month = 11; year-- }
    this.setData({ year, month, monthPickerVisible: false })
    setTimeout(() => this.renderCalendar(), 200)
  },

  nextMonth() {
    let { year, month } = this.data
    month++; if (month > 11) { month = 0; year++ }
    this.setData({ year, month, monthPickerVisible: false })
    setTimeout(() => this.renderCalendar(), 200)
  },

  openMonthPicker() {
    const { year, month } = this.data
    this.setData({
      monthPickerVisible: true,
      jumpYear: year,
      jumpMonth: month,
      jumpYears: this.buildMonthJumpYears(year)
    })
  },

  closeMonthPicker() {
    this.setData({ monthPickerVisible: false })
  },

  shiftJumpYears(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    if (Number.isNaN(delta)) return
    const jumpYear = this.data.jumpYear + delta
    this.setData({
      jumpYear,
      jumpYears: this.buildMonthJumpYears(jumpYear)
    })
  },

  selectJumpYear(e) {
    const year = Number(e.currentTarget.dataset.year)
    if (Number.isNaN(year)) return
    this.setData({ jumpYear: year })
  },

  selectJumpMonth(e) {
    const month = Number(e.currentTarget.dataset.month)
    if (Number.isNaN(month)) return
    this.setData({ jumpMonth: month })
  },

  confirmMonthJump() {
    this.setData({
      year: this.data.jumpYear,
      month: this.data.jumpMonth,
      monthPickerVisible: false
    }, () => this.renderCalendar())
  },

  buildMonthJumpYears(centerYear) {
    const years = []
    for (let year = centerYear - 6; year <= centerYear + 6; year++) {
      years.push(year)
    }
    return years
  },

  goBind() { wx.redirectTo({ url: '/pages/bind/bind' }) },

  openLegendSheet() {
    this.setData({
      infoSheetVisible: true,
      infoSheetMode: 'legend'
    })
  },

  openPredictionSheet() {
    this.setData({
      infoSheetVisible: true,
      infoSheetMode: 'prediction'
    })
  },

  openMonthlyRecap() {
    const { year, month, periods, memories } = this.data
    const prediction = cycle.predictNextPeriod(periods)
    this.setData({
      infoSheetVisible: true,
      infoSheetMode: 'recap',
      monthlyRecap: calendarInsights.buildMonthlyRecap({ year, month, periods, memories, prediction })
    })
  },

  closeInfoSheet() {
    this.setData({
      infoSheetVisible: false,
      infoSheetMode: ''
    })
  },

  copyMonthlyRecap() {
    const recap = this.data.monthlyRecap
    if (!recap || !recap.shareText) return
    wx.setClipboardData({
      data: recap.shareText,
      success: () => wx.showToast({ title: '已复制小结', icon: 'none' })
    })
  },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    const selectedDay = this.data.days.find(day => day.date === date) || { date }
    this.setData({
      dayActionSheetVisible: true,
      daySheetMode: 'actions',
      selectedDate: date,
      selectedDateSubtitle: this.formatDaySubtitle(selectedDay),
      selectedDayDetail: null
    })
  },

  onDayActionTap(e) {
    const action = e.currentTarget.dataset.action
    const date = this.data.selectedDate
    if (!date) return

    if (action === 'period') {
      this.closeDayActions()
      wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${date}&endDate=${date}` })
    } else if (action === 'memory') {
      this.closeDayActions()
      wx.navigateTo({ url: `/pages/memory/edit/edit?date=${date}` })
    } else if (action === 'detail') {
      this.showDayDetail(date)
    }
  },

  closeDayActions() {
    this.setData({
      dayActionSheetVisible: false,
      daySheetMode: 'actions',
      selectedDate: '',
      selectedDateSubtitle: '',
      selectedDayDetail: null
    })
  },

  noop() {},

  showDayDetail(date) {
    const { periods, memories } = this.data
    const selectedDay = this.data.days.find(day => day.date === date) || { date }
    const periodDetails = periods.filter(p => date >= p.startDate && date <= p.endDate).map(p => {
      const detail = cycle.decoratePeriod(p)
      const meta = []
      if (detail.flowLabel) meta.push(`经量 ${detail.flowLabel}`)
      if (detail.symptomText) meta.push(detail.symptomText)
      return {
        range: `${p.startDate} ~ ${p.endDate}`,
        metaText: meta.join(' · ')
      }
    })
    const memoryDetails = memories.filter(m => m.date === date).map(m => {
      return { note: m.note || '特别日子' }
    })

    this.setData({
      dayActionSheetVisible: true,
      daySheetMode: 'detail',
      selectedDate: date,
      selectedDateSubtitle: this.formatDaySubtitle(selectedDay),
      selectedDayDetail: {
        meanings: calendarInsights.buildDayMeanings(selectedDay),
        periods: periodDetails,
        memories: memoryDetails,
        empty: !periodDetails.length && !memoryDetails.length
      }
    })
  },

  formatDaySubtitle(day) {
    const parts = []
    if (day.weekday) parts.push(day.weekday)
    if (day.lunarText) parts.push(day.lunarText)
    if (day.holidayName) parts.push(day.holidayName)
    else if (day.isWorkday) parts.push('调休上班')
    return parts.join(' · ')
  },

  // 快速操作
  quickPeriod() {
    const now = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${now}&endDate=${now}` })
  },
  onReminderTap(e) {
    const reminder = this.data.cycleReminders[e.currentTarget.dataset.index]
    if (!reminder || reminder.action !== 'quickPeriod') return
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${reminder.date}&endDate=${reminder.date}` })
  },
  quickMemory() {
    const now = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/memory/edit/edit?date=${now}` })
  }
})
