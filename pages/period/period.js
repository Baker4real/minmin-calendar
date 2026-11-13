const util = require('../../utils/util')
const cycle = require('../../utils/cycle')
const periodCoverage = require('../../utils/periodCoverage')
const recordPageSync = require('../../utils/recordPageSync')
const recordEditRoute = require('../../utils/recordEditRoute')
const memoryMonthGroups = require('../../utils/memoryMonthGroups')
const roomAccessOutcome = require('../../utils/roomAccessOutcome')
const roomRecordsSync = require('../../utils/roomRecordsSync')
const wxPrompts = require('../../utils/wxPrompts')
const safeArea = require('../../utils/safeArea')
const { restoreTabBarOnShow } = require('../../utils/sheetLifecycle')
const { withPageVisibility } = require('../../utils/pageVisibility')

Page(withPageVisibility({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), navBarHeight: safeArea.getNavBarHeight(), capsuleRight: safeArea.getCapsuleRightInset(), segment: 'period', periods: [], periodGroups: [], avgCycle: null, avgDuration: null, loading: true, loadFailed: false, hasLoaded: false, memories: [], memoryGroups: [], memoryLoading: true, memoryLoadFailed: false, memoryHasLoaded: false },

  // 欢乐时光月份卡的展开选择（issue #109）：页面内存按月份键记「用户点过卡头」的月份，
  // 值为 memoryMonthGroups.EXPANDED / COLLAPSED；没点过的月份走默认规则（展开最近三个有记录的月份）。
  // 不写本地存储，小程序重启后自然恢复默认
  memoryMonthChoices: {},
  periodMonthChoices: {},
  periodYearChoices: {},

  // 全应用共用一份 Room 记录（#194）：加载时订阅、卸载时退订，订阅回调只更新渲染数据
  onLoad() {
    this._unsubscribeRecords = roomRecordsSync.subscribe((state, change) => this.renderRecords(state, change))
  },

  onUnload() {
    if (this._unsubscribeRecords) this._unsubscribeRecords()
  },

  onShow() {
    // 本页没有弹层：别的页面在弹层开着时被卸载留下的隐藏 tabBar，在这里交还
    restoreTabBarOnShow(this)
    this.consumeSegmentIntent()
    // 先请共享记录加载：它先按本机当前的房间码核对归属，换了 Room 就先清空，再按今天画一次手里的记录
    // （进行中经期的天数随日期走）；已读到过这个 Room 的记录时这次是静默刷新，显示时不等云应答
    const loaded = this.loadRecords()
    this.renderRecords(roomRecordsSync.getState(), { calendarChanged: true })
    return loaded
  },

  onPullDownRefresh() {
    const task = this.loadRecords()
    const stop = () => {
      if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh()
    }
    return Promise.resolve(task).then(stop, stop)
  },

  consumeSegmentIntent() {
    const segment = recordPageSync.consumeRecordTabSegmentIntent()
    if (segment) this.setData({ segment })
  },

  // 两个分段渲染同一份共享记录，切换分段不读取
  selectSegment(e) {
    const segment = e.currentTarget.dataset.segment
    if (segment !== 'period' && segment !== 'memory') return
    if (segment === this.data.segment) return
    this.setData({ segment })
  },

  // 编辑页保存/删除后在返回定时器前同步通知（recordPageSync seam）：落到被改动记录所属分段、展开保存结果所在月份，
  // 再把改动交给共享记录，首页和本页都不等自己的刷新就是新的
  applyRecordChange(change) {
    if (!change) return
    if (change.collection === 'memories') {
      // 保存后自动展开（issue #109）：新增/修改把记录所在月份设为展开，
      // 按月份键记进页面内存，之后的渲染里保持展开；删除（record 只有 _id）不改展开状态
      if ((change.mode === 'add' || change.mode === 'update') && change.record && change.record.date) {
        this.memoryMonthChoices = {
          ...this.memoryMonthChoices,
          [memoryMonthGroups.monthKey(change.record.date)]: memoryMonthGroups.EXPANDED
        }
      }
      this.setData({ segment: 'memory' })
    } else if (change.collection === 'periods') {
      if ((change.mode === 'add' || change.mode === 'update') && change.record && change.record.startDate) {
        this.periodMonthChoices = { ...this.periodMonthChoices, [change.record.startDate.slice(0, 7)]: true }
        this.periodYearChoices = { ...this.periodYearChoices, [change.record.startDate.slice(0, 4)]: true }
      }
      this.setData({ segment: 'period' })
    }
    roomRecordsSync.applyRecordChange(change)
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
  // 行只在显示时和记录或配对变化时（calendarChanged）重画，记录作者随同一次渲染给出；
  // 点按入口也只认渲染出来的行
  renderRecords(state, { calendarChanged = false } = {}) {
    const update = {
      ...segmentState(state, 'periods', { loading: 'loading', loaded: 'hasLoaded', failed: 'loadFailed' }),
      ...segmentState(state, 'memories', { loading: 'memoryLoading', loaded: 'memoryHasLoaded', failed: 'memoryLoadFailed' }),
      ...periodStats(state.collections.periods)
    }
    if (calendarChanged) Object.assign(update, this.recordRows(state))
    this.setData(update)
  },

  recordRows(state) {
    const today = util.formatDate(new Date())
    const paired = state.roomPaired
    const periods = [...state.collections.periods.records]
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map(period => withAuthorLabel(cycle.decoratePeriod(period, { today }), paired))
    const memories = [...state.collections.memories.records].sort((a, b) => b.date.localeCompare(a.date))
    return {
      periods,
      periodGroups: buildPeriodGroups(periods, this.periodMonthChoices, this.periodYearChoices),
      memories,
      // 欢乐时光月份分组（issue #108）；展开状态由页面内存的手动选择推导（issue #109）：没点过的月份走默认规则
      memoryGroups: memoryMonthGroups.applyMemoryMonthExpansion(
        memoryMonthGroups.buildMemoryMonthGroups(memories.map(memory => withAuthorLabel(memory, paired)), { today }),
        this.memoryMonthChoices
      )
    }
  },

  addPeriod() {
    const today = util.formatDate(new Date())
    const entry = periodCoverage.decidePeriodRecordForDate(this.data.periods, today, { today })
    // 记录 tab 只重开进行中；其余结果仍以今天新建，保存前再让用户选择重叠处理。
    if (entry.reason === 'ongoing') {
      wx.showToast({ title: entry.notice, icon: 'none' })
      wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(entry.record) })
      return
    }
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: today }) })
  },

  togglePeriodYear(e) {
    const key = e.currentTarget.dataset.key
    const year = this.data.periodGroups.find(group => group.key === key)
    if (!year) return
    this.periodYearChoices = { ...this.periodYearChoices, [key]: !year.expanded }
    this.setData({ periodGroups: buildPeriodGroups(this.data.periods, this.periodMonthChoices, this.periodYearChoices) })
  },

  togglePeriodMonth(e) {
    const key = e.currentTarget.dataset.key
    const month = this.data.periodGroups.flatMap(year => year.months).find(group => group.key === key)
    if (!month) return
    this.periodMonthChoices = { ...this.periodMonthChoices, [key]: !month.expanded }
    this.setData({ periodGroups: buildPeriodGroups(this.data.periods, this.periodMonthChoices, this.periodYearChoices) })
  },

  editPeriod(e) {
    const record = this.data.periods.find(period => period._id === e.currentTarget.dataset.id)
    if (!record) return
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(record) })
  },

  addMemory() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl({ date: today }) })
  },

  editMemory(e) {
    // 分组后行不再对应扁平下标：按记录 id 找到被点的那条（issue #108）
    const record = this.data.memories.find(memory => memory._id === e.currentTarget.dataset.id)
    if (!record) return
    wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl(record) })
  },

  // 点月份卡头：切换该月展开/收起，立即生效、无动画、不跳转（issue #109）。
  // 手动选择记进页面内存，重载/切分段后仍保留；不写本地存储
  toggleMonth(e) {
    const key = e.currentTarget.dataset.key
    const groups = this.data.memoryGroups
    const target = groups.find(group => group.key === key)
    if (!target) return
    this.memoryMonthChoices = {
      ...this.memoryMonthChoices,
      [key]: target.expanded ? memoryMonthGroups.COLLAPSED : memoryMonthGroups.EXPANDED
    }
    this.setData({
      memoryGroups: memoryMonthGroups.applyMemoryMonthExpansion(groups, this.memoryMonthChoices)
    })
  }
}))

// 一个分段的状态：首次加载中画骨架；未同步（从未读取成功，或 Room 被拦下）给失败画面与重试；
// 已同步、最近一次刷新失败的给行内重试并保留列表
function segmentState(state, collection, keys) {
  const { synced } = state.collections[collection]
  return {
    [keys.loading]: state.loading,
    [keys.loaded]: synced,
    [keys.failed]: !state.loading && (!synced || state.failedCollections.includes(collection))
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
        key, title, expanded, toggleLabel,
        ariaLabel: `${yearKey}年${title}，${expanded ? '已展开' : '已收起'}，${toggleLabel}经期记录`,
        records: []
      }
      year.months.push(month)
    }
    month.records.push(record)
  }
  return years
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
