const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

// issue #78：房间码复制/解除绑定同屏可达、清除本地数据文案与行为对齐的页面接缝测试。
// issue #88：#78 的绑定页/设置页复制键像素同款契约解除，两页复制键改为各自独立形态断言，
// 绑定页主按钮族/复制键/解除绑定按粉域试点形态断言。
// 观察用户能看见或能做到的事：哪个控件在场、哪句话显示、点按后落到哪个状态；
// 不断言私有结构。接缝与 tests/page-registration.test.js 的 loadPageHarness 同构（本文件自有最小副本）。

const repoRoot = path.join(__dirname, '..')

const readPageFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('bind bound screen puts the copy button in the same row as the room code, ahead of the enter-app main button', () => {
  const wxml = readPageFile('pages/bind/bind.wxml')
  const boundCard = sliceBetween(wxml, 'wx:if="{{bound}}"', 'wx:else')

  const copyButton = /class="copy-btn"[^>]*bindtap="copyRoomCode"/.exec(boundCard)
  assert.ok(copyButton, 'bound card must expose a copy button')
  assert.match(boundCard, /aria-label="复制房间码"/)

  // issue #84：房间码文本回归纯展示，已绑定屏只有复制键这一个复制入口
  assert.equal(
    (boundCard.match(/bindtap="copyRoomCode"/g) || []).length,
    1,
    'the bound screen must expose exactly one copy entry'
  )
  assert.doesNotMatch(
    boundCard,
    /class="bound-code"[^>]*\s(?:bindtap|aria-role|aria-label)=/,
    'the room code text must stay plain display text, not a control'
  )

  // issue #83：复制键紧贴房间码正后方，两者同处一个行容器（容器开→房间码→复制键→容器闭），
  // 不再是复制键独占的居中行
  assert.match(
    boundCard,
    /<view class="[^"]*">\s*<text class="bound-code"[^>]*>[^<]*<\/text>\s*<view class="copy-btn"[^>]*bindtap="copyRoomCode"[^>]*>[^<]*<\/view>\s*<\/view>/,
    'the copy button must sit in the same row container as the room code'
  )

  assert.match(
    boundCard,
    /class="btn-premium"[^>]*bindtap="goHome"[^>]*aria-label="进入应用"/,
    '进入应用 remains the main button on the bound screen'
  )
  assert.match(
    boundCard,
    /class="btn-danger"[^>]*bindtap="unbind"/,
    'bound screen keeps its unbind action'
  )

  const unboundCard = wxml.slice(wxml.indexOf('wx:else') + 'wx:else'.length)
  assert.doesNotMatch(
    unboundCard,
    /class="copy-btn"/,
    'copy button belongs to the bound screen, not the create/join form'
  )
})

// issue #88：#78 的「绑定页/设置页复制键像素同款」契约正式解除——绑定页整页换装粉胶囊后
// 两页视觉域分离，同款不再成立；两页各自登记独立形态断言，设置页 .copy-btn 零改动。
// 重建条件（全局视觉定稿若两页复制键回归同域同形）：恢复 fill/label/radius/padding/shadow 全等断言。
test('bind copy button is the pink pilot pill while settings keeps its rose small button', () => {
  const bindRule = findRule(readPageFile('pages/bind/bind.wxss'), '.copy-btn')
  const settingsRule = findRule(readPageFile('pages/settings/settings.wxss'), '.copy-btn')

  // 绑定页：与主按钮同族的粉胶囊，88rpx 触控高度
  assert.equal(bindRule.background, 'var(--bind-cta-pink)')
  assert.equal(bindRule.color, 'var(--bind-canvas-bottom)')
  assert.equal(bindRule['border-radius'], 'var(--radius-full)')
  assert.equal(bindRule['min-height'], '88rpx')

  // 设置页零改动：玫瑰底、海军字、radius-sm 小操作圆角
  assert.equal(settingsRule.background, 'var(--aurora-pink)')
  assert.equal(settingsRule.color, '#0A0E27')
  assert.equal(settingsRule['border-radius'], 'var(--radius-sm)')

  // 像素同款断言不再成立：两页复制键底色与圆角分叉
  assert.notEqual(bindRule.background, settingsRule.background)
  assert.notEqual(bindRule['border-radius'], settingsRule['border-radius'])
})

test('bind main button family is the pink pill and unbind is the pink ghost (issue #88)', () => {
  const css = readPageFile('pages/bind/bind.wxss')

  // 主按钮族（进入应用/创建我的房间/加入房间）页面级覆盖：粉底、深紫字、胶囊圆角、88rpx 触控高度
  const premiumRule = findRule(css, '.btn-premium')
  assert.equal(premiumRule.background, 'var(--bind-cta-pink)')
  assert.equal(premiumRule.color, 'var(--bind-canvas-bottom)')
  assert.equal(premiumRule['border-radius'], 'var(--radius-full)')
  assert.equal(premiumRule['min-height'], '88rpx')

  // 解除绑定：透明底 + 粉描边 + 粉字的幽灵形态（警示红族已移出该按钮）
  const dangerRule = findRule(css, '.btn-danger')
  assert.equal(dangerRule.background, 'transparent')
  assert.equal(dangerRule.color, 'var(--bind-ghost-pink)')
  assert.match(dangerRule.border, /1px solid rgba\(255,\s*143,\s*190,\s*0\.45\)/)

  // Pressed 不再继承 app 级红 tint：叠粉 tint，红色通道不得回到绑定页按钮
  const dangerActive = findRule(css, '.btn-danger:active')
  assert.match(dangerActive.background, /rgba\(255,\s*143,\s*190,\s*0\.12\)/)
  assert.doesNotMatch(dangerActive.background, /249,\s*115,\s*115/)
})

// issue #89：未绑定态整卡换装收口——tab 条与输入框玻璃面切紫域、选中 tab 换粉胶囊、
// 聚焦描边映射粉域；输入行为（6 位上限/等宽数字/逐字槽位/1px 实线描边）零变化；
// 需解绑中间态入口在场，错误提示保持警示红族形态。
test('bind unbound form rides the purple-pink domain while the error strip keeps the warning-red family', () => {
  const css = readPageFile('pages/bind/bind.wxss')

  // tab 条与输入框玻璃面与表单卡同配方切紫域（tab 条保留自身更淡的白玻璃层），海军回退退场
  const tabBar = findRule(css, '.tab-bar')
  assert.equal(
    tabBar.background,
    'rgba(255,255,255,0.05), var(--bind-glass-tint), var(--bind-glass-fallback)'
  )
  const codeInput = findRule(css, '.code-input')
  assert.equal(
    codeInput.background,
    'var(--glass-bg), var(--bind-glass-tint), var(--bind-glass-fallback)'
  )
  for (const rule of [tabBar, codeInput]) {
    assert.doesNotMatch(rule.background, /--glass-fallback/, 'navy glass fallback must leave the unbound form')
  }

  // 选中 tab 与主按钮同族：粉底 + 深紫字
  const activeTab = findRule(css, '.tab.active')
  assert.equal(activeTab.background, 'var(--bind-cta-pink)')
  assert.equal(activeTab.color, 'var(--bind-canvas-bottom)')

  // 聚焦描边映射粉域，1px 实线形态不变
  const focus = findRule(css, '.code-input:focus')
  assert.equal(focus['border-color'], 'var(--bind-cta-pink)')

  // 错误提示保持警示红族（红字 + 红族浅底描边），需解绑中间态入口样式在场
  const errorMsg = findRule(css, '.error-msg')
  assert.equal(errorMsg.color, '#F97373')
  assert.match(errorMsg.background, /rgba\(249,\s*115,\s*115,\s*0\.1\)/)
  assert.match(errorMsg.border, /1px solid rgba\(249,\s*115,\s*115,\s*0\.24\)/)
  const unbindInline = findRule(css, '.unbind-inline')
  assert.match(unbindInline['margin-top'], /^\d+rpx$/)
})

test('copy buttons press instantly under reduced motion on both bind and settings', () => {
  // .copy-btn 不在 app.wxss 全局 reduced-motion 名单里，两个页面必须在各自页面侧登记：
  // RM 下移除 transform 过渡，按下立即缩放，不做 0.2s 动画式按压
  for (const file of ['pages/bind/bind.wxss', 'pages/settings/settings.wxss']) {
    const css = readPageFile(file)
    const rmStart = css.indexOf('@media (prefers-reduced-motion: reduce)')
    assert.ok(rmStart !== -1, `${file} must register a prefers-reduced-motion block`)
    assert.match(
      css.slice(rmStart),
      /\.copy-btn[^{]*\{[^}]*transition:\s*none/,
      `${file} reduced-motion block must neutralize the copy button transform transition`
    )
  }
})

test('bind page exposes an unbind action on the same screen when create is rejected for still being in a room', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    createRoom: {
      code: -1,
      msg: '你已加入其他房间，请先解除绑定后再创建新房间'
    }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()

    await harness.page.createRoom()

    assert.equal(harness.page.data.errorMsg, '你已加入其他房间，请先解除绑定后再创建新房间')
    assert.equal(harness.page.data.needUnbind, true, 'the rejection must unlock an unbind action on this screen')

    const wxml = readPageFile('pages/bind/bind.wxml')
    const unboundCard = wxml.slice(wxml.indexOf('wx:else') + 'wx:else'.length)
    assert.match(
      unboundCard,
      /wx:if="\{\{needUnbind\}\}"[^>]*bindtap="unbind"/,
      'the unbound card renders the unbind entry when the room requires leaving first'
    )
  } finally {
    harness.teardown()
  }
})

test('bind page exposes the same-screen unbind when join is rejected for still being in a room', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    joinRoom: {
      code: -1,
      msg: '你已加入其他房间，请先解除绑定后再加入新房间'
    }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()
    harness.page.setData({ joinCode: 'ROOM01' })

    await harness.page.joinRoom()

    assert.equal(harness.page.data.needUnbind, true)
  } finally {
    harness.teardown()
  }
})

test('bind page does not offer unbind for ordinary create/join failures', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    createRoom: { code: -1, msg: '创建失败：网络超时' },
    joinRoom: { code: -1, msg: '房间不存在，请检查房间码' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()

    await harness.page.createRoom()
    assert.equal(harness.page.data.needUnbind, false)

    harness.page.setData({ joinCode: 'ROOM01' })
    await harness.page.joinRoom()
    assert.equal(harness.page.data.needUnbind, false)
  } finally {
    harness.teardown()
  }
})

test('confirming the same-screen unbind leaves the room and returns the bind page to a clean unbound state', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    createRoom: {
      code: -1,
      msg: '你已加入其他房间，请先解除绑定后再创建新房间'
    },
    leaveRoom: { code: 0 }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()
    await harness.page.createRoom()
    assert.equal(harness.page.data.needUnbind, true)

    const unbindPromise = harness.page.unbind()
    await Promise.resolve()
    assert.equal(harness.wx.modals.length, 1)

    await harness.wx.modals[0].success({ confirm: true, cancel: false })
    await unbindPromise

    assert.equal(room.calls.leaveRoom, 1)
    assert.equal(harness.page.data.bound, false)
    assert.equal(harness.page.data.needUnbind, false)
    assert.equal(harness.page.data.errorMsg, '')
  } finally {
    harness.teardown()
  }
})

test('bind page lands on the bound screen after creating a room, with the room code ready to copy', async () => {
  const clipboard = []
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    createRoom: { code: 0, roomCode: 'ROOM05' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room, clipboard })

  try {
    await harness.page.onShow()

    await harness.page.createRoom()

    assert.equal(harness.page.data.bound, true)
    assert.equal(harness.page.data.roomCode, 'ROOM05')
    assert.equal(harness.page.data.needUnbind, false)

    await harness.page.copyRoomCode()

    assert.deepEqual(clipboard, ['ROOM05'])
    assert.deepEqual(harness.wx.toasts, [{ title: '房间码已复制' }])
  } finally {
    harness.teardown()
  }
})

test('settings clear-local-data keeps showing the room code when the room is still active after clearing', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' },
    getActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  const harness = loadPageHarness('pages/settings/settings.js', { room })

  try {
    await harness.page.onShow()

    harness.page.clearData()
    assert.equal(harness.wx.modals.length, 1)
    const modal = harness.wx.modals[0]
    assert.match(modal.content, /只清除保存在本机的房间码/)
    assert.match(modal.content, /云端记录会保留/)
    assert.match(modal.content, /不会退出当前房间/)

    await modal.success({ confirm: true, cancel: false })

    assert.equal(room.calls.clearLocalRoom, 1)
    assert.equal(room.calls.getActiveRoom, 1)
    assert.equal(room.calls.leaveRoom, undefined, 'clearing the local code must not exit the room')
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')
    assert.deepEqual(harness.wx.toasts, [{ title: '已清除本机房间码' }])
  } finally {
    harness.teardown()
  }
})

test('settings clear-local-data falls back to the unbound display only when re-resolution finds no room', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' },
    getActiveRoom: { kind: 'no-room', bound: false, roomCode: '' }
  })
  const harness = loadPageHarness('pages/settings/settings.js', { room })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.roomCodeDisplay, 'ROOM01')

    harness.page.clearData()
    assert.equal(harness.wx.modals.length, 1)
    await harness.wx.modals[0].success({ confirm: true, cancel: false })

    assert.equal(harness.page.data.roomCode, '')
    assert.equal(harness.page.data.roomCodeDisplay, '未绑定')
    assert.deepEqual(harness.wx.toasts, [{ title: '已清除本机房间码' }])
  } finally {
    harness.teardown()
  }
})

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker)
  assert.ok(start !== -1, `expected ${startMarker} in the page`)
  const end = text.indexOf(endMarker, start)
  assert.ok(end !== -1, `expected ${endMarker} after ${startMarker}`)
  return text.slice(start, end)
}

function findRule(css, selector) {
  const pattern = new RegExp(`(?:^|\\r?\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`)
  const match = css.match(pattern)
  assert.ok(match, `expected rule ${selector}`)
  const decls = {}
  for (const decl of match[1].split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    decls[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim()
  }
  return decls
}

function createRoomSessionStub(results = {}) {
  const session = {
    calls: {},
    getRoomCode() {
      return ''
    },
    async getVerifiedActiveRoom() {
      session.calls.getVerifiedActiveRoom = (session.calls.getVerifiedActiveRoom || 0) + 1
      return results.getVerifiedActiveRoom || { kind: 'no-room', bound: false, roomCode: '' }
    },
    async getActiveRoom() {
      session.calls.getActiveRoom = (session.calls.getActiveRoom || 0) + 1
      return results.getActiveRoom || results.getVerifiedActiveRoom || { kind: 'no-room', bound: false, roomCode: '' }
    },
    async createRoom() {
      session.calls.createRoom = (session.calls.createRoom || 0) + 1
      return results.createRoom || { code: -1, msg: '创建失败' }
    },
    async joinRoom() {
      session.calls.joinRoom = (session.calls.joinRoom || 0) + 1
      return results.joinRoom || { code: -1, msg: '加入失败' }
    },
    clearLocalRoom() {
      session.calls.clearLocalRoom = (session.calls.clearLocalRoom || 0) + 1
    },
    async leaveRoom() {
      session.calls.leaveRoom = (session.calls.leaveRoom || 0) + 1
      return results.leaveRoom || { code: 0 }
    }
  }
  return session
}

function loadPageHarness(relativePath, { room, clipboard = [] } = {}) {
  const absolutePagePath = path.join(repoRoot, relativePath)
  const mocks = {
    [path.join(repoRoot, 'utils/room.js')]: room
  }

  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered = null

  const harnessWx = {
    modals: [],
    toasts: [],
    switchTab() {},
    navigateTo() {},
    showToast(options) {
      harnessWx.toasts.push(options)
    },
    showModal(options) {
      harnessWx.modals.push(options)
    },
    setClipboardData({ data, success }) {
      clipboard.push(data)
      if (success) success()
    },
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    removeStorageSync() {},
    env: { USER_DATA_PATH: '/tmp' }
  }

  delete require.cache[require.resolve(absolutePagePath)]
  global.wx = harnessWx
  global.Page = config => {
    registered = config
  }
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (Object.prototype.hasOwnProperty.call(mocks, resolved)) {
      return mocks[resolved]
    }
    return originalLoad.apply(this, arguments)
  }

  try {
    require(absolutePagePath)
  } finally {
    Module._load = originalLoad
  }

  if (!registered) {
    global.Page = originalPage
    global.wx = originalWx
    throw new Error(`${relativePath} did not register a Page(...) definition`)
  }

  const page = {
    data: { ...(registered.data || {}) },
    setDataCalls: [],
    setData(update, callback) {
      this.setDataCalls.push(update)
      this.data = { ...this.data, ...update }
      if (typeof callback === 'function') callback()
    }
  }
  Object.entries(registered).forEach(([key, value]) => {
    if (key === 'data') return
    page[key] = typeof value === 'function' ? value.bind(page) : value
  })

  return {
    page,
    wx: harnessWx,
    teardown() {
      global.Page = originalPage
      global.wx = originalWx
      delete require.cache[require.resolve(absolutePagePath)]
    }
  }
}
