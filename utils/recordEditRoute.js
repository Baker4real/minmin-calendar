const PERIOD_EDIT_PATH = '/pages/period/edit/edit'
const MEMORY_EDIT_PATH = '/pages/memory/edit/edit'
// 与 utils/cycle.js、云端副本一致的三态值；本模块保持零依赖，不引入运行时共享模块
const PERIOD_STATUS_VALUES = ['ongoing', 'unknown-end', 'known-end']

function isPeriodStatus(value) {
  return PERIOD_STATUS_VALUES.includes(value)
}

function buildPeriodEditUrl(record = {}, context = {}) {
  const completing = context.intent === 'complete'
  const explicitStatus = isPeriodStatus(record.status) ? record.status : ''
  const status = completing
    ? 'known-end'
    : (explicitStatus || (record.endDate ? 'known-end' : 'unknown-end'))
  return buildUrl(PERIOD_EDIT_PATH, {
    id: record.id || record._id || '',
    startDate: record.startDate || '',
    // 完成进行中记录时结束日是今天；其余只有已知结束才携带结束日期
    endDate: completing
      ? (context.today || '')
      : (status === 'known-end' ? (record.endDate || '') : ''),
    status: completing ? 'known-end' : explicitStatus,
    note: record.note || '',
    flow: record.flow || '',
    symptoms: Array.isArray(record.symptoms) ? record.symptoms.join(',') : ''
  })
}

function parsePeriodEditOptions(options = {}, context = {}) {
  const today = context.today || ''
  const symptoms = parseSymptoms(options.symptoms)
  const isEdit = !!options.id
  const startDate = options.startDate || today
  const hasExplicitStatus = isPeriodStatus(options.status)
  // 新增按生效开始日期推导默认状态：记今天默认进行中，补记过去默认已结束。
  // 补记的结束日留空，不用开始日填上；编辑旧记录按已有日期保守推导状态。
  const status = hasExplicitStatus
    ? options.status
    : (isEdit ? (options.endDate ? 'known-end' : 'unknown-end') : (startDate < today ? 'known-end' : 'ongoing'))
  return {
    id: options.id || '',
    startDate,
    endDate: status === 'known-end' ? (options.endDate || '') : '',
    status,
    note: decodeOption(options.note, { fallback: 'raw' }),
    flow: options.flow || '',
    symptoms,
    isEdit,
    maxDate: today
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
    note: decodeOption(options.note, { fallback: 'raw' }),
    isEdit: !!options.id,
    maxDate: today
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

function decodeOption(value, { fallback = '' } = {}) {
  if (!value) return ''
  const stringValue = String(value)
  try {
    return decodeURIComponent(stringValue)
  } catch (error) {
    return fallback === 'raw' ? stringValue : fallback
  }
}

module.exports = {
  buildMemoryEditUrl,
  buildPeriodEditUrl,
  parseMemoryEditOptions,
  parsePeriodEditOptions
}
