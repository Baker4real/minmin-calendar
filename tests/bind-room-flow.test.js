const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const { listWxmlFiles, parseWxssRules } = require('./designTokens')

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

// 按压底色把 :active 与 hover-class 并进同一条规则。查找任一选择器都要读到同一组声明。
test('findRule treats an :active selector and its hover-class as one rule', () => {
  const css = [
    '.btn-danger:active,',
    '.btn-danger.btn-danger-hover {',
    '  transform: scale(0.95);',
    '  background: linear-gradient(rgba(249,115,115,0.12), rgba(249,115,115,0.12)), var(--glass-fallback);',
    '}'
  ].join('\n')

  const active = findRule(css, '.btn-danger:active')
  const hover = findRule(css, '.btn-danger.btn-danger-hover')

  assert.equal(active.transform, 'scale(0.95)')
  assert.equal(active.background, 'linear-gradient(rgba(249,115,115,0.12), rgba(249,115,115,0.12)), var(--glass-fallback)')
  assert.deepEqual(hover, active)
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
    'linear-gradient(rgba(255,255,255,0.05), rgba(255,255,255,0.05)), var(--glass-fallback)'
  )
  const codeInput = findRule(css, '.code-input')
  assert.equal(
    codeInput.background,
    'linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback)'
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

// issue #138：加入房间时六位码完整可见、在框内居中，输入框与上方说明、下方主按钮同宽。
test('join room-code field has an 88rpx line and lines up with the hint and the main button', () => {
  const codeInput = findRule(readPageFile('pages/bind/bind.wxss'), '.code-input')

  assert.equal(codeInput.height, '88rpx', 'the field needs an explicit height at the touch step')
  assert.equal(codeInput['line-height'], '88rpx', 'the line box must match that height so glyphs are not clipped')
  assert.equal(codeInput.width, '100%', 'the field spans the card, same as the hint and the main button')
  assert.equal(codeInput['text-align'], 'center')
  assert.equal(codeInput['box-sizing'], 'border-box')
  assert.equal(codeInput.padding, '0 20rpx', 'vertical padding must not eat the line box')

  const placeholder = findRule(readPageFile('pages/bind/bind.wxss'), '.input-placeholder')
  assert.equal(placeholder['line-height'], '88rpx', 'the placeholder uses the same line box as the code')
})

// issue #138：首屏副标题用 text 组件认识的换行符分成两句，不用 br。
test('bind subtitle breaks the two phrases with a newline inside the text', () => {
  const wxml = readPageFile('pages/bind/bind.wxml')
  const hero = /<text class="hero-desc">([\s\S]*?)<\/text>/.exec(wxml)
  assert.ok(hero, 'the launch subtitle is a text node')
  assert.equal(hero[1], '两个人的专属空间\\n共享经期与欢乐时光')
  assert.doesNotMatch(hero[1], /<br\b/i)
})

// issue #138：创建 / 加入页说明房间只有两个人能看到，两个 tab 都看得到。
test('create and join screen says the room is visible only to the two of you', () => {
  const wxml = readPageFile('pages/bind/bind.wxml')
  const unbound = wxml.slice(wxml.indexOf('wx:else'))
  const sentence = unbound.indexOf('房间只有你们两个人能看到')
  const createTab = unbound.indexOf("tab === 'create'")
  const joinTab = unbound.indexOf("tab === 'join'")
  assert.ok(sentence !== -1, 'the create/join screen explains who can see the room')
  assert.ok(createTab !== -1 && joinTab !== -1)
  assert.ok(sentence < createTab && sentence < joinTab, 'the sentence stays visible on both the create and join tabs')
})

// issue #138：模板护栏。text 节点里出现 br 时，小程序不会换行，两句会粘在一起。
test('page templates do not put a br tag inside a text node', () => {
  const offenders = []
  for (const file of listWxmlFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const wxml = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    for (const body of textNodeBodies(wxml)) {
      if (/<br\b/i.test(body)) offenders.push(`${relative}: ${body.trim()}`)
    }
  }
  assert.deepEqual(offenders, [])
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

// issue #140：创建成功后，在「把房间码发给 TA」处用小程序原生分享发一张邀请卡。
// 标题是固定文案，不含经期或记录；房间码只出现在启动首屏的路径参数里。
test('bind page shares a fixed invite card whose path carries only the room code to the launch screen', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' },
    createRoom: { code: 0, roomCode: 'ROOM05' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()
    await harness.page.createRoom()

    const card = harness.page.onShareAppMessage()
    const app = JSON.parse(readPageFile('app.json'))
    assert.equal(app.pages[0], 'pages/bind/bind', 'the launch screen stays the bind page')
    assert.equal(card.title, '邀请你加入我的日历')
    assert.equal(card.path, '/pages/bind/bind?roomCode=ROOM05')
    assert.doesNotMatch(card.title, /经期|欢乐时光|记录|ROOM05/)
    const besidesPath = JSON.stringify(card).replace(card.path, '')
    assert.equal(besidesPath.includes('ROOM05'), false, 'the room code must not leave the path query')

    const boundCard = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
    const shareButton = /<button\b[^>]*>\s*发给 TA\s*<\/button>/.exec(boundCard)
    assert.ok(shareButton, 'the created-room card offers a native share button labeled 发给 TA')
    assert.match(shareButton[0], /open-type="share"/)
    assert.match(shareButton[0], /wx:if="\{\{justCreated\}\}"/)
  } finally {
    harness.teardown()
  }
})

// issue #140：未绑定的人从邀请卡进入启动首屏时，切到「加入房间」并预填房间码，仍要自己点「加入」。
test('bind page prefills the join form from a launch invite and waits for the join tap', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    harness.page.onLoad({ roomCode: 'ROOM05' })
    await harness.page.onShow()

    assert.equal(harness.page.data.bound, false)
    assert.equal(harness.page.data.tab, 'join')
    assert.equal(harness.page.data.joinCode, 'ROOM05')
    assert.equal(harness.page.data.errorMsg, '')
    assert.equal(room.calls.joinRoom, undefined, 'prefill must not join the room by itself')
    assert.equal(harness.wx.switchTabCalls.length, 0)
  } finally {
    harness.teardown()
  }
})

// issue #140：已经绑定的人打开邀请卡时忽略参数，仍按现有路径进首页。
test('bind page ignores a launch invite when the user is already bound and continues home', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    harness.page.onLoad({ roomCode: 'ROOM05' })
    await harness.page.onShow()

    assert.equal(harness.page.data.bound, true)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.page.data.tab, 'create')
    assert.equal(harness.page.data.joinCode, '')
    assert.equal(harness.page.data.errorMsg, '')
    assert.equal(room.calls.joinRoom, undefined)
    assert.equal(harness.wx.switchTabCalls.length, 1)
    assert.equal(harness.wx.switchTabCalls[0].url, '/pages/index/index')
  } finally {
    harness.teardown()
  }
})

// issue #140：路径参数长度不对时直接忽略，不报错，也不改加入表单。
test('bind page ignores a launch invite of the wrong length without an error', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    harness.page.onLoad({ roomCode: 'ABC' })
    await harness.page.onShow()

    assert.equal(harness.page.data.bound, false)
    assert.equal(harness.page.data.tab, 'create')
    assert.equal(harness.page.data.joinCode, '')
    assert.equal(harness.page.data.errorMsg, '')
    assert.equal(room.calls.joinRoom, undefined)
    assert.equal(harness.wx.switchTabCalls.length, 0)
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

// issue #115：第一次房间校验出结果前，启动首屏只渲染品牌心
test('bind page shows only the brand heart from first paint until the first room check returns', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    assert.equal(harness.page.data.verifying, true, 'first paint is the verifying state')
    assert.equal(harness.page.data.revealed, false, 'room content stays unrevealed until a result says so')
    assert.equal(room.calls.getVerifiedActiveRoom, undefined, 'the check has not returned before onShow')

    const wxml = readPageFile('pages/bind/bind.wxml')
    const heartAt = wxml.indexOf('class="hero-icon">♥')
    const gateAt = wxml.indexOf('wx:if="{{revealed}}"')
    assert.ok(heartAt !== -1, 'the brand heart is on the page')
    assert.ok(gateAt !== -1, 'room content waits behind the revealed gate')
    assert.ok(heartAt < gateAt, 'the brand heart stays outside the revealed gate')

    const gated = wxml.slice(gateAt)
    for (const marker of [
      'class="hero-title"',
      'class="hero-desc"',
      'wx:if="{{bound}}"',
      'class="error-msg"',
      'class="error-retry"',
      '创建房间',
      '加入房间'
    ]) {
      assert.ok(gated.includes(marker), `verifying hides ${marker}`)
    }
    assert.doesNotMatch(
      wxml.slice(0, gateAt),
      /hero-title|创建房间|已绑定房间|error-msg|error-retry/
    )

    const icon = findRule(readPageFile('pages/bind/bind.wxss'), '.hero-icon')
    assert.equal(icon.animation, 'heroIn 0.6s var(--ease-out) both', 'the registered heart entrance stays')

    let release
    room.getVerifiedActiveRoom = () => new Promise((resolve) => {
      release = resolve
    })
    const pending = harness.page.onShow()
    await Promise.resolve()
    assert.equal(harness.page.data.verifying, true, 'the heart stays alone while the first check is in flight')
    assert.equal(harness.page.data.revealed, false)

    release({ kind: 'no-room', bound: false, roomCode: '' })
    await pending
    assert.equal(harness.page.data.verifying, false, 'the first result ends verifying')
    assert.equal(harness.page.data.revealed, true, 'an unbound result reveals the room card')
    assert.equal(harness.page.data.bound, false)
    assert.equal(harness.page.data.checkFailed, false)
  } finally {
    harness.teardown()
  }
})

test('bind page keeps the heart and reveals the bound card only when the home jump fails', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'success', bound: true, roomCode: 'ROOM01' }
  })
  const jumped = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await jumped.page.onShow()

    assert.equal(jumped.page.data.verifying, false)
    assert.equal(jumped.page.data.revealed, false, 'a bound result stays on the heart while the homepage opens')
    assert.equal(jumped.page.data.homeJumpFailed, false)
    assert.equal(jumped.wx.switchTabCalls.length, 1)
    assert.equal(jumped.wx.switchTabCalls[0].url, '/pages/index/index')
  } finally {
    jumped.teardown()
  }

  const failed = loadPageHarness('pages/bind/bind.js', { room, switchTabFail: true })
  try {
    await failed.page.onShow()

    assert.equal(failed.wx.switchTabCalls.length, 1)
    assert.equal(failed.page.data.verifying, false)
    assert.equal(failed.page.data.revealed, true, 'a failed jump is what reveals the bound card')
    assert.equal(failed.page.data.bound, true)
    assert.equal(failed.page.data.roomCode, 'ROOM01')
    assert.equal(failed.page.data.homeJumpFailed, true)
    assert.match(
      sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else'),
      /wx:if="\{\{justCreated \|\| homeJumpFailed\}\}"[^>]*class="btn-premium"[^>]*bindtap="goHome"[^>]*aria-label="进入应用"/
    )
  } finally {
    failed.teardown()
  }
})

test('bind page reveals an unbound or failed check with the shared enter motion', async () => {
  const css = readPageFile('pages/bind/bind.wxss')
  const frames = /@keyframes bindReveal\s*\{([\s\S]*?)\n\}/.exec(css)
  assert.ok(frames, 'the room card reveal has its own keyframes')
  assert.match(frames[1], /from\s*\{[^}]*opacity:\s*0/)
  assert.match(frames[1], /from\s*\{[^}]*transform:\s*translateY\(16rpx\)/)
  assert.match(frames[1], /to\s*\{[^}]*opacity:\s*1/)
  assert.match(frames[1], /to\s*\{[^}]*transform:\s*translateY\(0\)/)

  const reveal = findRule(css, '.bind-reveal')
  assert.equal(reveal.animation, 'bindReveal var(--duration-enter) var(--ease-out) both')
  assert.equal(reveal.opacity, undefined, 'the card rests visible so reduced motion does not fade it in')
  assert.equal(reveal.transform, undefined, 'the card rests in place so reduced motion does not shift it')
  assert.doesNotMatch(css, /--duration-enter\s*:/, 'duration tokens stay defined once at app level')

  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(
    reduced,
    /\.bind-reveal[^{]*\{[^}]*animation:\s*none/,
    'reduced motion shows the card immediately, with no fade and no shift'
  )

  const wxml = readPageFile('pages/bind/bind.wxml')
  assert.match(
    wxml,
    /wx:if="\{\{revealed\}\}" class="bind-reveal"[\s\S]*wx:if="\{\{bound\}\}"[\s\S]*class="error-msg"[\s\S]*class="error-retry"/,
    'the card, the error strip, and retry share one reveal'
  )

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

    assert.equal(harness.page.data.verifying, false)
    assert.equal(harness.page.data.revealed, true)
    assert.equal(harness.page.data.bound, false)
    assert.equal(harness.page.data.checkFailed, true)
    assert.equal(harness.page.data.errorMsg, '同步房间状态失败：network down')
    assert.equal(harness.wx.switchTabCalls.length, 0)
  } finally {
    harness.teardown()
  }
})

test('bind page keeps the current room content when a later check or retry runs', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })

  try {
    await harness.page.onShow()
    assert.equal(harness.page.data.verifying, false)
    assert.equal(harness.page.data.revealed, true)

    let release
    room.getVerifiedActiveRoom = () => new Promise((resolve) => {
      release = resolve
    })
    const pending = harness.page.onShow()
    await Promise.resolve()
    assert.equal(harness.page.data.verifying, false, 'a later onShow does not return to verifying')
    assert.equal(harness.page.data.revealed, true, 'the revealed card stays put while the later check runs')
    assert.equal(harness.page.data.bound, false)

    release({ kind: 'success', bound: true, roomCode: 'ROOM01' })
    await pending
    assert.equal(harness.page.data.verifying, false)
    assert.equal(harness.page.data.revealed, true, 'a later bound result does not collapse back to the heart')
    assert.equal(harness.page.data.bound, true)
    assert.equal(harness.page.data.roomCode, 'ROOM01')
    assert.equal(harness.wx.switchTabCalls.length, 1)
    assert.equal(harness.wx.switchTabCalls[0].url, '/pages/index/index')
  } finally {
    harness.teardown()
  }

  const failedRoom = createRoomSessionStub({
    getVerifiedActiveRoom: {
      kind: 'retryable-failure',
      bound: false,
      roomCode: '',
      errorMsg: '同步房间状态失败：network down'
    }
  })
  const retryHarness = loadPageHarness('pages/bind/bind.js', { room: failedRoom })

  try {
    await retryHarness.page.onShow()
    assert.equal(retryHarness.page.data.revealed, true)
    assert.equal(retryHarness.page.data.checkFailed, true)

    let releaseRetry
    failedRoom.getVerifiedActiveRoom = () => new Promise((resolve) => {
      releaseRetry = resolve
    })
    const retrying = retryHarness.page.retryCheck()
    await Promise.resolve()
    assert.equal(retryHarness.page.data.verifying, false, 'retry does not return to verifying')
    assert.equal(retryHarness.page.data.revealed, true)
    assert.equal(retryHarness.page.data.errorMsg, '同步房间状态失败：network down')
    assert.equal(retryHarness.page.data.checkFailed, true)

    releaseRetry({ kind: 'no-room', bound: false, roomCode: '' })
    await retrying
    assert.equal(retryHarness.page.data.verifying, false)
    assert.equal(retryHarness.page.data.revealed, true)
    assert.equal(retryHarness.page.data.bound, false)
    assert.equal(retryHarness.page.data.checkFailed, false)
    assert.equal(retryHarness.page.data.errorMsg, '')
  } finally {
    retryHarness.teardown()
  }
})

test('bind page shows the unbind notice once and then clears it', async () => {
  const room = createRoomSessionStub({
    getVerifiedActiveRoom: { kind: 'no-room', bound: false, roomCode: '' }
  })
  const harness = loadPageHarness('pages/bind/bind.js', { room })
  const storage = { bindUnbindNotice: '1' }
  harness.wx.getStorageSync = (key) => storage[key] || ''
  harness.wx.removeStorageSync = (key) => { delete storage[key] }

  try {
    await harness.page.onShow()
    assert.deepEqual(harness.wx.toasts, [{ title: '已解除绑定', icon: 'none' }])
    assert.equal(storage.bindUnbindNotice, undefined)

    harness.wx.toasts.length = 0
    await harness.page.onShow()
    assert.deepEqual(harness.wx.toasts, [])
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
    assert.equal(modal.title, '重新同步房间')
    assert.match(modal.content, /不会删除记录/)
    assert.match(modal.content, /不会退出房间/)

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

function textNodeBodies(wxml) {
  const bodies = []
  const tags = /<\/?text\b[^>]*>/gi
  const stack = []
  let match
  while ((match = tags.exec(wxml))) {
    if (match[0].startsWith('</')) {
      const start = stack.pop()
      if (start === undefined) continue
      bodies.push(wxml.slice(start, match.index))
      continue
    }
    stack.push(match.index + match[0].length)
  }
  return bodies
}

function sliceBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker)
  assert.ok(start !== -1, `expected ${startMarker} in the page`)
  const end = text.indexOf(endMarker, start)
  assert.ok(end !== -1, `expected ${endMarker} after ${startMarker}`)
  return text.slice(start, end)
}

function findRule(css, selector) {
  // :active 与 hover-class 并列时仍是同一条规则，组里任一选择器都要能查到它。
  const rule = parseWxssRules(css).find((candidate) => candidate.selectors.includes(selector))
  assert.ok(rule, `expected rule ${selector}`)
  return rule.decls
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
