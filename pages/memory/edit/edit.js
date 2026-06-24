const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')

Page({
  data: { id: '', date: '', note: '', isEdit: false, saving: false },

  onLoad(options) {
    this.setData({
      date: options.date || util.formatDate(new Date()),
      note: options.note ? decodeURIComponent(options.note) : '',
      isEdit: !!options.id, id: options.id || ''
    })
  },

  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  goBack() {
    wx.navigateBack()
  },

  async save() {
    const { id, date, note, isEdit } = this.data
    if (!date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    this.setData({ saving: true })
    try {
      let res
      if (isEdit) {
        res = await cloud.updateMemory(id, { date, note })
      } else {
        res = await cloud.addMemory({ date, note })
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
            const r = await cloud.deleteMemory(this.data.id)
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
