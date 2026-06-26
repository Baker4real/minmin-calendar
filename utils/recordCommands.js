function runRecordSave(options) {
  const {
    page,
    wx: wxApi = getWx(),
    timer = createDefaultTimer(),
    action,
    validate,
    loadingKey = 'saving',
    successTitle = '保存成功',
    failureTitle = '保存失败',
    navigateBack = createNavigateBack(wxApi),
    navigateToBind = createNavigateToBind(wxApi),
    successDelay = 1000
  } = options || {}

  return runCommand({
    page,
    wxApi,
    timer,
    action,
    validate,
    loadingKey,
    successTitle,
    failureTitle,
    navigateBack,
    navigateToBind,
    successDelay,
    retryableMode: 'confirm-state',
    retryableAdvice: '保存结果暂未确认，请返回列表刷新后检查是否已生效，避免重复提交'
  })
}

function runRecordDelete(options) {
  const {
    wx: wxApi = getWx(),
    confirmTitle = '确认删除',
    navigateBack = createNavigateBack(wxApi)
  } = options || {}

  return new Promise(resolve => {
    wxApi.showModal({
      title: confirmTitle,
      success: async (result) => {
        if (!result.confirm) {
          resolve({ kind: 'cancelled' })
          return
        }

        resolve(runCommand({
          ...options,
          wxApi,
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
  const {
    page,
    wx: wxApi = getWx(),
    action,
    mapRecords,
    onLoaded,
    itemsKey,
    loadingKey = 'loading',
    retryableTitle = '加载失败，请检查网络',
    failureTitle = '加载失败',
    roomRepairTitle = '房间状态已变化，请重新绑定',
    navigateToBind = createNavigateToBind(wxApi)
  } = options || {}

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
    updatePage(page, { [itemsKey]: viewData })
    if (typeof onLoaded === 'function') {
      onLoaded(records)
    }
    updatePage(page, { [loadingKey]: false })
    return outcome
  }

  updatePage(page, { [loadingKey]: false })
  return handleFailureOutcome({
    outcome,
    wxApi,
    retryableTitle,
    failureTitle,
    roomRepairTitle,
    retryAction: () => runRecordListLoad(options),
    navigateToBind,
    retryableMode: 'retry'
  })
}

async function runCommand(options) {
  const {
    page,
    wxApi,
    timer,
    action,
    validate,
    loadingKey = 'saving',
    successTitle,
    failureTitle,
    navigateBack,
    navigateToBind,
    successDelay,
    retryableMode = 'confirm-state',
    retryableAdvice = `${failureTitle}，请稍后刷新后确认结果`
  } = options

  const validationMessage = typeof validate === 'function' ? validate() : ''
  if (validationMessage) {
    wxApi.showToast({ title: validationMessage, icon: 'none' })
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
    wxApi.showToast({ title: successTitle })
    timer.setTimeout(() => {
      navigateBack()
    }, successDelay)
    updatePage(page, { [loadingKey]: false })
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
    wxApi.showToast({ title: normalized.message, icon: 'none' })
    return normalized
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
  wxApi.showToast({ title: message, icon: 'none' })
  return {
    ...outcome,
    message
  }
}

function normalizeRoomRepairOutcome(outcome, roomRepairTitle) {
  const repair = outcome.repair || {}
  if (repair.kind === 'success' && repair.bound) {
    return {
      ...outcome,
      action: 'retry',
      message: '房间状态已同步，请重试'
    }
  }

  if (repair.kind === 'success' && !repair.bound) {
    return {
      ...outcome,
      action: 'rebind',
      message: roomRepairTitle
    }
  }

  return {
    ...outcome,
    action: 'repair-retry',
    message: repair.message || '同步房间状态失败，请稍后重试'
  }
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
    wxApi.showToast({ title: content, icon: 'none' })
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
    wxApi.showToast({ title: content, icon: 'none' })
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
    wxApi.showToast({ title: content, icon: 'none' })
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

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  runRecordSave,
  runRecordDelete,
  runRecordListLoad
}
