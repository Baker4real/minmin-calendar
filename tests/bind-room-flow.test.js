const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createMiniProgram } = require('./helpers/miniProgram')
const path = require('node:path')
const test = require('node:test')
const { readSource } = require('./sourceFiles')
const { listWxmlFiles, parseWxssRules } = require('./designTokens')
const { evaluateWxmlExpression, renderWxmlAttribute, renderWxmlClasses, wxmlOpeningTags } = require('./wxmlTemplate')

// issue #78：房间码复制/解除绑定同屏可达、清除本地数据文案与行为对齐的页面接缝测试。
// issue #102：已绑定冷启动自动 switchTab 进首页（跳转失败才留「进入应用」兜底）；校验失败留在
// 本页给可点重试；已绑定卡不再有解除绑定（needUnbind 中间态入口保留）；创建后提示「把房间码发给 TA」；
// 加入成功后直达首页，由首页的一次性欢迎条说明配对结果。
// issue #104：绑定页收敛回 Aurora Bloom——紫粉试点 token/深紫画布/粉胶囊/粉幽灵整体移除，
// #78 的绑定页/设置页复制键像素同款契约按 DESIGN.md 重建条件恢复（fill/label/radius/padding/shadow 全等）。
// 观察用户能看见或能做到的事：哪个控件在场、哪句话显示、点按后落到哪个状态；
// 所有页面行为经共享微信平台替身驱动，真实 Room、云访问和页面 module 保持原样。

const repoRoot = path.join(__dirname, '..')

const readPageFile = (relativePath) => readSource(path.join(repoRoot, relativePath), 'utf8')
const readRawPageFile = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

test('bind bound screen puts the copy button in the same row as the room code, ahead of the enter-app main button', () => {
  const wxml = readPageFile('pages/bind/bind.wxml')
  const boundCard = sliceBetween(wxml, 'wx:if="{{bound}}"', 'wx:else')

  const copyButton = /class="copy-btn button-primary"[^>]*bindtap="copyRoomCode"/.exec(boundCard)
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
    /class="room-code-value"[^>]*\s(?:bindtap|aria-role|aria-label)=/,
    'the room code text must stay plain display text, not a control'
  )

  // issue #83：复制键紧贴房间码正后方，两者同处一个行容器（容器开→房间码→复制键→容器闭），
  // 不再是复制键独占的居中行；#232：两页的房间码共用 shared/room-code.wxss 的同一个类。
  assert.match(
    boundCard,
    /<view class="[^"]*">\s*<text class="room-code-value"[^>]*>[^<]*<\/text>\s*<view class="copy-btn button-primary"[^>]*bindtap="copyRoomCode"[^>]*>[^<]*<\/view>\s*<\/view>/,
    'the copy button must sit in the same row container as the room code'
  )
  const sharedRoomCode = findRule(readPageFile('pages/shared/room-code.wxss'), '.room-code-value')
  assert.equal(sharedRoomCode['font-size'], 'var(--font-size-title)')
  assert.equal(sharedRoomCode.color, 'var(--text-primary)')
  assert.equal(sharedRoomCode['letter-spacing'], 'var(--letter-spacing-room-code)')
  for (const file of ['pages/bind/bind.wxss', 'pages/settings/settings.wxss']) {
    assert.deepEqual(findRule(readPageFile(file), '.room-code-value'), sharedRoomCode, `${file} uses the shared room-code rule`)
  }

  assert.match(
    boundCard,
    /class="btn-premium button-primary"[^>]*bindtap="goHome"[^>]*aria-label="进入应用"/,
    '进入应用 stays on the bound screen as the jump-failure main button'
  )
  // issue #102：解除绑定移到设置页房间卡，已绑定卡不再有解绑入口；
  // 绑定页只保留 needUnbind 中间态（错误恢复路径）的就地解除入口
  assert.doesNotMatch(
    boundCard,
    /bindtap="unbind"/,
    'the bound card no longer offers unbind; it lives on the settings room card'
  )

  const unboundCard = wxml.slice(wxml.indexOf('wx:else', wxml.indexOf('wx:if="{{bound}}"')) + 'wx:else'.length)
  assert.doesNotMatch(
    unboundCard,
    /class="copy-btn/,
    'copy button belongs to the bound screen, not the create/join form'
  )
})

// issue #78 像素同款契约重建（issue #104，DESIGN.md「试点不推广」节登记）；#232 将两页规则
// 收进 shared/room-code.wxss，继续核对 fill/label/radius/padding/shadow，并补上唯一的 flex-shrink。
test('bind and settings copy buttons are the same rose small button pixel-for-pixel (issue #78)', () => {
  const sharedCss = readPageFile('pages/shared/room-code.wxss')
  const sharedRule = findRule(sharedCss, '.copy-btn')

  // #232：契约五属性和 flex-shrink 只保留共享来源；页面原始文件只 import，不再各写一份。
  assert.equal(sharedRule.background, 'var(--aurora-pink)')
  assert.equal(sharedRule.color, 'var(--text-on-accent)')
  assert.equal(sharedRule['border-radius'], 'var(--radius-sm)')
  assert.equal(sharedRule.padding, '0 28rpx')
  assert.equal(sharedRule['box-shadow'], undefined)
  assert.equal(sharedRule['flex-shrink'], '0')
  assert.equal(sharedRule['min-height'], '88rpx')
  for (const file of ['pages/bind/bind.wxss', 'pages/settings/settings.wxss']) {
    assert.match(readRawPageFile(file), /@import '\.\.\/shared\/room-code\.wxss';/)
    const localCopyRules = parseWxssRules(readRawPageFile(file)).filter(rule => rule.selectors.some(selector => selector.startsWith('.copy-btn')))
    assert.deepEqual(localCopyRules, [], `${file} must not keep a local copy-button rule`)
    assert.deepEqual(findRule(readPageFile(file), '.copy-btn'), sharedRule, `${file} expands to the one shared copy-button rule`)
  }

  const sharedGlow = findRule(sharedCss, '.copy-btn::before')
  assert.equal(sharedGlow['box-shadow'], '0 8rpx 30rpx rgba(232,144,158,0.28)')
  assert.equal(findRule(sharedCss, '.copy-btn:active').transform, 'scale(0.94)')
  assert.equal(findRule(sharedCss, '.copy-btn:active::before').opacity, '0.5')
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
  assert.equal(appPremium.color, 'var(--text-on-accent)')
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
// 聚焦描边回玫瑰；输入仍用等宽数字/逐字槽位/1px 实线描边，#211 为接受含空白粘贴码去掉原始 6 字截断；
// 选中 tab 是描边玫瑰弱选中（issue #145），不再用主按钮实色填充。
// 需解绑中间态入口在场（样式跟随 app 级警示红），错误提示保持警示红族形态。
test('bind unbound form rides the navy Aurora glass while the error strip keeps the warning-red family', () => {
  const css = readPageFile('pages/bind/bind.wxss')

  // 紫粉试点整体退场：页面级 --bind-* token 与深紫画布覆盖不再存在
  assert.doesNotMatch(css, /--bind-/, 'the purple-pink pilot tokens must leave the bind page')
  assert.doesNotMatch(css, /\.page::before/, 'the dark-purple canvas override must leave the bind page')

  // #233：tab 条使用共享卡内变体，透明落在现有海军卡上；输入框仍保留自身玻璃面。
  const tabBar = Object.assign({}, ...parseWxssRules(css)
    .filter(rule => rule.selectors.includes('.tab-bar'))
    .map(rule => rule.decls))
  assert.equal(tabBar.background, 'transparent')
  assert.equal(tabBar.border, '0')
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

  // R10：原生 :focus 没有画出玫瑰，改由共享 focus/blur 类画出同一道 1px 实线。
  const focus = findRule(readPageFile('pages/shared/form-control.wxss'), '.form-control.form-control-focused')
  assert.equal(focus['border-color'], '#E8909E')

  // 错误提示保持警示红族（红字 + 红族浅底描边），需解绑中间态入口样式在场
  const errorMsg = findRule(css, '.error-msg')
  assert.equal(errorMsg.color, 'var(--color-danger)')
  assert.match(errorMsg.background, /rgba\(249,\s*115,\s*115,\s*0\.1\)/)
  assert.match(errorMsg.border, /1px solid rgba\(249,\s*115,\s*115,\s*0\.24\)/)
  // #234：重试不再是第二个红色错误面，整行句与首页、记录 tab 共用玫瑰可点色。
  const errorRetry = findRule(css, '.error-retry')
  assert.equal(errorRetry.color, '#E8909E')
  assert.equal(errorRetry.border, '1px solid rgba(255,255,255,0.1)')
  const unbindInline = findRule(css, '.unbind-inline')
  assert.match(unbindInline['margin-top'], /^\d+rpx$/)
})

test('R10 room-code input shows the shared focused class on focus and clears it on blur', async (t) => {
  const app = bindPlatform(t)
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'switchTab', { currentTarget: { dataset: { tab: 'join' } } })
  const input = wxmlOpeningTags(readPageFile('pages/bind/bind.wxml'))
    .find(tag => tag.tag === 'input' && tag.classes.includes('code-input'))
  assert.ok(input)
  assert.equal(input.attrs.bindfocus, 'onCodeFocus')
  assert.equal(input.attrs.bindblur, 'onCodeBlur')
  assert.equal(page.data.codeFocused, false)
  assert.equal(renderWxmlClasses(input.attrs.class, page.data).includes('form-control-focused'), false)

  await app.dispatch(page, 'onCodeFocus')
  assert.equal(page.data.codeFocused, true)
  assert.equal(renderWxmlClasses(input.attrs.class, page.data).includes('form-control-focused'), true)
  await app.dispatch(page, 'onCodeBlur')
  assert.equal(page.data.codeFocused, false)
  assert.equal(renderWxmlClasses(input.attrs.class, page.data).includes('form-control-focused'), false)
})

// issue #138：加入房间时六位码完整可见、在框内居中，输入框与上方说明、下方主按钮同宽。
test('join room-code field has an 88rpx line and lines up with the hint and the main button', () => {
  const css = readPageFile('pages/bind/bind.wxss')
  const codeInput = findRule(css, '.code-input')
  const baseInput = findRule(css, '.form-control')

  assert.equal(codeInput.height, '88rpx', 'the field needs an explicit height at the touch step')
  assert.equal(codeInput['line-height'], '88rpx', 'the line box must match that height so glyphs are not clipped')
  assert.equal(baseInput.width, '100%', 'the field spans the card, same as the hint and the main button')
  assert.equal(codeInput['text-align'], 'center')
  assert.equal(baseInput['box-sizing'], 'border-box')
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
    const wxml = readSource(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    for (const body of textNodeBodies(wxml)) {
      if (/<br\b/i.test(body)) offenders.push(`${relative}: ${body.trim()}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('copy buttons press instantly under reduced motion on both bind and settings', () => {
  // #232：两页经 @import 共用这一段；RM 下移除 transform 与柔光过渡，按下立即到位。
  const css = readPageFile('pages/shared/room-code.wxss')
  const rmStart = css.lastIndexOf('@media (prefers-reduced-motion: reduce)')
  assert.ok(rmStart !== -1, 'shared room-code styles must register a prefers-reduced-motion block')
  assert.match(
    css.slice(rmStart),
    /\.copy-btn[^{]*\{[^}]*transition:\s*none/,
    'shared reduced-motion block must neutralize the copy button transform transition'
  )
  assert.match(
    css.slice(rmStart),
    /\.copy-btn::before[^{]*\{[^}]*transition:\s*none/,
    'shared reduced-motion block must make the copy button glow switch instantly'
  )
})

test('bind page exposes same-screen unbind for create and join refused by another room', async (t) => {
  for (const action of ['createRoom', 'joinRoom']) {
    await t.test(action, async (t) => {
      for (const [msg, displayed] of [
        ['你目前属于另一个房间，需要退出后才能继续', '你目前属于另一个房间，需要退出后才能继续'],
        ['membership conflict', '这次没有完成，请重试'],
        ['云数据库查询超时 (15000ms)', '网络不太稳定，请重试']
      ]) {
        await t.test(msg, async (t) => {
          const app = bindPlatform(t, { [action]: { code: -5, msg } })
          const page = app.launch(action === 'joinRoom' ? '/pages/bind/bind?roomCode=ROOM01' : '/pages/bind/bind')
          await app.settle()
          await app.dispatch(page, action)
          assert.equal(page.data.errorMsg, displayed)
          assert.equal(page.data.needUnbind, true)
          assert.match(readPageFile('pages/bind/bind.wxml'), /wx:if="\{\{needUnbind\}\}"[^>]*bindtap="unbind"/)
        })
      }
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

test('create and join failures render their error strip with an alert role', async (t) => {
  const errorStrip = wxmlOpeningTags(readPageFile('pages/bind/bind.wxml')).find(tag => tag.classes.includes('error-msg'))
  assert.ok(errorStrip, 'bind page has an error strip')
  for (const [action, message] of [['createRoom', '创建失败'], ['joinRoom', '房间不存在，请检查房间码']]) {
    await t.test(action, async (t) => {
      const app = bindPlatform(t, { [action]: { code: -1, msg: message } })
      const page = app.launch(action === 'joinRoom' ? '/pages/bind/bind?roomCode=ROOM01' : '/pages/bind/bind')
      await app.settle()
      await app.dispatch(page, action)
      assert.equal(page.data.errorMsg, message)
      assert.equal(Boolean(evaluateWxmlExpression(errorStrip.attrs['wx:if'].slice(2, -2), page.data)), true)
      assert.equal(errorStrip.attrs['aria-role'], 'alert')
    })
  }
})

test('create and join clear the unbind entry for other failures even when the copy contains the old hint', async (t) => {
  for (const action of ['createRoom', 'joinRoom']) {
    await t.test(action, async (t) => {
      const app = bindPlatform(t, { [action]: { code: -5, msg: '你目前属于另一个房间' } })
      const page = app.launch(action === 'joinRoom' ? '/pages/bind/bind?roomCode=ROOM01' : '/pages/bind/bind')
      await app.settle()
      await app.dispatch(page, action)
      assert.equal(page.data.needUnbind, true)
      app.cloud.when(action).reply({ code: -1, msg: '请先解除绑定，再重试' })
      await app.dispatch(page, action)
      assert.equal(page.data.errorMsg, '请先解除绑定，再重试')
      assert.equal(page.data.needUnbind, false)
      app.cloud.when(action).reject(new Error('network down'))
      await app.dispatch(page, action)
      assert.equal(page.data.errorMsg, '网络不太稳定，请重试')
      assert.equal(page.data.needUnbind, false)
      assert.equal(page.data.loading, false)
    })
  }
})

test('confirming same-screen unbind uses unknown no-code copy and leaves only through the shared danger action', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: -5, msg: '你已加入其他房间，请先解除绑定后再创建新房间' } })
  app.cloud.when('leaveRoom').reply({ code: 0, archivedCount: 0 })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')
  assert.equal(page.data.needUnbind, true)
  const writes = []
  const setStorageSync = app.wx.setStorageSync
  app.wx.setStorageSync = (key, value) => {
    writes.push(key)
    return setStorageSync(key, value)
  }
  const unbinding = app.dispatch(page, 'unbind')
  await app.settle()
  assert.equal(page.data.confirmationTitle, '解除绑定？')
  assert.equal(page.data.confirmationContent, '解除后你这边看不到这本日历，记录不会删除。TA 还在房间里时，用原来的房间码加入；房间里只剩你时，在绑定页点「我来建房间」恢复')
  assert.deepEqual(page.data.confirmationActions, [
    { id: 'confirm', text: '解除绑定', kind: 'danger' },
    { id: 'cancel', text: '取消', kind: 'secondary' }
  ])
  assert.deepEqual(app.wx.modals, [])
  assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
  await app.dispatch(page, 'onConfirmationAction', { currentTarget: { dataset: { action: 'confirm' } } })
  await app.advance(200)
  await unbinding
  await app.settle()
  assert.equal(app.cloud.calls.filter(call => call.name === 'leaveRoom').length, 1)
  assert.equal(page.data.bound, false)
  assert.equal(page.data.needUnbind, false)
  assert.equal(page.data.errorMsg, '')
  assert.equal(page.data.leaveRecoveryNotice, '想回原来的房间，用原来的房间码加入')
  assert.deepEqual(writes, [], 'same-screen outcome handoff must not write local storage')
  assert.equal(app.navigation.length, 1, 'same-screen unbind adds no route or route parameters')
  assert.deepEqual(app.wx.toasts, [], 'the existing same-screen unbind remains silent')
})

test('created room shows the room-ready title and its next-step explanation before the code', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: 0, room: { roomCode: 'ROOM05' } } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')

  const card = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
  const status = /<view class="bound-status">([\s\S]*?)<\/view>/.exec(card)
  const explanation = /<text wx:if="\{\{justCreated\}\}" class="info-text">([\s\S]*?)<\/text>/.exec(card)
  assert.ok(status)
  assert.ok(explanation)
  assert.equal(renderWxmlAttribute(status[1], page.data), '房间建好了')
  assert.equal(explanation[1], '把房间码发给 TA，TA 加入后你们看的是同一本日历')
  assert.ok(status.index < explanation.index)
  assert.ok(explanation.index < card.indexOf('class="bound-code-row"'))
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
  assert.match(card, /wx:if="\{\{justCreated\}\}"[^>]*>\s*把房间码发给 TA，TA 加入后你们看的是同一本日历\s*<\//)
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
  assert.equal(card.imageUrl, '/images/invite-card.png')
  assert.doesNotMatch(card.title, /经期|欢乐时光|记录|ROOM05/)
  assert.equal(JSON.stringify(card).replace(card.path, '').includes('ROOM05'), false)
  const boundCard = sliceBetween(readPageFile('pages/bind/bind.wxml'), 'wx:if="{{bound}}"', 'wx:else')
  const button = /<button\b[^>]*>\s*发给 TA\s*<\/button>/.exec(boundCard)
  assert.ok(button)
  assert.match(button[0], /open-type="share"/)
  assert.match(button[0], /wx:if="\{\{justCreated\}\}"/)
})

test('bind without a room code shares only the ordinary app card with static artwork', async (t) => {
  const app = bindPlatform(t)
  const page = app.launch('/pages/bind/bind')
  await app.settle()

  assert.deepEqual(app.share(page), {
    title: '美少女的日历',
    path: '/pages/bind/bind',
    imageUrl: '/images/invite-card.png'
  })
})

test('bind with a paired or unknown Room shares only the ordinary static card', async (t) => {
  for (const status of ['paired', undefined]) {
    await t.test(status || 'unknown', async (t) => {
      const app = bindPlatform(t, { room: { roomCode: 'ROOM05', status }, failHome: true })
      const page = app.launch('/pages/bind/bind')
      await app.settle()

      assert.equal(page.data.bound, true)
      const card = app.share(page)
      assert.deepEqual(card, {
        title: '美少女的日历',
        path: '/pages/bind/bind',
        imageUrl: '/images/invite-card.png'
      })
      assert.equal(JSON.stringify(card).includes('ROOM05'), false)
    })
  }
})

test('bind starts with two equal unselected entries and expands only the chosen room flow', async (t) => {
  const app = bindPlatform(t)
  const page = app.launch('/pages/bind/bind')
  await app.settle()

  const wxml = readPageFile('pages/bind/bind.wxml')
  const entries = wxmlOpeningTags(wxml).filter(tag => tag.classes[0] === 'tab')
  assert.deepEqual(entries.map(tag => tag.attrs['aria-label']), ['我来建房间', '我有房间码'])
  assert.match(wxml, />我来建房间<\/view>/)
  assert.match(wxml, />我有房间码<\/view>/)
  assert.equal(page.data.tab, '')
  const panels = wxmlOpeningTags(wxml).filter(tag => /^\{\{tab === '(create|join)'\}\}$/.test(tag.attrs['wx:if'] || ''))
  const panelVisible = tab => {
    const panel = panels.find(tag => tag.attrs['wx:if'].includes(`'${tab}'`))
    assert.ok(panel, `expected the ${tab} panel`)
    return evaluateWxmlExpression(panel.attrs['wx:if'].slice(2, -2), page.data)
  }
  assert.equal(panelVisible('create'), false)
  assert.equal(panelVisible('join'), false)
  for (const entry of entries) {
    assert.equal(renderWxmlClasses(entry.attrs.class, page.data).includes('active'), false)
    assert.equal(evaluateWxmlExpression(entry.attrs['aria-checked'].slice(2, -2), page.data), false)
  }

  await app.dispatch(page, 'switchTab', { currentTarget: { dataset: { tab: 'join' } } })
  assert.equal(panelVisible('create'), false)
  assert.equal(panelVisible('join'), true)
  await app.dispatch(page, 'switchTab', { currentTarget: { dataset: { tab: 'create' } } })
  assert.equal(panelVisible('create'), true)
  assert.equal(panelVisible('join'), false)
})

test('cancelling invite share skips home navigation on that return show only', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: 0, room: { roomCode: 'ROOM05' } } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'createRoom')
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM05', status: 'waiting' } })

  const card = app.share(page)
  assert.equal(card.path, '/pages/bind/bind?roomCode=ROOM05')
  app.hide()
  app.show()
  await app.settle()
  assert.equal(homeJumps(app).length, 0, 'the show that closes the share panel stays on Bind')
  assert.equal(app.currentPage.route, 'pages/bind/bind')
  assert.equal(page.data.bound, true)
  assert.equal(page.data.justCreated, true)
  assert.deepEqual(boundCardActions(page.data), [
    { tier: 'primary', label: '发给 TA', action: 'share' },
    { tier: 'secondary', label: '进入应用', action: 'goHome' }
  ])

  app.hide()
  app.show()
  await app.settle()
  assert.equal(homeJumps(app).length, 1, 'a later show resumes the normal bound-room navigation')
  assert.equal(app.currentPage.route, 'pages/index/index')
})

test('bind page normalizes every whitespace in an invite and ignores malformed invite lengths', async (t) => {
  for (const [code, tab, joinCode] of [
    ['ROOM05', 'join', 'ROOM05'],
    [' a b\tc 1 2 3 ', 'join', 'ABC123'],
    ['ABC', '', '']
  ]) {
    await t.test(JSON.stringify(code), async (t) => {
      const app = bindPlatform(t)
      const page = app.launch(`/pages/bind/bind?roomCode=${encodeURIComponent(code)}`)
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

test('bind page removes all whitespace from pasted input before uppercasing and joining', async (t) => {
  const app = bindPlatform(t)
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  await app.dispatch(page, 'switchTab', { currentTarget: { dataset: { tab: 'join' } } })
  await app.dispatch(page, 'onCodeInput', { detail: { value: ' a b\tc 1 2 3 ' } })
  assert.equal(page.data.joinCode, 'ABC123')
  const input = wxmlOpeningTags(readPageFile('pages/bind/bind.wxml')).find(tag => tag.classes.includes('code-input'))
  assert.notEqual(input.attrs.maxlength, '6', 'the raw input must accept whitespace around a six-character code')
  await app.dispatch(page, 'joinRoom')
  const join = app.cloud.calls.find(call => call.name === 'joinRoom')
  assert.equal(join.data.roomCode, 'ABC123')
})

test('cached-room launch validates and preloads records together, then Home joins that in-flight load', async (t) => {
  const app = bindPlatform(t, {
    storage: { roomCode: 'ROOM01' },
    room: { roomCode: 'ROOM01', status: 'waiting' }
  })
  const check = app.cloud.when('getMyRoom').defer()
  const periods = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods' } }).defer()
  const memories = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'memories' } }).defer()
  app.launch('/pages/bind/bind')
  await app.settle()

  assert.deepEqual(app.cloud.calls.map(call => call.name), ['getMyRoom', 'dataOp', 'dataOp'])
  assert.deepEqual(app.cloud.calls.filter(call => call.name === 'dataOp').map(call => call.data.collection), ['periods', 'memories'])
  check.resolve({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  await app.settle()
  assert.equal(app.currentPage.route, 'pages/index/index')
  const home = app.currentPage
  assert.equal(home.data.loading, true)
  assert.equal(app.cloud.calls.filter(call => call.name === 'dataOp').length, 2, 'Home must join the launch load instead of starting another')

  periods.resolve({
    code: 0,
    data: [{ _id: 'launch-p', startDate: '2026-06-20', endDate: '2026-06-20', status: 'known-end' }],
    roomStatus: 'waiting'
  })
  memories.resolve({ code: 0, data: [], roomStatus: 'waiting' })
  await app.settle()
  assert.equal(home.data.days.find(day => day.date === '2026-06-20').isPeriod, true)
  assert.equal(home.data.loading, false)
  assert.equal(app.cloud.calls.filter(call => call.name === 'dataOp').length, 2)
})

test('invalid cached-room checks discard the launch load and keep the existing failure paths', async (t) => {
  for (const [label, failure] of [['no-room', false], ['retryable-failure', true]]) {
    await t.test(label, async (t) => {
      const app = bindPlatform(t, {
        storage: { roomCode: 'ROOM01' },
        room: { roomCode: 'ROOM01', status: 'waiting' }
      })
      const check = app.cloud.when('getMyRoom').defer()
      const periods = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods' } }).defer()
      const memories = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'memories' } }).defer()
      const bind = app.launch('/pages/bind/bind')
      await app.settle()
      if (failure) check.reject(new Error('network down'))
      else check.resolve({ code: 0, room: null })
      await app.settle()

      assert.equal(bind.data.bound, false)
      assert.equal(bind.data.revealed, true)
      assert.equal(bind.data.verifying, false)
      assert.equal(bind.data.checkFailed, failure)
      assert.equal(bind.data.errorMsg, failure ? '网络不太稳定，请重试' : '')
      assert.equal(app.storage.roomCode, failure ? 'ROOM01' : undefined)

      periods.resolve({
        code: 0,
        data: [{ _id: 'stale-launch-p', startDate: '2026-06-20', endDate: '2026-06-20', status: 'known-end' }],
        roomStatus: 'paired'
      })
      memories.resolve({ code: 0, data: [], roomStatus: 'paired' })
      await app.settle()

      app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
      const laterPeriods = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods' } }).defer()
      const laterMemories = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'memories' } }).defer()
      app.hide()
      app.show()
      await app.settle()
      assert.equal(app.currentPage.route, 'pages/index/index')
      const home = app.currentPage
      assert.equal(app.cloud.calls.filter(call => call.name === 'dataOp').length, 4, 'a later valid entry must read afresh')
      assert.equal(home.data.loading, true)
      assert.equal(home.data.refreshing, false)
      assert.equal(home.data.days.find(day => day.date === '2026-06-20').isPeriod, false, 'the invalidated launch result must not render')

      laterPeriods.resolve({ code: 0, data: [], roomStatus: 'waiting' })
      laterMemories.resolve({ code: 0, data: [], roomStatus: 'waiting' })
      await app.settle()
      assert.equal(home.data.days.find(day => day.date === '2026-06-20').isPeriod, false)
    })
  }
})

test('already-bound launch ignores the invite, enters home silently and never shows the enter fallback', async (t) => {
  const app = bindPlatform(t, { room: { roomCode: 'ROOM01', status: 'waiting' } })
  const page = app.launch('/pages/bind/bind?roomCode=ROOM05')
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM01')
  assert.equal(page.data.tab, '')
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

test('bind page enters the real homepage directly after a successful join without a toast', async (t) => {
  const app = bindPlatform(t, { joinRoom: { code: 0, roomCode: 'ROOM09' } })
  const page = app.launch('/pages/bind/bind?roomCode=ROOM09')
  await app.settle()
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM09', status: 'paired' } })
  await app.dispatch(page, 'joinRoom')
  await app.settle()
  assert.deepEqual(app.wx.toasts, [])
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

test('first room check shows the opening hint only after 800ms and clears it when validation completes', async (t) => {
  for (const [label, delay] of [['fast', 400], ['slow', 800]]) {
    await t.test(label, async (t) => {
      const app = bindPlatform(t, {
        storage: { roomCode: 'ROOM01' },
        room: { roomCode: 'ROOM01', status: 'waiting' }
      })
      const check = app.cloud.when('getMyRoom').defer()
      const bind = app.launch('/pages/bind/bind')
      await app.settle()
      assert.equal(bind.data.openingCalendarHint, false)

      if (delay === 800) {
        await app.advance(799)
        assert.equal(bind.data.openingCalendarHint, false)
        await app.advance(1)
        assert.equal(bind.data.openingCalendarHint, true)
      } else {
        await app.advance(delay)
        assert.equal(bind.data.openingCalendarHint, false)
      }

      check.resolve({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
      await app.settle()
      assert.equal(app.currentPage.route, 'pages/index/index')
      assert.equal(bind.data.openingCalendarHint, false)
      await app.advance(800)
      assert.equal(bind.data.openingCalendarHint, false, 'a completed fast check must not show a stale hint')

      const wxml = readPageFile('pages/bind/bind.wxml')
      const heartAt = wxml.indexOf('class="hero-icon"')
      const hintAt = wxml.indexOf('wx:if="{{openingCalendarHint}}"')
      assert.ok(heartAt !== -1 && hintAt > heartAt)
      assert.match(wxml.slice(hintAt), /class="hero-desc opening-calendar">正在打开日历…<\/text>/)
    })
  }
})

test('first room check keeps only the brand heart before the opening-hint delay', async (t) => {
  const app = bindPlatform(t)
  const check = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.equal(page.data.verifying, true)
  assert.equal(page.data.revealed, false)
  const wxml = readPageFile('pages/bind/bind.wxml')
  const heartAt = wxml.indexOf('class="hero-icon"')
  const gateAt = wxml.indexOf('wx:if="{{revealed}}"')
  assert.ok(heartAt !== -1 && gateAt > heartAt)
  const gated = wxml.slice(gateAt)
  for (const marker of ['class="hero-title"', 'class="hero-desc"', 'wx:if="{{bound}}"', 'class="error-msg"', 'class="error-retry"', '我来建房间', '我有房间码']) assert.ok(gated.includes(marker))
  assert.doesNotMatch(wxml.slice(0, gateAt), /hero-title|我来建房间|我有房间码|已绑定房间|error-msg|error-retry/)
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
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
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
  assert.deepEqual(renderedClasses('premium-card', page.data, boundCard), ['premium-card', 'glass-surface', 'bound-reveal'])
  assert.deepEqual(boundCardActions(page.data), [{ tier: 'primary', label: '发给 TA', action: 'share' }, { tier: 'secondary', label: '进入应用', action: 'goHome' }])
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM05' } })
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.deepEqual(renderedClasses('hero', page.data), ['hero'])
  assert.deepEqual(renderedClasses('premium-card', page.data, boundCard), ['premium-card', 'glass-surface'])
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
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
  assert.equal(findRule(reduced, '.hero.hero-bloom .hero-icon::after').animation, 'none')
  assert.equal(findRule(reduced, '.premium-card.bound-reveal').animation, 'none')
})

test('bind shows archived and rejoin recovery lines after settings leave using only process memory', async (t) => {
  for (const [archivedCount, recoveryText] of [
    [1, '原来的房间已经存起来，点「我来建房间」就能恢复'],
    [0, '想回原来的房间，用房间码 ROOM01 加入']
  ]) {
    await t.test(archivedCount ? 'archived' : 'not archived', async (t) => {
      const app = bindPlatform(t, { storage: { roomCode: 'ROOM01' } })
      app.cloud.when('getMyRoom').replyOnce({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } }).reply({ code: 0, room: null })
      app.cloud.when('leaveRoom').reply({ code: 0, archivedCount })
      const settings = app.launch('/pages/settings/settings')
      await app.settle()
      const writes = []
      const setStorageSync = app.wx.setStorageSync
      app.wx.setStorageSync = (key, value) => {
        writes.push(key)
        return setStorageSync(key, value)
      }
      const unbinding = app.dispatch(settings, 'unbind')
      await app.settle()
      await app.dispatch(settings, 'onConfirmationAction', { currentTarget: { dataset: { action: 'confirm' } } })
      await app.advance(200)
      await unbinding
      await app.settle()
      const page = app.currentPage
      assert.equal(page.route, 'pages/bind/bind')
      assert.equal(page.data.leaveRecoveryNotice, recoveryText)
      assert.equal(app.navigation.at(-1).url, '/pages/bind/bind')
      assert.equal(app.navigation.at(-1).url.includes('?'), false)
      assert.deepEqual(writes, [], 'neither the archive flag nor original Room code is stored')
      assert.deepEqual(app.wx.modals, [])
      assert.deepEqual(app.wx.toasts, [{ title: '已解除绑定', icon: 'none' }])
      const wxml = readPageFile('pages/bind/bind.wxml')
      const noticeTag = wxmlOpeningTags(wxml).find(tag => tag.classes.includes('leave-recovery-notice'))
      assert.ok(noticeTag, 'the recovery line is part of the Bind template')
      assert.equal(evaluateWxmlExpression(noticeTag.attrs['wx:if'].slice(2, -2), page.data), true)
      assert.ok(wxml.indexOf('leave-recovery-notice') < wxml.indexOf('wx:if="{{bound}}"'), 'the line sits above the binding card')
      app.hide()
      app.show()
      await app.settle()
      assert.equal(page.data.leaveRecoveryNotice, recoveryText)
      assert.equal(app.wx.toasts.length, 1)
      app.cloud.when('createRoom').reply({ code: 0, room: { roomCode: 'ROOM05' } })
      await app.dispatch(page, 'createRoom')
      assert.equal(page.data.leaveRecoveryNotice, '', 'rebinding consumes the explanation')
    })
  }
})

test('settings local reset preserves an active room and only shows unbound after fresh resolution finds no room', async (t) => {
  for (const stillBound of [true, false]) {
    await t.test(String(stillBound), async (t) => {
      const app = bindPlatform(t, { room: { roomCode: 'ROOM01' } })
      const page = app.launch('/pages/settings/settings')
      await app.settle()
      assert.equal(page.data.roomCodeDisplay, 'ROOM01')
      app.cloud.when('getMyRoom').reply({ code: 0, room: stillBound ? { roomCode: 'ROOM01' } : null })
      const resyncing = app.dispatch(page, 'clearData')
      await app.settle()
      assert.equal(page.data.confirmationTitle, '重新同步房间？')
      assert.equal(page.data.confirmationContent, '重新从云端读一次你所在的房间，不会删除任何记录')
      await app.dispatch(page, 'onConfirmationAction', { currentTarget: { dataset: { action: 'confirm' } } })
      await app.advance(200)
      await resyncing
      assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 2)
      assert.equal(app.cloud.calls.some(call => call.name === 'leaveRoom'), false)
      assert.equal(page.data.roomCode, stillBound ? 'ROOM01' : '')
      assert.equal(page.data.roomCodeDisplay, stillBound ? 'ROOM01' : '未绑定')
      assert.deepEqual(app.wx.toasts, [{ title: '已重新同步' }])
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

test('create and join each commit their result and loading false together exactly once', async (t) => {
  for (const action of ['createRoom', 'joinRoom']) {
    for (const outcome of ['success', 'failure']) {
      await t.test(`${action} ${outcome}`, async (t) => {
        const success = outcome === 'success'
        const app = bindPlatform(t, {
          [action]: success
            ? action === 'createRoom' ? { code: 0, room: { roomCode: 'ROOM05' } } : { code: 0, roomCode: 'ROOM05' }
            : { code: -1, msg: '这次没有完成，请重试' }
        })
        const page = app.launch(action === 'joinRoom' ? '/pages/bind/bind?roomCode=ROOM05' : '/pages/bind/bind')
        await app.settle()
        const start = page.setDataCalls.length
        await app.dispatch(page, action)
        const frames = page.setDataCalls.slice(start)
        assert.equal(frames.length, 2, 'one loading frame and one combined result frame')
        assert.equal(frames[0].loading, true)
        assert.equal(frames[1].loading, false)
        assert.equal(frames.filter(frame => frame.loading === false).length, 1)
        if (success) {
          assert.equal(frames[1].bound, true)
          assert.equal(frames[1].roomCode, 'ROOM05')
          if (action === 'createRoom') assert.equal(frames[1].justCreated, true)
        } else {
          assert.equal(frames[1].errorMsg, '这次没有完成，请重试')
          assert.equal(frames[1].needUnbind, false)
        }
        assert.deepEqual(app.platformCalls.vibrateShort, success && action === 'createRoom' ? [{ type: 'light' }] : undefined,
          'only successful room creation produces one light haptic')
      })
    }
  }
})

test('restored room notice reads periods and memories in parallel without delaying the create result', async (t) => {
  const app = bindPlatform(t, { createRoom: { code: 0, room: { roomCode: 'ROOM05' } } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  const periods = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'periods' } }).defer()
  const memories = app.cloud.when({ name: 'dataOp', data: { action: 'list', collection: 'memories' } }).defer()
  const start = page.setDataCalls.length
  const creating = app.dispatch(page, 'createRoom')
  await app.settle()

  const listCalls = app.cloud.calls.filter(call => call.name === 'dataOp' && call.data.action === 'list')
  assert.deepEqual(listCalls.map(call => call.data.collection).sort(), ['memories', 'periods'])
  const resultFrames = page.setDataCalls.slice(start)
  assert.equal(resultFrames.length, 2)
  assert.equal(resultFrames[1].loading, false)
  assert.equal(resultFrames[1].bound, true)
  assert.equal(Object.hasOwn(resultFrames[1], 'restoredNotice'), false)
  assert.deepEqual(app.platformCalls.vibrateShort, [{ type: 'light' }], 'creation feedback does not wait for restored-record reads')

  periods.resolve({ code: 0, data: [{ _id: 'p1' }, { _id: 'p2' }] })
  await app.settle()
  assert.equal(page.setDataCalls.slice(start).length, 2)
  memories.resolve({ code: 0, data: [{ _id: 'm1' }] })
  await creating
  await app.settle()

  const frames = page.setDataCalls.slice(start)
  assert.equal(frames.length, 3)
  assert.equal(frames[1].loading, false)
  assert.deepEqual(frames[2], { restoredNotice: '已恢复原来的房间和 3 条记录' })
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
