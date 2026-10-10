/**
 * Adapter between record operations and the WeChat page lifecycle.
 * Business outcome classification stays in roomAccessOutcome; this module
 * intentionally owns only page state, wx feedback, navigation, and retries.
 */
const roomAccessOutcome = require('./roomAccessOutcome')

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
    failureTitle = '保存失败',
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
    failureTitle,
    mergedTitle: opts.mergedTitle,
    mergedContent: opts.mergedContent,
    navigateBack,
    navigateToBind,
    successDelay,
    retryableMode: 'confirm-state',
    retryableAdvice: '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交'
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

  if (!wxApi || typeof wxApi.showModal !== 'function') {
    return Promise.resolve({ kind: 'cancelled' })
  }

  // 确认之前不进入删除忙碌态：按钮仍读「删除此记录」，取消后无需复位。
  return new Promise(resolve => {
    wxApi.showModal({
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
          retryableMode: 'confirm-state',
          retryableAdvice: '删除结果暂未确认，请返回列表刷新后确认记录是否已删除，避免重复操作'
        }))
      }
    })
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
    loadFailedKey = 'loadFailed',
    retryableTitle = '加载失败，请检查网络',
    failureTitle = '加载失败',
    roomRepairTitle = '房间状态已变化，请重新绑定'
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
      message: getErrorMessage(error),
      retry: action
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
    retryableTitle,
    failureTitle,
    roomRepairTitle,
    retryAction: () => runRecordListLoad(options),
    navigateToBind,
    retryableMode: 'retry'
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
    failureTitle,
    mergedTitle = '已合并到已有记录',
    mergedContent = '房间里已有一条进行中的记录，已为你打开它',
    navigateBack,
    navigateToBind,
    successDelay,
    retryableMode = 'confirm-state',
    retryableAdvice = `${failureTitle}，请稍后刷新后确认结果`
  } = options

  const validationMessage = typeof validate === 'function' ? validate() : ''
  if (validationMessage) {
    safeShowToast(wxApi, { title: validationMessage, icon: 'none' })
    return { kind: 'validation', message: validationMessage }
  }

  updatePage(page, { [loadingKey]: true })

  let outcome
  try {
    outcome = await action()
  } catch (error) {
    outcome = {
      kind: 'retryable-failure',
      message: getErrorMessage(error),
      retry: action
    }
  }

  if (outcome.kind === 'success') {
    // 云端重开了已有进行中记录并丢弃本次表单：归为「合并到已有进行中记录」，
    // 不显示保存成功、不排返回，用说明 modal 告知后再把结果交给页面
    if (outcome.result && outcome.result.reopened === true) {
      updatePage(page, { [loadingKey]: false })
      return promptAcknowledge({
        wxApi,
        title: mergedTitle,
        content: mergedContent,
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

  updatePage(page, { [loadingKey]: false })
  return handleFailureOutcome({
    outcome,
    wxApi,
    retryableTitle: `${failureTitle}，请重试`,
    failureTitle,
    roomRepairTitle: '房间状态已变化，请重新绑定',
    retryAction: () => runCommand(options),
    navigateToBind,
    retryableMode,
    retryableAdvice
  })
}

async function handleFailureOutcome({
  outcome,
  wxApi,
  retryableTitle,
  failureTitle,
  roomRepairTitle,
  retryAction,
  navigateToBind,
  retryableMode = 'retry',
  retryableAdvice = retryableTitle
}) {
  if (outcome.kind === 'retryable-failure') {
    if (retryableMode !== 'retry') {
      const normalized = {
        ...outcome,
        action: 'refresh-check',
        message: retryableAdvice
      }
      return promptAcknowledge({
        wxApi,
        title: failureTitle,
        content: retryableAdvice,
        fallback: normalized
      })
    }
    return promptRetry({
      wxApi,
      title: failureTitle,
      content: retryableTitle,
      retryAction,
      fallback: outcome
    })
  }

  if (outcome.kind === 'room-repair') {
    const normalized = normalizeRoomRepairOutcome(outcome, roomRepairTitle)
    if (normalized.action === 'retry') {
      return promptRetry({
        wxApi,
        title: '房间状态已同步',
        content: normalized.message,
        retryAction,
        fallback: normalized
      })
    }
    if (normalized.action === 'rebind') {
      return promptNavigateToBind({
        wxApi,
        title: '房间状态已变化',
        content: normalized.message,
        navigateToBind,
        fallback: normalized
      })
    }
    if (retryableMode === 'retry') {
      return promptRetry({
        wxApi,
        title: failureTitle,
        content: normalized.message,
        retryAction,
        fallback: normalized
      })
    }
    const acknowledged = {
      ...normalized,
      action: 'refresh-check',
      message: buildRecoveryAdviceMessage(normalized.message, retryableAdvice)
    }
    return promptAcknowledge({
      wxApi,
      title: failureTitle,
      content: acknowledged.message,
      fallback: acknowledged
    })
  }

  if (outcome.kind === 'no-room') {
    const normalized = {
      kind: 'no-room',
      message: '请先绑定房间'
    }
    return promptNavigateToBind({
      wxApi,
      title: '请先绑定房间',
      content: '当前操作需要先绑定房间',
      navigateToBind,
      fallback: normalized
    })
  }

  const message = outcome.message || failureTitle
  safeShowToast(wxApi, { title: message, icon: 'none' })
  return {
    ...outcome,
    message
  }
}

function normalizeRoomRepairOutcome(outcome, roomRepairTitle) {
  return {
    ...outcome,
    ...roomAccessOutcome.buildRoomRepairAction(outcome, {
      rebindMessage: roomRepairTitle
    })
  }
}

function buildRecoveryAdviceMessage(message, advice) {
  if (!advice) {
    return message
  }
  if (!message) {
    return advice
  }
  if (message === advice) {
    return message
  }
  return `${message}\n\n${advice}`
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

function promptAcknowledge({ wxApi, title, content, fallback }) {
  if (!wxApi || typeof wxApi.showModal !== 'function') {
    safeShowToast(wxApi, { title: content, icon: 'none' })
    return Promise.resolve(fallback)
  }

  return new Promise(resolve => {
    wxApi.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了',
      success: () => resolve(fallback)
    })
  })
}

function promptRetry({ wxApi, title, content, retryAction, fallback }) {
  if (!wxApi || typeof wxApi.showModal !== 'function' || typeof retryAction !== 'function') {
    safeShowToast(wxApi, { title: content, icon: 'none' })
    return Promise.resolve(fallback)
  }

  return new Promise(resolve => {
    wxApi.showModal({
      title,
      content,
      confirmText: '重试',
      cancelText: '取消',
      success: async (result) => {
        if (!result.confirm) {
          resolve(fallback)
          return
        }
        resolve(retryAction())
      }
    })
  })
}

function promptNavigateToBind({ wxApi, title, content, navigateToBind, fallback }) {
  if (!wxApi || typeof wxApi.showModal !== 'function' || typeof navigateToBind !== 'function') {
    safeShowToast(wxApi, { title: content, icon: 'none' })
    return Promise.resolve(fallback)
  }

  return new Promise(resolve => {
    wxApi.showModal({
      title,
      content,
      confirmText: '去绑定',
      cancelText: '取消',
      success: async (result) => {
        if (result.confirm) {
          navigateToBind()
        }
        resolve(fallback)
      }
    })
  })
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
