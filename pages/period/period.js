const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')
const recordCommands = require('../../utils/recordCommands')

Page({
  goBack() { wx.navigateBack() },
  data: { periods: [], avgCycle: null, avgDuration: null, loading: true },

  onShow() { this.loadData() },

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
    if (periods.length === 0) {
      this.setData({ avgDuration: null })
      return
    }
    if (periods.length > 0) {
      const total = periods.reduce((s, p) => s + (p.duration || 0), 0)
      this.setData({ avgDuration: prediction.avgDuration || Math.round(total / periods.length) })
    }
  },

  addPeriod() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${today}&endDate=${today}` })
  },

  editPeriod(e) {
    const p = this.data.periods[e.currentTarget.dataset.index]
    const symptoms = encodeURIComponent((p.symptoms || []).join(','))
    wx.navigateTo({
      url: `/pages/period/edit/edit?id=${p._id}&startDate=${p.startDate}&endDate=${p.endDate}&note=${encodeURIComponent(p.note||'')}&flow=${p.flow || ''}&symptoms=${symptoms}`
    })
  }
})
