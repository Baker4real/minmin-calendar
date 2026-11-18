const cloudApi = require('./cloud')
const roomSessionApi = require('./room')
const roomAccessOutcome = require('./roomAccessOutcome')
const roomRecordsSnapshot = require('./roomRecordsSnapshot')
const wxPrompts = require('./wxPrompts')

let pendingRoomLeave = null

// Pages render the outcome; confirmation, server leave and the pending notice belong here.
async function leaveRoom(options = {}) {
  const onResult = options.onResult || (() => {})
  const finish = result => {
    onResult(result)
    return result
  }
  if (typeof options.confirm !== 'function') return finish({ kind: 'cancelled' })
  const action = await options.confirm({
    name: '解除绑定',
    title: '解除绑定？',
    content: roomLeaveContent(options.roomStatus, options.roomCode),
    actions: [
      { id: 'confirm', text: '解除绑定', kind: 'danger' },
      { id: 'cancel', text: '取消', kind: 'secondary' }
    ]
  })
  if (action !== 'confirm') return finish({ kind: 'cancelled' })

  const roomSession = options.roomSession || roomSessionApi
  const result = await roomSession.leaveRoom()
  if (result.code !== 0) {
    return finish({ kind: 'failure', message: result.msg || '解除绑定失败，请稍后重试' })
  }
  const outcome = {
    kind: 'success',
    archived: result.archivedCount > 0,
    roomCode: normalizeRoomCode(options.roomCode)
  }
  pendingRoomLeave = { ...outcome, notifyOnBind: options.notifyOnBind === true }
  return finish(outcome)
}

function roomLeaveContent(roomStatus, roomCode) {
  const code = normalizeRoomCode(roomCode)
  const rejoin = code ? `房间码 ${code} ` : '原来的房间码'
  if (roomStatus === 'paired') {
    return `解除后你这边看不到这本日历；记录留在房间里，TA 照常能看。想回来，用${rejoin}重新加入`
  }
  if (roomStatus === 'waiting') {
    return '房间里只有你。解除后房间会存起来，记录不删；之后在绑定页点「我来建房间」就能恢复原来的房间和记录'
  }
  return `解除后你这边看不到这本日历，记录不会删除。TA 还在房间里时，用${rejoin}加入；房间里只剩你时，在绑定页点「我来建房间」恢复`
}

function consumeRoomLeaveOutcome(options = {}) {
  const outcome = pendingRoomLeave
  pendingRoomLeave = null
  if (!outcome) return null
  if (outcome.notifyOnBind) {
    showToast(resolveWxApi(options), { title: '已解除绑定', icon: 'none' })
  }
  return {
    kind: outcome.kind,
    archived: outcome.archived,
    roomCode: outcome.roomCode,
    recoveryText: roomLeaveRecoveryText(outcome)
  }
}

function roomLeaveRecoveryText(outcome) {
  if (outcome.archived) return '原来的房间已经存起来，点「我来建房间」就能恢复'
  const code = normalizeRoomCode(outcome.roomCode)
  const rejoin = code ? `房间码 ${code} ` : '原来的房间码'
  return `想回原来的房间，用${rejoin}加入`
}

// issue #150：分享失败后的选择由共享确认面板承载；所有取消路径都只结束流程。
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
    const confirmation = await confirmExport({ confirm: options.confirm })
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
      json,
      confirm: options.confirm
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

async function confirmResync(options = {}) {
  if (typeof options.confirm !== 'function') return { kind: 'cancelled' }
  const action = await options.confirm({
    name: '重新同步房间',
    title: '重新同步房间？',
    content: '重新从云端读一次你所在的房间，不会删除任何记录',
    actions: [
      { id: 'confirm', text: '重新同步', kind: 'primary' },
      { id: 'cancel', text: '取消', kind: 'secondary' }
    ]
  })
  return { kind: action === 'confirm' ? 'confirmed' : 'cancelled' }
}

async function clearLocalCache(options = {}) {
  const wxApi = resolveWxApi(options)
  const roomSession = options.roomSession || roomSessionApi

  roomSession.clearLocalRoom()
  const room = await roomSession.getActiveRoom()
  if (room && (room.kind === 'success' || room.kind === 'no-room')) {
    showToast(wxApi, { title: '已重新同步' })
  }
  return { kind: 'success', room }
}

async function confirmExport(options = {}) {
  if (typeof options.confirm !== 'function') return { kind: 'cancelled' }
  const action = await options.confirm({
    name: '导出数据',
    title: '导出数据',
    content: '会导出全部经期和欢乐时光。建议发到「文件传输助手」保存。目前还不能导入恢复。',
    actions: [
      { id: 'confirm', text: '开始导出', kind: 'primary' },
      { id: 'cancel', text: '取消', kind: 'secondary' }
    ]
  })
  return { kind: action === 'confirm' ? 'confirmed' : 'cancelled' }
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

// issue #150：分享失败只得到可识别的 share-failed，剪贴板只在用户明确选「复制成文字」后写入
async function shareExportJson({ wxApi, filePath, json, confirm }) {
  const shared = await shareFile(wxApi, filePath)
  if (shared === 'shared') {
    showToast(wxApi, { title: '导出成功' })
    return { kind: 'shared', filePath }
  }
  // 用户取消分享面板：直接结束，不动剪贴板，也不提示已复制
  if (shared === 'cancelled') {
    return { kind: 'cancelled', filePath }
  }

  const choice = await chooseAfterShareFailure(confirm)
  if (choice === 'retry') {
    return shareExportJson({ wxApi, filePath, json, confirm })
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

async function chooseAfterShareFailure(confirm) {
  if (typeof confirm !== 'function') return 'cancel'
  const action = await confirm({
    name: '分享没有完成',
    title: '分享没有完成',
    content: '选「复制成文字」会把全部经期和欢乐时光放进剪贴板',
    actions: [
      { id: 'retry', text: '重试分享', kind: 'primary' },
      { id: 'copy', text: '复制成文字', kind: 'secondary' },
      { id: 'cancel', text: '取消', kind: 'secondary' }
    ]
  })
  return action === 'retry' || action === 'copy' ? action : 'cancel'
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
  consumeRoomLeaveOutcome,
  copyRoomCode,
  exportRecordsAsJson,
  clearLocalCache,
  confirmResync,
  confirmExport
}
