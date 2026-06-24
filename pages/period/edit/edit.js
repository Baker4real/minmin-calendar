const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const cycle = require('../../../utils/cycle')

Page({
  data: {
    id: '',
    startDate: '',
    endDate: '',
    note: '',
    flow: '',
    symptoms: [],
    flowOptions: cycle.FLOW_OPTIONS,
    symptomOptions: cycle.buildSymptomOptions(),
    isEdit: false,
    saving: false
  },

  onLoad(options) {
    const symptoms = options.symptoms ? decodeURIComponent(options.symptoms).split(',').filter(Boolean) : []
    this.setData({
      startDate: options.startDate || util.formatDate(new Date()),
      endDate: options.endDate || util.formatDate(new Date()),
      note: options.note ? decodeURIComponent(options.note) : '',
      flow: options.flow || '',
      symptoms,
      symptomOptions: cycle.buildSymptomOptions(symptoms),
      isEdit: !!options.id, id: options.id || ''
    })
  },

  onStartChange(e) {
    this.setData({ startDate: e.detail.value })
    if (this.data.startDate > this.data.endDate) this.setData({ endDate: this.data.startDate })
  },
  onEndChange(e) { this.setData({ endDate: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },
  selectFlow(e) {
    const flow = e.currentTarget.dataset.value
    this.setData({ flow: this.data.flow === flow ? '' : flow })
  },
  toggleSymptom(e) {
    const value = e.currentTarget.dataset.value
    const selected = new Set(this.data.symptoms)
    if (selected.has(value)) selected.delete(value)
    else selected.add(value)
    const symptoms = Array.from(selected)
    this.setData({
      symptoms,
      symptomOptions: cycle.buildSymptomOptions(symptoms)
    })
  },

  goBack() {
    wx.navigateBack()
  },

  async save() {
    const { id, startDate, endDate, note, flow, symptoms, isEdit } = this.data
    if (!startDate || !endDate) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    if (startDate > endDate) { wx.showToast({ title: '结束日期不能早于开始', icon: 'none' }); return }
    this.setData({ saving: true })
    const payload = cycle.buildPeriodPayload({ startDate, endDate, note, flow, symptoms })
    try {
      let res
      if (isEdit) {
        res = await cloud.updatePeriod(id, payload)
      } else {
        res = await cloud.addPeriod(payload)
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
