const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const periodCoverage = require('../../utils/periodCoverage')
const recordCommands = require('../../utils/recordCommands')
const recordPageSync = require('../../utils/recordPageSync')
const recordEditRoute = require('../../utils/recordEditRoute')
const memoryMonthGroups = require('../../utils/memoryMonthGroups')
const { adoptListedRoomStatus } = require('../../utils/roomRecordsSync')
const safeArea = require('../../utils/safeArea')
const { restoreTabBarOnShow } = require('../../utils/sheetLifecycle')
const { withPageVisibility } = require('../../utils/pageVisibility')

Page(withPageVisibility({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), navBarHeight: safeArea.getNavBarHeight(), capsuleRight: safeArea.getCapsuleRightInset(), segment: 'period', periods: [], periodGroups: [], avgCycle: null, avgDuration: null, loading: true, loadFailed: false, hasLoaded: false, memories: [], memoryGroups: [], memoryLoading: false, memoryLoadFailed: false, memoryHasLoaded: false },

  // 欢乐时光月份卡的展开选择（issue #109）：页面内存按月份键记「用户点过卡头」的月份，
  // 值为 memoryMonthGroups.EXPANDED / COLLAPSED；没点过的月份走默认规则（展开最近三个有记录的月份）。
  // 不写本地存储，小程序重启后自然恢复默认
  memoryMonthChoices: {},
  periodMonthChoices: {},
  periodYearChoices: {},

  onShow() {
    // 本页没有弹层：别的页面在弹层开着时被卸载留下的隐藏 tabBar，在这里交还
    restoreTabBarOnShow(this)
    this.consumeSegmentIntent()
    return this.data.segment === 'memory' ? this.loadMemoryData() : this.loadData()
  },

  onPullDownRefresh() {
    const task = this.data.segment === 'memory' ? this.loadMemoryData() : this.loadData()
    const stop = () => {
      if (typeof wx.stopPullDownRefresh === 'function') wx.stopPullDownRefresh()
    }
    return Promise.resolve(task).then(stop, stop)
  },

  consumeSegmentIntent() {
    const segment = recordPageSync.consumeRecordTabSegmentIntent()
    if (segment) this.setData({ segment })
  },

  selectSegment(e) {
    const segment = e.currentTarget.dataset.segment
    if (segment !== 'period' && segment !== 'memory') return
    if (segment === this.data.segment) return
    this.setData({ segment })
    return segment === 'memory' ? this.loadMemoryData() : this.loadData()
  },

  // 编辑页保存/删除后在返回定时器前同步通知（recordPageSync seam）：落到被改动记录所属分段
  applyRecordChange(change) {
    if (!change) return
    if (change.collection === 'memories') {
      // 保存后自动展开（issue #109）：新增/修改把记录所在月份设为展开，
      // 按月份键记进页面内存，返回后的重载里保持展开；删除（record 只有 _id）不改展开状态
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
  },

  async loadData() {
    const client = cloud.createRoomDataClient()
    const today = util.formatDate(new Date())
    await recordCommands.runRecordListLoad({
      page: this,
      itemsKey: 'periods',
      action: () => listAdoptingRoomStatus(this, client, 'periods'),
      mapRecords: periods => [...periods]
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map(period => withAuthorLabel(this, cycle.decoratePeriod(period, { today }))),
      onLoaded: periods => {
        this.calcStats(periods)
        this.setData({ hasLoaded: true, periodGroups: buildPeriodGroups(this.data.periods, this.periodMonthChoices, this.periodYearChoices) })
      }
    })
  },

  async loadMemoryData() {
    const client = cloud.createRoomDataClient()
    const today = util.formatDate(new Date())
    await recordCommands.runRecordListLoad({
      page: this,
      itemsKey: 'memories',
      loadingKey: 'memoryLoading',
      loadFailedKey: 'memoryLoadFailed',
      action: () => listAdoptingRoomStatus(this, client, 'memories'),
      mapRecords: memories => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
      onLoaded: memories => {
        // 列表加载成功后产出月份分组（issue #108）；失败路径不清 memories，分组同样保留上次的。
        // 展开状态由页面内存的手动选择推导（issue #109）：重载后手动选择保留，没点过的月份走默认规则
        this.setData({
          memoryHasLoaded: true,
          memoryGroups: memoryMonthGroups.applyMemoryMonthExpansion(
            memoryMonthGroups.buildMemoryMonthGroups(memories.map(memory => withAuthorLabel(this, memory)), { today }),
            this.memoryMonthChoices
          )
        })
      }
    })
  },

  calcStats(periods) {
    const prediction = cycle.predictNextPeriod(periods)
    this.setData({ avgCycle: prediction.canPredict ? prediction.avgCycle : null })
    // 预测持续时长落在五天默认档时不冒充已知统计，只退回已完成记录的平均
    const predictedDuration = prediction.canPredict && prediction.durationSource !== 'default'
      ? prediction.avgDuration
      : null
    this.setData({ avgDuration: predictedDuration || calculateAverageDuration(periods) })
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
    // 分组后行不再对应扁平下标：按记录 id 在月份分组里找到被点的那条（issue #108）
    const record = findMemoryRecordById(this.data.memoryGroups, e.currentTarget.dataset.id)
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

// 欢乐时光月份分组内的记录查找：返回带 _id/date/note 的行数据，找不到返回 null（不撞出空表单）
function findMemoryRecordById(groups, id) {
  for (const group of groups) {
    const record = group.records.find(item => item._id === id)
    if (record) return record
  }
  return null
}

// 配对状态只来自列表结果（#191），规则与首页同步共用 adoptListedRoomStatus。记录 tab 还没接上共享记录（#194），
// 先由页面记住列表上一次带回的房间码与配对状态；结果先记下再交给 runRecordListLoad，这一次的行就按它渲染
async function listAdoptingRoomStatus(page, client, collection) {
  const outcome = await client.list(collection)
  page._listedRoom = adoptListedRoomStatus(page._listedRoom, outcome)
  return outcome
}

// 记录作者随列表的同一次渲染给出：已配对时带「我记的 / TA 记的」，未配对或状态未知时不带
function withAuthorLabel(page, record) {
  const paired = Boolean(page._listedRoom && page._listedRoom.roomStatus === 'paired')
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
