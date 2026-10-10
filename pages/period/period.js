const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const recordCommands = require('../../utils/recordCommands')
const recordEditRoute = require('../../utils/recordEditRoute')
const memoryMonthGroups = require('../../utils/memoryMonthGroups')
const safeArea = require('../../utils/safeArea')

// 与 pages/period/edit/edit.js、pages/memory/edit/edit.js 共享的
// 一次性「目标分段」意图键：switchTab 不能带 query，入口先写键，本页 onShow 消费并立即清除（issue #103）
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'

Page({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), navBarHeight: safeArea.getNavBarHeight(), capsuleRight: safeArea.getCapsuleRightInset(), segment: 'period', periods: [], avgCycle: null, avgDuration: null, loading: true, loadFailed: false, hasLoaded: false, memories: [], memoryGroups: [], memoryLoading: false, memoryLoadFailed: false, memoryHasLoaded: false },

  // 欢乐时光月份卡的展开选择（issue #109）：页面内存按月份键记「用户点过卡头」的月份，
  // 值为 memoryMonthGroups.EXPANDED / COLLAPSED；没点过的月份走默认规则（只展开最近一个有记录的月份）。
  // 不写本地存储，小程序重启后自然恢复默认
  memoryMonthChoices: {},

  onShow() {
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
    let segment = ''
    try {
      segment = wx.getStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY)
    } catch (e) {}
    if (segment !== 'period' && segment !== 'memory') return
    try {
      wx.removeStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY)
    } catch (e) {}
    this.setData({ segment })
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
      this.setData({ segment: 'period' })
    }
  },

  async loadData() {
    const client = cloud.createRoomDataClient()
    const today = util.formatDate(new Date())
    await recordCommands.runRecordListLoad({
      page: this,
      itemsKey: 'periods',
      action: () => client.list('periods'),
      mapRecords: periods => [...periods]
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map(period => cycle.decoratePeriod(period, { today })),
      onLoaded: periods => {
        this.calcStats(periods)
        this.setData({ hasLoaded: true })
      },
      retryableTitle: '加载失败，请检查网络',
      failureTitle: '加载失败'
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
      action: () => client.list('memories'),
      mapRecords: memories => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
      onLoaded: memories => {
        // 列表加载成功后产出月份分组（issue #108）；失败路径不清 memories，分组同样保留上次的。
        // 展开状态由页面内存的手动选择推导（issue #109）：重载后手动选择保留，没点过的月份走默认规则
        this.setData({
          memoryHasLoaded: true,
          memoryGroups: memoryMonthGroups.applyMemoryMonthExpansion(
            memoryMonthGroups.buildMemoryMonthGroups(memories, { today }),
            this.memoryMonthChoices
          )
        })
      },
      retryableTitle: '加载失败，请检查网络',
      failureTitle: '加载失败'
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
    // 已有进行中的记录时，重复新增重开原记录（进入原记录编辑页），不建第二条
    const ongoing = cycle.findOngoingPeriod(this.data.periods)
    if (ongoing) {
      wx.showToast({ title: '已有进行中的经期，继续编辑它', icon: 'none' })
      wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(ongoing) })
      return
    }
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: today }) })
  },

  editPeriod(e) {
    const p = this.data.periods[e.currentTarget.dataset.index]
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(p) })
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
})

// 欢乐时光月份分组内的记录查找：返回带 _id/date/note 的行数据，找不到返回 null（不撞出空表单）
function findMemoryRecordById(groups, id) {
  for (const group of groups) {
    const record = group.records.find(item => item._id === id)
    if (record) return record
  }
  return null
}

function calculateAverageDuration(periods = []) {
  const durations = periods
    .map(cycle.getPeriodDuration)
    .filter(duration => duration > 0)

  if (!durations.length) return null
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return Math.round(total / durations.length)
}
