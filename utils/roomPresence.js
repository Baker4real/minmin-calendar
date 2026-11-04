const ROOM_STATUS_SEEN_KEY = 'roomStatusSeen'
const PARTNER_WELCOME_KEY = 'partnerWelcome'

function rememberRoomStatus(status, storage = createWxStorage()) {
  const current = status === 'waiting' || status === 'paired' ? status : ''
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
  rememberRoomStatus,
  markPartnerWelcomePending,
  isPartnerWelcomePending,
  markPartnerWelcomeSeen
}
