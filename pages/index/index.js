const util = require('../../utils/util')
const cloud = require('../../utils/cloud')
const cycle = require('../../utils/cycle')

Page({
  data: {
    year: 0, month: 0, days: [],
    weekDays: ['日','一','二','三','四','五','六'],
    periods: [], memories: [],
    avgCycle: null,
    avgDuration: null,
    nextPredict: null,
    nextPredictDisplay: '--',
    nextPredictWeekday: '',
    predictionRangeDisplay: '',
    predictionWindow: null,
    predictConfidence: null,
    cycleReminders: [],
    loading: true, noRoom: false
  },

  onLoad() {
    const now = new Date()
    this.setData({ year: now.getFullYear(), month: now.getMonth() })
  },

  onShow() {
    const roomCode = cloud.getRoomCode()
    if (!roomCode) {
      this.setData({ noRoom: true, loading: false })
      return
    }
    this.setData({ noRoom: false })
    // 并发防护：如果已有加载中的请求，复用其 Promise
    if (!this._loadingPromise) {
      this._loadingPromise = this.loadData()
    }
  },

  async loadData() {
    this.setData({ loading: true })
    try {
      const [periods, memories] = await Promise.all([
        cloud.getPeriods(),
        cloud.getMemories()
      ])
      this.setData({ periods, memories })
      this.calcStats(periods)
      // ⚠️ 关键修复：数据加载后重新渲染日历网格
      this.renderCalendar()
    } catch (e) {
      console.error('load error', e)
      wx.showToast({ title: '数据加载失败，请检查网络', icon: 'none' })
    }
    this.setData({ loading: false })
    this._loadingPromise = null
  },

  calcStats(periods) {
    const prediction = cycle.predictNextPeriod(periods)
    if (!prediction.canPredict) {
      this.setData({
        avgCycle: null,
        avgDuration: null,
        nextPredict: null,
        nextPredictDisplay: '--',
        nextPredictWeekday: '',
        predictionRangeDisplay: '',
        predictionWindow: null,
        predictConfidence: null,
        cycleReminders: []
      })
      return
    }

    this.setData({
      avgCycle: prediction.avgCycle,
      avgDuration: prediction.avgDuration,
      nextPredict: prediction.nextStart,
      nextPredictDisplay: prediction.nextDisplay,
      nextPredictWeekday: prediction.nextWeekday,
      predictionRangeDisplay: prediction.rangeDisplay,
      predictionWindow: {
        rangeStart: prediction.rangeStart,
        rangeEnd: prediction.rangeEnd
      },
      predictConfidence: prediction.confidenceText,
      cycleReminders: cycle.buildCycleReminders(prediction, periods)
    })
  },

  renderCalendar() {
    const { year, month, periods, memories, predictionWindow } = this.data
    const today = util.formatDate(new Date())
    const days = util.buildCalendarDays({ year, month, periods, memories, nextPredict: this.data.nextPredict, predictionWindow, today })
    this.setData({ days })
  },

  prevMonth() {
    let { year, month } = this.data
    month--; if (month < 0) { month = 11; year-- }
    this.setData({ year, month })
    setTimeout(() => this.renderCalendar(), 200)
  },

  nextMonth() {
    let { year, month } = this.data
    month++; if (month > 11) { month = 0; year++ }
    this.setData({ year, month })
    setTimeout(() => this.renderCalendar(), 200)
  },

  goBind() { wx.redirectTo({ url: '/pages/bind/bind' }) },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date
    if (!date) return
    wx.showActionSheet({
      itemList: ['记录经期', '欢乐时光', '查看详情'],
      success: (res) => {
        if (res.tapIndex === 0) wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${date}&endDate=${date}` })
        else if (res.tapIndex === 1) wx.navigateTo({ url: `/pages/memory/edit/edit?date=${date}` })
        else if (res.tapIndex === 2) this.showDayDetail(date)
      }
    })
  },

  showDayDetail(date) {
    const { periods, memories } = this.data
    let msg = `📅 ${date}\n`
    periods.filter(p => date >= p.startDate && date <= p.endDate).forEach(p => {
      const detail = cycle.decoratePeriod(p)
      msg += `\n🩸 经期: ${p.startDate} ~ ${p.endDate}`
      if (detail.flowLabel) msg += `\n经量: ${detail.flowLabel}`
      if (detail.symptomText) msg += `\n状态: ${detail.symptomText}`
    })
    memories.filter(m => m.date === date).forEach(m => {
      msg += `\n❤️ 欢乐时光: ${m.note || '特别日子'}`
    })
    if (msg === `📅 ${date}\n`) msg += '\n当天无记录'
    wx.showModal({ title: '详情', content: msg, showCancel: false })
  },

  // 快速操作
  quickPeriod() {
    const now = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${now}&endDate=${now}` })
  },
  onReminderTap(e) {
    const reminder = this.data.cycleReminders[e.currentTarget.dataset.index]
    if (!reminder || reminder.action !== 'quickPeriod') return
    wx.navigateTo({ url: `/pages/period/edit/edit?startDate=${reminder.date}&endDate=${reminder.date}` })
  },
  quickMemory() {
    const now = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/memory/edit/edit?date=${now}` })
  }
})
