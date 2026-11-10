const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const recordCommands = require('../../../utils/recordCommands')
const recordDraft = require('../../../utils/recordDraft')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordFieldErrors = require('../../../utils/recordFieldErrors')
const recordPageSync = require('../../../utils/recordPageSync')
const safeArea = require('../../../utils/safeArea')
const { withPageVisibility } = require('../../../utils/pageVisibility')

const DRAFT_FIELDS = ['date', 'note']
// 可定位的校验字段（只有日期）
const FIELD_ORDER = ['date']

function displayDateLabel(dateStr) {
  return util.formatDisplayDate(dateStr, { today: util.formatDate(new Date()) })
}

// 日期出错时给一句人话；没问题时返回 null。
function collectMemoryFieldErrors({ date }, today) {
  if (!date) return { date: '请选择日期' }
  if (!util.isValidDateString(date)) return { date: '请选择有效日期' }
  if (date > today) return { date: '日期不能晚于今天' }
  return null
}

// 与 pages/period/edit/edit.js、pages/period/period.js 共享的一次性
// 「目标分段」意图键：从首页等入口进入本页保存/删除后写键，记录 tab onShow 消费并落到欢乐时光分段（issue #103）
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'

Page(withPageVisibility({
  data: { safeTop: safeArea.getSafeTop(), safeBottom: safeArea.getSafeBottom(), navBarHeight: safeArea.getNavBarHeight(), capsuleRight: safeArea.getCapsuleRightInset(), id: '', date: '', note: '', isEdit: false, maxDate: '', saving: false, deleting: false, submitted: false, draftRestored: false, fieldErrors: {} },

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
    this.setData({
      ...formState,
      dateLabel: displayDateLabel(formState.date),
      draftRestored: !!storedDraft
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

  // 保存/删除成功后写下一次性分段意图：notify 只达前一页，从首页进入时到不了记录 tab；
  // 记录 tab 下一次 onShow 消费该键落到本分段，从记录 tab 进入时已被 applyRecordChange 落段，多消费一次无害
  markRecordTabSegmentIntent() {
    try {
      wx.setStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY, 'memory')
    } catch (e) {}
  },

  onDateChange(e) {
    this.setData({
      date: e.detail.value,
      dateLabel: displayDateLabel(e.detail.value)
    })
    this.refreshFieldErrors()
  },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },

  // 字段错误的显示与清除规则和经期编辑页共用一份（utils/recordFieldErrors.js）
  showFieldErrors(fieldErrors) {
    recordFieldErrors.showFieldErrors(this, fieldErrors, FIELD_ORDER)
  },

  refreshFieldErrors() {
    recordFieldErrors.refreshFieldErrors(this, data => collectMemoryFieldErrors(data, util.formatDate(new Date())))
  },

  goBack() {
    wx.navigateBack()
  },

  async save() {
    if (this.data.saving || this.data.deleting || this.data.submitted) return
    const { id, date, note, isEdit } = this.data
    const today = util.formatDate(new Date())
    const client = cloud.createRoomDataClient()
    let submitted = null
    const outcome = await recordCommands.runRecordSave({
      page: this,
      action: () => {
        submitted = { date, note }
        return isEdit ? client.update('memories', id, submitted) : client.add('memories', submitted)
      },
      refetch: () => client.list('memories'),
      reconcile: {
        id: isEdit ? id : '',
        get fields() {
          return submitted || {}
        }
      },
      validate: () => collectMemoryFieldErrors({ date }, today),
      successTitle: '已存进你们的欢乐时光',
      successIcon: 'none'
    })
    if (outcome && outcome.kind === 'validation') {
      this.showFieldErrors(outcome.fieldErrors)
      return outcome
    }
    if (outcome && outcome.kind === 'success') {
      this.discardRecordDraft()
      this.markRecordTabSegmentIntent()
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
    if (this.data.saving || this.data.deleting || this.data.submitted || this._deleteConfirming) return
    this._deleteConfirming = true
    try {
      const client = cloud.createRoomDataClient()
      const outcome = await recordCommands.runRecordDelete({
        page: this,
        action: () => client.remove('memories', this.data.id),
        confirmTitle: '确认删除',
        confirmContent: '删除后你们两人的日历都会移除这条欢乐时光，且不可恢复',
        successTitle: '已删除'
      })
      if (outcome.kind === 'success') {
        this.discardRecordDraft()
        this.markRecordTabSegmentIntent()
        recordPageSync.notifyPreviousPageRecordChange({
          collection: 'memories',
          mode: 'remove',
          record: { _id: this.data.id }
        })
      }
      return outcome
    } finally {
      this._deleteConfirming = false
    }
  }
}))
