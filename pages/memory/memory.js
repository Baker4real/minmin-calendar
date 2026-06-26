const cloud = require('../../utils/cloud')
const util = require('../../utils/util')
const recordCommands = require('../../utils/recordCommands')
const recordEditRoute = require('../../utils/recordEditRoute')

Page({
  goBack() { wx.navigateBack() },
  data: { memories: [], loading: true },

  onShow() { return this.loadData() },

  async loadData() {
    const client = cloud.createRoomDataClient()
    await recordCommands.runRecordListLoad({
      page: this,
      itemsKey: 'memories',
      action: () => client.list('memories'),
      mapRecords: memories => [...memories].sort((a, b) => b.date.localeCompare(a.date)),
      retryableTitle: '加载失败，请检查网络',
      failureTitle: '加载失败'
    })
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
