const recordCommands = require('../../../utils/recordCommands')
const cycle = require('../../../utils/cycle')
const { confirmationSheet, confirmationSheetData } = require('../../../utils/confirmationSheet')
const { probeReducedMotion } = require('../../../utils/sheetLifecycle')
const safeArea = require('../../../utils/safeArea')
const { withPageVisibility } = require('../../../utils/pageVisibility')

Page(withPageVisibility({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
    statusOptions: cycle.PERIOD_STATUS_OPTIONS.map(item => ({ ...item, hint: cycle.periodStatusHint(item.value) })),
    flowOptions: cycle.FLOW_OPTIONS,
    symptomGroups: cycle.buildSymptomOptions(),
    ...confirmationSheetData()
  },

  onLoad(options) {
    this._editSession = recordCommands.openRecordEditSession({
      kind: 'period',
      route: options,
      render: state => this.setData(state),
      confirm: confirmation => confirmationSheet(this).open(confirmation)
    })
  },

  onHide() {
    this._editSession.onHide()
  },

  onUnload() {
    this._editSession.onUnload()
    confirmationSheet(this).unload()
  },

  onReady() {
    probeReducedMotion(this)
  },

  onStartChange(e) {
    this._editSession.changeField('startDate', e.detail.value)
  },

  onEndChange(e) {
    this._editSession.changeField('endDate', e.detail.value)
  },

  selectStatus(e) {
    this._editSession.changeField('status', e.currentTarget.dataset.value)
  },

  onNoteInput(e) {
    this._editSession.changeField('note', e.detail.value)
  },

  selectFlow(e) {
    this._editSession.changeField('flow', e.currentTarget.dataset.value)
  },

  toggleSymptom(e) {
    this._editSession.changeField('symptoms', e.currentTarget.dataset.value)
  },

  discardDraft() {
    this._editSession.discardDraft()
  },

  openStartDateOwner() {
    return this._editSession.openStartDateOwner()
  },

  goBack() {
    wx.navigateBack()
  },

  save() {
    return this._editSession.save()
  },

  delete() {
    return this._editSession.delete()
  },

  onConfirmationAction(e) {
    confirmationSheet(this).action(e.currentTarget.dataset.action)
  },

  onConfirmationMask() {
    confirmationSheet(this).cancel()
  },

  onConfirmationClose() {
    confirmationSheet(this).cancel()
  },

  onSheetDragRelease(detail) {
    confirmationSheet(this).dragRelease(detail)
  },

  onSheetDragCancel(detail) {
    confirmationSheet(this).dragCancel(detail)
  },

  onSheetSystemBack() {
    confirmationSheet(this).systemBack()
  }
}))
