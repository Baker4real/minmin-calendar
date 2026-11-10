/**
 * Adapter between record operations and the WeChat page lifecycle.
 * Failure presentation belongs to roomAccessOutcome and is executed by wxPrompts.
 * Editing coordination remains here and in the edit pages until the session migration.
 */
const roomAccessOutcome = require('./roomAccessOutcome')
const wxPrompts = require('./wxPrompts')

function runRecordSave(options) {
  const opts = options || {}
  const wxApi = resolveWxApi(opts)
  const {
    page,
    timer = createDefaultTimer(),
    action,
    validate,
    loadingKey = 'saving',
    successTitle = '保存成功',
    successIcon,
    successDelay = 1000
  } = opts
  const navigateBack = typeof opts.navigateBack === 'function'
    ? opts.navigateBack
    : createNavigateBack(wxApi)
  const navigateToBind = typeof opts.navigateToBind === 'function'
    ? opts.navigateToBind
    : createNavigateToBind(wxApi)

  return runCommand({
    page,
    wxApi,
    timer,
    action,
    validate,
    loadingKey,
    successTitle,
    successIcon,
    mergedTitle: opts.mergedTitle,
    mergedContent: opts.mergedContent,
    navigateBack,
    navigateToBind,
    successDelay,
    operation: 'save',
    refetch: opts.refetch,
    reconcile: opts.reconcile
  })
}

function runRecordDelete(options) {
  const opts = options || {}
  const wxApi = resolveWxApi(opts)
  const {
    page,
    confirmTitle = '确认删除',
    confirmContent,
    confirmText = '删除',
    confirmColor = '#F97373',
    loadingKey = 'deleting'
  } = opts
  const navigateBack = typeof opts.navigateBack === 'function'
    ? opts.navigateBack
    : createNavigateBack(wxApi)

  // 确认之前不进入删除忙碌态：按钮仍读「删除此记录」，取消后无需复位。
  return new Promise(resolve => {
    wxPrompts.modal({
      title: confirmTitle,
      confirmText,
      confirmColor,
      ...(confirmContent ? { content: confirmContent } : {}),
      success: async (result) => {
        if (!result.confirm) {
          resolve({ kind: 'cancelled' })
          return
        }

        resolve(runCommand({
          ...options,
          wxApi,
          loadingKey,
          validate: null,
          navigateBack,
          operation: 'delete'
        }))
      }
    }, wxApi)
  })
}

async function runRecordListLoad(options) {
  const opts = options || {}
  const wxApi = resolveWxApi(opts)
  const {
    page,
    action,
    mapRecords,
    onLoaded,
    itemsKey,
    loadingKey = 'loading',
    loadFailedKey = 'loadFailed'
  } = opts
  const navigateToBind = typeof opts.navigateToBind === 'function'
    ? opts.navigateToBind
    : createNavigateToBind(wxApi)

  updatePage(page, { [loadingKey]: true })

  let outcome
  try {
    outcome = await action()
  } catch (error) {
    outcome = {
      kind: 'retryable-failure',
      message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
    }
  }

  if (outcome.kind === 'success') {
    const records = Array.isArray(outcome.data) ? outcome.data : []
    const viewData = typeof mapRecords === 'function' ? mapRecords(records) : records
    updatePage(page, { [itemsKey]: viewData, [loadFailedKey]: false })
    if (typeof onLoaded === 'function') {
      onLoaded(records)
    }
    updatePage(page, { [loadingKey]: false })
    return outcome
  }

  updatePage(page, { [loadingKey]: false })
  const result = await handleFailureOutcome({
    outcome,
    wxApi,
    operation: 'list',
    retryAction: () => runRecordListLoad(options),
    navigateToBind
  })
  if (!result || result.kind !== 'success') {
    updatePage(page, { [loadFailedKey]: true })
  }
  return result
}

async function runCommand(options) {
  const {
    page,
    wxApi,
    timer = createDefaultTimer(),
    action,
    validate,
    loadingKey = 'saving',
    successTitle,
    successIcon,
    mergedTitle = '已合并到已有记录',
    mergedContent = '房间里已有一条进行中的记录，已为你打开它',
    navigateBack,
    navigateToBind,
    successDelay,
    operation,
    refetch,
    reconcile
  } = options

  const validation = readValidation(validate)
  if (validation) {
    // 能定位到字段的错误交回页面显示在字段旁；只有无法定位的整体错误才用瞬时 toast
    if (!validation.fieldErrors) {
      safeShowToast(wxApi, { title: validation.message, icon: 'none' })
    }
    return validation
  }

  updatePage(page, { [loadingKey]: true })

  let outcome
  try {
    outcome = await action()
  } catch (error) {
    outcome = {
      kind: 'retryable-failure',
      message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
    }
  }

  if (outcome.kind === 'success') {
    // 云端重开了已有进行中记录并丢弃本次表单：归为「合并到已有进行中记录」，
    // 不显示保存成功、不排返回，用说明 modal 告知后再把结果交给页面
    if (outcome.result && outcome.result.reopened === true) {
      updatePage(page, { [loadingKey]: false })
      return wxPrompts.present({ mode: 'acknowledge', title: mergedTitle, content: mergedContent }, {
        wx: wxApi,
        fallback: { kind: 'merged', result: outcome.result }
      })
    }
    safeShowToast(wxApi, {
      title: successTitle,
      ...(successIcon ? { icon: successIcon } : {})
    })
    timer.setTimeout(() => {
      navigateBack()
    }, successDelay)
    // 已提交、等待返回：清掉「保存中/删除中」，但保持不可点，直到 navigateBack
    updatePage(page, { [loadingKey]: false, submitted: true })
    return outcome
  }

  if (outcome.kind === 'retryable-failure' && operation === 'save' && typeof refetch === 'function') {
    if (outcome.message) roomAccessOutcome.presentUserFailure(outcome.message)
    const reconciled = await confirmUnconfirmedSave({
      refetch,
      reconcile
    })
    if (reconciled.refetchFailed) {
      const refetchMessage = reconciled.error && reconciled.error.message
      if (refetchMessage) roomAccessOutcome.presentUserFailure(refetchMessage)
    }
    if (reconciled.confirmed && reconciled.record) {
      safeShowToast(wxApi, { title: '已保存' })
      timer.setTimeout(() => {
        navigateBack()
      }, successDelay)
      updatePage(page, { [loadingKey]: false, submitted: true })
      return { kind: 'success', result: { record: reconciled.record } }
    }
    if (reconciled.confirmed) {
      outcome = { kind: 'save-not-applied' }
    }
  }

  updatePage(page, { [loadingKey]: false })
  return handleFailureOutcome({
    outcome,
    wxApi,
    operation,
    retryAction: () => runCommand(options),
    navigateToBind
  })
}

function handleFailureOutcome({ outcome, operation, wxApi, retryAction, navigateToBind }) {
  return wxPrompts.present(roomAccessOutcome.presentRoomAccessFailure(outcome, operation), {
    wx: wxApi,
    retry: retryAction,
    navigateToBind
  })
}

// validate 返回空值表示通过；字符串是无法定位到字段的整体错误；
// 对象是「字段 → 一句人话」，空句的字段不算出错，全部为空等于通过。
function readValidation(validate) {
  const result = typeof validate === 'function' ? validate() : ''
  if (!result) return null
  if (typeof result === 'string') return { kind: 'validation', message: result }
  const fields = Object.keys(result).filter(field => result[field])
  if (fields.length === 0) return null
  const fieldErrors = {}
  fields.forEach(field => {
    fieldErrors[field] = result[field]
  })
  return { kind: 'validation', message: fieldErrors[fields[0]], fieldErrors }
}

async function confirmUnconfirmedSave({ refetch, reconcile }) {
  let listed
  try {
    listed = await refetch()
  } catch (error) {
    return { confirmed: false, record: null, refetchFailed: true, error }
  }
  if (!listed || listed.kind !== 'success') {
    return { confirmed: false, record: null, refetchFailed: true, error: listed }
  }
  return {
    confirmed: true,
    record: findReconciledRecord(listed.data, reconcile),
    refetchFailed: false
  }
}

function findReconciledRecord(records, reconcile) {
  const spec = reconcile && typeof reconcile === 'object' ? reconcile : {}
  const fields = spec.fields && typeof spec.fields === 'object' ? spec.fields : {}
  const keys = Object.keys(fields)
  if (keys.length === 0) return null
  const list = Array.isArray(records) ? records : []
  if (spec.id) {
    const record = list.find(item => item && String(item._id) === String(spec.id))
    if (!record || !fieldsMatch(record, fields)) return null
    return record
  }
  return list.find(item => item && fieldsMatch(item, fields)) || null
}

function fieldsMatch(record, fields) {
  return Object.keys(fields).every(key => sameFieldValue(record[key], fields[key]))
}

function sameFieldValue(actual, expected) {
  if (Array.isArray(expected) || Array.isArray(actual)) {
    const left = (Array.isArray(actual) ? actual : []).map(value => String(value)).sort()
    const right = (Array.isArray(expected) ? expected : []).map(value => String(value)).sort()
    return left.length === right.length && left.every((value, index) => value === right[index])
  }
  return String(actual == null ? '' : actual) === String(expected == null ? '' : expected)
}

function updatePage(page, update) {
  if (page && typeof page.setData === 'function') {
    page.setData(update)
  }
}

function createDefaultTimer() {
  return {
    setTimeout(handler, delay) {
      return setTimeout(handler, delay)
    }
  }
}

function createNavigateBack(wxApi) {
  if (wxApi && typeof wxApi.navigateBack === 'function') {
    return () => wxApi.navigateBack()
  }
  return () => {}
}

function createNavigateToBind(wxApi) {
  if (wxApi && typeof wxApi.navigateTo === 'function') {
    return () => wxApi.navigateTo({ url: '/pages/bind/bind' })
  }
  return () => {}
}

function getWx() {
  if (typeof wx === 'undefined') {
    throw new Error('wx is unavailable outside the WeChat runtime')
  }
  return wx
}

function resolveWxApi(options) {
  if (options && Object.prototype.hasOwnProperty.call(options, 'wx')) {
    return options.wx
  }
  return getWx()
}

function safeShowToast(wxApi, options) {
  if (wxApi && typeof wxApi.showToast === 'function') {
    wxApi.showToast(options)
  }
}

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  runRecordSave,
  runRecordDelete,
  runRecordListLoad
}
