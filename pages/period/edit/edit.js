const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const cycle = require('../../../utils/cycle')
const recordCommands = require('../../../utils/recordCommands')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordPageSync = require('../../../utils/recordPageSync')

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
    const routeState = recordEditRoute.parsePeriodEditOptions(options, {
      today: util.formatDate(new Date())
    })
    this.setData({
      ...routeState,
      symptomOptions: cycle.buildSymptomOptions(routeState.symptoms)
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
    const client = cloud.createRoomDataClient()
    let savedPayload = null
    const outcome = await recordCommands.runRecordSave({
      page: this,
      action: () => {
        const payload = cycle.buildPeriodPayload({ startDate, endDate, note, flow, symptoms })
        savedPayload = payload
        if (isEdit) {
          return client.update('periods', id, payload)
        }
        return client.add('periods', payload)
      },
      validate: () => {
        if (!startDate || !endDate) return '请选择日期'
        if (!util.isValidDateString(startDate) || !util.isValidDateString(endDate)) return '请选择有效日期'
        if (startDate > endDate) return '结束日期不能早于开始'
        return ''
      },
      successTitle: '保存成功',
      failureTitle: '保存失败'
    })
    if (outcome.kind === 'success' && savedPayload) {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'periods',
        mode: isEdit ? 'update' : 'add',
        record: {
          _id: recordPageSync.getSavedRecordId(outcome, id),
          ...savedPayload
        }
      })
    }
    return outcome
  },

  async delete() {
    const client = cloud.createRoomDataClient()
    const outcome = await recordCommands.runRecordDelete({
      page: this,
      action: () => client.remove('periods', this.data.id),
      confirmTitle: '确认删除',
      successTitle: '已删除',
      failureTitle: '删除失败'
    })
    if (outcome.kind === 'success') {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'periods',
        mode: 'remove',
        record: { _id: this.data.id }
      })
    }
    return outcome
  }
})
