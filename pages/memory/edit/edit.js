const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const recordCommands = require('../../../utils/recordCommands')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordPageSync = require('../../../utils/recordPageSync')

Page({
  data: { id: '', date: '', note: '', isEdit: false, saving: false },

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
      validate: () => (!date ? '请选择日期' : ''),
      successTitle: '保存成功',
      failureTitle: '保存失败'
    })
    if (outcome.kind === 'success') {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'memories',
        mode: isEdit ? 'update' : 'add',
        record: {
          _id: recordPageSync.getSavedRecordId(outcome, id),
          date,
          note
        }
      })
    }
  },

  async delete() {
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
