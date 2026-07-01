const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const recordCommands = require('../../utils/recordCommands')
const recordEditRoute = require('../../utils/recordEditRoute')

Page({
  goBack() { wx.navigateBack() },
  data: { periods: [], avgCycle: null, avgDuration: null, loading: true },

  onShow() { return this.loadData() },

  async loadData() {
    const client = cloud.createRoomDataClient()
    await recordCommands.runRecordListLoad({
      page: this,
      itemsKey: 'periods',
      action: () => client.list('periods'),
      mapRecords: periods => [...periods]
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .map(cycle.decoratePeriod),
      onLoaded: periods => this.calcStats(periods),
      retryableTitle: '加载失败，请检查网络',
      failureTitle: '加载失败'
    })
  },

  calcStats(periods) {
    const prediction = cycle.predictNextPeriod(periods)
    this.setData({ avgCycle: prediction.canPredict ? prediction.avgCycle : null })
    this.setData({ avgDuration: prediction.avgDuration || calculateAverageDuration(periods) })
  },

  addPeriod() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl({ startDate: today, endDate: today }) })
  },

  editPeriod(e) {
    const p = this.data.periods[e.currentTarget.dataset.index]
    wx.navigateTo({ url: recordEditRoute.buildPeriodEditUrl(p) })
  }
})

function calculateAverageDuration(periods = []) {
  const durations = periods
    .map(getValidPeriodDuration)
    .filter(duration => duration > 0)

  if (!durations.length) return null
  const total = durations.reduce((sum, duration) => sum + duration, 0)
  return Math.round(total / durations.length)
}

function getValidPeriodDuration(period) {
  const range = util.normalizeDateRange(period)
  if (!range) return null

  const duration = Number(period.duration)
  if (range.hasEndDate && Number.isFinite(duration) && duration > 0) return Math.round(duration)
  return util.daysBetween(util.parseDate(range.startDate), util.parseDate(range.endDate)) + 1
}
