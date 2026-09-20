/**
 * 编辑表单草稿暂存的纯函数模块。
 * 存储通过 { get, set, remove } 适配器注入，测试用内存适配器即可驱动；
 * createWxDraftStorage 是唯一接触 wx 本地存储的接缝。
 */
const DRAFT_STORAGE_PREFIX = 'recordDraft'

function buildDraftKey(scope = {}) {
  const collection = scope.collection ? String(scope.collection) : ''
  const id = scope.id ? String(scope.id) : ''
  return `${DRAFT_STORAGE_PREFIX}:${collection}:${id || 'new'}`
}

function pickDraftFields(source, fields) {
  const values = {}
  const list = Array.isArray(fields) ? fields : []
  list.forEach(field => {
    const value = source ? source[field] : undefined
    values[field] = Array.isArray(value) ? value.slice() : value === undefined ? '' : value
  })
  return values
}

function readDraft(storage, key) {
  const raw = storageGet(storage, key)
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed
  } catch (error) {
    return null
  }
}

function writeDraft(storage, key, values) {
  if (!storage || typeof storage.set !== 'function') return false
  storage.set(key, JSON.stringify(values || {}))
  return true
}

function clearDraft(storage, key) {
  if (!storage || typeof storage.remove !== 'function') return
  storage.remove(key)
}

function syncDraft(storage, key, values, baseline) {
  if (JSON.stringify(values || {}) === JSON.stringify(baseline || {})) {
    clearDraft(storage, key)
    return 'cleared'
  }
  writeDraft(storage, key, values)
  return 'written'
}

function createWxDraftStorage(wxApi) {
  return {
    get(key) {
      try {
        return wxApi.getStorageSync(key)
      } catch (error) {
        return ''
      }
    },
    set(key, value) {
      try {
        wxApi.setStorageSync(key, value)
      } catch (error) {
        // 存储不可用时草稿静默丢弃，不打断表单
      }
    },
    remove(key) {
      try {
        wxApi.removeStorageSync(key)
      } catch (error) {
        // 同上
      }
    }
  }
}

function storageGet(storage, key) {
  if (!storage || typeof storage.get !== 'function') return ''
  return storage.get(key)
}

module.exports = {
  buildDraftKey,
  pickDraftFields,
  readDraft,
  writeDraft,
  clearDraft,
  syncDraft,
  createWxDraftStorage
}
