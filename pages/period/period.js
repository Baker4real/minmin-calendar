const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const recordCommands = require('../../utils/recordCommands')
const recordEditRoute = require('../../utils/recordEditRoute')
const safeArea = require('../../utils/safeArea')

// 与 pages/settings/settings.js、pages/period/edit/edit.js、pages/memory/edit/edit.js 共享的
// 一次性「目标分段」意图键：switchTab 不能带 query，入口先写键，本页 onShow 消费并立即清除（issue #103）
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'

Page({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), segment: 'period', periods: [], avgCycle: null, avgDuration: null, loading: true, loadFailed: false, hasLoaded: false, memories: [], memoryLoading: false, memoryLoadFailed: false, memoryHasLoaded: false },

  onShow() {
    this.consumeSegmentIntent()
    return this.data.segment === 'memory' ? this.loadMemoryData() : this.loadData()
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
    await recordCommands.runRecordListLoad({
      page: this,
      itemsKey: 'memories',
      loadingKey: 'memoryLoading',
      loadFailedKey: 'memoryLoadFailed',
      action: () => client.list('memories'),
      mapRecords: memories => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
      onLoaded: () => {
        this.setData({ memoryHasLoaded: true })
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
    const m = this.data.memories[e.currentTarget.dataset.index]
    wx.navigateTo({ url: recordEditRoute.buildMemoryEditUrl(m) })
  }
})

function calculateAverageDuration(periods = []) {
  const durations = periods
    .map(cycle.getPeriodDuration)
    .filter(duration => duration > 0)

  if (!durations.length) return null
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return Math.round(total / durations.length)
}
