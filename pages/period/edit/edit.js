const util = require('../../../utils/util')
const cloud = require('../../../utils/cloud')
const cycle = require('../../../utils/cycle')
const recordCommands = require('../../../utils/recordCommands')
const recordDraft = require('../../../utils/recordDraft')
const recordEditRoute = require('../../../utils/recordEditRoute')
const recordPageSync = require('../../../utils/recordPageSync')
const safeArea = require('../../../utils/safeArea')

const DRAFT_FIELDS = ['startDate', 'endDate', 'status', 'note', 'flow', 'symptoms']

// 与 pages/settings/settings.js、pages/memory/edit/edit.js、pages/period/period.js 共享的一次性
// 「目标分段」意图键：从首页等入口进入本页保存/删除后写键，记录 tab onShow 消费并落到经期分段（issue #103）
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'

Page({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
    id: '',
    startDate: '',
    endDate: '',
    status: 'ongoing',
    note: '',
    flow: '',
    symptoms: [],
    flowOptions: cycle.FLOW_OPTIONS,
    statusOptions: cycle.PERIOD_STATUS_OPTIONS,
    symptomGroups: cycle.buildSymptomOptions(),
    maxDate: '',
    isEdit: false,
    saving: false,
    deleting: false,
    submitted: false,
    draftRestored: false
  },

  onLoad(options) {
    const today = util.formatDate(new Date())
    const routeState = recordEditRoute.parsePeriodEditOptions(options, { today })
    const draftStorage = recordDraft.createWxDraftStorage(wx)
    const draftKey = recordDraft.buildDraftKey({ collection: 'periods', id: routeState.id })
    const storedDraft = recordDraft.readDraft(draftStorage, draftKey)
    const merged = storedDraft
      ? { ...routeState, ...recordDraft.pickDraftFields(storedDraft, DRAFT_FIELDS) }
      : routeState
    // 状态是权威：旧草稿缺 status 时按已知日期重新推导，不隐含进行中
    const status = cycle.getPeriodStatus(merged)
    const formState = {
      ...merged,
      status,
      endDate: status === 'known-end' ? merged.endDate : ''
    }
    this._draftStorage = draftStorage
    this._draftKey = draftKey
    this._draftBaseline = recordDraft.pickDraftFields(routeState, DRAFT_FIELDS)
    this._draftDiscarded = false
    this.setData({
      ...formState,
      draftRestored: !!storedDraft,
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

  // 保存/删除成功后写下一次性分段意图：notify 只达前一页，从首页进入时到不了记录 tab；
  // 记录 tab 下一次 onShow 消费该键落到本分段，从记录 tab 进入时已被 applyRecordChange 落段，多消费一次无害
  markRecordTabSegmentIntent() {
    try {
      wx.setStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY, 'period')
    } catch (e) {}
  },

  onStartChange(e) {
    this.setData({ startDate: e.detail.value })
    if (this.data.status === 'known-end' && this.data.startDate > this.data.endDate) {
      this.setData({ endDate: this.data.startDate })
    }
  },
  onEndChange(e) { this.setData({ endDate: e.detail.value }) },
  selectStatus(e) {
    if (this.data.saving) return
    const status = e.currentTarget.dataset.value
    if (!cycle.isPeriodStatus(status) || status === this.data.status) return
    // 切到已知结束且还没选过结束日期时，用开始日期兜底（同日为合法单日记录）
    const update = { status }
    if (status === 'known-end' && !this.data.endDate) update.endDate = this.data.startDate
    this.setData(update)
  },
  onNoteInput(e) { this.setData({ note: e.detail.value }) },
  selectFlow(e) {
    if (this.data.saving) return
    const flow = e.currentTarget.dataset.value
    this.setData({ flow: this.data.flow === flow ? '' : flow })
  },
  toggleSymptom(e) {
    if (this.data.saving) return
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
    if (this.data.saving || this.data.deleting || this.data.submitted) return
    const { id, startDate, endDate, status, note, flow, symptoms, isEdit } = this.data
    const today = util.formatDate(new Date())
    const client = cloud.createRoomDataClient()
    const outcome = await recordCommands.runRecordSave({
      page: this,
      action: () => {
        const payload = cycle.buildPeriodPayload({ startDate, endDate, status, note, flow, symptoms })
        if (isEdit) {
          return client.update('periods', id, payload)
        }
        return client.add('periods', payload)
      },
      validate: () => {
        if (!startDate) return '请选择日期'
        if (!util.isValidDateString(startDate)) return '请选择有效日期'
        if (startDate > today) return '开始日期不能晚于今天'
        if (status === 'known-end') {
          if (!endDate || !util.isValidDateString(endDate)) return '请选择有效日期'
          if (startDate > endDate) return '结束日期不能早于开始'
          if (endDate > today) return '结束日期不能晚于今天'
        }
        return ''
      },
      successTitle: '保存成功',
      failureTitle: '保存失败',
      mergedTitle: '已打开进行中的经期',
      mergedContent: '房间里已有一条进行中的经期，已为你打开它'
    })
    if (outcome && (outcome.kind === 'success' || outcome.kind === 'merged')) {
      this.discardRecordDraft()
      this.markRecordTabSegmentIntent()
    }
    const savedRecord = recordPageSync.getSavedRecord(outcome)
    if (outcome && outcome.kind === 'merged' && savedRecord) {
      this.applyReopenedRecord(savedRecord)
    }
    if (savedRecord) {
      recordPageSync.notifyPreviousPageRecordChange({
        collection: 'periods',
        mode: outcome.kind === 'merged' ? 'update' : (isEdit ? 'update' : 'add'),
        record: savedRecord
      })
    }
    return outcome
  },

  applyReopenedRecord(record) {
    const symptoms = Array.isArray(record.symptoms) ? record.symptoms : []
    // 与 onLoad 同一原则：状态是权威，结束日期只在已知结束时保留
    const status = cycle.getPeriodStatus(record)
    const formState = {
      id: record._id,
      startDate: record.startDate || '',
      endDate: status === 'known-end' ? (record.endDate || '') : '',
      status,
      note: record.note || '',
      flow: record.flow || '',
      symptoms,
      isEdit: true
    }
    // 草稿身份切换到被重开的记录：键与基线按新身份重建，避免被丢弃表单的草稿串键
    this._draftKey = recordDraft.buildDraftKey({ collection: 'periods', id: formState.id })
    this._draftBaseline = recordDraft.pickDraftFields(formState, DRAFT_FIELDS)
    this._draftDiscarded = false
    this.setData({
      ...formState,
      draftRestored: false,
      symptomGroups: cycle.buildSymptomOptions(symptoms)
    })
  },

  async delete() {
    if (this.data.saving || this.data.deleting || this.data.submitted || this._deleteConfirming) return
    this._deleteConfirming = true
    try {
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
        this.markRecordTabSegmentIntent()
        recordPageSync.notifyPreviousPageRecordChange({
          collection: 'periods',
          mode: 'remove',
          record: { _id: this.data.id }
        })
      }
      return outcome
    } finally {
      this._deleteConfirming = false
    }
  }
})
