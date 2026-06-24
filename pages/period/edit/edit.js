const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')

Page({
  data: { id: '', startDate: '', endDate: '', note: '', isEdit: false, saving: false },

  onLoad(options) {
    this.setData({
      startDate: options.startDate || util.formatDate(new Date()),
      endDate: options.endDate || util.formatDate(new Date()),
      note: options.note ? decodeURIComponent(options.note) : '',
      isEdit: !!options.id, id: options.id || ''
    })
  },

  onStartChange(e) {
    this.setData({ startDate: e.detail.value })
    if (this.data.startDate > this.data.endDate) this.setData({ endDate: this.data.startDate })
  },
  onEndChange(e) { this.setData({ endDate: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  goBack() {
    wx.navigateBack()
  },

  async save() {
    const { id, startDate, endDate, note, isEdit } = this.data
    if (!startDate || !endDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    if (startDate > endDate) { wx.showToast({ title: '结束日期不能早于开始', icon: 'none' }); return }
    this.setData({ saving: true })
    const duration = util.daysBetween(util.parseDate(startDate), util.parseDate(endDate)) + 1
    try {
      let res
      if (isEdit) {
        res = await cloud.updatePeriod(id, { startDate, endDate, note, duration })
      } else {
        res = await cloud.addPeriod({ startDate, endDate, note, duration })
      }
      if (res.result && res.result.code === 0) {
        wx.showToast({ title: '保存成功' })
        setTimeout(() => wx.navigateBack(), 1000)
      } else {
        wx.showToast({ title: res.result?.msg || '保存失败', icon: 'error' })
      }
    } catch(e) {
      wx.showToast({ title: '保存失败', icon: 'error' })
    }
    this.setData({ saving: false })
  },

  delete() {
    wx.showModal({
      title: '确认删除',
      success: async (res) => {
        if (res.confirm) {
          try {
            const r = await cloud.deletePeriod(this.data.id)
            if (r.result && r.result.code === 0) {
              wx.showToast({ title: '已删除' })
              setTimeout(() => wx.navigateBack(), 1000)
            }
          } catch(e) { wx.showToast({ title: '删除失败', icon: 'error' }) }
        }
      }
    })
  }
})
