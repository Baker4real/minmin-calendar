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

function getSavedRecordId(outcome, fallbackId = '') {
  if (fallbackId) return fallbackId
  const result = outcome && outcome.result ? outcome.result : {}
  return result.id || result._id || ''
}

function getCurrentPagesProvider() {
  if (typeof getCurrentPages === 'function') return getCurrentPages
  return null
}

module.exports = {
  notifyPreviousPageRecordChange,
  getSavedRecordId
}
