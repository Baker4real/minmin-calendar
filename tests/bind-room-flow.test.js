const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createMiniProgram } = require('./helpers/miniProgram')
const path = require('node:path')
const test = require('node:test')
const { listWxmlFiles, parseWxssRules } = require('./designTokens')
const { renderWxmlClasses, wxmlOpeningTags } = require('./wxmlTemplate')

// issue #78：房间码复制/解除绑定同屏可达、清除本地数据文案与行为对齐的页面接缝测试。
// issue #102：已绑定冷启动自动 switchTab 进首页（跳转失败才留「进入应用」兜底）；校验失败留在
// 本页给可点重试；已绑定卡不再有解除绑定（needUnbind 中间态入口保留）；创建后提示「把房间码发给 TA」；
// 加入成功给一次「已和 TA 连上」反馈再进首页。
// issue #104：绑定页收敛回 Aurora Bloom——紫粉试点 token/深紫画布/粉胶囊/粉幽灵整体移除，
// #78 的绑定页/设置页复制键像素同款契约按 DESIGN.md 重建条件恢复（fill/label/radius/padding/shadow 全等）。
// 观察用户能看见或能做到的事：哪个控件在场、哪句话显示、点按后落到哪个状态；
// 所有页面行为经共享微信平台替身驱动，真实 Room、云访问和页面 module 保持原样。

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
    '进入应用 stays on the bound screen as the jump-failure main button'
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

  // 契约五属性：fill / label / radius / padding / shadow，两页逐值全等。
  // 玫瑰光从 issue #166 起画在 ::before 柔光层上，按钮本身不带阴影
  for (const prop of ['background', 'color', 'border-radius', 'padding', 'box-shadow']) {
    assert.equal(bindRule[prop], settingsRule[prop], `copy button ${prop} must match the settings anchor`)
  }
  assert.equal(settingsRule.background, 'var(--aurora-pink)')
  assert.equal(settingsRule.color, '#0A0E27')
  assert.equal(settingsRule['border-radius'], 'var(--radius-sm)')
  assert.equal(settingsRule.padding, '0 28rpx')
  assert.equal(settingsRule['box-shadow'], undefined)
  const bindGlow = findRule(readPageFile('pages/bind/bind.wxss'), '.copy-btn::before')
  const settingsGlow = findRule(readPageFile('pages/settings/settings.wxss'), '.copy-btn::before')
  assert.equal(settingsGlow['box-shadow'], '0 4px 15px rgba(232,144,158,0.28)')
  assert.equal(bindGlow['box-shadow'], settingsGlow['box-shadow'], 'copy button glow must match the settings anchor')

  // 88rpx 触控高度、按下缩放和按下时柔光沉下去的程度在两页同样同款
  assert.equal(bindRule['min-height'], '88rpx')
  assert.equal(settingsRule['min-height'], '88rpx')
  const bindActive = findRule(readPageFile('pages/bind/bind.wxss'), '.copy-btn:active')
  const settingsActive = findRule(readPageFile('pages/settings/settings.wxss'), '.copy-btn:active')
  assert.equal(bindActive.transform, settingsActive.transform)
  const bindPressedGlow = findRule(readPageFile('pages/bind/bind.wxss'), '.copy-btn:active::before')
  const settingsPressedGlow = findRule(readPageFile('pages/settings/settings.wxss'), '.copy-btn:active::before')
  assert.equal(bindPressedGlow.opacity, settingsPressedGlow.opacity)
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
  const appDangerTint = findRule(readPageFile('app.wxss'), '.btn-danger:active::before')
  assert.equal(appDangerTint['background-color'], 'rgba(249,115,115,0.12)')

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
// 聚焦描边回玫瑰；输入行为（6 位上限/等宽数字/逐字槽位/1px 实线描边）零变化；
// 选中 tab 是描边玫瑰弱选中（issue #145），不再用主按钮实色填充。
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

  // 选中 tab 与记录分段、密度控件同一种描边玫瑰弱选中
  const activeTab = findRule(css, '.tab.active')
  assert.equal(activeTab.color, '#E8909E')
  assert.equal(activeTab.background, 'rgba(232,144,158,0.08)')
  assert.equal(activeTab['border-color'], 'rgba(232,144,158,0.45)')

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
    assert.match(
      css.slice(rmStart),
      /\.copy-btn::before[^{]*\{[^}]*transition:\s*none/,
      `${file} reduced-motion block must make the copy button glow switch instantly`
    )
  }
})

test('bind page exposes same-screen unbind for create and join refused by another room', async (t) => {
  for (const action of ['createRoom', 'joinRoom']) {
    await t.test(action, async (t) => {
      const msg = action === 'createRoom'
        ? '你已加入其他房间，请先解除绑定后再创建新房间'
        : '你已加入其他房间，请先解除绑定后再加入新房间'
      const app = bindPlatform(t, { [action]: { code: -5, msg } })
      const page = app.launch(action === 'joinRoom' ? '/pages/bind/bind?roomCode=ROOM01' : '/pages/bind/bind')
      await app.settle()
      await app.dispatch(page, action)
      assert.equal(page.data.errorMsg, msg)
      assert.equal(page.data.needUnbind, true)
      assert.match(readPageFile('pages/bind/bind.wxml'), /wx:if="\{\{needUnbind\}\}"[^>]*bindtap="unbind"/)
    })
  }
})

test('bind page does not offer unbind for ordinary create/join failures', async (t) => {
  const app = bindPlatform(t, {
    createRoom: { code: -1, msg: '创建失败：网络超时' },
    joinRoom: { code: -1, msg: '房间不存在，请检查房间码' }
  })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')
  assert.equal(page.data.needUnbind, false)
  await app.dispatch(page, 'switchTab', { currentTarget: { dataset: { tab: 'join' } } })
  await app.dispatch(page, 'onCodeInput', { detail: { value: 'room01' } })
  await app.dispatch(page, 'joinRoom')
  assert.equal(page.data.joinCode, 'ROOM01')
  assert.equal(page.data.errorMsg, '房间不存在，请检查房间码')
  assert.equal(page.data.needUnbind, false)
})

test('confirming same-screen unbind leaves the room and returns to a clean unbound state', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: -5, msg: '你已加入其他房间，请先解除绑定后再创建新房间' } })
  app.cloud.when('leaveRoom').reply({ code: 0 })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')
  assert.equal(page.data.needUnbind, true)
  app.respondNext('showModal', { confirm: true, cancel: false })
  await app.dispatch(page, 'unbind')
  await app.settle()
  assert.equal(app.wx.modals.length, 1)
  assert.equal(app.wx.modals[0].title, '解除绑定')
  assert.equal(app.cloud.calls.filter(call => call.name === 'leaveRoom').length, 1)
  assert.equal(page.data.bound, false)
  assert.equal(page.data.needUnbind, false)
  assert.equal(page.data.errorMsg, '')
})

test('creating a room leaves its code ready to copy and share, with sharing the only main action', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: 0, room: { roomCode: 'ROOM05' } }, failHome: true })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM05')
  assert.equal(page.data.needUnbind, false)
  assert.equal(page.data.justCreated, true)
  assert.equal(page.data.homeJumpFailed, false)
  assert.equal(homeJumps(app).length, 0)
  const actions = [{ tier: 'primary', label: '发给 TA', action: 'share' }, { tier: 'secondary', label: '进入应用', action: 'goHome' }]
  assert.deepEqual(boundCardActions(page.data), actions)
  await app.dispatch(page, 'copyRoomCode')
  assert.deepEqual(app.clipboard, ['ROOM05'])
  assert.deepEqual(app.wx.toasts, [{ title: '房间码已复制' }])
  await app.dispatch(page, 'goHome')
  assert.equal(page.data.homeJumpFailed, true)
  assert.deepEqual(boundCardActions(page.data), actions, 'a failed home jump does not demote sharing')
  const card = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
  assert.match(card, /wx:if="\{\{justCreated\}\}"[^>]*>\s*把房间码发给 TA\s*<\//)
  assert.equal((card.match(/bindtap="copyRoomCode"/g) || []).length, 1)
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.justCreated, false)
})

test('bind page shares a fixed invite card carrying only the room code to the launch screen', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: 0, room: { roomCode: 'ROOM05' } } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')
  const card = app.share(page)
  assert.equal(JSON.parse(readPageFile('app.json')).pages[0], 'pages/bind/bind')
  assert.equal(card.title, '邀请你加入我的日历')
  assert.equal(card.path, '/pages/bind/bind?roomCode=ROOM05')
  assert.doesNotMatch(card.title, /经期|欢乐时光|记录|ROOM05/)
  assert.equal(JSON.stringify(card).replace(card.path, '').includes('ROOM05'), false)
  const boundCard = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
  const button = /<button\b[^>]*>\s*发给 TA\s*<\/button>/.exec(boundCard)
  assert.ok(button)
  assert.match(button[0], /open-type="share"/)
  assert.match(button[0], /wx:if="\{\{justCreated\}\}"/)
})

test('bind page prefills an invite without joining and ignores malformed invite lengths', async (t) => {
  for (const [code, tab, joinCode] of [['ROOM05', 'join', 'ROOM05'], ['ABC', 'create', '']]) {
    await t.test(code, async (t) => {
      const app = bindPlatform(t)
      const page = app.launch(`/pages/bind/bind?roomCode=${code}`)
      await app.settle()
      assert.equal(page.data.bound, false)
      assert.equal(page.data.tab, tab)
      assert.equal(page.data.joinCode, joinCode)
      assert.equal(page.data.errorMsg, '')
      assert.equal(app.cloud.calls.some(call => call.name === 'joinRoom'), false)
      assert.equal(homeJumps(app).length, 0)
    })
  }
})

test('already-bound launch ignores the invite, enters home silently and never shows the enter fallback', async (t) => {
  const app = bindPlatform(t, { room: { roomCode: 'ROOM01', status: 'waiting' } })
  const page = app.launch('/pages/bind/bind?roomCode=ROOM05')
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM01')
  assert.equal(page.data.tab, 'create')
  assert.equal(page.data.joinCode, '')
  assert.equal(page.data.errorMsg, '')
  assert.equal(page.data.justCreated, false)
  assert.equal(page.data.homeJumpFailed, false)
  assert.equal(page.data.revealed, false)
  assert.equal(page.data.verifying, false)
  assert.deepEqual(boundCardActions(page.data), [])
  assert.equal(app.cloud.calls.some(call => call.name === 'joinRoom'), false)
  assert.equal(homeJumps(app).length, 1)
  assert.equal(app.currentPage.route, 'pages/index/index')
  assert.deepEqual(app.wx.toasts, [])
})

test('bind page confirms a successful join once and enters the real homepage', async (t) => {
  const app = bindPlatform(t, { joinRoom: { code: 0, roomCode: 'ROOM09' } })
  const page = app.launch('/pages/bind/bind?roomCode=ROOM09')
  await app.settle()
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM09', status: 'paired' } })
  await app.dispatch(page, 'joinRoom')
  await app.settle()
  assert.deepEqual(app.wx.toasts, [{ title: '已和 TA 连上' }])
  assert.equal(homeJumps(app).length, 1)
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM09')
  assert.equal(app.currentPage.route, 'pages/index/index')
  assert.equal(app.currentPage.data.partnerWelcome, true)
})

test('failed home navigation reveals the bound card and keeps enter-app as its main recovery', async (t) => {
  const app = bindPlatform(t, { room: { roomCode: 'ROOM01' }, failHome: true })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM01')
  assert.equal(page.data.errorMsg, '')
  assert.equal(page.data.revealed, true)
  assert.equal(page.data.verifying, false)
  assert.equal(page.data.justCreated, false)
  assert.equal(page.data.homeJumpFailed, true)
  assert.deepEqual(boundCardActions(page.data), [{ tier: 'primary', label: '进入应用', action: 'goHome' }])
  await app.dispatch(page, 'goHome')
  assert.equal(homeJumps(app).length, 2)
  assert.equal(page.data.homeJumpFailed, true)
  app.failNavigation('switchTab', false)
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.homeJumpFailed, false)
  assert.equal(page.data.justCreated, false)
  assert.equal(homeJumps(app).length, 3)
  assert.equal(app.currentPage.route, 'pages/index/index')
})

test('verification failure stays on the bind page with filtered copy and a working retry', async (t) => {
  const app = bindPlatform(t)
  app.cloud.when('getMyRoom').reject(new Error('network down'))
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.equal(page.data.bound, false)
  assert.equal(page.data.needUnbind, false)
  assert.equal(page.data.errorMsg, '网络不太稳定，请重试')
  assert.equal(page.data.checkFailed, true)
  assert.equal(page.data.revealed, true)
  assert.equal(page.data.verifying, false)
  await app.dispatch(page, 'retryCheck')
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 2)
  assert.equal(page.data.errorMsg, '网络不太稳定，请重试')
  assert.equal(page.data.needUnbind, false)
  assert.equal(homeJumps(app).length, 0)
  const wxml = readPageFile('pages/bind/bind.wxml')
  assert.match(wxml, /wx:if="\{\{checkFailed\}\}"[^>]*bindtap="retryCheck"/)
  assert.match(wxml, /bindtap="retryCheck"[^>]*aria-role="button"[^>]*aria-label="重试"/)
})

test('first room check keeps only the brand heart until its delayed response', async (t) => {
  const app = bindPlatform(t)
  const check = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.equal(page.data.verifying, true)
  assert.equal(page.data.revealed, false)
  const wxml = readPageFile('pages/bind/bind.wxml')
  const heartAt = wxml.indexOf('class="hero-icon">♥')
  const gateAt = wxml.indexOf('wx:if="{{revealed}}"')
  assert.ok(heartAt !== -1 && gateAt > heartAt)
  const gated = wxml.slice(gateAt)
  for (const marker of ['class="hero-title"', 'class="hero-desc"', 'wx:if="{{bound}}"', 'class="error-msg"', 'class="error-retry"', '创建房间', '加入房间']) assert.ok(gated.includes(marker))
  assert.doesNotMatch(wxml.slice(0, gateAt), /hero-title|创建房间|已绑定房间|error-msg|error-retry/)
  assert.equal(findRule(readPageFile('pages/bind/bind.wxss'), '.hero-icon').animation, 'heroIn 0.6s var(--ease-out) both')
  check.resolve({ code: 0, room: null })
  await app.settle()
  assert.equal(page.data.verifying, false)
  assert.equal(page.data.revealed, true)
  assert.equal(page.data.bound, false)
  assert.equal(page.data.checkFailed, false)
})

test('later checks and retries keep revealed content while cloud responses are delayed', async (t) => {
  for (const retry of [false, true]) {
    await t.test(retry ? 'retry' : 'show', async (t) => {
      const app = bindPlatform(t)
      if (retry) app.cloud.when('getMyRoom').reject(new Error('network down'))
      const page = app.launch('/pages/bind/bind')
      await app.settle()
      const check = app.cloud.when('getMyRoom').defer()
      if (retry) app.dispatch(page, 'retryCheck')
      else { app.hide(); app.show() }
      await app.settle()
      assert.equal(page.data.verifying, false)
      assert.equal(page.data.revealed, true)
      assert.equal(page.data.bound, false)
      if (retry) {
        assert.equal(page.data.errorMsg, '网络不太稳定，请重试')
        assert.equal(page.data.checkFailed, true)
      }
      check.resolve({ code: 0, room: retry ? null : { roomCode: 'ROOM01' } })
      // Further homepage lookups after the delayed bound result use this response.
      if (!retry) app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
      await app.settle()
      assert.equal(page.data.verifying, false)
      assert.equal(page.data.revealed, true)
      assert.equal(page.data.checkFailed, false)
      assert.equal(page.data.errorMsg, '')
      assert.equal(page.data.bound, !retry)
      assert.equal(homeJumps(app).length, retry ? 0 : 1)
    })
  }
})

test('bind page reveals the card and its title with the shared enter motion', () => {
  const css = readPageFile('pages/bind/bind.wxss')
  const frames = /@keyframes bindReveal\s*\{([\s\S]*?)\n\}/.exec(css)
  assert.ok(frames)
  assert.match(frames[1], /from\s*\{[^}]*opacity:\s*0/)
  assert.match(frames[1], /from\s*\{[^}]*transform:\s*translateY\(16rpx\)/)
  assert.match(frames[1], /to\s*\{[^}]*opacity:\s*1/)
  assert.match(frames[1], /to\s*\{[^}]*transform:\s*translateY\(0\)/)
  const reveal = findRule(css, '.bind-reveal')
  assert.equal(reveal.animation, 'bindReveal var(--duration-enter) var(--ease-out) both')
  assert.equal(reveal.opacity, undefined)
  assert.equal(reveal.transform, undefined)
  assert.doesNotMatch(css, /--duration-enter\s*:/)
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(reduced, /\.bind-reveal[^{]*\{[^}]*animation:\s*none/)
  const wxml = readPageFile('pages/bind/bind.wxml')
  assert.match(wxml, /wx:if="\{\{revealed\}\}" class="bind-reveal"[\s\S]*wx:if="\{\{bound\}\}"[\s\S]*class="error-msg"[\s\S]*class="error-retry"/)
  assert.match(wxml, /<view wx:if="\{\{revealed\}\}" class="bind-reveal">\s*<text class="hero-title">[^<]*<\/text>\s*<text class="hero-desc">[^<]*<\/text>\s*<\/view>/)
})

test('created room blooms once, failed creation does not bloom, and rechecking clears the mark', async (t) => {
  const app = bindPlatform(t, { failHome: true, createRoom: { code: -1, msg: '创建失败' } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  const boundCard = attrs => attrs['wx:if'] === '{{bound}}'
  assert.deepEqual(renderedClasses('hero', page.data), ['hero'])
  await app.dispatch(page, 'createRoom')
  assert.equal(page.data.errorMsg, '创建失败')
  assert.deepEqual(renderedClasses('hero', page.data), ['hero'])
  app.cloud.when('createRoom').reply({ code: 0, room: { roomCode: 'ROOM05' } })
  await app.dispatch(page, 'createRoom')
  assert.deepEqual(renderedClasses('hero', page.data), ['hero', 'hero-bloom'])
  assert.deepEqual(renderedClasses('premium-card', page.data, boundCard), ['premium-card', 'bound-reveal'])
  assert.deepEqual(boundCardActions(page.data), [{ tier: 'primary', label: '发给 TA', action: 'share' }, { tier: 'secondary', label: '进入应用', action: 'goHome' }])
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM05' } })
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.deepEqual(renderedClasses('hero', page.data), ['hero'])
  assert.deepEqual(renderedClasses('premium-card', page.data, boundCard), ['premium-card'])
  const css = readPageFile('pages/bind/bind.wxss')
  const frames = /@keyframes heroBloom\s*\{([\s\S]*?)\n\}/.exec(css)
  assert.ok(frames)
  assert.match(frames[1], /from\s*\{\s*opacity:\s*0\.\d+;\s*transform:\s*scale\(1\);\s*\}/)
  assert.match(frames[1], /to\s*\{\s*opacity:\s*0;\s*transform:\s*scale\(1\.\d+\);\s*\}/)
  const echo = findRule(css, '.hero.hero-bloom .hero-icon::after')
  assert.equal(echo.content, "'♥'")
  assert.equal(echo.animation, 'heroBloom var(--duration-emphasis) var(--ease-out) both')
  assert.equal(echo.opacity, '0')
  assert.equal(echo['text-shadow'], 'none')
  assert.equal(echo['pointer-events'], 'none')
  const card = findRule(css, '.premium-card.bound-reveal')
  assert.equal(card.animation, 'bindReveal var(--duration-enter) var(--ease-out) both')
  assert.equal(card.opacity, undefined)
  assert.equal(card.transform, undefined)
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.equal(findRule(reduced, '.hero.hero-bloom .hero-icon::after').animation, 'none')
  assert.equal(findRule(reduced, '.premium-card.bound-reveal').animation, 'none')
})

test('bind page consumes the unbind notice exactly once', async (t) => {
  const app = bindPlatform(t, { storage: { bindUnbindNotice: '1' } })
  app.launch('/pages/bind/bind')
  await app.settle()
  assert.deepEqual(app.wx.toasts, [{ title: '已解除绑定', icon: 'none' }])
  assert.equal(app.storage.bindUnbindNotice, undefined)
  app.hide()
  app.show()
  await app.settle()
  assert.equal(app.wx.toasts.length, 1)
})

test('settings local reset preserves an active room and only shows unbound after fresh resolution finds no room', async (t) => {
  for (const stillBound of [true, false]) {
    await t.test(String(stillBound), async (t) => {
      const app = bindPlatform(t, { room: { roomCode: 'ROOM01' } })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      assert.equal(page.data.roomCodeDisplay, 'ROOM01')
      app.cloud.when('getMyRoom').reply({ code: 0, room: stillBound ? { roomCode: 'ROOM01' } : null })
      app.respondNext('showModal', { confirm: true, cancel: false })
      await app.dispatch(page, 'clearData')
      await app.settle()
      const modal = app.wx.modals[0]
      assert.equal(modal.title, '重新同步房间')
      assert.match(modal.content, /不会删除记录/)
      assert.match(modal.content, /不会退出房间/)
      assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 2)
      assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
      assert.equal(page.data.roomCode, stillBound ? 'ROOM01' : '')
      assert.equal(page.data.roomCodeDisplay, stillBound ? 'ROOM01' : '未绑定')
      assert.deepEqual(app.wx.toasts, [{ title: '已清除本机房间码' }])
    })
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

// issue #149：按页面数据求值已绑定卡按钮的 wx:if / wx:elif，按文档顺序列出实际渲染的操作和主次
function boundCardActions(data) {
  const boundCard = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
  const keys = Object.keys(data).filter(key => /^[A-Za-z_$][\w$]*$/.test(key))
  const evaluate = expr => Boolean(new Function(...keys, `return (${expr})`)(...keys.map(key => data[key])))
  const actions = []
  let chainShown = false
  for (const [, , attrs, label] of boundCard.matchAll(/<(button|view)\b([^>]*)>([^<]*)<\/\1>/g)) {
    const classes = ((/(?:^|\s)class="([^"]*)"/.exec(attrs) || [])[1] || '').split(/\s+/)
    if (!classes.includes('btn-premium') && !classes.includes('btn-ghost')) continue
    const branch = /\swx:(if|elif)="\{\{(.+?)\}\}"/.exec(attrs)
    let shown = true
    if (branch && branch[1] === 'if') shown = evaluate(branch[2])
    if (branch && branch[1] === 'elif') shown = !chainShown && evaluate(branch[2])
    chainShown = branch && branch[1] === 'elif' ? chainShown || shown : shown
    if (!shown) continue
    const handler = /\sbindtap="([^"]+)"/.exec(attrs) || /\sopen-type="([^"]+)"/.exec(attrs)
    actions.push({
      tier: classes.includes('btn-premium') ? 'primary' : 'secondary',
      label: label.trim(),
      action: handler ? handler[1] : ''
    })
  }
  return actions
}

// issue #167：bind.wxml 里类名以 firstClass 开头（并且属性满足 where）的第一个开始标签，按页面数据渲染出的类名
function renderedClasses(firstClass, data, where = () => true) {
  const tag = wxmlOpeningTags(readPageFile('pages/bind/bind.wxml'))
    .find(candidate => candidate.classes[0] === firstClass && where(candidate.attrs))
  assert.ok(tag, `expected an element whose class starts with ${firstClass}`)
  return renderWxmlClasses(tag.attrs.class, data)
}

function findRule(css, selector) {
  // :active 与 hover-class 并列时仍是同一条规则，组里任一选择器都要能查到它。
  const rule = parseWxssRules(css).find((candidate) => candidate.selectors.includes(selector))
  assert.ok(rule, `expected rule ${selector}`)
  return rule.decls
}

test('bind page reports restored records only after both collections load successfully', async (t) => {
  for (const [label, periods, memories, notice] of [
    ['restored', { code: 0, data: [{ _id: 'p1' }, { _id: 'p2' }] }, { code: 0, data: [{ _id: 'm1' }] }, '已恢复原来的房间和 3 条记录'],
    ['empty', { code: 0, data: [] }, { code: 0, data: [] }, ''],
    ['incomplete', new Error('network down'), { code: 0, data: [{ _id: 'm1' }] }, '']
  ]) {
    await t.test(label, async (t) => {
      const app = bindPlatform(t, { createRoom: { code: 0, room: { roomCode: 'ROOM05' } }, periods, memories })
      const page = app.launch('/pages/bind/bind')
      await app.settle()
      await app.dispatch(page, 'createRoom')
      assert.equal(page.data.restoredNotice, notice)
      assert.equal(page.data.justCreated, true)
      assert.match(readPageFile('pages/bind/bind.wxml'), /\{\{restoredNotice\}\}/)
    })
  }
})

// Scenario data programs only cloud responses and platform state; all pages and modules are real.
function bindPlatform(t, options = {}) {
  const app = createMiniProgram({ storage: options.storage || {} })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: options.room || null })
  app.cloud.when('createRoom').reply(options.createRoom || { code: -1, msg: '创建失败' })
  app.cloud.when('joinRoom').reply(options.joinRoom || { code: -1, msg: '加入失败' })
  for (const collection of ['periods', 'memories']) {
    const response = options[collection] || { code: 0, data: [] }
    const route = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection } })
    if (response instanceof Error) route.reject(response)
    else route.reply(response)
  }
  if (options.failHome) app.failNavigation('switchTab')
  return app
}

function homeJumps(app) {
  return app.navigation.filter(call => call.method === 'switchTab' && call.url === '/pages/index/index')
}
