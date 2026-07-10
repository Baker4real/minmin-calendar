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
  if (!outcome || outcome.kind !== 'success') return null
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
  getSavedRecord
}
