const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const { createMiniProgram } = require('./helpers/miniProgram')

test('period record tab has no back button and the standalone memory page stays registered as a compat route', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'app.json'), 'utf8'))
  const tabs = appConfig.tabBar.list.map(tab => tab.pagePath)
  assert.ok(tabs.includes('pages/period/period'), 'the record tab must stay a configured tab')
  // issue #103 方案 A：独立欢乐时光列表页保留为兼容路由（深链/历史页面栈仍可达）
  assert.ok(
    appConfig.pages.includes('pages/memory/memory'),
    'the standalone memory page stays registered as a compat route'
  )

  // tab 页不画返回键：导航模型与其他 tab 一致
  const wxml = fs.readFileSync(path.join(repoRoot, 'pages/period/period.wxml'), 'utf8')
  assert.equal(wxml.includes('nav-back'), false, 'record tab must not paint a back button')
})

test('record tab segments period and memory lists behind one radio group', () => {
  const wxml = fs.readFileSync(path.join(repoRoot, 'pages/period/period.wxml'), 'utf8')

  // 分段控件：经期 / 欢乐时光 同级可达（radio 朗读语义由 interaction-semantics 钉住）
  assert.match(wxml, /class="segment-control"/)
  assert.match(wxml, /class="segment-option \{\{segment === 'period' \? 'active' : ''\}\}"/)
  assert.match(wxml, /data-segment="period"/)
  assert.match(wxml, /class="segment-option \{\{segment === 'memory' \? 'active' : ''\}\}"/)
  assert.match(wxml, /data-segment="memory"/)

  // 经期分段保留现有列表结构；欢乐时光分段复用同一套列表状态机（memory 前缀键），
  // 列表以月份分组卡渲染（issue #108），行循环挂在分组数组的 records 上
  assert.match(wxml, /wx:if="\{\{segment === 'period'\}\}"/)
  assert.match(wxml, /<view wx:else>/, 'the memory segment is the else branch of the period segment')
  assert.match(wxml, /wx:for="\{\{memoryGroups\}\}"/)
  assert.match(wxml, /memoryLoadFailed/)
  assert.match(wxml, /memoryLoading/)
  assert.match(wxml, /memoryHasLoaded/)

  // 导航标题不再与分段重名
  assert.match(wxml, /nav-title">记录</)
})

// 首页加载与同步行为统一由 home-sync.test.js 经共享平台 harness 覆盖（#171）。

test('settings verifies cached room codes, exposes sync failure, and displays the repaired room after export', async (t) => {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reject(new Error('网络不太稳定，请重试'))
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, '同步失败，请重试')
  assert.equal(page.data.roomCode, '')
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 1)
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM02' } })
  app.cloud.when({ name: 'dataOp', data: { collection: 'periods', roomCode: 'ROOM01' } })
    .reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '无权访问该房间' })
  app.cloud.when({ name: 'dataOp', data: { collection: 'memories', roomCode: 'ROOM01' } }).reply({ code: 0, data: [] })
  app.respondNext('showModal', { confirm: true })
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  assert.equal(app.wx.modals.at(-1).confirmText, '重试')
  assert.equal(app.wx.modals.at(-1).content, '房间状态已更新，请重试导出')
  app.respond('showModal', 1, { confirm: false })
  await app.settle()
  await exporting
  assert.equal(page.data.roomCode, 'ROOM02')
  assert.equal(page.data.roomCodeDisplay, 'ROOM02')
  assert.equal(app.storage.roomCode, 'ROOM02')
  assert.deepEqual(app.files, [])
})

test('bind page rechecks a cached room and clears stale bound state when verification says unbound', async (t) => {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
  t.after(() => app.teardown())
  app.failNavigation('switchTab')
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.equal(page.data.bound, true)
  assert.equal(page.data.roomCode, 'ROOM01')
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.hide()
  app.show()
  await app.settle()
  assert.equal(page.data.bound, false)
  assert.equal(page.data.roomCode, '')
  assert.equal(page.data.errorMsg, '')
  assert.equal(app.storage.roomCode, undefined)
  assert.equal(app.cloud.calls.filter(call => call.name === 'getMyRoom').length, 2)
})

test('settings export keeps the visible room when repair has a retryable failure', async (t) => {
  const app = createMiniProgram({ storage: { roomCode: 'ROOM01' } })
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, 'ROOM01')
  app.cloud.when('getMyRoom').reject(new Error('网络不太稳定，请重试'))
  app.cloud.when({ name: 'dataOp', data: { collection: 'periods' } })
    .reply({ code: -1, errorCode: 'ROOM_ACCESS_DENIED', msg: '无权访问该房间' })
  app.cloud.when({ name: 'dataOp', data: { collection: 'memories' } }).reply({ code: 0, data: [] })
  app.respondNext('showModal', { confirm: true })
  const exporting = app.dispatch(page, 'exportData')
  await app.settle()
  assert.equal(app.wx.modals.at(-1).confirmText, '重试')
  assert.equal(app.wx.modals.at(-1).content, '网络不太稳定，请重试')
  app.respond('showModal', 1, { confirm: false })
  await app.settle()
  await exporting
  assert.equal(page.data.roomCode, 'ROOM01')
  assert.equal(page.data.roomCodeDisplay, 'ROOM01')
  assert.equal(app.storage.roomCode, 'ROOM01')
  assert.deepEqual(app.files, [])
})

function loadPageHarness(relativePath, { mocks = {}, wxOverrides = {} } = {}) {
  const absolutePagePath = path.join(repoRoot, relativePath)
  const absoluteMocks = Object.fromEntries(
    Object.entries(mocks).map(([relativeMockPath, value]) => [
      path.join(repoRoot, relativeMockPath),
      value
    ])
  )
  const originalPage = global.Page
  const originalWx = global.wx
  const originalLoad = Module._load
  let registered = null

  delete require.cache[require.resolve(absolutePagePath)]
  global.wx = createPageHarnessWx(wxOverrides)
  global.Page = config => {
    registered = config
  }
  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain)
    if (Object.prototype.hasOwnProperty.call(absoluteMocks, resolved)) {
      return absoluteMocks[resolved]
    }
    return originalLoad.apply(this, arguments)
  }

  require(absolutePagePath)
  Module._load = originalLoad

  if (!registered) {
    throw new Error(`${relativePath} did not register a Page(...) definition`)
  }

  const page = instantiatePage(registered)

  return {
    page,
    teardown() {
      Module._load = originalLoad
      global.Page = originalPage
      global.wx = originalWx
      delete require.cache[require.resolve(absolutePagePath)]
    }
  }
}

function instantiatePage(config) {
  const page = {
    data: { ...(config.data || {}) },
    setDataCalls: [],
    setData(update, callback) {
      this.setDataCalls.push(update)
      this.data = { ...this.data, ...update }
      if (typeof callback === 'function') callback()
    }
  }

  Object.entries(config).forEach(([key, value]) => {
    if (key === 'data') return
    page[key] = typeof value === 'function' ? value.bind(page) : value
  })

  return page
}

function createPageHarnessWx(overrides = {}) {
  const base = {
    navigateBack() {},
    navigateTo() {},
    redirectTo() {},
    switchTab() {},
    showToast() {},
    showModal() {},
    showLoading() {},
    hideLoading() {},
    pageScrollTo() {},
    setClipboardData({ success }) {
      if (success) success()
    },
    getFileSystemManager() {
      return {
        writeFileSync() {}
      }
    },
    shareFileMessage({ success }) {
      if (success) success()
    },
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    removeStorageSync() {},
    env: {
      USER_DATA_PATH: '/tmp'
    },
    cloud: {
      async callFunction() {
        return { result: {} }
      }
    }
  }

  return Object.assign(base, overrides)
}

// issue #163：页面不可见（切走 tab、被编辑页盖住、小程序进后台）时根节点带 page-hidden，常驻装饰暂停在当前帧；
// 再次显示时第一件事就是去掉标记，不等云端加载结果。兼容路由 pages/memory/memory 会被自己的 switchTab 关掉，不在此列。
const PAGE_HIDDEN_PAGES = [
  'pages/index/index.js'
]

test('pages pause their ambient decorations while hidden and resume as soon as they show again', () => {
  for (const relativePath of PAGE_HIDDEN_PAGES) {
    // 云端请求一直挂起：onShow 里的加载停在半路，标记只能来自 onShow 自己
    const harness = loadPageHarness(relativePath, {
      wxOverrides: { cloud: { callFunction: () => new Promise(() => {}) } }
    })
    try {
      const { page } = harness
      if (typeof page.onLoad === 'function') page.onLoad({})
      assert.ok(!page.data.pageHidden, `${relativePath} starts visible`)
      const first = page.setDataCalls.length
      page.onShow()
      assert.equal(page.setDataCalls.slice(first).some((update) => 'pageHidden' in update), false,
        `${relativePath} does not re-render the mark on its first show`)

      page.onHide()
      assert.equal(page.data.pageHidden, true, `${relativePath} marks itself hidden`)
      const writes = page.setDataCalls.length
      page.onHide()
      assert.equal(page.setDataCalls.slice(writes).some((update) => 'pageHidden' in update), false,
        `${relativePath} does not re-render an unchanged hidden mark`)

      page.onShow()
      assert.equal(page.data.pageHidden, false, `${relativePath} resumes on show before any load settles`)
      const shown = page.setDataCalls.length
      page.onShow()
      assert.equal(page.setDataCalls.slice(shown).some((update) => 'pageHidden' in update), false,
        `${relativePath} does not re-render an unchanged visible mark`)
    } finally {
      harness.teardown()
    }
  }
})

test('settings pauses decorations while hidden and resumes before room verification settles', async (t) => {
  const app = createMiniProgram()
  t.after(() => app.teardown())
  const verification = app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  assert.ok(!page.data.pageHidden)
  assert.equal(page.data.roomCodeLoaded, false)
  app.hide()
  app.hide()
  assert.equal(page.data.pageHidden, true)
  app.cloud.when('getMyRoom').reply({ code: 0, room: null })
  app.show()
  assert.equal(page.data.pageHidden, false)
  assert.equal(page.data.roomCodeLoaded, false)
  app.show()
  assert.equal(page.data.pageHidden, false)
  verification.resolve({ code: 0, room: null })
  await app.settle()
  assert.equal(page.data.roomCodeDisplay, '未绑定')
})

test('bind page pauses decorations while hidden and resumes before delayed verification settles', async (t) => {
  const app = createMiniProgram()
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').defer()
  const page = app.launch('/pages/bind/bind')
  await app.settle()
  assert.ok(!page.data.pageHidden)
  assert.equal(page.setDataCalls.some(update => 'pageHidden' in update), false)
  app.hide()
  assert.equal(page.data.pageHidden, true)
  const hiddenWrites = page.setDataCalls.length
  app.hide()
  assert.equal(page.setDataCalls.slice(hiddenWrites).some(update => 'pageHidden' in update), false)
  app.cloud.when('getMyRoom').defer()
  app.show()
  assert.equal(page.data.pageHidden, false)
  const shownWrites = page.setDataCalls.length
  app.cloud.when('getMyRoom').defer()
  app.show()
  assert.equal(page.setDataCalls.slice(shownWrites).some(update => 'pageHidden' in update), false)
  assert.equal(page.data.verifying, true)
})

test('every backdrop-filter in wxss is immediately followed by -webkit-backdrop-filter', () => {
  const skipDirs = new Set(['node_modules', 'cloudfunctions', '_external'])
  const files = []

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skipDirs.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name.endsWith('.wxss')) files.push(full)
    }
  }

  walk(repoRoot)

  const unpaired = []
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      if (!/^\s*backdrop-filter\s*:/.test(line)) return
      const next = lines[index + 1] || ''
      if (!/^\s*-webkit-backdrop-filter\s*:/.test(next)) {
        unpaired.push(`${path.relative(repoRoot, file)}:${index + 1}`)
      }
    })
  }

  assert.deepEqual(unpaired, [])
})
