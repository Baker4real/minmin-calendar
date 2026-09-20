const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const cycle = require('../../../utils/cycle')
const recordCommands = require('../../../utils/recordCommands')
const recordDraft = require('../../../utils/recordDraft')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordPageSync = require('../../../utils/recordPageSync')
const safeArea = require('../../../utils/safeArea')

const DRAFT_FIELDS = ['startDate', 'endDate', 'note', 'flow', 'symptoms']

Page({
  data: {
    safeTop: safeArea.getSafeTop(),
    id: '',
    startDate: '',
    endDate: '',
    note: '',
    flow: '',
    symptoms: [],
    flowOptions: cycle.FLOW_OPTIONS,
    symptomGroups: cycle.buildSymptomOptions(),
    isEdit: false,
    saving: false,
    deleting: false
  },

  onLoad(options) {
    const routeState = recordEditRoute.parsePeriodEditOptions(options, {
      today: util.formatDate(new Date())
    })
    const draftStorage = recordDraft.createWxDraftStorage(wx)
    const draftKey = recordDraft.buildDraftKey({ collection: 'periods', id: routeState.id })
    const storedDraft = recordDraft.readDraft(draftStorage, draftKey)
    const formState = storedDraft
      ? { ...routeState, ...recordDraft.pickDraftFields(storedDraft, DRAFT_FIELDS) }
      : routeState
    this._draftStorage = draftStorage
    this._draftKey = draftKey
    this._draftBaseline = recordDraft.pickDraftFields(routeState, DRAFT_FIELDS)
    this._draftDiscarded = false
    this.setData({
      ...formState,
      symptomGroups: cycle.buildSymptomOptions(formState.symptoms)
    })
    if (storedDraft) {
      wx.showToast({ title: '已恢复上次未完成的输入', icon: 'none' })
    }
  },

  onHide() {
    this.persistRecordDraft()
  },

  onUnload() {
    this.persistRecordDraft()
  },

  persistRecordDraft() {
    if (this._draftDiscarded || !this._draftStorage) return
    recordDraft.syncDraft(
      this._draftStorage,
      this._draftKey,
      recordDraft.pickDraftFields(this.data, DRAFT_FIELDS),
      this._draftBaseline
    )
  },

  discardRecordDraft() {
    this._draftDiscarded = true
    if (this._draftStorage) recordDraft.clearDraft(this._draftStorage, this._draftKey)
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
      symptomGroups: cycle.buildSymptomOptions(symptoms)
    })
  },

  goBack() {
    wx.navigateBack()
  },

  async save() {
    if (this.data.saving || this.data.deleting) return
    const { id, startDate, endDate, note, flow, symptoms, isEdit } = this.data
    const client = cloud.createRoomDataClient()
    const outcome = await recordCommands.runRecordSave({
      page: this,
      action: () => {
        const payload = cycle.buildPeriodPayload({ startDate, endDate, note, flow, symptoms })
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
    if (outcome && outcome.kind === 'success') {
      this.discardRecordDraft()
    }
    const savedRecord = recordPageSync.getSavedRecord(outcome)
    if (savedRecord) {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'periods',
        mode: isEdit ? 'update' : 'add',
        record: savedRecord
      })
    }
    return outcome
  },

  async delete() {
    if (this.data.deleting) return
    const client = cloud.createRoomDataClient()
    const outcome = await recordCommands.runRecordDelete({
      page: this,
      action: () => client.remove('periods', this.data.id),
      confirmTitle: '确认删除',
      confirmContent: '删除后你们两人的日历都会移除这条经期记录，且不可恢复',
      successTitle: '已删除',
      failureTitle: '删除失败'
    })
    if (outcome.kind === 'success') {
      this.discardRecordDraft()
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'periods',
        mode: 'remove',
        record: { _id: this.data.id }
      })
    }
    return outcome
  }
})
