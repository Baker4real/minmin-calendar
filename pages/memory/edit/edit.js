const recordCommands = require('../../../utils/recordCommands')
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
    ...confirmationSheetData()
  },

  onLoad(options) {
    this._editSession = recordCommands.openRecordEditSession({
      kind: 'memory',
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

  onDateChange(e) {
    this._editSession.changeField('date', e.detail.value)
  },

  onNoteInput(e) {
    this._editSession.changeField('note', e.detail.value)
  },

  discardDraft() {
    this._editSession.discardDraft()
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

  onSheetSystemBack() {
    confirmationSheet(this).systemBack()
  }
}))
