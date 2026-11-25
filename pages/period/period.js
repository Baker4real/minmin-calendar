const util = require('../../utils/util')
const cycle = require('../../utils/cycle')
const { buildPeriodQuickEntry } = require('../../utils/homeCalendarState')
const periodCoverage = require('../../utils/periodCoverage')
const recordPageSync = require('../../utils/recordPageSync')
const recordEditRoute = require('../../utils/recordEditRoute')
const memoryMonthGroups = require('../../utils/memoryMonthGroups')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const roomRecordsSync = require('../../utils/roomRecordsSync')
const wxPrompts = require('../../utils/wxPrompts')
const safeArea = require('../../utils/safeArea')
const { restoreTabBarOnShow } = require('../../utils/sheetLifecycle')
const { syncPill } = require('../../utils/syncPill')
const { withPageVisibility } = require('../../utils/pageVisibility')

Page(withPageVisibility({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), navBarHeight: safeArea.getNavBarHeight(), capsuleRight: safeArea.getCapsuleRightInset(), ...safeArea.getNavTitlePadding('placeholder'), segment: 'period', segmentMotion: 'a', periodCount: 0, periodGroups: [], periodQuickLabel: '记经期', periodQuickMode: 'add', periodQuickAriaLabel: '记经期', predictionThresholdText: '记两次经期后就能估下次', avgCycle: null, avgDuration: null, loading: true, refreshing: false, loadFailed: false, hasLoaded: false, memoryCount: 0, memoryYearCount: 0, memoryGroups: [], memoryLoading: true, memoryLoadFailed: false, memoryHasLoaded: false, syncStatusVisible: false, syncStatusText: '', syncStatusMounted: false, syncStatusPhase: 'closed' },

  // 欢乐时光月份卡的展开选择（issue #109）：页面内存按月份键记「用户点过卡头」的月份，
  // 值为 memoryMonthGroups.EXPANDED / COLLAPSED；尚无选择时仅首月默认展开。
  // 不写本地存储，小程序重启后自然恢复默认
  memoryMonthChoices: {},
  periodMonthChoices: {},
  periodYearChoices: {},
  _recordsDirty: false,
  _renderedToday: '',
  _pendingSegment: '',

  // 全应用共用一份 Room 记录（#194）：加载时订阅、卸载时退订，订阅回调只更新渲染数据
  onLoad() {
    this._unsubscribeRecords = roomRecordsSync.subscribe((state, change) => this.renderRecords(state, change))
  },

  onUnload() {
    if (this._unsubscribeRecords) this._unsubscribeRecords()
    syncPill(this).clear()
  },

  onShow() {
    // 本页没有弹层：别的页面在弹层开着时被卸载留下的隐藏 tabBar，在这里交还
    restoreTabBarOnShow(this)
    this.consumeSegmentIntent()
    // 先请共享记录加载：它先按本机当前的房间码核对归属，换了 Room 就先清空。
    // 只有记录脏标记或 Today 样本变化才重画行；无变化的再次显示不多发一份分组（#224）。
    const loaded = this.loadRecords()
    this.renderRecords(roomRecordsSync.getState())
    return loaded
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true })
    const task = this.loadRecords()
    const stop = () => {
      this.setData({ refreshing: false })
      if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh()
    }
    return Promise.resolve(task).then(stop, stop)
  },

  consumeSegmentIntent() {
    const segment = recordPageSync.consumeRecordTabSegmentIntent()
    if (segment) this.showSegment(segment)
  },

  showSegment(segment) {
    if (segment !== 'period' && segment !== 'memory') return
    if (segment === this.data.segment) return
    this.setData({ segment, segmentMotion: this.data.segmentMotion === 'a' ? 'b' : 'a' })
  },

  // 两个分段渲染同一份共享记录，切换分段不读取
  selectSegment(e) {
    this.showSegment(e.currentTarget.dataset.segment)
  },

  // 共享记录发布的记录变化（编辑页保存/删除成功后交给它的那一次，#195）：落到被改动记录所属分段、
  // 展开保存结果所在月份；可见时同行渲染，隐藏时留到下次显示一起补上
  landOnRecordChange(change) {
    if (change.collection === 'memories') {
      // 保存后自动展开（issue #109）：新增/修改把记录所在月份设为展开，
      // 按月份键记进页面内存，之后的渲染里保持展开；删除（record 只有 _id）不改展开状态
      if ((change.mode === 'add' || change.mode === 'update') && change.record.date) {
        this.memoryMonthChoices = {
          ...this.memoryMonthChoices,
          [memoryMonthGroups.monthKey(change.record.date)]: memoryMonthGroups.EXPANDED
        }
      }
      return { segment: 'memory' }
    }
    if ((change.mode === 'add' || change.mode === 'update') && change.record.startDate) {
      this.periodMonthChoices = { ...this.periodMonthChoices, [change.record.startDate.slice(0, 7)]: true }
      this.periodYearChoices = { ...this.periodYearChoices, [change.record.startDate.slice(0, 4)]: true }
    }
    return { segment: 'period' }
  },

  // 显示、下拉和重试都只请共享记录加载一次（两类各读一次，与在途的加载合并）。提示只依据这次加载返回的结果
  loadRecords() {
    return roomRecordsSync.load().then(result => {
      this.presentLoadResult(result)
      return result
    })
  },

  // 两个分段的重试（失败画面与行内重试行）都请共享记录加载一次
  loadData() {
    return this.loadRecords()
  },

  loadMemoryData() {
    return this.loadRecords()
  },

  // 弹窗、toast 和跳转只由调用了这次加载、且仍在前台的页面执行：隐藏的页面不提示；一次加载被显示、下拉、重试
  // 或首页共用时只提示一次。呈现方式由 roomAccessOutcome 决定，行内的那几种由分段的失败画面和行内重试表达
  presentLoadResult(result) {
    if (!result || !result.outcome || this.data.pageHidden) return
    if (!roomRecordsSync.claimPrompt(result)) return
    wxPrompts.present(roomAccessOutcome.presentRoomAccessFailure(result.outcome, 'list'), {
      // 分段的失败画面与行内重试已随订阅渲染
      showInline: () => {}
    })
  },

  // 两个分段渲染共享记录：已同步的集合直接显示；未同步的不显示空态，给失败画面与重试，手里已保存的记录照常列出，
  // 经期条数和平均值显示占位；曾同步、最近一次刷新失败的保留列表并给行内重试。
  // 行只在显示时、记录或配对变化时（calendarChanged）和落到一次记录变化时重画，记录作者随同一次渲染给出；
  // 点按入口按 id 回读共享记录，不从页面保存另一份记录副本
  renderRecords(state, { calendarChanged = false, recordChange = null } = {}) {
    if (recordChange) {
      const landing = this.landOnRecordChange(recordChange)
      this._pendingSegment = landing.segment
    }
    if (calendarChanged || recordChange) this._recordsDirty = true
    // 隐藏期间只保留脏标记和展开选择；onShow 用共享记录的最新状态补画（#224）。
    if (this.data.pageHidden) return
    const today = util.formatDate(new Date())
    const drawRows = this._recordsDirty || this._renderedToday !== today
    const update = {
      ...segmentState(state, 'periods', { loading: 'loading', loaded: 'hasLoaded', failed: 'loadFailed' }),
      ...segmentState(state, 'memories', { loading: 'memoryLoading', loaded: 'memoryHasLoaded', failed: 'memoryLoadFailed' }),
      ...periodStats(state.collections.periods)
    }
    if (this._pendingSegment) {
      if (this._pendingSegment !== this.data.segment) update.segmentMotion = this.data.segmentMotion === 'a' ? 'b' : 'a'
      update.segment = this._pendingSegment
      this._pendingSegment = ''
    }
    if (drawRows) Object.assign(update, this.recordRows(state))
    const patch = changedFields(this.data, update)
    if (Object.keys(patch).length) this.setData(patch)
    if (drawRows) {
      this._recordsDirty = false
      this._renderedToday = today
    }
    if (state.pill) this.showSyncStatus(state.pill.text, state.pill)
    else this.hideSyncStatus()
  },

  recordRows(state) {
    const today = util.formatDate(new Date())
    const quickEntry = buildPeriodQuickEntry(state.collections.periods.records, {
      today,
      periodsSynced: state.collections.periods.synced,
      roomPaired: state.roomPaired
    })
    return {
      periodCount: state.collections.periods.records.length,
      periodGroups: this.periodProjection(state),
      periodQuickLabel: quickEntry.label,
      periodQuickMode: quickEntry.mode,
      periodQuickAriaLabel: quickEntry.ariaLabel,
      predictionThresholdText: cycle.buildPredictionThresholdText(state.collections.periods.records),
      memoryCount: state.collections.memories.records.length,
      memoryYearCount: state.collections.memories.records.filter(record => record.date.slice(0, 4) === today.slice(0, 4)).length,
      memoryGroups: this.memoryProjection(state)
    }
  },

  periodProjection(state) {
    const today = util.formatDate(new Date())
    const periods = [...state.collections.periods.records]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map(period => withAuthorLabel(cycle.decoratePeriod(period, { today }), state.roomPaired))
    return buildPeriodGroups(periods, this.periodMonthChoices, this.periodYearChoices)
  },

  memoryProjection(state) {
    const today = util.formatDate(new Date())
    const memories = [...state.collections.memories.records]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(memory => withAuthorLabel(memory, state.roomPaired))
    // 欢乐时光月份分组：展开状态由页面内存选择推导；行数据在收起时仍保留，
    // 由模板的读屏隐藏与禁点网格隔离，供 0fr / 1fr 连续伸缩（#274）。
    return memoryMonthGroups.applyMemoryMonthExpansion(
      memoryMonthGroups.buildMemoryMonthGroups(memories, { today }),
      this.memoryMonthChoices
    )
  },

  addPeriod() {
    const state = roomRecordsSync.readCurrentRoom()
    const periods = state.collections.periods.records
    const today = util.formatDate(new Date())
    const quickEntry = buildPeriodQuickEntry(periods, { today, periodsSynced: state.collections.periods.synced, roomPaired: state.roomPaired })
    let entry = quickEntry.action
    if (quickEntry.mode === 'complete') {
      const decision = periodCoverage.decidePeriodRecordForDate(periods, today, { today })
      const record = findRecordById('periods', decision.record && (decision.record._id || decision.record.id))
      if (!record) return
      entry = {
        url: recordEditRoute.buildPeriodEditUrl(withAuthorLabel(record, state.roomPaired), { intent: 'complete', today })
      }
    }
    wx.navigateTo({ url: entry.url })
  },

  togglePeriodYear(e) {
    const key = e.currentTarget.dataset.key
    const yearIndex = this.data.periodGroups.findIndex(group => group.key === key)
    if (yearIndex < 0) return
    const year = this.data.periodGroups[yearIndex]
    this.periodYearChoices = { ...this.periodYearChoices, [key]: !year.expanded }
    const next = this.periodProjection(roomRecordsSync.readCurrentRoom())[yearIndex]
    const root = `periodGroups[${yearIndex}]`
    const patch = {
      [`${root}.expanded`]: next.expanded,
      [`${root}.toggleLabel`]: next.toggleLabel,
      [`${root}.ariaLabel`]: next.ariaLabel
    }
    this.setData(patch)
  },

  togglePeriodMonth(e) {
    const key = e.currentTarget.dataset.key
    const yearIndex = this.data.periodGroups.findIndex(year => year.months.some(group => group.key === key))
    if (yearIndex < 0) return
    const monthIndex = this.data.periodGroups[yearIndex].months.findIndex(group => group.key === key)
    const month = this.data.periodGroups[yearIndex].months[monthIndex]
    this.periodMonthChoices = { ...this.periodMonthChoices, [key]: !month.expanded }
    const next = this.periodProjection(roomRecordsSync.readCurrentRoom())[yearIndex].months[monthIndex]
    const root = `periodGroups[${yearIndex}].months[${monthIndex}]`
    this.setData({
      [`${root}.expanded`]: next.expanded,
      [`${root}.toggleLabel`]: next.toggleLabel,
      [`${root}.ariaLabel`]: next.ariaLabel
    })
  },

  editPeriod(e) {
    const record = findRecordById('periods', e.currentTarget.dataset.id)
    if (!record) return
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(withAuthorLabel(record, roomRecordsSync.getState().roomPaired)) })
  },

  addMemory() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl({ date: today }) })
  },

  editMemory(e) {
    // 页面不持有记录副本：按行里的 id 从共享记录取被点的那条（#224）。
    const record = findRecordById('memories', e.currentTarget.dataset.id)
    if (!record) return
    wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl(withAuthorLabel(record, roomRecordsSync.getState().roomPaired)) })
  },

  // 点月份卡头：切换该月展开/收起，不跳转；网格过渡由模板类与共享时长驱动。
  // 手动选择记进页面内存，重载/切分段后仍保留；不写本地存储
  toggleMonth(e) {
    const key = e.currentTarget.dataset.key
    const index = this.data.memoryGroups.findIndex(group => group.key === key)
    if (index < 0) return
    const target = this.data.memoryGroups[index]
    this.memoryMonthChoices = {
      ...this.memoryMonthChoices,
      [key]: target.expanded ? memoryMonthGroups.COLLAPSED : memoryMonthGroups.EXPANDED
    }
    const nextGroups = this.memoryProjection(roomRecordsSync.readCurrentRoom())
    const patch = {}
    nextGroups.forEach((next, nextIndex) => {
      const current = this.data.memoryGroups[nextIndex]
      if (current.expanded === next.expanded && current.ariaLabel === next.ariaLabel) return
      const root = `memoryGroups[${nextIndex}]`
      patch[`${root}.expanded`] = next.expanded
      patch[`${root}.ariaLabel`] = next.ariaLabel
    })
    this.setData(patch)
  },

  showSyncStatus(text, options = {}) {
    syncPill(this).show(text, options)
  },

  hideSyncStatus() {
    syncPill(this).hide()
  }
}))

function changedFields(data, update) {
  return Object.fromEntries(Object.entries(update).filter(([key, value]) => !Object.is(data[key], value)))
}

// 一个分段的状态：首次加载中画骨架；未同步的分段遇到任何一次加载（重试、下拉、显示时的刷新）也画骨架，另一段已同步
// 让这次加载静默时，被点的重试仍看得见在读（决定 23）。没有加载在跑时，未同步（读取失败，或 Room 被拦下）给失败画面
// 与重试；已同步、最近一次刷新失败的给行内重试并保留列表
function segmentState(state, collection, keys) {
  const { synced } = state.collections[collection]
  const loading = state.loading || (!synced && state.refreshing)
  return {
    [keys.loading]: loading,
    [keys.loaded]: synced,
    [keys.failed]: !loading && (!synced || state.failedCollections.includes(collection))
  }
}

// 周期概览只按已同步的经期计算：未同步时平均值留空，模板显示占位（--）
function periodStats({ records, synced }) {
  if (!synced) return { avgCycle: null, avgDuration: null }
  const prediction = cycle.predictNextPeriod(records)
  // 预测持续时长落在五天默认档时不冒充已知统计，只退回已完成记录的平均
  const predictedDuration = prediction.canPredict && prediction.durationSource !== 'default'
    ? prediction.avgDuration
    : null
  return {
    avgCycle: prediction.canPredict ? prediction.avgCycle : null,
    avgDuration: predictedDuration || calculateAverageDuration(records)
  }
}

// 列表已按开始日稳定倒序；跨月记录只按开始年月出现一次。
function buildPeriodGroups(periods, choices, yearChoices) {
  const years = []
  for (const record of periods) {
    const key = record.startDate.slice(0, 7)
    const yearKey = key.slice(0, 4)
    let year = years[years.length - 1]
    if (!year || year.key !== yearKey) {
      const expanded = yearChoices[yearKey] !== false
      const toggleLabel = expanded ? '收起' : '展开'
      year = {
        key: yearKey, title: `${yearKey}年`, expanded, toggleLabel,
        ariaLabel: `${yearKey}年，${expanded ? '已展开' : '已收起'}，${toggleLabel}经期记录`,
        months: []
      }
      years.push(year)
    }
    let month = year.months[year.months.length - 1]
    if (!month || month.key !== key) {
      const title = `${Number(key.slice(5))}月`
      const expanded = choices[key] !== false
      const toggleLabel = expanded ? '收起' : '展开'
      month = {
        key, title, expanded, toggleLabel, count: 0,
        ariaLabel: `${yearKey}年${title}，${expanded ? '已展开' : '已收起'}，${toggleLabel}经期记录`,
        records: []
      }
      year.months.push(month)
    }
    month.count += 1
    month.countText = util.formatQuantity(month.count, '条')
    month.records.push(record)
  }
  return years
}

function findRecordById(collection, id) {
  if (!id) return null
  return roomRecordsSync.readCurrentRoom().collections[collection].records
    .find(record => (record._id || record.id) === id) || null
}

// 记录作者随列表的同一次渲染给出：共享记录的配对状态是已配对时带「我记的 / TA 记的」，未配对或状态未知时不带
function withAuthorLabel(record, paired) {
  const authorLabel = cycle.recordAuthorLabel(record, { paired })
  return authorLabel ? { ...record, authorLabel } : record
}

function calculateAverageDuration(periods = []) {
  const durations = periods
    .map(cycle.getPeriodDuration)
    .filter(duration => duration > 0)

  if (!durations.length) return null
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return Math.round(total / durations.length)
}
