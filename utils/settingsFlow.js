const cloudApi = require('./cloud')
const roomSessionApi = require('./room')
const roomAccessOutcome = require('./roomAccessOutcome')

function copyRoomCode(options = {}) {
  const wxApi = resolveWxApi(options)
  const roomCode = normalizeRoomCode(options.roomCode)
  if (!roomCode) {
    showToast(wxApi, { title: '请先绑定房间', icon: 'none' })
    return Promise.resolve({ kind: 'unbound' })
  }

  return new Promise(resolve => {
    if (!wxApi || typeof wxApi.setClipboardData !== 'function') {
      showToast(wxApi, { title: '复制失败', icon: 'error' })
      resolve({ kind: 'copy-failed', message: '剪贴板不可用' })
      return
    }

    wxApi.setClipboardData({
      data: roomCode,
      success: () => {
        showToast(wxApi, { title: '房间码已复制' })
        resolve({ kind: 'success', roomCode })
      },
      fail: error => {
        showToast(wxApi, { title: '复制失败', icon: 'error' })
        resolve({ kind: 'copy-failed', message: getErrorMessage(error) })
      }
    })
  })
}

async function exportRecordsAsJson(options = {}) {
  const wxApi = resolveWxApi(options)
  const cloud = options.cloud || cloudApi
  const roomSession = options.roomSession || roomSessionApi
  const now = options.now || (() => new Date().toISOString())
  const userDataPath = options.userDataPath || getUserDataPath(wxApi)
  const navigateToBind = options.navigateToBind || createNavigateToBind(wxApi)
  const hideLoading = createLoadingGuard(wxApi)

  showLoading(wxApi, { title: '导出中...' })
  try {
    const client = createRoomDataClient(cloud, roomSession)
    const periodsOutcome = await listRecords({ cloud, client, collection: 'periods' })
    if (periodsOutcome.kind !== 'success') {
      hideLoading()
      return handleExportLoadFailure(wxApi, periodsOutcome, () => exportRecordsAsJson(options), navigateToBind)
    }

    const memoriesOutcome = await listRecords({ cloud, client, collection: 'memories' })
    if (memoriesOutcome.kind !== 'success') {
      hideLoading()
      return handleExportLoadFailure(wxApi, memoriesOutcome, () => exportRecordsAsJson(options), navigateToBind)
    }

    const payload = {
      exportTime: normalizeExportTime(now()),
      periods: periodsOutcome.data,
      memories: memoriesOutcome.data
    }
    const json = JSON.stringify(payload, null, 2)
    const filePath = `${userDataPath}/minmin-calendar-backup.json`
    const fs = wxApi.getFileSystemManager()

    fs.writeFileSync(filePath, json, 'utf8')
    hideLoading()

    return await shareOrCopyJson({
      wxApi,
      filePath,
      json
    })
  } catch (error) {
    hideLoading()
    showToast(wxApi, { title: '导出失败', icon: 'error' })
    return {
      kind: 'export-failed',
      message: getErrorMessage(error)
    }
  }
}

function clearLocalCache(options = {}) {
  const wxApi = resolveWxApi(options)
  const roomSession = options.roomSession || roomSessionApi

  roomSession.clearLocalRoom()
  showToast(wxApi, { title: '已清除' })
  return Promise.resolve({ kind: 'success', roomCode: '未绑定' })
}

function createRoomDataClient(cloud, roomSession) {
  if (!cloud || typeof cloud.createRoomDataClient !== 'function') {
    return null
  }
  return cloud.createRoomDataClient({ roomSession })
}

async function listRecords({ cloud, client, collection }) {
  if (client && typeof client.list === 'function') {
    return client.list(collection)
  }

  try {
    const getter = collection === 'periods' ? cloud.getPeriods : cloud.getMemories
    const data = await getter()
    return { kind: 'success', data }
  } catch (error) {
    return {
      kind: 'retryable-failure',
      message: getErrorMessage(error),
      retry: () => listRecords({ cloud, client, collection })
    }
  }
}

function handleExportLoadFailure(wxApi, outcome, retryExport, navigateToBind) {
  const prompt = roomAccessOutcome.buildModalRoomAccessPrompt(outcome, {
    retryTitle: '导出失败',
    retryContent: '导出失败，请检查网络',
    noRoomContent: '导出前需要先绑定房间',
    repairRetryContent: getRoomRepairMessage(outcome.repair)
  })

  if (prompt.mode === 'retry') {
    return promptRetry({
      wxApi,
      title: prompt.title,
      content: prompt.content,
      retryAction: retryExport,
      fallback: outcome
    })
  }

  if (prompt.mode === 'navigate-to-bind') {
    return promptNavigateToBind({
      wxApi,
      title: prompt.title,
      content: prompt.content,
      navigateToBind,
      fallback: outcome
    })
  }

  showToast(wxApi, { title: prompt.content, icon: 'none' })
  return {
    kind: 'export-failed',
    message: prompt.content
  }
}

function getRoomRepairMessage(repair) {
  if (repair && repair.kind === 'success' && repair.bound && repair.roomCode) {
    return '房间状态已更新，请重试导出'
  }
  if (repair && repair.kind === 'success' && !repair.bound) {
    return '房间状态已变化，请重新绑定'
  }
  return repair && repair.message ? repair.message : '同步房间状态失败，请稍后重试'
}

function createLoadingGuard(wxApi) {
  let hidden = false
  return function hideLoading() {
    if (hidden) return
    hidden = true
    if (wxApi && typeof wxApi.hideLoading === 'function') {
      wxApi.hideLoading()
    }
  }
}

async function shareOrCopyJson({ wxApi, filePath, json }) {
  if (typeof wxApi.shareFileMessage === 'function') {
    const shared = await shareFile(wxApi, filePath)
    if (shared) {
      showToast(wxApi, { title: '导出成功' })
      return { kind: 'shared', filePath }
    }
  }

  await setClipboardData(wxApi, json)
  showToast(wxApi, { title: '已复制到剪贴板' })
  return { kind: 'clipboard', filePath }
}

function shareFile(wxApi, filePath) {
  return new Promise(resolve => {
    wxApi.shareFileMessage({
      filePath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function setClipboardData(wxApi, data) {
  return new Promise((resolve, reject) => {
    wxApi.setClipboardData({
      data,
      success: resolve,
      fail: reject
    })
  })
}

function normalizeRoomCode(value) {
  const roomCode = String(value || '').trim()
  if (!roomCode || roomCode === '未绑定') {
    return ''
  }
  return roomCode
}

function normalizeExportTime(value) {
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  return new Date(value || Date.now()).toISOString()
}

function getUserDataPath(wxApi) {
  return wxApi && wxApi.env && wxApi.env.USER_DATA_PATH ? wxApi.env.USER_DATA_PATH : ''
}

function showToast(wxApi, options) {
  if (wxApi && typeof wxApi.showToast === 'function') {
    wxApi.showToast(options)
  }
}

function showLoading(wxApi, options) {
  if (wxApi && typeof wxApi.showLoading === 'function') {
    wxApi.showLoading(options)
  }
}

function createNavigateToBind(wxApi) {
  if (wxApi && typeof wxApi.navigateTo === 'function') {
    return () => wxApi.navigateTo({ url: '/pages/bind/bind' })
  }
  return () => {}
}

function promptRetry({ wxApi, title, content, retryAction, fallback }) {
  if (!wxApi || typeof wxApi.showModal !== 'function' || typeof retryAction !== 'function') {
    showToast(wxApi, { title: content, icon: 'none' })
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
    showToast(wxApi, { title: content, icon: 'none' })
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

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  copyRoomCode,
  exportRecordsAsJson,
  clearLocalCache
}
