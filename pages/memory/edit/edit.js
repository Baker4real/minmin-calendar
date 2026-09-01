const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const recordCommands = require('../../../utils/recordCommands')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordPageSync = require('../../../utils/recordPageSync')
const safeArea = require('../../../utils/safeArea')

Page({
  data: { safeTop: safeArea.getSafeTop(), id: '', date: '', note: '', isEdit: false, saving: false, deleting: false },

  onLoad(options) {
    this.setData(recordEditRoute.parseMemoryEditOptions(options, {
      today: util.formatDate(new Date())
    }))
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
      successTitle: '保存成功',
      failureTitle: '保存失败'
    })
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
      successTitle: '已删除',
      failureTitle: '删除失败'
    })
    if (outcome.kind === 'success') {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'memories',
        mode: 'remove',
        record: { _id: this.data.id }
      })
    }
    return outcome
  }
})
