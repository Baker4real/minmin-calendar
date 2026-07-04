const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const recordEditRoute = require('../../utils/recordEditRoute')
const { buildHomeCalendarState } = require('../../utils/homeCalendarState')

const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'
const SYNC_STATUS_CLEAR_DELAY = 1600
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
    refreshing: false,
    hasLoadedHomeData: false,
    syncStatusVisible: false,
    syncStatusText: '',
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
      this._loadingPromise = this.loadData({ background: this.canRefreshInBackground() })
    }
    return this._loadingPromise
  },

  async loadData(options = {}) {
    const background = Boolean(options.background)
    this.prepareLoadState(background)

    try {
      const client = cloud.createRoomDataClient()
      const [periodsOutcome, memoriesOutcome] = await Promise.all([
        client.list('periods'),
        client.list('memories')
      ])

      return this.handleCollectionLoadOutcomes({
        periodsOutcome,
        memoriesOutcome,
        background
      })
    } catch (e) {
      console.error('load error', e)
      const outcome = {
        kind: 'retryable-failure',
        message: getErrorMessage(e)
      }
      if (background) {
        this.showBackgroundSyncFailure()
        return outcome
      }
      this.showRoomStatus({
        title: '日历加载失败',
        desc: '请检查网络后重试',
        actionText: '重试',
        action: 'retry'
      })
      return outcome
    } finally {
      this.finishLoadState(background)
      this._loadingPromise = null
    }
  },

  handleCollectionLoadOutcomes({ periodsOutcome, memoriesOutcome, background }) {
    const blockingOutcome = [periodsOutcome, memoriesOutcome]
      .find(outcome => this.isBlockingCollectionOutcome(outcome))
    if (blockingOutcome) {
      return this.handleLoadOutcome(blockingOutcome, { background })
    }

    const periodsSucceeded = this.isSuccessfulCollectionOutcome(periodsOutcome)
    const memoriesSucceeded = this.isSuccessfulCollectionOutcome(memoriesOutcome)

    if (periodsSucceeded || memoriesSucceeded) {
      const periods = periodsSucceeded ? periodsOutcome.data : this.data.periods
      const memories = memoriesSucceeded ? memoriesOutcome.data : this.data.memories
      const backgroundDataChanged = background && (
        (periodsSucceeded && !this.areRecordListsEqual(this.data.periods, periods)) ||
        (memoriesSucceeded && !this.areRecordListsEqual(this.data.memories, memories))
      )

      this.applyHomeCalendarState({ periods, memories })
      this.setData({
        hasLoadedHomeData: true,
        noRoom: false,
        roomStatusTitle: '',
        roomStatusDesc: '',
        roomStatusActionText: '',
        roomStatusAction: ''
      })

      if (periodsSucceeded && memoriesSucceeded) {
        if (background) {
          if (this.consumePendingRecordChangeSync() || backgroundDataChanged) {
            this.showSyncStatus('已同步')
          } else {
            this.hideSyncStatus()
          }
        }
        return {
          kind: 'success',
          periods: periodsOutcome.data,
          memories: memoriesOutcome.data
        }
      }

      if (!background || this._hasPendingRecordChangeSync || backgroundDataChanged) {
        this.showSyncStatus(this.buildPartialSyncStatus({
          periodsOutcome,
          memoriesOutcome,
          background
        }), { autoHide: false })
      } else {
        this.hideSyncStatus()
      }
      return {
        kind: 'partial-success',
        periodsOutcome,
        memoriesOutcome
      }
    }

    const retryableOutcome = [periodsOutcome, memoriesOutcome]
      .find(outcome => this.isRetryableCollectionFailure(outcome))
    return this.handleLoadOutcome(retryableOutcome || {
      kind: 'retryable-failure',
      message: '日历加载失败'
    }, { background })
  },

  isSuccessfulCollectionOutcome(outcome) {
    return outcome && outcome.kind === 'success'
  },

  isRetryableCollectionFailure(outcome) {
    return outcome && outcome.kind === 'retryable-failure'
  },

  isBlockingCollectionOutcome(outcome) {
    return outcome && outcome.kind !== 'success' && outcome.kind !== 'retryable-failure'
  },

  buildPartialSyncStatus({ periodsOutcome, memoriesOutcome, background }) {
    const periodsFailed = this.isRetryableCollectionFailure(periodsOutcome)
    const memoriesFailed = this.isRetryableCollectionFailure(memoriesOutcome)
    const periodsSucceeded = this.isSuccessfulCollectionOutcome(periodsOutcome)
    const memoriesSucceeded = this.isSuccessfulCollectionOutcome(memoriesOutcome)

    if (periodsFailed && memoriesSucceeded) {
      return background ? '经期同步失败，已保留旧经期数据' : '经期同步失败，已显示记忆数据'
    }
    if (memoriesFailed && periodsSucceeded) {
      return background ? '记忆同步失败，已保留旧记忆数据' : '记忆同步失败，已显示经期数据'
    }
    return background ? '部分数据同步失败，已保留旧数据' : '部分数据同步失败'
  },

  canRefreshInBackground() {
    return this.data.hasLoadedHomeData && !this.data.noRoom
  },

  prepareLoadState(background) {
    this.clearSyncStatusTimer()
    if (background) {
      const update = { refreshing: true }
      if (!this._hasPendingRecordChangeSync) {
        update.syncStatusVisible = false
        update.syncStatusText = ''
      }
      this.setData(update)
      return
    }

    this.setData({
      loading: true,
      refreshing: false,
      syncStatusVisible: false,
      syncStatusText: '',
      noRoom: false,
      roomStatusTitle: '',
      roomStatusDesc: '',
      roomStatusActionText: '',
      roomStatusAction: ''
    })
  },

  finishLoadState(background) {
    if (background) {
      this.setData({ refreshing: false })
      return
    }
    this.setData({ loading: false, refreshing: false })
  },

  handleLoadOutcome(outcome, { background }) {
    if (background && outcome && outcome.kind === 'retryable-failure') {
      this.showBackgroundSyncFailure()
      return outcome
    }

    this.applyRoomStatusOutcome(outcome)
    return outcome
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

  applyRecordChange(change = {}) {
    const { collection, record, mode } = change
    if (collection !== 'periods' && collection !== 'memories') return
    if (!record || typeof record !== 'object') return

    const records = this.mergeRecordChange(this.data[collection], record, mode)
    this.applyHomeCalendarState({ [collection]: records })
    if (this.data.hasLoadedHomeData) {
      this._hasPendingRecordChangeSync = true
      this.showSyncStatus('已更新，正在同步', { autoHide: false })
    }
  },

  mergeRecordChange(records = [], record = {}, mode = 'upsert') {
    const current = Array.isArray(records) ? [...records] : []
    const recordId = record._id || record.id || ''
    const normalized = recordId && !record._id ? { ...record, _id: recordId } : { ...record }
    const index = recordId
      ? current.findIndex(item => (item._id || item.id || '') === recordId)
      : -1

    if (mode === 'remove') {
      return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current
    }

    if (index >= 0) {
      current[index] = { ...current[index], ...normalized }
      return current
    }

    return [normalized, ...current]
  },

  consumePendingRecordChangeSync() {
    const pending = Boolean(this._hasPendingRecordChangeSync)
    this._hasPendingRecordChangeSync = false
    return pending
  },

  areRecordListsEqual(left, right) {
    return stableRecordListKey(left) === stableRecordListKey(right)
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
      this._loadingPromise = this.loadData({ background: false })
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
      wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: date, endDate: date }) })
    } else if (action === 'memory') {
      this.closeDayActions()
      wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl({ date }) })
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
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: now, endDate: now }) })
  },
  onReminderTap(e) {
    const reminder = this.data.cycleReminders[e.currentTarget.dataset.index]
    if (!reminder || reminder.action !== 'quickPeriod') return
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: reminder.date, endDate: reminder.date }) })
  },
  quickMemory() {
    const now = util.formatDate(new Date())
    wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl({ date: now }) })
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
    this.clearSyncStatusTimer()
    this.setData({
      hasLoadedHomeData: false,
      refreshing: false,
      syncStatusVisible: false,
      syncStatusText: '',
      noRoom: true,
      roomStatusTitle: title,
      roomStatusDesc: desc,
      roomStatusActionText: actionText,
      roomStatusAction: action
    })
  },

  showSyncStatus(text, options = {}) {
    this.clearSyncStatusTimer()
    this.setData({
      syncStatusVisible: true,
      syncStatusText: text
    })

    if (options.autoHide === false) return

    const timer = setTimeout(() => {
      this.setData({
        syncStatusVisible: false,
        syncStatusText: ''
      })
      this._syncStatusTimer = null
    }, SYNC_STATUS_CLEAR_DELAY)
    if (timer && typeof timer.unref === 'function') timer.unref()
    this._syncStatusTimer = timer
  },

  showBackgroundSyncFailure() {
    if (this._hasPendingRecordChangeSync) {
      this.showSyncStatus('同步失败，稍后重试')
      return
    }
    this.hideSyncStatus()
  },

  hideSyncStatus() {
    this.clearSyncStatusTimer()
    if (!this.data.syncStatusVisible && !this.data.syncStatusText) return
    this.setData({
      syncStatusVisible: false,
      syncStatusText: ''
    })
  },

  clearSyncStatusTimer() {
    if (!this._syncStatusTimer) return
    clearTimeout(this._syncStatusTimer)
    this._syncStatusTimer = null
  }
})

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

function stableRecordListKey(records) {
  if (!Array.isArray(records)) return '[]'
  return JSON.stringify(records.map(stableValue).sort(compareStableRecordValues))
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function compareStableRecordValues(left, right) {
  const leftId = getStableRecordIdentity(left)
  const rightId = getStableRecordIdentity(right)
  if (leftId < rightId) return -1
  if (leftId > rightId) return 1

  const leftJson = JSON.stringify(left)
  const rightJson = JSON.stringify(right)
  if (leftJson < rightJson) return -1
  if (leftJson > rightJson) return 1
  return 0
}

function getStableRecordIdentity(record) {
  if (!record || typeof record !== 'object') return ''
  return record._id || record.id || record.date || record.startDate || ''
}
