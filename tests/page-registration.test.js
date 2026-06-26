const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

test('record and settings pages register successfully in a lightweight Page harness', () => {
  const pages = [
    {
      relativePath: 'pages/period/period.js',
      methods: ['goBack', 'onShow', 'loadData', 'calcStats', 'addPeriod', 'editPeriod']
    },
    {
      relativePath: 'pages/memory/memory.js',
      methods: ['goBack', 'onShow', 'loadData', 'addMemory', 'editMemory']
    },
    {
      relativePath: 'pages/settings/settings.js',
      methods: ['onShow', 'copyRoomCode', 'goMemory', 'exportData', 'clearData', 'about']
    }
  ]

  const originalPage = global.Page
  const originalWx = global.wx

  global.wx = createPageHarnessWx()

  try {
    pages.forEach(page => {
      const registered = loadPageDefinition(page.relativePath)
      assert.ok(registered, `${page.relativePath} should call Page(...)`)
      page.methods.forEach(method => {
        assert.equal(typeof registered[method], 'function', `${page.relativePath} should expose ${method}()`)
      })
    })
  } finally {
    global.Page = originalPage
    global.wx = originalWx
  }

  function loadPageDefinition(relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath)
    delete require.cache[absolutePath]

    let registered = null
    global.Page = config => {
      registered = config
    }

    require(absolutePath)
    return registered
  }
})

function createPageHarnessWx() {
  return {
    navigateBack() {},
    navigateTo() {},
    showToast() {},
    showModal() {},
    showLoading() {},
    hideLoading() {},
    setClipboardData() {},
    getFileSystemManager() {
      return {
        writeFileSync() {}
      }
    },
    shareFileMessage() {},
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
}
