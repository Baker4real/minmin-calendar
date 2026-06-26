const PERIOD_EDIT_PATH = '/pages/period/edit/edit'
const MEMORY_EDIT_PATH = '/pages/memory/edit/edit'

function buildPeriodEditUrl(record = {}) {
  return buildUrl(PERIOD_EDIT_PATH, {
    id: record.id || record._id || '',
    startDate: record.startDate || '',
    endDate: record.endDate || record.startDate || '',
    note: record.note || '',
    flow: record.flow || '',
    symptoms: Array.isArray(record.symptoms) ? record.symptoms.join(',') : ''
  })
}

function parsePeriodEditOptions(options = {}, context = {}) {
  const today = context.today || ''
  const symptoms = parseSymptoms(options.symptoms)
  return {
    id: options.id || '',
    startDate: options.startDate || today,
    endDate: options.endDate || options.startDate || today,
    note: decodeOption(options.note),
    flow: options.flow || '',
    symptoms,
    isEdit: !!options.id
  }
}

function buildMemoryEditUrl(record = {}) {
  return buildUrl(MEMORY_EDIT_PATH, {
    id: record.id || record._id || '',
    date: record.date || '',
    note: record.note || ''
  })
}

function parseMemoryEditOptions(options = {}, context = {}) {
  const today = context.today || ''
  return {
    id: options.id || '',
    date: options.date || today,
    note: decodeOption(options.note),
    isEdit: !!options.id
  }
}

function buildUrl(path, query) {
  const params = Object.keys(query)
    .filter(key => query[key] !== undefined && query[key] !== null && query[key] !== '')
    .map(key => `${key}=${encodeURIComponent(String(query[key]))}`)
  return params.length ? `${path}?${params.join('&')}` : path
}

function parseSymptoms(value) {
  const decoded = decodeOption(value)
  if (!decoded) return []
  return decoded.split(',').filter(Boolean)
}

function decodeOption(value) {
  if (!value) return ''
  return decodeURIComponent(value)
}

module.exports = {
  buildMemoryEditUrl,
  buildPeriodEditUrl,
  parseMemoryEditOptions,
  parsePeriodEditOptions
}
