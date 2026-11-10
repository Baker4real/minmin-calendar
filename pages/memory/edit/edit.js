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
      kind: 'memory',
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

  onDateChange(e) {
    this._editSession.changeField('date', e.detail.value)
  },

  onNoteInput(e) {
    this._editSession.changeField('note', e.detail.value)
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
