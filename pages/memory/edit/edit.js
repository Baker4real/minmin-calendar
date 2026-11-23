const recordCommands = require('../../../utils/recordCommands')
const { confirmationSheet, confirmationSheetData } = require('../../../utils/confirmationSheet')
const { datePickerSheet, datePickerSheetData } = require('../../../utils/datePickerSheet')
const { probeReducedMotion } = require('../../../utils/sheetLifecycle')
const safeArea = require('../../../utils/safeArea')
const { withPageVisibility } = require('../../../utils/pageVisibility')

Page(withPageVisibility({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset(),
    ...safeArea.getNavTitlePadding('back'),
    noteFocused: false,
    ...confirmationSheetData(),
    ...datePickerSheetData()
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
    datePickerSheet(this).unload()
  },

  onReady() {
    probeReducedMotion(this)
  },

  openMemoryDatePicker() {
    if (this.data.saving) return
    datePickerSheet(this).open({
      label: '日期',
      value: this.data.date,
      maxDate: this.data.maxDate,
      onConfirm: date => this.onDateChange({ detail: { value: date } })
    })
  },

  onDatePickerChange(e) {
    datePickerSheet(this).change(e.detail.value, e)
  },

  onDatePickerPickStart(e) {
    datePickerSheet(this).pickStart(e)
  },

  onDatePickerPickEnd(e) {
    datePickerSheet(this).pickEnd(e)
  },

  onDatePickerConfirm() {
    datePickerSheet(this).confirm()
  },

  onDateChange(e) {
    this._editSession.changeField('date', e.detail.value)
  },

  onNoteInput(e) {
    this._editSession.changeField('note', e.detail.value)
  },

  onNoteFocus() {
    this.setData({ noteFocused: true })
  },

  onNoteBlur() {
    this.setData({ noteFocused: false })
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

  onDatePickerMask() {
    datePickerSheet(this).cancel()
  },

  onDatePickerClose() {
    datePickerSheet(this).cancel()
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
    datePickerSheet(this).dragRelease(detail)
  },

  onSheetDragCancel(detail) {
    confirmationSheet(this).dragCancel(detail)
    datePickerSheet(this).dragCancel(detail)
  },

  onSheetSystemBack() {
    if (this.data.datePickerMounted) datePickerSheet(this).systemBack()
    else confirmationSheet(this).systemBack()
  },

  noop() {}
}))
