const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const calendarInsights = require('../../utils/calendarInsights')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const { buildHomeCalendarState } = require('../../utils/homeCalendarState')

const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'
const INITIAL_VIEW_DATE = new Date()
const INITIAL_HOME_STATE = buildHomeCalendarState({
  year: INITIAL_VIEW_DATE.getFullYear(),
  month: INITIAL_VIEW_DATE.getMonth(),
  today: util.formatDate(INITIAL_VIEW_DATE)
})

Page({
  data: {
    year: INITIAL_VIEW_DATE.getFullYear(),
    month: INITIAL_VIEW_DATE.getMonth(),
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
    calendarDensity: 'full',
    periods: [], memories: [],
    ...INITIAL_HOME_STATE,
    legendItems: calendarInsights.CALENDAR_LEGEND_ITEMS,
    infoSheetVisible: false,
    infoSheetMode: '',
    monthlyRecap: null,
    dayActionSheetVisible: false,
    daySheetMode: 'actions',
    selectedDate: '',
    selectedDateSubtitle: '',
    selectedDayDetail: null,
    dayDetailsByDate: {},
    loading: true,
    noRoom: false,
    roomStatusTitle: '',
    roomStatusDesc: '',
    roomStatusActionText: '',
    roomStatusAction: ''
  },

  onLoad() {
    const now = new Date()
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth(),
      calendarDensity: this.getSavedCalendarDensity()
    })
  },

  onShow() {
    if (!this._loadingPromise) {
      this._loadingPromise = this.loadData()
    }
    return this._loadingPromise
  },

  async loadData() {
    this.setData({
      loading: true,
      noRoom: false,
      roomStatusTitle: '',
      roomStatusDesc: '',
      roomStatusActionText: '',
      roomStatusAction: ''
    })
    try {
      const client = cloud.createRoomDataClient()
      const periodsOutcome = await client.list('periods')
      if (periodsOutcome.kind !== 'success') {
        this.applyRoomStatusOutcome(periodsOutcome)
        return periodsOutcome
      }

      const memoriesOutcome = await client.list('memories')
      if (memoriesOutcome.kind !== 'success') {
        this.applyRoomStatusOutcome(memoriesOutcome)
        return memoriesOutcome
      }

      this.applyHomeCalendarState({
        periods: periodsOutcome.data,
        memories: memoriesOutcome.data
      })
    } catch (e) {
      console.error('load error', e)
      this.showRoomStatus({
        title: '日历加载失败',
        desc: '请检查网络后重试',
        actionText: '重试',
        action: 'retry'
      })
    } finally {
      this.setData({ loading: false })
      this._loadingPromise = null
    }
  },

  calcStats(periods) {
    this.applyHomeCalendarState({ periods })
  },

  renderCalendar() {
    this.applyHomeCalendarState()
  },

  applyHomeCalendarState(overrides = {}) {
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(overrides, key)
    const periods = hasOwn('periods') ? overrides.periods : this.data.periods
    const memories = hasOwn('memories') ? overrides.memories : this.data.memories
    const year = hasOwn('year') ? overrides.year : this.data.year
    const month = hasOwn('month') ? overrides.month : this.data.month
    const today = hasOwn('today') ? overrides.today : util.formatDate(new Date())

    this.setData({
      periods,
      memories,
      ...buildHomeCalendarState({ year, month, periods, memories, today })
    })
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

  getSavedCalendarDensity() {
    try {
      const density = wx.getStorageSync(CALENDAR_DENSITY_STORAGE_KEY)
      if (density === 'compact' || density === 'full') return density
    } catch (e) {
      return 'full'
    }
    return 'full'
  },

  setCalendarDensity(e) {
    const density = e.currentTarget.dataset.density
    if (density !== 'compact' && density !== 'full') return
    this.setData({ calendarDensity: density })
    try {
      wx.setStorageSync(CALENDAR_DENSITY_STORAGE_KEY, density)
    } catch (e) {}
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

  jumpToToday() {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    this.setData({
      year,
      month,
      jumpYear: year,
      jumpMonth: month,
      jumpYears: this.buildMonthJumpYears(year),
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

  handleRoomStatusAction() {
    if (this.data.roomStatusAction === 'bind') {
      this.goBind()
      return
    }
    if (!this._loadingPromise) {
      this._loadingPromise = this.loadData()
    }
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
    this.setData({
      infoSheetVisible: true,
      infoSheetMode: 'recap',
      monthlyRecap: this.data.monthlyRecap
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
    const selectedDay = this.data.days.find(day => day.date === date) || { date }

    this.setData({
      dayActionSheetVisible: true,
      daySheetMode: 'detail',
      selectedDate: date,
      selectedDateSubtitle: this.formatDaySubtitle(selectedDay),
      selectedDayDetail: this.data.dayDetailsByDate[date] || {
        meanings: [],
        periods: [],
        memories: [],
        empty: true
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
  },

  applyRoomStatusOutcome(outcome) {
    this.showRoomStatus(roomAccessOutcome.buildInlineRoomStatus(outcome, {
      noRoomTitle: '还没绑定房间',
      noRoomDesc: '需要先创建或加入一个共享房间\n才能和对方一起使用',
      failureTitle: '日历加载失败',
      fallbackDesc: '请检查网络后重试'
    }))
  },

  showRoomStatus({ title, desc, actionText, action }) {
    this.setData({
      noRoom: true,
      roomStatusTitle: title,
      roomStatusDesc: desc,
      roomStatusActionText: actionText,
      roomStatusAction: action
    })
  }
})
