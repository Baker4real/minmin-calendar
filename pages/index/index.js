const util = require('../../utils/util')
const cloud = require('../../utils/cloud')

Page({
  data: {
    year: 0, month: 0, days: [],
    weekDays: ['日','一','二','三','四','五','六'],
    periods: [], memories: [],
    avgCycle: null, nextPredict: null, nextPredictDisplay: '--', nextPredictWeekday: '', predictConfidence: null,
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
      const periods = await cloud.getPeriods()
      const memories = await cloud.getMemories()
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
    if (periods.length < 2) {
      this.setData({ avgCycle: null, nextPredict: null, nextPredictDisplay: '--', nextPredictWeekday: '', predictConfidence: null })
      return
    }
    const sorted = [...periods].sort((a, b) => a.startDate.localeCompare(b.startDate))
    const gaps = []
    for (let i = 1; i < sorted.length; i++) {
      const d1 = util.parseDate(sorted[i-1].startDate)
      const d2 = util.parseDate(sorted[i].startDate)
      gaps.push(util.daysBetween(d1, d2))
    }
    // 异常值过滤：去掉偏离均值超过7天的值
    const rawAvg = gaps.reduce((a,b) => a+b, 0) / gaps.length
    const filtered = gaps.filter(g => Math.abs(g - rawAvg) <= 7)
    if (filtered.length === 0) {
      this.setData({ avgCycle: Math.round(rawAvg), nextPredict: '--', nextPredictDisplay: '--', nextPredictWeekday: '', predictConfidence: '低' })
      return
    }

    // 加权平均：最近几次权重递增
    const recent = filtered.slice(-3)
    const weights = [1, 2, 3].slice(3 - recent.length)
    const weightedAvg = Math.round(recent.reduce((s, g, i) => s + g * weights[i], 0) / weights.reduce((a,b) => a+b, 0))

    const last = util.parseDate(sorted[sorted.length-1].startDate)
    const next = new Date(last); next.setDate(next.getDate() + weightedAvg)
    const nextPredict = util.formatDate(next)
    const predictDisplay = util.formatPredictDisplay(nextPredict)

    // 置信度
    const confidence = filtered.length >= 4 ? '高' : filtered.length >= 2 ? '中' : '低'
    this.setData({
      avgCycle: weightedAvg,
      nextPredict,
      nextPredictDisplay: predictDisplay.date,
      nextPredictWeekday: predictDisplay.weekday,
      predictConfidence: confidence
    })
  },

  renderCalendar() {
    const { year, month, periods, memories } = this.data
    const today = util.formatDate(new Date())
    const days = util.buildCalendarDays({ year, month, periods, memories, nextPredict: this.data.nextPredict, today })
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
      msg += `\n🩸 经期: ${p.startDate} ~ ${p.endDate}`
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
  quickMemory() {
    const now = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/memory/edit/edit?date=${now}` })
  }
})
