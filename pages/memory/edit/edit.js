const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const recordCommands = require('../../../utils/recordCommands')
const recordDraft = require('../../../utils/recordDraft')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordPageSync = require('../../../utils/recordPageSync')
const safeArea = require('../../../utils/safeArea')

const DRAFT_FIELDS = ['date', 'note']

Page({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), id: '', date: '', note: '', isEdit: false, maxDate: '', saving: false, deleting: false },

  onLoad(options) {
    const routeState = recordEditRoute.parseMemoryEditOptions(options, {
      today: util.formatDate(new Date())
    })
    const draftStorage = recordDraft.createWxDraftStorage(wx)
    const draftKey = recordDraft.buildDraftKey({ collection: 'memories', id: routeState.id })
    const storedDraft = recordDraft.readDraft(draftStorage, draftKey)
    const formState = storedDraft
      ? { ...routeState, ...recordDraft.pickDraftFields(storedDraft, DRAFT_FIELDS) }
      : routeState
    this._draftStorage = draftStorage
    this._draftKey = draftKey
    this._draftBaseline = recordDraft.pickDraftFields(routeState, DRAFT_FIELDS)
    this._draftDiscarded = false
    this.setData(formState)
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

  onDateChange(e) { this.setData({ date: e.detail.value }) },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  goBack() {
    wx.navigateBack()
  },

  async save() {
    if (this.data.saving || this.data.deleting) return
    const { id, date, note, isEdit } = this.data
    const client = cloud.createRoomDataClient()
    const outcome = await recordCommands.runRecordSave({
      page: this,
      action: () => {
        if (isEdit) {
          return client.update('memories', id, { date, note })
        }
        return client.add('memories', { date, note })
      },
      validate: () => {
        if (!date) return '请选择日期'
        if (!util.isValidDateString(date)) return '请选择有效日期'
        return ''
      },
      successTitle: '已存进你们的欢乐时光',
      successIcon: 'none',
      failureTitle: '保存失败'
    })
    if (outcome && outcome.kind === 'success') {
      this.discardRecordDraft()
    }
    const savedRecord = recordPageSync.getSavedRecord(outcome)
    if (savedRecord) {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'memories',
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
      action: () => client.remove('memories', this.data.id),
      confirmTitle: '确认删除',
      confirmContent: '删除后你们两人的日历都会移除这条欢乐时光，且不可恢复',
      successTitle: '已删除',
      failureTitle: '删除失败'
    })
    if (outcome.kind === 'success') {
      this.discardRecordDraft()
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'memories',
        mode: 'remove',
        record: { _id: this.data.id }
      })
    }
    return outcome
  }
})
