const cloudApi = require('./cloud')
const roomSessionApi = require('./room')
const roomAccessOutcome = require('./roomAccessOutcome')
const roomRecordsSnapshot = require('./roomRecordsSnapshot')
const wxPrompts = require('./wxPrompts')

const ROOM_LEAVE_NOTICE_KEY = 'bindUnbindNotice'

// Pages render the outcome; confirmation, server leave and the pending notice belong here.
function leaveRoom({ onResult, notifyOnBind = false }) {
  const wxApi = getWx()
  wxPrompts.modal({
    title: '解除绑定',
    content: '解除绑定后你会退出这个房间。TA 还在的话会留在房间里；房间里只剩你时，房间会归档。之后在绑定页点「创建」即可恢复。',
    confirmText: '解除绑定',
    confirmColor: '#F97373',
    success: async response => {
      if (!response.confirm) {
        onResult({ kind: 'cancelled' })
        return
      }
      const result = await roomSessionApi.leaveRoom()
      if (result.code !== 0) {
        onResult({ kind: 'failure', message: result.msg || '解除绑定失败，请稍后重试' })
        return
      }
      if (notifyOnBind) {
        // Optional feedback must not block navigation after the server has left the Room.
        try {
          wxApi.setStorageSync(ROOM_LEAVE_NOTICE_KEY, '1')
        } catch (e) {}
      }
      onResult({ kind: 'success' })
    },
    fail: error => onResult({
      kind: 'failure',
      message: roomAccessOutcome.presentUserFailure(error.errMsg || getErrorMessage(error))
    })
  }, wxApi)
}

function consumeRoomLeaveNotice() {
  const wxApi = getWx()
  // Notice storage is best-effort; Room verification must still run on Bind.
  let notice = ''
  try {
    notice = wxApi.getStorageSync(ROOM_LEAVE_NOTICE_KEY)
  } catch (e) {}
  if (!notice) return
  try {
    wxApi.removeStorageSync(ROOM_LEAVE_NOTICE_KEY)
  } catch (e) {}
  wxApi.showToast({ title: '已解除绑定', icon: 'none' })
}

// issue #150：分享失败后的选择；「取消」是系统操作菜单自带的取消键
const SHARE_FAILURE_ACTIONS = [
  { label: '重试分享', choice: 'retry' },
  { label: '复制 JSON', choice: 'copy' }
]
const SHARE_FAILURE_ALERT = '分享没有完成。选「复制 JSON」会把全部经期和欢乐时光放进剪贴板。'

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
        resolve({ kind: 'copy-failed', message: roomAccessOutcome.presentUserFailure(getErrorMessage(error)) })
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

  if (options.confirmBeforeExport) {
    const confirmation = await confirmExport({ wx: wxApi })
    if (confirmation.kind !== 'confirmed') {
      return confirmation
    }
  }

  showLoading(wxApi, { title: '导出中...' })
  try {
    const client = createRoomDataClient(cloud, roomSession)
    const snapshot = await roomRecordsSnapshot.loadExportRecordsSnapshot({ client })
    if (snapshot.kind !== 'success') {
      hideLoading()
      return handleExportLoadFailure(wxApi, snapshot.outcome, () => exportRecordsAsJson(options), navigateToBind)
    }

    const payload = {
      exportTime: normalizeExportTime(now()),
      periods: snapshot.collections.periods.data,
      memories: snapshot.collections.memories.data
    }
    const json = JSON.stringify(payload, null, 2)
    const filePath = `${userDataPath}/minmin-calendar-backup.json`
    const fs = wxApi.getFileSystemManager()

    fs.writeFileSync(filePath, json, 'utf8')
    hideLoading()

    return await shareExportJson({
      wxApi,
      filePath,
      json
    })
  } catch (error) {
    hideLoading()
    showToast(wxApi, { title: '导出失败', icon: 'error' })
    return {
      kind: 'export-failed',
      message: roomAccessOutcome.presentUserFailure(getErrorMessage(error))
    }
  }
}

function clearLocalCache(options = {}) {
  const wxApi = resolveWxApi(options)
  const roomSession = options.roomSession || roomSessionApi

  roomSession.clearLocalRoom()
  showToast(wxApi, { title: '已清除本机房间码' })
  return roomSession.getActiveRoom().then(room => ({ kind: 'success', room }))
}

function confirmExport(options = {}) {
  const wxApi = resolveWxApi(options)
  return new Promise(resolve => {
    wxPrompts.modal({
      title: '导出数据',
      content: '会导出全部经期和欢乐时光。建议发到「文件传输助手」保存。目前还不能导入恢复。',
      confirmText: '开始导出',
      cancelText: '取消',
      success: result => {
        resolve(result && result.confirm ? { kind: 'confirmed' } : { kind: 'cancelled' })
      }
    }, wxApi)
  })
}

function createRoomDataClient(cloud, roomSession) {
  if (!cloud || typeof cloud.createRoomDataClient !== 'function') {
    return null
  }
  return cloud.createRoomDataClient({ roomSession })
}

function handleExportLoadFailure(wxApi, outcome, retryExport, navigateToBind) {
  const presentation = roomAccessOutcome.presentRoomAccessFailure(outcome, 'export')
  return wxPrompts.present(presentation, {
    wx: wxApi,
    retry: retryExport,
    navigateToBind,
    fallback: presentation.mode === 'toast' ? { kind: 'export-failed', message: presentation.content } : outcome
  })
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

// issue #150：分享失败只得到可识别的 share-failed，剪贴板只在用户明确选「复制 JSON」后写入
async function shareExportJson({ wxApi, filePath, json }) {
  const shared = await shareFile(wxApi, filePath)
  if (shared === 'shared') {
    showToast(wxApi, { title: '导出成功' })
    return { kind: 'shared', filePath }
  }
  // 用户取消分享面板：直接结束，不动剪贴板，也不提示已复制
  if (shared === 'cancelled') {
    return { kind: 'cancelled', filePath }
  }

  const choice = await chooseAfterShareFailure(wxApi)
  if (choice === 'retry') {
    return shareExportJson({ wxApi, filePath, json })
  }
  if (choice === 'copy') {
    try {
      await setClipboardData(wxApi, json)
    } catch (error) {
      showToast(wxApi, { title: '复制失败', icon: 'error' })
      return { kind: 'copy-failed', filePath }
    }
    showToast(wxApi, { title: '已复制到剪贴板' })
    return { kind: 'copied', filePath }
  }
  return { kind: 'share-failed', filePath }
}

// 点蒙层在新版微信不会关闭菜单，取消分支不承载业务，只结束流程
function chooseAfterShareFailure(wxApi) {
  return new Promise(resolve => {
    wxApi.showActionSheet({
      alertText: SHARE_FAILURE_ALERT,
      itemList: SHARE_FAILURE_ACTIONS.map(action => action.label),
      success: result => {
        const action = SHARE_FAILURE_ACTIONS[result && result.tapIndex]
        resolve(action ? action.choice : 'cancel')
      },
      fail: () => resolve('cancel')
    })
  })
}

function shareFile(wxApi, filePath) {
  if (typeof wxApi.shareFileMessage !== 'function') {
    return Promise.resolve('failed')
  }
  return new Promise(resolve => {
    wxApi.shareFileMessage({
      filePath,
      success: () => resolve('shared'),
      fail: error => resolve(isShareCancelled(error) ? 'cancelled' : 'failed')
    })
  })
}

function isShareCancelled(error) {
  const errMsg = error && error.errMsg ? String(error.errMsg) : ''
  return errMsg.indexOf('cancel') !== -1
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
  leaveRoom,
  consumeRoomLeaveNotice,
  copyRoomCode,
  exportRecordsAsJson,
  clearLocalCache,
  confirmExport
}
