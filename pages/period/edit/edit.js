const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const cycle = require('../../../utils/cycle')
const recordCommands = require('../../../utils/recordCommands')

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
    const payload = cycle.buildPeriodPayload({ startDate, endDate, note, flow, symptoms })
    const client = cloud.createRoomDataClient()
    await recordCommands.runRecordSave({
      page: this,
      action: () => {
        if (isEdit) {
          return client.update('periods', id, payload)
        }
        return client.add('periods', payload)
      },
      validate: () => {
        if (!startDate || !endDate) return '请选择日期'
        if (startDate > endDate) return '结束日期不能早于开始'
        return ''
      },
      successTitle: '保存成功',
      failureTitle: '保存失败'
    })
  },

  delete() {
    const client = cloud.createRoomDataClient()
    return recordCommands.runRecordDelete({
      page: this,
      action: () => client.remove('periods', this.data.id),
      confirmTitle: '确认删除',
      successTitle: '已删除',
      failureTitle: '删除失败'
    })
  }
})
