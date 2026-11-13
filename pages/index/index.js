const util = require('../../utils/util')
const { createRoomRecordsSync } = require('../../utils/roomRecordsSync')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const wxPrompts = require('../../utils/wxPrompts')
const recordEditRoute = require('../../utils/recordEditRoute')
const recordDraft = require('../../utils/recordDraft')
const { buildHomeCalendarState } = require('../../utils/homeCalendarState')
const { computeCalendarRowHeight } = require('../../utils/calendarRowHeight')
const safeArea = require('../../utils/safeArea')
const roomPresence = require('../../utils/roomPresence')
const { withPageVisibility } = require('../../utils/pageVisibility')
const {
  createSheetLifecycle,
  probeReducedMotion,
  restoreTabBarOnShow
} = require('../../utils/sheetLifecycle')
const { homepageSheetData, homepageSheets } = require('./homepageSheets')

// 与 pages/settings/settings.js 共享同一存储键；写入方在设置页
const CALENDAR_DENSITY_STORAGE_KEY = 'calendarDensity'
// issue #98：超期进行中记录的一次性完成提示标记；经 utils/recordDraft.js 的 createWxDraftStorage 本地存储接缝读写
const ONGOING_REMINDER_STORAGE_KEY = 'ongoingPeriodReminderShown'
const SYNC_STATUS_CLEAR_DELAY = 1600
const JUMP_YEAR_MIN = 2001
const JUMP_YEAR_MAX = 2035
// issue #155：信息弹层按显示的内容命名。遮罩读「关闭」加这个名称，面板以它作对话框名。
const INFO_SHEET_NAMES = { legend: '日历图例', prediction: '预测说明', recap: '本月小结' }
// issue #165：翻月滑入的时长，与 app.wxss 的 --duration-enter 同值；这段时间内同方向再翻算接续。
// tests/index-page.test.js 从 app.wxss 读出这个 token 卡住接续的边界，两边只改一处会失配
const CALENDAR_FLIP_MS = 240
const INITIAL_VIEW_DATE = new Date()
const INITIAL_HOME_STATE = buildHomeCalendarState({
  year: INITIAL_VIEW_DATE.getFullYear(),
  month: INITIAL_VIEW_DATE.getMonth(),
  today: util.formatDate(INITIAL_VIEW_DATE)
})
function readPageViewport() {
  try {
    if (typeof wx !== 'undefined' && wx && typeof wx.getWindowInfo === 'function') {
      const info = wx.getWindowInfo()
      if (info && info.windowWidth > 0 && info.windowHeight > 0) {
        return { viewportWidth: info.windowWidth, viewportHeight: info.windowHeight }
      }
    }
  } catch (e) {
    // 拿不到窗口时用 390 宽、去掉底栏后的常见页高
  }
  return { viewportWidth: 390, viewportHeight: 761 }
}

// 行高与清爽密度是否合并信息行只从 utils/calendarRowHeight.js 的几何账本一次求出（issue #153）
function calendarGeometry({ days, density, navBarHeightPx, showBackToToday, showPartnerWelcome = false, showRefreshRetry = false }) {
  const viewport = readPageViewport()
  const row = computeCalendarRowHeight({
    viewportWidth: viewport.viewportWidth,
    viewportHeight: viewport.viewportHeight,
    navBarHeightPx,
    density: density === 'full' ? 'full' : 'compact',
    days,
    showBackToToday,
    showPartnerWelcome,
    showRefreshRetry
  })
  return { calendarRowHeightPx: row.heightPx, calendarInfoMerged: row.infoMerged }
}

function calendarRenderState(state) {
  const render = { ...state }
  delete render.dayDetailsByDate
  delete render.periodQuickAction
  delete render.memoryQuickAction
  return render
}

function infoSheetContent(mode, extra = {}) {
  return { ...extra, infoSheetMode: mode, infoSheetName: INFO_SHEET_NAMES[mode] }
}

function emptyDayDetail() {
  return {
    title: '',
    subtitle: '',
    isFuture: false,
    periodAction: null,
    memoryAction: null,
    meanings: [],
    periods: [],
    memories: [],
    actions: [],
    empty: true
  }
}

Page(withPageVisibility({
  _dayDetailsByDate: INITIAL_HOME_STATE.dayDetailsByDate,
  _periodQuickAction: INITIAL_HOME_STATE.periodQuickAction,
  _memoryQuickAction: INITIAL_HOME_STATE.memoryQuickAction,
  // 正在播的那段翻月滑入 { direction, startedAt }（issue #165）；挂在格子层上的类名记号是 data.calendarFlip
  _flipRun: null,

  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
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
    ...monthNavState(INITIAL_VIEW_DATE.getFullYear(), INITIAL_VIEW_DATE.getMonth()),
    ...homepageSheetData(),
    calendarDensity: 'compact',
    // 翻月方向记号（next-a/next-b/prev-a/prev-b）挂在 .calendar-days 上，空串即不滑动（issue #165）
    calendarFlip: '',
    // 一次性状态强调（today-a/today-b/predict-a/predict-b），只跟着触发它的那次日历提交（issue #165）
    calendarEmphasis: '',
    // 记录成功反馈：日期 → memory / period，只跟着那次记录变化的日历提交，首页隐藏时收掉（issue #167）
    recordFeedback: {},
    ...calendarRenderState(INITIAL_HOME_STATE),
    ...calendarGeometry({
      days: INITIAL_HOME_STATE.days,
      density: 'compact',
      navBarHeightPx: safeArea.getNavBarHeight(),
      showBackToToday: INITIAL_HOME_STATE.showBackToToday
    }),
    skeletonCells: Array.from({ length: 35 }, (_, index) => index),
    infoSheetMode: '',
    infoSheetName: '',
    daySheetMode: 'actions',
    dayDetailFade: false,
    selectedDate: '',
    selectedDateLabel: '',
    selectedDateSubtitle: '',
    selectedDateIsFuture: false,
    selectedDayDetail: null,
    loading: true,
    refreshing: false,
    hasLoadedHomeData: false,
    refreshRetryVisible: false,
    refreshRetryText: '',
    refreshRetryLabel: '',
    syncStatusVisible: false,
    syncStatusText: '',
    syncStatusMounted: false,
    syncStatusPhase: 'closed',
    noRoom: false,
    partnerWelcome: false,
    roomStatusTitle: '',
    roomStatusDesc: '',
    roomStatusActionText: '',
    roomStatusAction: ''
  },

  onLoad() {
    this.refreshReducedMotion()
    const now = new Date()
    this._recordsSync = createRoomRecordsSync({
      onChange: (state, change) => this.renderRecordsSync(state, change)
    })
    this.applyHomeCalendarState({
      year: now.getFullYear(),
      month: now.getMonth(),
      today: util.formatDate(now)
    }, { fields: { calendarDensity: this.getSavedCalendarDensity() } })
  },

  onShow() {
    restoreTabBarOnShow(this)
    // 密度偏好在设置页切换；返回首页（tab onShow）时重读即刻生效，行高按新密度同一次重算。
    // 记录加载在这次调用里同步开始；配对状态随两份列表一起带回，不另查房间（#191）。
    const today = util.formatDate(new Date())
    const calendarDensity = this.getSavedCalendarDensity()
    // 隔日回来时所有日期内容一起更新；同日静默刷新保留当前投影的反馈与动画。
    if (today !== this._calendarToday) {
      this.applyHomeCalendarState({ today }, { fields: { calendarDensity } })
    } else {
      const reminder = this.unseenOngoingCompletionReminder(this.data.ongoingCompletionReminder)
      this.setData(this.withCalendarGeometry({
        calendarDensity,
        ongoingCompletionReminder: reminder
      }), () => this.markOngoingReminderShown(reminder))
    }
    this.refreshReducedMotion()
    return this.loadRecords({ background: this.data.hasLoadedHomeData && !this.data.noRoom })
  },

  // 首页发起的每次加载都经这里：「TA 已加入」只认这次列表带回的配对状态，由 roomPresence 判定只提示一次；
  // 没带回状态（读取失败或旧版 dataOp）就不喂旧值。显示、下拉、重试共用一次在途加载时也只提示一次。
  loadRecords(options) {
    return this._recordsSync.load(options).then(result => {
      if (roomPresence.rememberRoomStatus(result && result.roomStatus)) {
        wx.showToast({ title: 'TA 已加入', icon: 'none' })
      }
      return result
    })
  },

  // 一次性配对欢迎（issue #149）：日历能显示时才挂上欢迎条，行高同一次 setData 计入它；
  // 渲染回调确认欢迎条已提交到视图层后才记为看过。骨架屏、失败或未绑定画面时保持待显示。
  revealPendingPartnerWelcome() {
    if (this.data.partnerWelcome || !this.data.hasLoadedHomeData || this.data.noRoom) return
    if (!roomPresence.isPartnerWelcomePending()) return
    this.setData(
      this.withCalendarGeometry({ partnerWelcome: true }),
      () => {
        roomPresence.markPartnerWelcomeSeen()
        this._partnerWelcomeSeen = true
      }
    )
  },

  // 欢迎条只陪第一次显示它的那次停留：已经看过的欢迎条在首页隐藏时收起（画面不可见，不跳动），
  // 再回到首页时不再出现，行高同一次 setData 去掉它
  dismissSeenPartnerWelcome() {
    if (!this.data.partnerWelcome || !this._partnerWelcomeSeen) return
    this._partnerWelcomeSeen = false
    this.setData(this.withCalendarGeometry({ partnerWelcome: false }))
  },

  // 日历几何的唯一出口（issue #153）：改动日期格、密度、顶栏、「回到今天」、欢迎条或行内重试行的 setData
  // 都经这里，用改动后的数据一次求出行高与是否合并信息行，与这些改动同一次提交
  withCalendarGeometry(patch) {
    const next = { ...this.data, ...patch }
    return {
      ...patch,
      ...calendarGeometry({
        days: next.days,
        density: next.calendarDensity,
        navBarHeightPx: next.navBarHeight,
        showBackToToday: next.showBackToToday,
        showPartnerWelcome: next.partnerWelcome,
        showRefreshRetry: next.refreshRetryVisible
      })
    }
  },

  onReady() {
    this.refreshReducedMotion()
  },

  refreshReducedMotion() {
    probeReducedMotion(this)
  },

  renderRecordsSync(state, { calendarChanged, recordChange }) {
    const fields = {
      loading: state.loading,
      refreshing: state.refreshing,
      hasLoadedHomeData: state.hasLoadedHomeData,
      ...state.retry
    }
    if (state.blockedOutcome) {
      this.applyRoomStatusOutcome(state.blockedOutcome, fields)
      return
    }
    Object.assign(fields, {
      noRoom: false,
      roomStatusTitle: '',
      roomStatusDesc: '',
      roomStatusActionText: '',
      roomStatusAction: ''
    })
    if (calendarChanged) this.applyHomeCalendarState({ recordChange }, { fields })
    else this.setData(this.withCalendarGeometry(fields))
    if (state.pill) this.showSyncStatus(state.pill.text, state.pill)
    else this.hideSyncStatus()
    this.revealPendingPartnerWelcome()
  },

  _dayDetail(date) {
    const details = this._dayDetailsByDate || {}
    return details[date] || emptyDayDetail()
  },

  // overrides 决定投影：年月、今天，以及这次的记录变化（recordChange：投影据此给出记录成功反馈，
  // 随渲染数据一起提交，issue #167）。第二个参数是跟日历同一次提交的其他东西：flip / emphasis 是这次带的
  // 一次性记号（见 _calendarMarks），fields 是其他字段（选月面板），不覆盖投影和记号
  applyHomeCalendarState(overrides = {}, { flip, emphasis, fields = {} } = {}) {
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(overrides, key)
    const { collections, roomPaired } = this._recordsSync.getState()
    const year = hasOwn('year') ? overrides.year : this.data.year
    const month = hasOwn('month') ? overrides.month : this.data.month
    const today = hasOwn('today') ? overrides.today : util.formatDate(new Date())

    const state = buildHomeCalendarState({
      year,
      month,
      periods: collections.periods.records,
      memories: collections.memories.records,
      today,
      roomPaired,
      periodsSynced: collections.periods.synced,
      memoriesSynced: collections.memories.synced,
      recordChange: hasOwn('recordChange') ? overrides.recordChange : null
    })
    this._calendarToday = today
    this._dayDetailsByDate = state.dayDetailsByDate
    this._periodQuickAction = state.periodQuickAction
    this._memoryQuickAction = state.memoryQuickAction
    const reminder = this.unseenOngoingCompletionReminder(state.ongoingCompletionReminder)

    const update = {
      ...fields,
      ...calendarRenderState(state),
      ongoingCompletionReminder: reminder,
      ...monthNavState(year, month),
      year,
      month,
      ...this._calendarMarks({ flip, emphasis })
    }
    if (this.data.selectedDate && this.data.dayActionsMounted) {
      Object.assign(update, this.selectedDayState(this.data.selectedDate))
    }
    this.setData(this.withCalendarGeometry(update), () => this.markOngoingReminderShown(reminder))
  },

  applyRecordChange(change) {
    this._recordsSync.applyRecordChange(change)
  },

  prevMonth() {
    let { year, month } = this.data
    if (monthNavState(year, month).prevMonthDisabled) return
    month--; if (month < 0) { month = 11; year-- }
    this.applyHomeCalendarState({ year, month }, { flip: 'prev' })
  },

  nextMonth() {
    let { year, month } = this.data
    if (monthNavState(year, month).nextMonthDisabled) return
    month++; if (month > 11) { month = 0; year++ }
    this.applyHomeCalendarState({ year, month }, { flip: 'next' })
  },

  // 日历提交带的三个一次性记号（issue #165、#167）：翻月方向 calendarFlip、状态强调 calendarEmphasis、
  // 记录成功反馈 recordFeedback（投影按 recordChange 算出，随渲染数据一起提交）。
  // 强调和反馈只跟着触发它们的那次提交，之后每次日历提交都去掉，换月或节点重建不会重播。
  // 翻月记号只由翻月（flip: 'next' / 'prev'）和即时替换（flip: 'none'：选月、回到今天）改写，别的提交不带它，
  // 类名不变就不重播。进行中（CALENDAR_FLIP_MS 内）同方向再翻只换数据、动画接着播，接续不续期；
  // 反向或已播完就换记号从头播。数据总在这一次提交里更新，动画不推迟任何操作
  _calendarMarks({ flip, emphasis } = {}) {
    const marks = { calendarEmphasis: emphasis ? nextCalendarToken(this.data.calendarEmphasis, emphasis) : '' }
    if (flip === 'none') {
      this._flipRun = null
      marks.calendarFlip = ''
    } else if (flip) {
      const now = Date.now()
      const run = this._flipRun
      if (!run || run.direction !== flip || now - run.startedAt >= CALENDAR_FLIP_MS) {
        this._flipRun = { direction: flip, startedAt: now }
        marks.calendarFlip = nextCalendarToken(this.data.calendarFlip, flip)
      }
    }
    return marks
  },

  // 日历被换下（未绑定、加载失败画面）：回来时是新挂载的节点，带着旧记号会重播滑入、强调或记录成功反馈
  _clearedCalendarMarks() {
    this._flipRun = null
    return { calendarFlip: '', calendarEmphasis: '', recordFeedback: {} }
  },

  // 日历滑动松手：判定在纯函数里，页面只做一次既有翻月更新（和箭头同一段滑入，issue #165），不跟手。
  onCalendarSwipe(detail) {
    const decision = util.decideMonthSwipe(detail && detail.dx, detail && detail.dy)
    if (decision === 'next') this.nextMonth()
    else if (decision === 'prev') this.prevMonth()
  },

  openMonthPicker() {
    const { year, month } = this.data
    homepageSheets(this).open('monthPicker', {
      jumpMonth: month,
      ...buildJumpYearState(year)
    })
  },

  closeMonthPicker() {
    homepageSheets(this).close('monthPicker')
  },

  onSheetDragRelease(detail) {
    homepageSheets(this).dragRelease(detail)
  },

  // 工具菜单承接图例 / 预测说明 / 本月小结，入口在顶栏「工具」。
  openMonthMenu() {
    homepageSheets(this).open('toolsMenu')
  },

  closeMonthMenu() {
    homepageSheets(this).close('toolsMenu')
  },

  onMonthMenuTap(e) {
    const action = e.currentTarget.dataset.action
    const sheets = homepageSheets(this)
    if (action === 'legend') {
      sheets.handoff('toolsMenu', 'infoSheet', infoSheetContent('legend'))
    } else if (action === 'prediction') {
      sheets.handoff('toolsMenu', 'infoSheet', infoSheetContent('prediction'))
    } else if (action === 'recap') {
      sheets.handoff('toolsMenu', 'infoSheet', infoSheetContent('recap', {
        monthlyRecap: this.data.monthlyRecap
      }))
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

  // 选月与回到今天：月标题和那个月的格子同一次提交（issue #165），不在渲染回调里补排格子
  selectJumpMonth(e) {
    const month = Number(e.currentTarget.dataset.month)
    if (!Number.isInteger(month) || month < 0 || month > 11) return
    this.applyHomeCalendarState({ year: this.data.jumpYear, month }, {
      flip: 'none',
      fields: { jumpMonth: month }
    })
    homepageSheets(this).close('monthPicker')
  },

  // 回到今天就点亮今天一次（issue #165）；已在当月再点也换记号重播
  jumpToToday() {
    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth()
    this.applyHomeCalendarState({ year, month, today: util.formatDate(today) }, {
      flip: 'none',
      emphasis: 'today',
      fields: { jumpMonth: month, ...buildJumpYearState(year) }
    })
    homepageSheets(this).close('monthPicker')
  },

  handleRoomStatusAction() {
    return wxPrompts.runAction(this.data.roomStatusAction, {
      navigateToBind: () => this.goBind(),
      retry: () => this.loadRecords({ background: false })
    })
  },

  // 首页已加载后的刷新失败重试：保持后台刷新语义，失败时日历与重试句都留驻，
  // 不把已显示的日历换回整页失败画面
  retryRefresh() {
    return this.loadRecords({ background: true })
  },

  onPullDownRefresh() {
    const task = this.loadRecords({ background: true })
    const stop = () => {
      if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh()
    }
    return Promise.resolve(task).then(stop, stop)
  },

  goBind() { wx.redirectTo({ url: '/pages/bind/bind' }) },

  openLegendSheet() {
    homepageSheets(this).open('infoSheet', infoSheetContent('legend'))
  },

  openPredictionSheet() {
    homepageSheets(this).open('infoSheet', infoSheetContent('prediction'))
  },

  openMonthlyRecap() {
    homepageSheets(this).open('infoSheet', infoSheetContent('recap', {
      monthlyRecap: this.data.monthlyRecap
    }))
  },

  closeInfoSheet() {
    homepageSheets(this).close('infoSheet')
  },

  // issue #165：关掉预测说明时把当月的「预」点亮一次，说明讲的就是这几天。只认开着的预测说明被关掉，
  // 离场途中的重复关闭不算；当月没有「预」就没有可亮的
  _predictionEmphasisPatch() {
    const { infoSheetMode, infoSheetMounted, infoSheetPhase, days } = this.data
    if (infoSheetMode !== 'prediction' || !infoSheetMounted || infoSheetPhase === 'leaving') return {}
    if (!(days || []).some(day => day.isPredict)) return {}
    return { calendarEmphasis: nextCalendarToken(this.data.calendarEmphasis, 'predict') }
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
    const detail = this._dayDetail(date)
    if (detail.periods.length || detail.memories.length) {
      this.showDayDetail(date)
      return
    }
    homepageSheets(this).open('dayActions', {
      daySheetMode: 'actions',
      dayDetailFade: false,
      ...this.selectedDayState(date)
    })
  },

  onDayActionTap(e) {
    const action = e.currentTarget.dataset.action
    const date = this.data.selectedDate
    if (!date) return

    if (action === 'detail') {
      this.showDayDetail(date)
      return
    }
    const detail = this._dayDetail(date)
    if (!detail.actions.some(item => item.key === action)) return
    const entry = action === 'period' ? detail.periodAction : action === 'memory' ? detail.memoryAction : null
    if (!entry) return
    this.closeDayActions()
    this.openProjectedEntry(entry)
  },

  onDayRecordTap(e) {
    if (this._dayDetail(this.data.selectedDate).isFuture) return
    const kind = e.currentTarget.dataset.kind
    const recordId = e.currentTarget.dataset.id
    if (!recordId) return
    const collection = kind === 'memory' ? 'memories' : 'periods'
    const record = this._recordsSync.getState().collections[collection].records.find(item => (item._id || item.id) === recordId)
    if (!record) return
    this.closeDayActions()
    wx.navigateTo({
      url: kind === 'memory'
        ? recordEditRoute.buildMemoryEditUrl(record)
        : recordEditRoute.buildPeriodEditUrl(record)
    })
  },

  closeDayActions() {
    homepageSheets(this).close('dayActions')
  },

  noop() {},

  // issue #134：系统返回先关掉最上层弹层，走现有离场，不离开页面。
  onSheetSystemBack() {
    homepageSheets(this).systemBack()
  },

  showDayDetail(date) {
    const fadingIn = this.data.dayActionsMounted
      && this.data.daySheetMode === 'actions'
      && this.data.dayActionsPhase !== 'leaving'

    homepageSheets(this).open('dayActions', {
      daySheetMode: 'detail',
      dayDetailFade: fadingIn,
      ...this.selectedDayState(date)
    })
  },

  selectedDayState(date) {
    const detail = this._dayDetail(date)
    return {
      selectedDate: date,
      selectedDateLabel: detail.title,
      selectedDateSubtitle: detail.subtitle,
      selectedDateIsFuture: detail.isFuture,
      selectedDayDetail: detail
    }
  },

  openProjectedEntry(entry) {
    if (!entry) return
    if (entry.notice) wx.showToast({ title: entry.notice, icon: 'none' })
    wx.navigateTo({ url: entry.url })
  },
  quickPeriod() {
    this.openProjectedEntry(this._periodQuickAction)
  },
  onReminderTap(e) {
    const reminder = this.data.cycleReminders[e.currentTarget.dataset.index]
    if (reminder) this.openProjectedEntry(reminder.periodAction)
  },

  // issue #129：同一条记录只提示一次，但渲染本身不记「已提醒」。
  // 用户点过它，或首页在显示过它之后被离开，才经本地存储接缝持久化。
  // 提示绝不写结束日期、绝不关闭状态，点击只打开同一条记录补填。
  unseenOngoingCompletionReminder(reminder) {
    if (!reminder) return null
    const storage = recordDraft.createWxDraftStorage(wx)
    if (storage.get(ONGOING_REMINDER_STORAGE_KEY) === reminder.recordKey) return null
    return reminder
  },

  markOngoingReminderShown(reminder) {
    // 候选提交到可见日历后才算显示过；持久化仍等离开或点击。
    const current = this.data.ongoingCompletionReminder
    if (reminder && current && current.recordKey === reminder.recordKey &&
        !this.data.pageHidden && this.data.hasLoadedHomeData && !this.data.noRoom) {
      this._ongoingReminderShownKey = reminder.recordKey
    }
  },

  persistOngoingReminderSeen() {
    const recordKey = this._ongoingReminderShownKey
    if (!recordKey) return
    const storage = recordDraft.createWxDraftStorage(wx)
    if (storage.get(ONGOING_REMINDER_STORAGE_KEY) !== recordKey) {
      storage.set(ONGOING_REMINDER_STORAGE_KEY, recordKey)
    }
    this._ongoingReminderShownKey = ''
  },

  // page-hidden 由 withPageVisibility 在这里跑完之后才挂。issue #167：记录成功反馈要在那之前收掉，
  // 反馈在 page-hidden 下按住不播，先挂 page-hidden 会让 ♥ 和色带在离场途中消失
  onHide() {
    this.clearRecordFeedback()
    this.persistOngoingReminderSeen()
    this.dismissSeenPartnerWelcome()
  },

  clearRecordFeedback() {
    if (Object.keys(this.data.recordFeedback || {}).length === 0) return
    this.setData({ recordFeedback: {} })
  },

  onUnload() {
    this.persistOngoingReminderSeen()
  },

  onOngoingReminderTap() {
    const reminder = this.data.ongoingCompletionReminder
    if (!reminder || !reminder.record) return
    this.persistOngoingReminderSeen()
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(reminder.record) })
  },
  quickMemory() {
    this.openProjectedEntry(this._memoryQuickAction)
  },

  applyRoomStatusOutcome(outcome, fields) {
    return wxPrompts.present(roomAccessOutcome.presentRoomAccessFailure(outcome, 'home'), {
      showInline: presentation => this.showRoomStatus(presentation, fields)
    })
  },

  showRoomStatus({ title, content: desc, actionText, action }, fields) {
    this.hideSyncStatus()
    this.setData({
      ...fields,
      ...this._clearedCalendarMarks(),
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
}))

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

// 日历动画记号在 a、b 间交替：同一段动画要从头再播，类名必须变（issue #165）
function nextCalendarToken(current, kind) {
  return `${kind}-${typeof current === 'string' && current.endsWith('-a') ? 'b' : 'a'}`
}

function buildJumpYearState(year) {
  const jumpYear = Math.min(JUMP_YEAR_MAX, Math.max(JUMP_YEAR_MIN, year))
  return {
    jumpYear,
    jumpYearAtMin: jumpYear <= JUMP_YEAR_MIN,
    jumpYearAtMax: jumpYear >= JUMP_YEAR_MAX
  }
}

// issue #159：可看的月份是 JUMP_YEAR_MIN 年 1 月到 JUMP_YEAR_MAX 年 12 月。到了一端，那一侧的箭头
// 禁用（外观、读屏同一个值），翻月处理器和滑动也在这里止步：不翻月、不提示
function monthNavState(year, month) {
  return {
    prevMonthDisabled: year < JUMP_YEAR_MIN || (year === JUMP_YEAR_MIN && month <= 0),
    nextMonthDisabled: year > JUMP_YEAR_MAX || (year === JUMP_YEAR_MAX && month >= 11)
  }
}
