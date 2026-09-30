const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const recordCommands = require('../../utils/recordCommands')
const recordEditRoute = require('../../utils/recordEditRoute')
const safeArea = require('../../utils/safeArea')

Page({
  goBack() { wx.switchTab({ url: '/pages/index/index' }) },
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), periods: [], avgCycle: null, avgDuration: null, loading: true, loadFailed: false, hasLoaded: false },

  onShow() { return this.loadData() },

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
