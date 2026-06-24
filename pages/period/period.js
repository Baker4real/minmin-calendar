const util = require('../../utils/util')
const cloud = require('../../utils/cloud')

Page({
  goBack() { wx.navigateBack() },
  data: { periods: [], avgCycle: null, avgDuration: null, loading: true },

  onShow() { this.loadData() },

  async loadData() {
    this.setData({ loading: true })
    try {
      const periods = await cloud.getPeriods()
      const sorted = [...periods].sort((a,b) => b.startDate.localeCompare(a.startDate))
      this.setData({ periods: sorted })
      this.calcStats(periods)
    } catch(e) { console.error(e) }
    this.setData({ loading: false })
  },

  calcStats(periods) {
    if (periods.length >= 2) {
      const sorted = [...periods].sort((a,b) => a.startDate.localeCompare(b.startDate))
      const recent = sorted.slice(-3)
      const gaps = []
      for (let i = 1; i < recent.length; i++) {
        gaps.push(util.daysBetween(util.parseDate(recent[i-1].startDate), util.parseDate(recent[i].startDate)))
      }
      if (gaps.length > 0) this.setData({ avgCycle: Math.round(gaps.reduce((a,b) => a+b,0) / gaps.length) })
    }
    if (periods.length > 0) {
      const total = periods.reduce((s, p) => s + (p.duration || 0), 0)
      this.setData({ avgDuration: Math.round(total / periods.length) })
    }
  },

  addPeriod() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${today}&endDate=${today}` })
  },

  editPeriod(e) {
    const p = this.data.periods[e.currentTarget.dataset.index]
    wx.navigateTo({
      url: `/pages/period/edit/edit?id=${p._id}&startDate=${p.startDate}&endDate=${p.endDate}&note=${encodeURIComponent(p.note||'')}`
    })
  }
})
