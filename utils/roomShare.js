const APP_DISPLAY_NAME = '美少女的日历'
const DEFAULT_SHARE_PATH = '/pages/bind/bind'
const INVITE_IMAGE_URL = '/images/invite-card.png'

// Static artwork never carries a Room code or page content. Only an actual waiting Room
// puts its code in the launch path; every other share is the ordinary application card.
function buildRoomShareCard({ roomCode = '', roomStatus = '' } = {}) {
  if (roomStatus === 'waiting' && roomCode) {
    return {
      title: '邀请你加入我的日历',
      path: `${DEFAULT_SHARE_PATH}?roomCode=${encodeURIComponent(roomCode)}`,
      imageUrl: INVITE_IMAGE_URL
    }
  }
  return {
    title: APP_DISPLAY_NAME,
    path: DEFAULT_SHARE_PATH,
    imageUrl: INVITE_IMAGE_URL
  }
}

module.exports = { buildRoomShareCard }
