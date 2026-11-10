// switchTab cannot carry query parameters. All record entry points share this one-time intent.
const RECORD_TAB_SEGMENT_STORAGE_KEY = 'recordTabSegment'
const RECORD_SEGMENTS = { periods: 'period', memories: 'memory' }

function setRecordTabSegmentIntent(segment) {
  if (!Object.values(RECORD_SEGMENTS).includes(segment)) return
  try {
    wx.setStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY, segment)
  } catch (error) {}
}

function consumeRecordTabSegmentIntent() {
  let segment
  try {
    segment = wx.getStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY)
  } catch (error) {}
  if (!Object.values(RECORD_SEGMENTS).includes(segment)) return ''
  try {
    wx.removeStorageSync(RECORD_TAB_SEGMENT_STORAGE_KEY)
  } catch (error) {}
  return segment
}

function notifyRecordSaved({ collection, isEdit, outcome }) {
  if (!outcome || (outcome.kind !== 'success' && outcome.kind !== 'merged')) return
  setRecordTabSegmentIntent(RECORD_SEGMENTS[collection])
  const record = getSavedRecord(outcome)
  if (record) {
    notifyPreviousPageRecordChange({
      collection,
      mode: outcome.kind === 'merged' || isEdit ? 'update' : 'add',
      record
    })
  }
}

function notifyRecordDeleted({ collection, id }) {
  setRecordTabSegmentIntent(RECORD_SEGMENTS[collection])
  notifyPreviousPageRecordChange({ collection, mode: 'remove', record: { _id: id } })
}

function notifyPreviousPageRecordChange(change, options = {}) {
  const getPages = options.getCurrentPages || getCurrentPagesProvider()
  if (typeof getPages !== 'function') return false

  const pages = getPages()
  if (!Array.isArray(pages) || pages.length < 2) return false

  const previousPage = pages[pages.length - 2]
  if (!previousPage || typeof previousPage.applyRecordChange !== 'function') return false

  try {
    previousPage.applyRecordChange(change)
    return true
  } catch (error) {
    if (typeof options.onError === 'function') options.onError(error)
    return false
  }
}

function getSavedRecord(outcome) {
  if (!outcome || (outcome.kind !== 'success' && outcome.kind !== 'merged')) return null
  const result = outcome && outcome.result ? outcome.result : {}
  const record = result.record
  if (!record || typeof record !== 'object' || !record._id) return null
  return { ...record }
}

function getCurrentPagesProvider() {
  if (typeof getCurrentPages === 'function') return getCurrentPages
  return null
}

module.exports = {
  notifyPreviousPageRecordChange,
  getSavedRecord,
  notifyRecordSaved,
  notifyRecordDeleted,
  setRecordTabSegmentIntent,
  consumeRecordTabSegmentIntent
}
