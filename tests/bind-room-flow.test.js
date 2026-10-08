const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

// issue #78：房间码复制/解除绑定同屏可达、清除本地数据文案与行为对齐的页面接缝测试。
// issue #102：已绑定冷启动自动 switchTab 进首页（跳转失败才留「进入应用」兜底）；校验失败留在
// 本页给可点重试；已绑定卡不再有解除绑定（needUnbind 中间态入口保留）；创建后提示「把房间码发给 TA」；
// 加入成功给一次「已和 TA 连上」反馈再进首页。
// issue #104：绑定页收敛回 Aurora Bloom——紫粉试点 token/深紫画布/粉胶囊/粉幽灵整体移除，
// #78 的绑定页/设置页复制键像素同款契约按 DESIGN.md 重建条件恢复（fill/label/radius/padding/shadow 全等）。
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
  // issue #102：解除绑定移到设置页房间卡，已绑定卡不再有解绑入口；
  // 绑定页只保留 needUnbind 中间态（错误恢复路径）的就地解除入口
  assert.doesNotMatch(
    boundCard,
    /bindtap="unbind"/,
    'the bound card no longer offers unbind; it lives on the settings room card'
  )

  const unboundCard = wxml.slice(wxml.indexOf('wx:else') + 'wx:else'.length)
  assert.doesNotMatch(
    unboundCard,
    /class="copy-btn"/,
    'copy button belongs to the bound screen, not the create/join form'
  )
})

// issue #78 像素同款契约重建（issue #104，DESIGN.md「试点不推广」节登记）：绑定页整页收敛回
// Aurora 后，两页复制键回归同一色域与同一形态——fill/label/radius/padding/shadow 逐属性全等，
// 锚定设置页 .copy-btn（设置页侧零改动）。
test('bind and settings copy buttons are the same rose small button pixel-for-pixel (issue #78)', () => {
  const bindRule = findRule(readPageFile('pages/bind/bind.wxss'), '.copy-btn')
  const settingsRule = findRule(readPageFile('pages/settings/settings.wxss'), '.copy-btn')

  // 契约五属性：fill / label / radius / padding / shadow，两页逐值全等
  for (const prop of ['background', 'color', 'border-radius', 'padding', 'box-shadow']) {
    assert.equal(bindRule[prop], settingsRule[prop], `copy button ${prop} must match the settings anchor`)
  }
  assert.equal(settingsRule.background, 'var(--aurora-pink)')
  assert.equal(settingsRule.color, '#0A0E27')
  assert.equal(settingsRule['border-radius'], 'var(--radius-sm)')
  assert.equal(settingsRule.padding, '0 28rpx')
  assert.equal(settingsRule['box-shadow'], '0 4px 15px rgba(232,144,158,0.28)')

  // 88rpx 触控高度与按下缩放在两页同样同款
  assert.equal(bindRule['min-height'], '88rpx')
  assert.equal(settingsRule['min-height'], '88rpx')
  const bindActive = findRule(readPageFile('pages/bind/bind.wxss'), '.copy-btn:active')
  const settingsActive = findRule(readPageFile('pages/settings/settings.wxss'), '.copy-btn:active')
  assert.equal(bindActive.transform, settingsActive.transform)
})

// issue #104：粉胶囊/粉幽灵页面级覆盖整体移除——绑定页主按钮回 app 级玫瑰基类，
// 解除绑定（needUnbind 中间态就地入口）回 app 级警示红基类，红 tint Pressed 一并回归
test('bind buttons ride the app-level rose primary and warning-red danger families (issue #104)', () => {
  const css = readPageFile('pages/bind/bind.wxss')

  // 页面级覆盖不再存在：bind.wxss 不得再出现 .btn-premium / .btn-danger 及其 :active 规则
  for (const selector of ['.btn-premium', '.btn-danger', '.btn-danger:active']) {
    const pattern = new RegExp(`(?:^|\\r?\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`)
    assert.doesNotMatch(css, pattern, `bind page must not override ${selector}; the app-level base applies`)
  }

  // app 级基类保持玫瑰主按钮与警示红危险按钮（红 tint Pressed 对 needUnbind 入口直接生效）
  const appPremium = findRule(readPageFile('app.wxss'), '.btn-premium')
  assert.equal(appPremium.background, 'var(--aurora-pink)')
  assert.equal(appPremium.color, '#0A0E27')
  const appDangerActive = findRule(readPageFile('app.wxss'), '.btn-danger:active')
  assert.match(appDangerActive.background, /rgba\(249,\s*115,\s*115,\s*0\.12\)/)

  // needUnbind 中间态就地解除入口保留：布局间距在场，样式跟随 app 级警示红族
  const unbindInline = findRule(css, '.unbind-inline')
  assert.match(unbindInline['margin-top'], /^\d+rpx$/)
})

// issue #104：未绑定表单域收敛回 Aurora 海军域——tab 条与输入框玻璃面回海军实底回退、
// 选中 tab 回玫瑰填充、聚焦描边回玫瑰；输入行为（6 位上限/等宽数字/逐字槽位/1px 实线描边）零变化；
// 需解绑中间态入口在场（样式跟随 app 级警示红），错误提示保持警示红族形态。
test('bind unbound form rides the navy Aurora glass while the error strip keeps the warning-red family', () => {
  const css = readPageFile('pages/bind/bind.wxss')

  // 紫粉试点整体退场：页面级 --bind-* token 与深紫画布覆盖不再存在
  assert.doesNotMatch(css, /--bind-/, 'the purple-pink pilot tokens must leave the bind page')
  assert.doesNotMatch(css, /\.page::before/, 'the dark-purple canvas override must leave the bind page')

  // tab 条与输入框玻璃面回海军实底回退（tab 条保留自身更淡的白玻璃层）
  const tabBar = findRule(css, '.tab-bar')
  assert.equal(
    tabBar.background,
    'rgba(255,255,255,0.05), var(--glass-fallback)'
  )
  const codeInput = findRule(css, '.code-input')
  assert.equal(
    codeInput.background,
    'var(--glass-bg), var(--glass-fallback)'
  )

  // 卡片不再覆盖紫玻璃 tint：布局声明保留，background 交回 app 级 .premium-card
  const premiumCard = findRule(css, '.premium-card')
  assert.equal(premiumCard.background, undefined, 'the bind card must ride the app-level navy glass background')

  // 选中 tab 与主按钮同族：玫瑰填充 + 画布海军字
  const activeTab = findRule(css, '.tab.active')
  assert.equal(activeTab.background, 'var(--aurora-pink)')
  assert.equal(activeTab.color, '#0A0E27')

  // 聚焦描边回玫瑰，1px 实线形态不变
  const focus = findRule(css, '.code-input:focus')
  assert.equal(focus['border-color'], '#E8909E')

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

// issue #102：创建成功后的引导——房间码区域提示「把房间码发给 TA」，复制键仍是唯一复制入口
test('bind page hints to send the room code to the partner after creating a room', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    createRoom: { code: 0, roomCode: 'ROOM05' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()

    await harness.page.createRoom()

    assert.equal(harness.page.data.bound, true)
    assert.equal(harness.page.data.justCreated, true)
    assert.equal(
      harness.page.data.homeJumpFailed,
      false,
      'the enter-app button shows through justCreated, not a jump failure'
    )
    assert.equal(harness.wx.switchTabCalls.length, 0, 'the creator stays to copy and send the room code')

    const boundCard = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
    assert.match(
      boundCard,
      /wx:if="\{\{justCreated\}\}"[^>]*>\s*把房间码发给 TA\s*<\//,
      'the room-code area tells the creator to send the code to the partner'
    )
    assert.equal(
      (boundCard.match(/bindtap="copyRoomCode"/g) || []).length,
      1,
      'the copy button stays the only copy entry'
    )

    // onShow 重校验后提示清除，不常驻
    await harness.page.onShow()
    assert.equal(harness.page.data.justCreated, false)
  } finally {
    harness.teardown()
  }
})

// issue #102：加入成功后给一次明确的「已和 TA 连上」反馈，再进入首页
test('bind page confirms a successful join once and enters the homepage', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    joinRoom: { code: 0, roomCode: 'ROOM09' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()
    harness.page.setData({ joinCode: 'ROOM09' })

    await harness.page.joinRoom()

    assert.deepEqual(harness.wx.toasts, [{ title: '已和 TA 连上' }])
    assert.equal(harness.wx.switchTabCalls.length, 1)
    assert.equal(harness.wx.switchTabCalls[0].url, '/pages/index/index')
    assert.equal(harness.page.data.bound, true)
    assert.equal(harness.page.data.roomCode, 'ROOM09')
  } finally {
    harness.teardown()
  }
})

// ===== issue #102：已绑定冷启动直达首页；跳转失败保留「进入应用」兜底 =====

test('bind page cold-starts straight into the homepage tab when the room still verifies as bound', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()

    assert.equal(harness.page.data.bound, true)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.wx.switchTabCalls.length, 1, 'bound verification must jump home immediately')
    assert.equal(harness.wx.switchTabCalls[0].url, '/pages/index/index')
    assert.deepEqual(harness.wx.toasts, [], 'cold-start jump stays silent; the connected toast is only for joins')

    // review #99 / issue #102：自动跳转成功时「进入应用」不出现——只在跳转失败或刚创建房间时兜底
    assert.equal(harness.page.data.justCreated, false)
    assert.equal(harness.page.data.homeJumpFailed, false)
    assert.match(
      sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else'),
      /wx:if="\{\{justCreated \|\| homeJumpFailed\}\}"[^>]*class="btn-premium"[^>]*bindtap="goHome"[^>]*aria-label="进入应用"/,
      'the enter-app button renders only when the home jump failed or the room was just created'
    )
  } finally {
    harness.teardown()
  }
})

test('bind page keeps the bound card with the enter-app fallback when the home jump fails', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room, switchTabFail: true })

  try {
    await harness.page.onShow()

    assert.equal(harness.wx.switchTabCalls.length, 1)
    assert.equal(harness.page.data.bound, true, 'the bound card stays as the fallback surface')
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.errorMsg, '')
    assert.equal(harness.page.data.homeJumpFailed, true, 'the failed jump unhides the enter-app fallback')

    // 兜底按钮可点：再点一次「进入应用」重试跳转；再次失败时旗标保持，按钮不退场
    harness.page.goHome()
    assert.equal(harness.wx.switchTabCalls.length, 2)
    assert.equal(harness.page.data.homeJumpFailed, true)

    assert.match(
      sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else'),
      /wx:if="\{\{justCreated \|\| homeJumpFailed\}\}"[^>]*class="btn-premium"[^>]*bindtap="goHome"/,
      'the enter-app main button remains as the minimal fallback'
    )
  } finally {
    harness.teardown()
  }
})

// review #99 / issue #102：重新校验后旗标清除——「进入应用」兜底只在需要时在场
test('bind page hides the enter-app fallback once re-verification clears the jump-failure flag', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  let failNextJump = true
  const harness = loadPageHarness('pages/bind/bind.js', { room, switchTabFail: () => failNextJump })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.homeJumpFailed, true)

    // 重校验仍已绑定且跳转恢复：旗标清除、自动进首页，兜底退场
    failNextJump = false
    await harness.page.retryCheck()
    assert.equal(harness.page.data.justCreated, false)
    assert.equal(harness.page.data.homeJumpFailed, false)
    assert.equal(harness.wx.switchTabCalls.length, 2)
  } finally {
    harness.teardown()
  }
})

test('bind page stays with the error and a tappable retry when room verification fails', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: {
      kind: 'retryable-failure',
      bound: false,
      roomCode: '',
      errorMsg: '同步房间状态失败：network down'
    }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()

    assert.equal(harness.page.data.bound, false, 'a verification failure must not enter the app')
    assert.equal(harness.page.data.needUnbind, false, 'a network failure must not mislead into rebinding')
    assert.equal(harness.page.data.errorMsg, '同步房间状态失败：network down')
    assert.equal(harness.page.data.checkFailed, true, 'the error strip gains a retry affordance')
    assert.equal(harness.wx.switchTabCalls.length, 0)

    // 重试 = 重跑 onShow 的房间校验，而不是导向重新绑定
    await harness.page.retryCheck()
    assert.equal(room.calls.getVerifiedActiveRoom, 2)
    assert.equal(harness.page.data.errorMsg, '同步房间状态失败：network down')
    assert.equal(harness.page.data.needUnbind, false)

    const wxml = readPageFile('pages/bind/bind.wxml')
    assert.match(
      wxml,
      /wx:if="\{\{checkFailed\}\}"[^>]*bindtap="retryCheck"/,
      'the retry button only appears after a verification failure'
    )
    assert.match(
      wxml,
      /bindtap="retryCheck"[^>]*aria-role="button"[^>]*aria-label="重试"/,
      'the retry button is a named tappable control'
    )
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

function loadPageHarness(relativePath, { room, clipboard = [], switchTabFail = false } = {}) {
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
    switchTabCalls: [],
    // issue #102：启动分流需要观察 switchTab 目标并能模拟跳转失败（扩展既有 fake，不是新 seam）；
    // review #99：switchTabFail 也接受谓词函数，便于模拟「失败后恢复」
    switchTab(options) {
      harnessWx.switchTabCalls.push(options)
      const shouldFail = typeof switchTabFail === 'function' ? switchTabFail() : switchTabFail
      if (shouldFail && options && typeof options.fail === 'function') {
        options.fail({ errMsg: 'switchTab:fail harness stub' })
      }
    },
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
