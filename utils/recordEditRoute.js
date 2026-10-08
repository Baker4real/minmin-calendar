const PERIOD_EDIT_PATH = '/pages/period/edit/edit'
const MEMORY_EDIT_PATH = '/pages/memory/edit/edit'
// 与 utils/cycle.js、云端副本一致的三态值；本模块保持零依赖，不引入运行时共享模块
const PERIOD_STATUS_VALUES = ['ongoing', 'unknown-end', 'known-end']

function isPeriodStatus(value) {
  return PERIOD_STATUS_VALUES.includes(value)
}

function buildPeriodEditUrl(record = {}) {
  const status = isPeriodStatus(record.status)
    ? record.status
    : (record.endDate ? 'known-end' : 'unknown-end')
  return buildUrl(PERIOD_EDIT_PATH, {
    id: record.id || record._id || '',
    startDate: record.startDate || '',
    // 只有已知结束的记录携带结束日期；进行中/结束日期不详由状态表达
    endDate: status === 'known-end' ? (record.endDate || '') : '',
    status: isPeriodStatus(record.status) ? record.status : '',
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
  // 新增按生效开始日期推导默认状态：记今天默认进行中，补记过去默认已结束；
  // 编辑旧记录按已有日期保守推导状态
  const status = hasExplicitStatus
    ? options.status
    : (isEdit ? (options.endDate ? 'known-end' : 'unknown-end') : (startDate < today ? 'known-end' : 'ongoing'))
  // 推导出的「已结束」缺结束日期时兜底到开始日期（起止同日的单日记录）；
  // 显式传入 known-end 的调用方保持原样，不补兜底
  const derivedKnownEnd = !hasExplicitStatus && !isEdit && status === 'known-end'
  return {
    id: options.id || '',
    startDate,
    endDate: status === 'known-end' ? (options.endDate || (derivedKnownEnd ? startDate : '')) : '',
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
