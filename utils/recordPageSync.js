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

// A confirmed save (including a merge into the ongoing record) or delete leaves the record tab's
// one-time segment intent and returns the record change the edit session hands to the shared
// records once (#195). A save whose canonical record did not come back has no change to hand over.
function savedRecordChange({ collection, isEdit, outcome }) {
  if (!outcome || (outcome.kind !== 'success' && outcome.kind !== 'merged')) return null
  setRecordTabSegmentIntent(RECORD_SEGMENTS[collection])
  const record = getSavedRecord(outcome)
  if (!record) return null
  return { collection, mode: outcome.kind === 'merged' || isEdit ? 'update' : 'add', record }
}

function deletedRecordChange({ collection, id }) {
  setRecordTabSegmentIntent(RECORD_SEGMENTS[collection])
  return { collection, mode: 'remove', record: { _id: id } }
}

function getSavedRecord(outcome) {
  if (!outcome || (outcome.kind !== 'success' && outcome.kind !== 'merged')) return null
  const result = outcome && outcome.result ? outcome.result : {}
  const record = result.record
  if (!record || typeof record !== 'object' || !record._id) return null
  return { ...record }
}

module.exports = {
  getSavedRecord,
  savedRecordChange,
  deletedRecordChange,
  setRecordTabSegmentIntent,
  consumeRecordTabSegmentIntent
}
