const recordCommands = require('../../../utils/recordCommands')
const safeArea = require('../../../utils/safeArea')
const { withPageVisibility } = require('../../../utils/pageVisibility')

Page(withPageVisibility({
  data: {
    safeTop: safeArea.getSafeTop(),
    safeBottom: safeArea.getSafeBottom(),
    navBarHeight: safeArea.getNavBarHeight(),
    capsuleRight: safeArea.getCapsuleRightInset()
  },

  onLoad(options) {
    this._editSession = recordCommands.openRecordEditSession({
      kind: 'period',
      route: options,
      render: state => this.setData(state)
    })
  },

  onHide() {
    this._editSession.onHide()
  },

  onUnload() {
    this._editSession.onUnload()
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

  goBack() {
    wx.navigateBack()
  },

  save() {
    return this._editSession.save()
  },

  delete() {
    return this._editSession.delete()
  }
}))
