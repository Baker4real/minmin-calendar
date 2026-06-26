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
    successDelay
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
          navigateBack
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
    roomRepairTitle = '房间状态已变化，请重新绑定'
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

  const handled = handleFailureOutcome({
    outcome,
    wxApi,
    retryableTitle,
    failureTitle,
    roomRepairTitle
  })
  updatePage(page, { [loadingKey]: false })
  return handled
}

async function runCommand(options) {
  const {
    page,
    wxApi,
    timer,
    action,
    validate,
    loadingKey,
    successTitle,
    failureTitle,
    navigateBack,
    successDelay
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

  const handled = handleFailureOutcome({
    outcome,
    wxApi,
    retryableTitle: `${failureTitle}，请重试`,
    failureTitle,
    roomRepairTitle: '房间状态已变化，请重新绑定'
  })
  updatePage(page, { [loadingKey]: false })
  return handled
}

function handleFailureOutcome({ outcome, wxApi, retryableTitle, failureTitle, roomRepairTitle }) {
  if (outcome.kind === 'retryable-failure') {
    wxApi.showToast({ title: retryableTitle, icon: 'none' })
    return outcome
  }

  if (outcome.kind === 'room-repair') {
    const normalized = normalizeRoomRepairOutcome(outcome, roomRepairTitle)
    wxApi.showToast({ title: normalized.message, icon: 'none' })
    return normalized
  }

  if (outcome.kind === 'no-room') {
    const normalized = {
      kind: 'no-room',
      message: '请先绑定房间'
    }
    wxApi.showToast({ title: normalized.message, icon: 'none' })
    return normalized
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
