const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const recordEditRoute = require('../../utils/recordEditRoute')
const recordDraft = require('../../utils/recordDraft')
const roomRecordsSnapshot = require('../../utils/roomRecordsSnapshot')
const { buildHomeCalendarState } = require('../../utils/homeCalendarState')
const safeArea = require('../../utils/safeArea')
const { createSheetLifecycle, homepageSheets, handoffSheet } = require('../../utils/sheetLifecycle')

// 与 pages/settings/settings.js 共享同一存储键；写入方在设置页
const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'
// issue #98：超期进行中记录的一次性完成提示标记；经 utils/recordDraft.js 的 createWxDraftStorage 本地存储接缝读写
const ONGOING_REMINDER_STORAGE_KEY = 'ongoingPeriodReminderShown'
const SYNC_STATUS_CLEAR_DELAY = 1600
const COLLECTIONS = ['periods', 'memories']
const JUMP_YEAR_MIN = 2001
const JUMP_YEAR_MAX = 2035
const INITIAL_VIEW_DATE = new Date()
const INITIAL_HOME_STATE = buildHomeCalendarState({
  year: INITIAL_VIEW_DATE.getFullYear(),
  month: INITIAL_VIEW_DATE.getMonth(),
  today: util.formatDate(INITIAL_VIEW_DATE)
})

Page({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
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
    jumpMonth: 0,
    ...buildJumpYearState(INITIAL_VIEW_DATE.getFullYear()),
    monthPickerVisible: false,
    monthPickerMounted: false,
    monthPickerPhase: 'closed',
    pageObscured: false,
    sheetDragClear: {
      monthPicker: { token: 0, action: '' },
      dayActions: { token: 0, action: '' },
      toolsMenu: { token: 0, action: '' },
      info: { token: 0, action: '' }
    },
    monthMenuVisible: false,
    monthMenuMounted: false,
    monthMenuPhase: 'closed',
    calendarDensity: 'compact',
    periods: [], memories: [],
    ...INITIAL_HOME_STATE,
    infoSheetVisible: false,
    infoSheetMounted: false,
    infoSheetPhase: 'closed',
    infoSheetHandoff: false,
    infoSheetMode: '',
    monthlyRecap: null,
    dayActionSheetVisible: false,
    dayActionMounted: false,
    dayActionPhase: 'closed',
    daySheetMode: 'actions',
    dayDetailFade: false,
    selectedDate: '',
    selectedDateSubtitle: '',
    selectedDateIsFuture: false,
    selectedDayDetail: null,
    dayDetailsByDate: {},
    ongoingCompletionReminder: null,
    loading: true,
    refreshing: false,
    hasLoadedHomeData: false,
    refreshRetryVisible: false,
    syncStatusVisible: false,
    syncStatusText: '',
    syncStatusMounted: false,
    syncStatusPhase: 'closed',
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
    this._syncState = {
      revisions: { periods: 0, memories: 0 },
      pendingRevisions: { periods: null, memories: null },
      nextRequestId: 1,
      activeRequest: null
    }
  },

  onShow() {
    // 密度偏好在设置页切换；返回首页（tab onShow）时重读即刻生效
    this.setData({ calendarDensity: this.getSavedCalendarDensity() })
    return this.loadData({ background: this.canRefreshInBackground() })
  },

  loadData(options = {}) {
    if (this._loadingPromise) return this._loadingPromise

    const background = Boolean(options.background)
    const requestId = this._startLoad(background)
    const promise = this._loadData(requestId, background)
    this._loadingPromise = promise
    const clearLoadingPromise = () => {
      if (this._loadingPromise === promise) this._loadingPromise = null
    }
    promise.then(clearLoadingPromise, clearLoadingPromise)
    return promise
  },

  async _loadData(requestId, background) {
    try {
      const client = cloud.createRoomDataClient()
      const snapshot = await roomRecordsSnapshot.loadHomeRecordsSnapshot({ client })
      this._resolveLoad(requestId, snapshot, background)
      return snapshot.kind === 'blocked' ? snapshot.outcome : snapshot
    } catch (e) {
      console.error('load error', e)
      const outcome = {
        kind: 'retryable-failure',
        message: getErrorMessage(e)
      }
      this._failLoad(requestId, outcome, background)
      return outcome
    }
  },

  canRefreshInBackground() {
    return this.data.hasLoadedHomeData && !this.data.noRoom
  },

  _ensureSyncState() {
    if (this._syncState) return this._syncState
    this._syncState = {
      revisions: { periods: 0, memories: 0 },
      pendingRevisions: { periods: null, memories: null },
      nextRequestId: 1,
      activeRequest: null
    }
    return this._syncState
  },

  _startLoad(background) {
    const state = this._ensureSyncState()
    const requestId = state.nextRequestId
    state.nextRequestId += 1
    state.activeRequest = {
      id: requestId,
      mode: background ? 'background' : 'initial',
      startRevisions: { ...state.revisions }
    }

    if (background) {
      this.setData({ loading: false, refreshing: true })
      if (this._hasPendingRevisions()) {
        this.showSyncStatus('已更新，正在同步', { autoHide: false })
      } else {
        this.hideSyncStatus()
      }
    } else {
      this.hideSyncStatus()
      this.setData({
        loading: true,
        refreshing: false,
        refreshRetryVisible: false,
        syncStatusVisible: false,
        syncStatusText: '',
        noRoom: false,
        roomStatusTitle: '',
        roomStatusDesc: '',
        roomStatusActionText: '',
        roomStatusAction: ''
      })
    }

    return requestId
  },

  _resolveLoad(requestId, snapshot, background) {
    const state = this._ensureSyncState()
    const request = state.activeRequest
    if (!request || request.id !== requestId) return

    if (snapshot && snapshot.kind === 'blocked') {
      state.activeRequest = null
      this.setData({ loading: false, refreshing: false })
      this.applyRoomStatusOutcome(snapshot.outcome)
      return
    }

    if (snapshot && snapshot.kind === 'retryable-failure') {
      this._failLoad(requestId, snapshot.outcome, background)
      return
    }

    const wasLoaded = this.data.hasLoadedHomeData
    let recordsChanged = false
    let confirmedPending = false
    const pendingRevisions = { ...state.pendingRevisions }

    for (const collection of COLLECTIONS) {
      const outcome = snapshot && snapshot[collection + 'Outcome']
      if (!outcome || outcome.kind !== 'success') continue
      if (state.revisions[collection] > request.startRevisions[collection]) continue

      if (this._applySnapshotCollection(collection, snapshot[collection])) {
        recordsChanged = true
      }
      if (pendingRevisions[collection] !== null) confirmedPending = true
      pendingRevisions[collection] = null
    }

    state.pendingRevisions = pendingRevisions
    state.activeRequest = null
    this.setData({
      hasLoadedHomeData: true,
      loading: false,
      refreshing: false,
      refreshRetryVisible: false,
      noRoom: false,
      roomStatusTitle: '',
      roomStatusDesc: '',
      roomStatusActionText: '',
      roomStatusAction: ''
    })
    if (!wasLoaded) this.applyHomeCalendarState()
    this.syncOngoingCompletionReminder()

    const syncStatus = this._buildResolvedSyncStatus({
      snapshot: snapshot || {},
      mode: request.mode,
      pendingRevisions,
      recordsChanged,
      confirmedPending
    })
    if (syncStatus) {
      this.showSyncStatus(syncStatus.text, { autoHide: syncStatus.autoHide })
    } else if (background) {
      this.hideSyncStatus()
    }
  },

  _failLoad(requestId, outcome, background) {
    const state = this._ensureSyncState()
    const request = state.activeRequest
    if (!request || request.id !== requestId) return

    state.activeRequest = null
    this.setData({ loading: false, refreshing: false })
    if (!background) {
      this.applyRoomStatusOutcome(outcome)
      return
    }
    // 日历已显示过：刷新失败留驻可点的重试句，不自动消失，
    // 直到重试成功或被后一次成功刷新替换（_resolveLoad 成功路径清除）
    this.setData({ refreshRetryVisible: true })
    if (this._hasPendingRevisions()) {
      this.showSyncStatus('同步失败，稍后重试', { autoHide: true })
    } else {
      this.hideSyncStatus()
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

    const update = {
      periods,
      memories,
      ...buildHomeCalendarState({ year, month, periods, memories, today }),
      year,
      month
    }
    if (hasOwn('monthPickerVisible')) update.monthPickerVisible = overrides.monthPickerVisible
    this.setData(update)
  },

  applyRecordChange(change = {}) {
    this._applyRecordChange(change.collection, change.record, change.mode)
  },

  _applyRecordChange(collection, record, mode) {
    const state = this._ensureSyncState()
    if (!COLLECTIONS.includes(collection) || !record || typeof record !== 'object') return

    const currentRecords = this._normalizeRecords(this.data[collection])
    const nextRecords = this._mergeRecordChange(currentRecords, record, mode)
    if (this._stableRecordListKey(nextRecords) === this._stableRecordListKey(currentRecords)) return

    const revision = state.revisions[collection] + 1
    state.revisions[collection] = revision
    if (this.data.hasLoadedHomeData) state.pendingRevisions[collection] = revision

    this.applyHomeCalendarState({ [collection]: nextRecords })
    this.syncOngoingCompletionReminder()
    if (this.data.hasLoadedHomeData) {
      this.showSyncStatus('已更新，正在同步', { autoHide: false })
    }
  },

  _hasPendingRevisions() {
    return COLLECTIONS.some(collection => this._syncState.pendingRevisions[collection] !== null)
  },

  _applySnapshotCollection(collection, records) {
    const nextRecords = this._normalizeRecords(records)
    const currentRecords = this._normalizeRecords(this.data[collection])
    if (this._stableRecordListKey(currentRecords) === this._stableRecordListKey(nextRecords)) return false
    this.applyHomeCalendarState({ [collection]: nextRecords })
    return true
  },

  _mergeRecordChange(records, record, mode = 'upsert') {
    const current = [...this._normalizeRecords(records)]
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

  _stableRecordListKey(records) {
    return JSON.stringify(this._normalizeRecords(records).map(stableValue).sort(compareStableRecordValues))
  },

  _normalizeRecords(records) {
    return Array.isArray(records) ? records : []
  },

  _buildResolvedSyncStatus({
    snapshot,
    mode,
    pendingRevisions,
    recordsChanged,
    confirmedPending
  }) {
    if (snapshot.kind === 'partial-success') {
      const periodsFailed = this._isRetryableFailure(snapshot.periodsOutcome)
      const memoriesFailed = this._isRetryableFailure(snapshot.memoriesOutcome)
      const backgroundLoad = mode === 'background'
      const shouldShowBackgroundPartial = this._hasPendingRevisionsFor(pendingRevisions) ||
        confirmedPending ||
        recordsChanged
      if (backgroundLoad && !shouldShowBackgroundPartial) return null
      if (periodsFailed && !memoriesFailed) {
        return {
          text: backgroundLoad
            ? '经期同步失败，已保留旧经期数据'
            : '经期同步失败，已显示欢乐时光',
          autoHide: false
        }
      }
      if (memoriesFailed && !periodsFailed) {
        return {
          text: backgroundLoad
            ? '欢乐时光同步失败，已保留上次的欢乐时光'
            : '欢乐时光同步失败，已显示经期数据',
          autoHide: false
        }
      }
    }
    if (this._hasPendingRevisionsFor(pendingRevisions)) {
      return { text: '已更新，正在同步', autoHide: false }
    }
    if (mode === 'background' && (confirmedPending || recordsChanged)) {
      return { text: '已同步', autoHide: true }
    }
    return null
  },

  _hasPendingRevisionsFor(pendingRevisions) {
    return COLLECTIONS.some(collection => pendingRevisions[collection] !== null)
  },

  _isRetryableFailure(outcome) {
    return outcome && outcome.kind === 'retryable-failure'
  },

  prevMonth() {
    let { year, month } = this.data
    if (year < JUMP_YEAR_MIN || (year === JUMP_YEAR_MIN && month === 0)) return
    month--; if (month < 0) { month = 11; year-- }
    this.applyHomeCalendarState({ year, month, monthPickerVisible: false })
  },

  nextMonth() {
    let { year, month } = this.data
    if (year > JUMP_YEAR_MAX || (year === JUMP_YEAR_MAX && month === 11)) return
    month++; if (month > 11) { month = 0; year++ }
    this.applyHomeCalendarState({ year, month, monthPickerVisible: false })
  },

  openMonthPicker() {
    const { year, month } = this.data
    homepageSheets(this).monthPicker.open(this, {
      jumpMonth: month,
      ...buildJumpYearState(year)
    })
  },

  closeMonthPicker() {
    this.setData({ monthPickerVisible: false })
    homepageSheets(this).monthPicker.leave(this, undefined, this._takeSheetDragPatch())
  },

  onSheetDragRelease(detail) {
    const target = detail && SHEET_DRAG_TARGETS[detail.sheet]
    if (!target || this.data[target.phaseKey] !== 'open') return
    const decision = decideSheetDragRelease(detail.displacement, detail.elapsed, detail.panelHeight)
    this._queueSheetDrag(detail.sheet, decision)
    if (decision === 'close') {
      target.close(this)
      return
    }
    this.setData(this._takeSheetDragPatch())
  },

  _queueSheetDrag(sheet, action) {
    const current = this.data.sheetDragClear
    const previous = current[sheet]
    this._pendingSheetDrag = {
      sheetDragClear: {
        ...current,
        [sheet]: { token: previous.token + 1, action }
      }
    }
  },

  _takeSheetDragPatch() {
    const patch = this._pendingSheetDrag
    this._pendingSheetDrag = null
    return patch || {}
  },

  // issue #105：月份工具菜单——图例 / 预测说明 / 本月小结的低频入口收进月份标题旁的「…」
  openMonthMenu() {
    homepageSheets(this).toolsMenu.open(this)
  },

  closeMonthMenu() {
    this.setData({ monthMenuVisible: false })
    homepageSheets(this).toolsMenu.leave(this, undefined, this._takeSheetDragPatch())
  },

  onMonthMenuTap(e) {
    const action = e.currentTarget.dataset.action
    const sheets = homepageSheets(this)
    if (action === 'legend') {
      handoffSheet(this, sheets.toolsMenu, sheets.info, { infoSheetMode: 'legend' })
    } else if (action === 'prediction') {
      handoffSheet(this, sheets.toolsMenu, sheets.info, { infoSheetMode: 'prediction' })
    } else if (action === 'recap') {
      handoffSheet(this, sheets.toolsMenu, sheets.info, {
        infoSheetMode: 'recap',
        monthlyRecap: this.data.monthlyRecap
      })
    }
  },

  getSavedCalendarDensity() {
    try {
      const density = wx.getStorageSync(CALENDAR_DENSITY_STORAGE_KEY)
      if (density === 'compact' || density === 'full') return density
    } catch (e) {
      return 'compact'
    }
    return 'compact'
  },

  shiftJumpYear(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    if (Number.isNaN(delta)) return
    this.setData(buildJumpYearState(this.data.jumpYear + delta))
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
    homepageSheets(this).monthPicker.leave(this)
  },

  jumpToToday() {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    this.setData({
      year,
      month,
      jumpMonth: month,
      ...buildJumpYearState(year),
      monthPickerVisible: false
    }, () => this.renderCalendar())
    homepageSheets(this).monthPicker.leave(this)
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

  // 首页已加载后的刷新失败重试：保持后台刷新语义，失败时日历与重试句都留驻，
  // 不把已显示的日历换回整页失败画面
  retryRefresh() {
    return this.loadData({ background: true })
  },

  goBind() { wx.redirectTo({ url: '/pages/bind/bind' }) },

  openLegendSheet() {
    homepageSheets(this).info.open(this, { infoSheetMode: 'legend' })
  },

  openPredictionSheet() {
    homepageSheets(this).info.open(this, { infoSheetMode: 'prediction' })
  },

  openMonthlyRecap() {
    homepageSheets(this).info.open(this, {
      infoSheetMode: 'recap',
      monthlyRecap: this.data.monthlyRecap
    })
  },

  closeInfoSheet() {
    this.setData({ infoSheetVisible: false })
    homepageSheets(this).info.leave(this, () => {
      this.setData({ infoSheetMode: '' })
    }, this._takeSheetDragPatch())
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
    homepageSheets(this).dayActions.open(this, {
      daySheetMode: 'actions',
      dayDetailFade: false,
      selectedDate: date,
      selectedDateSubtitle: this.formatDaySubtitle(selectedDay),
      selectedDateIsFuture: date > util.formatDate(new Date()),
      selectedDayDetail: null
    })
  },

  onDayActionTap(e) {
    const action = e.currentTarget.dataset.action
    const date = this.data.selectedDate
    if (!date) return

    if (action === 'period') {
      // 未来日期不提供记录经期（模板已隐藏入口，这里是不导航的兜底防线）
      if (this.data.selectedDateIsFuture) return
      this.closeDayActions()
      this.openPeriodForDate(date)
    } else if (action === 'memory') {
      this.closeDayActions()
      wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl({ date }) })
    } else if (action === 'detail') {
      this.showDayDetail(date)
    }
  },

  closeDayActions() {
    this.setData({ dayActionSheetVisible: false })
    homepageSheets(this).dayActions.leave(this, () => {
      this.setData({
        daySheetMode: 'actions',
        dayDetailFade: false,
        selectedDate: '',
        selectedDateSubtitle: '',
        selectedDateIsFuture: false,
        selectedDayDetail: null
      })
    }, this._takeSheetDragPatch())
  },

  noop() {},

  showDayDetail(date) {
    const selectedDay = this.data.days.find(day => day.date === date) || { date }
    const fadingIn = this.data.dayActionMounted
      && this.data.daySheetMode === 'actions'
      && this.data.dayActionPhase !== 'leaving'

    homepageSheets(this).dayActions.open(this, {
      daySheetMode: 'detail',
      dayDetailFade: fadingIn,
      selectedDate: date,
      selectedDateSubtitle: this.formatDaySubtitle(selectedDay),
      selectedDateIsFuture: date > util.formatDate(new Date()),
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
  // 「记录经期」统一决策：已有进行中的经期时重开原记录，不建第二条；
  // 否则按给定日期新增（新增默认状态由 recordEditRoute 按开始日期推导）。
  // 快捷入口、提醒入口与日历日动作 sheet 共用这一条页内逻辑。
  openPeriodForDate(date) {
    const ongoing = cycle.findOngoingPeriod(this.data.periods)
    if (ongoing) {
      wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(ongoing) })
      return
    }
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: date }) })
  },
  quickPeriod() {
    this.openPeriodForDate(util.formatDate(new Date()))
  },
  onReminderTap(e) {
    const reminder = this.data.cycleReminders[e.currentTarget.dataset.index]
    if (!reminder || reminder.action !== 'quickPeriod') return
    this.openPeriodForDate(reminder.date)
  },

  // issue #98：超期进行中记录的一次非阻塞完成提示。同一条记录只提示一次：
  // 提示出现即把记录标识经本地存储接缝持久化，之后刷新、跨天、重进应用都不再弹出；
  // 提示本身绝不写结束日期、绝不关闭状态，点击只打开同一条记录补填。
  syncOngoingCompletionReminder() {
    const reminder = cycle.buildOngoingCompletionReminder(this.data.periods, {
      today: util.formatDate(new Date())
    })
    const hideReminder = () => {
      if (this.data.ongoingCompletionReminder) {
        this.setData({ ongoingCompletionReminder: null })
      }
    }
    if (!reminder) return hideReminder()

    const storage = recordDraft.createWxDraftStorage(wx)
    if (storage.get(ONGOING_REMINDER_STORAGE_KEY) === reminder.recordKey) {
      return hideReminder()
    }

    this.setData({ ongoingCompletionReminder: reminder })
    storage.set(ONGOING_REMINDER_STORAGE_KEY, reminder.recordKey)
  },

  onOngoingReminderTap() {
    const reminder = this.data.ongoingCompletionReminder
    if (!reminder || !reminder.record) return
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(reminder.record) })
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
    this.hideSyncStatus()
    this.setData({
      hasLoadedHomeData: false,
      refreshing: false,
      refreshRetryVisible: false,
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
    syncPill(this).open(this, { syncStatusText: text })

    if (options.autoHide === false) return

    const timer = setTimeout(() => {
      this._syncStatusTimer = null
      this.hideSyncStatus()
    }, SYNC_STATUS_CLEAR_DELAY)
    if (timer && typeof timer.unref === 'function') timer.unref()
    this._syncStatusTimer = timer
  },

  hideSyncStatus() {
    this.clearSyncStatusTimer()
    if (!this.data.syncStatusVisible && !this.data.syncStatusText) return
    if (!this.data.syncStatusMounted) {
      this.setData({
        syncStatusVisible: false,
        syncStatusText: ''
      })
      return
    }
    // issue #120：离场过程中文案和朗读名保持可见，胶囊卸载后再清掉。
    syncPill(this).leave(this, () => {
      this.setData({ syncStatusText: '' })
    })
  },

  clearSyncStatusTimer() {
    if (!this._syncStatusTimer) return
    clearTimeout(this._syncStatusTimer)
    this._syncStatusTimer = null
  }
})

function syncPill(page) {
  if (!page._syncPill) {
    page._syncPill = createSheetLifecycle({
      visibleKey: 'syncStatusVisible',
      mountedKey: 'syncStatusMounted',
      phaseKey: 'syncStatusPhase'
    })
  }
  return page._syncPill
}

const SHEET_DRAG_TARGETS = {
  monthPicker: {
    phaseKey: 'monthPickerPhase',
    close(page) { page.closeMonthPicker() }
  },
  dayActions: {
    phaseKey: 'dayActionPhase',
    close(page) { page.closeDayActions() }
  },
  toolsMenu: {
    phaseKey: 'monthMenuPhase',
    close(page) { page.closeMonthMenu() }
  },
  info: {
    phaseKey: 'infoSheetPhase',
    close(page) { page.closeInfoSheet() }
  }
}

function decideSheetDragRelease(displacement, elapsed, panelHeight) {
  if (!(displacement > 0)) return 'reset'
  const pastDistance = panelHeight > 0 && displacement > panelHeight * 0.25
  const pastSpeed = elapsed > 0 && displacement / elapsed > 0.11
  return pastDistance || pastSpeed ? 'close' : 'reset'
}

function buildJumpYearState(year) {
  const jumpYear = Math.min(JUMP_YEAR_MAX, Math.max(JUMP_YEAR_MIN, year))
  return {
    jumpYear,
    jumpYearAtMin: jumpYear <= JUMP_YEAR_MIN,
    jumpYearAtMax: jumpYear >= JUMP_YEAR_MAX
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function compareStableRecordValues(left, right) {
  const leftIdentity = getStableRecordIdentity(left)
  const rightIdentity = getStableRecordIdentity(right)
  if (leftIdentity < rightIdentity) return -1
  if (leftIdentity > rightIdentity) return 1
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

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}
