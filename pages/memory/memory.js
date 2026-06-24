const cloud = require('../../utils/cloud')
const util = require('../../utils/util')

Page({
  goBack() { wx.navigateBack() },
  data: { memories: [], loading: true },

  onShow() { this.loadData() },

  async loadData() {
    this.setData({ loading: true })
    try {
      const memories = await cloud.getMemories()
      this.setData({ memories: [...memories].sort((a,b) => b.date.localeCompare(a.date)) })
    } catch(e) { console.error(e) }
    this.setData({ loading: false })
  },

  addMemory() {
    const today = util.formatDate(new Date())
    wx.navigateTo({ url: `/pages/memory/edit/edit?date=${today}` })
  },

  editMemory(e) {
    const m = this.data.memories[e.currentTarget.dataset.index]
    wx.navigateTo({
      url: `/pages/memory/edit/edit?id=${m._id}&date=${m.date}&note=${encodeURIComponent(m.note||'')}`
    })
  }
})
