const ROOM_STATUS_SEEN_KEY = 'roomStatusSeen'
const PARTNER_WELCOME_KEY = 'partnerWelcome'
// 客户端认得的 Room 配对状态只有这两个：列表结果只带回它们（utils/cloud.js），记下的状态也只认它们
const PAIRING_STATUSES = ['waiting', 'paired']

// 认得的配对状态原样返回，其余（缺失、不认识的取值）一律是 ''
function acceptedPairingStatus(status) {
  return PAIRING_STATUSES.includes(status) ? status : ''
}

function rememberRoomStatus(status, storage = createWxStorage()) {
  const current = acceptedPairingStatus(status)
  if (!current) return false
  const previous = storage.get(ROOM_STATUS_SEEN_KEY) || ''
  if (previous === current) return false
  storage.set(ROOM_STATUS_SEEN_KEY, current)
  return previous === 'waiting' && current === 'paired'
}

function markPartnerWelcomePending(storage = createWxStorage()) {
  storage.set(PARTNER_WELCOME_KEY, 'pending')
}

// 待显示的欢迎只在首页确认欢迎条已渲染后才记为看过（issue #149）
function isPartnerWelcomePending(storage = createWxStorage()) {
  return (storage.get(PARTNER_WELCOME_KEY) || '') === 'pending'
}

function markPartnerWelcomeSeen(storage = createWxStorage()) {
  storage.set(PARTNER_WELCOME_KEY, 'seen')
}

function createWxStorage() {
  return {
    get(key) {
      try {
        return wx.getStorageSync(key) || ''
      } catch (error) {
        return ''
      }
    },
    set(key, value) {
      try {
        wx.setStorageSync(key, value)
      } catch (error) {}
    }
  }
}

module.exports = {
  acceptedPairingStatus,
  rememberRoomStatus,
  markPartnerWelcomePending,
  isPartnerWelcomePending,
  markPartnerWelcomeSeen
}
