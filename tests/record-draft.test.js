const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const recordDraft = require('../utils/recordDraft')

test('writeDraft and readDraft round-trip draft values through storage', () => {
  const storage = createMemoryStorage()
  const key = recordDraft.buildDraftKey({ collection: 'periods', id: '' })
  const values = {
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    note: '头疼，早睡了',
    flow: 'heavy',
    symptoms: ['cramps', 'headache']
  }

  assert.equal(recordDraft.readDraft(storage, key), null)
  assert.equal(recordDraft.writeDraft(storage, key, values), true)
  assert.deepEqual(recordDraft.readDraft(storage, key), values)
})

test('writeDraft overwrites the previous draft for the same record identity', () => {
  const storage = createMemoryStorage()
  const key = recordDraft.buildDraftKey({ collection: 'memories', id: 'm1' })

  recordDraft.writeDraft(storage, key, { date: '2026-09-01', note: '第一版' })
  recordDraft.writeDraft(storage, key, { date: '2026-09-02', note: '改过的版本' })

  assert.deepEqual(recordDraft.readDraft(storage, key), { date: '2026-09-02', note: '改过的版本' })
})

test('clearDraft removes the stored draft so the next open starts clean', () => {
  const storage = createMemoryStorage()
  const key = recordDraft.buildDraftKey({ collection: 'memories', id: 'm1' })

  recordDraft.writeDraft(storage, key, { date: '2026-09-01', note: '待补' })
  recordDraft.clearDraft(storage, key)

  assert.equal(recordDraft.readDraft(storage, key), null)
})

test('readDraft tolerates missing, corrupted, or non-object storage payloads', () => {
  const storage = createMemoryStorage()
  const key = recordDraft.buildDraftKey({ collection: 'periods', id: 'p1' })

  assert.equal(recordDraft.readDraft(storage, key), null)

  storage.set(key, '{oops')
  assert.equal(recordDraft.readDraft(storage, key), null)

  storage.set(key, '"just a string"')
  assert.equal(recordDraft.readDraft(storage, key), null)

  storage.set(key, '[1,2]')
  assert.equal(recordDraft.readDraft(storage, key), null)
})

test('buildDraftKey separates new records and different edited records from each other', () => {
  const newPeriodKey = recordDraft.buildDraftKey({ collection: 'periods', id: '' })
  const periodOneKey = recordDraft.buildDraftKey({ collection: 'periods', id: 'p1' })
  const periodTwoKey = recordDraft.buildDraftKey({ collection: 'periods', id: 'p2' })
  const memoryOneKey = recordDraft.buildDraftKey({ collection: 'memories', id: 'p1' })

  assert.notEqual(newPeriodKey, periodOneKey)
  assert.notEqual(periodOneKey, periodTwoKey)
  assert.notEqual(periodOneKey, memoryOneKey)

  const storage = createMemoryStorage()
  recordDraft.writeDraft(storage, periodOneKey, { startDate: '2026-09-01', note: '只属于 p1' })

  assert.equal(recordDraft.readDraft(storage, newPeriodKey), null)
  assert.equal(recordDraft.readDraft(storage, periodTwoKey), null)
  assert.equal(recordDraft.readDraft(storage, memoryOneKey), null)
  assert.equal(recordDraft.readDraft(storage, periodOneKey).note, '只属于 p1')
})

test('syncDraft writes while the form differs from its baseline and clears once it returns to it', () => {
  const storage = createMemoryStorage()
  const key = recordDraft.buildDraftKey({ collection: 'memories', id: '' })
  const baseline = { date: '2026-09-20', note: '' }

  assert.equal(recordDraft.syncDraft(storage, key, { date: '2026-09-20', note: '' }, baseline), 'cleared')
  assert.equal(recordDraft.readDraft(storage, key), null)

  assert.equal(recordDraft.syncDraft(storage, key, { date: '2026-09-20', note: '看电影' }, baseline), 'written')
  assert.deepEqual(recordDraft.readDraft(storage, key), { date: '2026-09-20', note: '看电影' })

  assert.equal(recordDraft.syncDraft(storage, key, { date: '2026-09-20', note: '' }, baseline), 'cleared')
  assert.equal(recordDraft.readDraft(storage, key), null)
})

test('pickDraftFields keeps only draft fields and copies array values', () => {
  const source = {
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    note: 'x',
    flow: 'light',
    symptoms: ['cramps'],
    saving: true,
    symptomGroups: [{ key: 'body' }]
  }

  const picked = recordDraft.pickDraftFields(source, ['startDate', 'endDate', 'note', 'flow', 'symptoms'])

  assert.deepEqual(picked, {
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    note: 'x',
    flow: 'light',
    symptoms: ['cramps']
  })
  assert.notEqual(picked.symptoms, source.symptoms)
})

function createMemoryStorage() {
  const entries = new Map()
  return {
    entries,
    get(key) {
      return entries.has(key) ? entries.get(key) : ''
    },
    set(key, value) {
      entries.set(key, value)
    },
    remove(key) {
      entries.delete(key)
    }
  }
}

test('memory edit restores a stored draft on load and prompts the restore notice', () => {
  const store = new Map()
  const toasts = []
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, toasts)
  })

  try {
    store.set(
      recordDraft.buildDraftKey({ collection: 'memories', id: 'm1' }),
      JSON.stringify({ date: '2026-09-01', note: '没写完的纪念' })
    )

    harness.page.onLoad({ id: 'm1', date: '2026-08-30', note: '' })

    assert.equal(harness.page.data.date, '2026-09-01')
    assert.equal(harness.page.data.note, '没写完的纪念')
    assert.deepEqual(toasts, [{ title: '已恢复上次未完成的输入', icon: 'none' }])
    // 草稿盖住已保存记录时，表单上有常驻可见说明，不只靠一闪而过的提示
    assert.equal(harness.page.data.draftRestored, true)
  } finally {
    harness.teardown()
  }
})

test('memory edit keeps route values and stays quiet when no draft exists', () => {
  const store = new Map()
  const toasts = []
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, toasts)
  })

  try {
    harness.page.onLoad({ id: 'm1', date: '2026-08-30', note: 'original' })

    assert.equal(harness.page.data.date, '2026-08-30')
    assert.equal(harness.page.data.note, 'original')
    assert.deepEqual(toasts, [])
    assert.equal(harness.page.data.draftRestored, false)
  } finally {
    harness.teardown()
  }
})

test('memory edit does not pick up drafts belonging to another record identity', () => {
  const store = new Map()
  const toasts = []
  store.set(
    recordDraft.buildDraftKey({ collection: 'memories', id: 'm1' }),
    JSON.stringify({ date: '2026-09-01', note: 'm1 的草稿' })
  )

  const editOther = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, toasts)
  })
  try {
    editOther.page.onLoad({ id: 'm2', date: '2026-09-05', note: '' })
    assert.equal(editOther.page.data.date, '2026-09-05')
    assert.equal(editOther.page.data.note, '')
  } finally {
    editOther.teardown()
  }

  const addNew = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, toasts)
  })
  try {
    addNew.page.onLoad({})
    assert.equal(addNew.page.data.date, '2026-09-20')
    assert.equal(addNew.page.data.note, '')
  } finally {
    addNew.teardown()
  }

  assert.deepEqual(toasts, [])
})

test('memory edit persists the in-progress form on hide and overwrites it on unload', () => {
  const store = new Map()
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, [])
  })

  try {
    const key = recordDraft.buildDraftKey({ collection: 'memories', id: '' })

    harness.page.onLoad({})
    harness.page.onDateChange({ detail: { value: '2026-09-18' } })
    harness.page.onNoteInput({ detail: { value: '写到一半' } })
    harness.page.onHide()

    assert.deepEqual(JSON.parse(store.get(key)), { date: '2026-09-18', note: '写到一半' })

    harness.page.onNoteInput({ detail: { value: '写到一半，又改了点' } })
    harness.page.onUnload()

    assert.deepEqual(JSON.parse(store.get(key)), { date: '2026-09-18', note: '写到一半，又改了点' })
  } finally {
    harness.teardown()
  }
})

test('memory edit leaves no draft when the pristine form is abandoned', () => {
  const store = new Map()
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, [])
  })

  try {
    harness.page.onLoad({})
    harness.page.onHide()
    harness.page.onUnload()

    assert.equal(store.size, 0)
  } finally {
    harness.teardown()
  }
})

test('memory edit clears the draft after a successful save and does not resurrect it on unload', async () => {
  const store = new Map()
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks({
      async runRecordSave() {
        return {
          kind: 'success',
          result: { record: { _id: 'm9', date: '2026-09-20', note: '已保存的内容' } }
        }
      }
    }),
    wxOverrides: createWxOverrides(store, [])
  })

  try {
    const key = recordDraft.buildDraftKey({ collection: 'memories', id: '' })

    harness.page.onLoad({})
    harness.page.onNoteInput({ detail: { value: '已保存的内容' } })
    harness.page.onHide()
    assert.ok(store.has(key))

    const outcome = await harness.page.save()

    assert.equal(outcome.kind, 'success')
    assert.equal(store.has(key), false)

    harness.page.onUnload()
    assert.equal(store.has(key), false)
  } finally {
    harness.teardown()
  }
})

test('memory edit clears the record draft after a successful delete', async () => {
  const store = new Map()
  const harness = loadPageHarness('pages/memory/edit/edit.js', {
    mocks: createMemoryEditMocks(),
    wxOverrides: createWxOverrides(store, [])
  })

  try {
    const key = recordDraft.buildDraftKey({ collection: 'memories', id: 'm1' })

    harness.page.onLoad({ id: 'm1', date: '2026-09-01', note: '' })
    harness.page.onNoteInput({ detail: { value: '删掉前的改动' } })
    harness.page.onHide()
    assert.ok(store.has(key))

    const outcome = await harness.page.delete()

    assert.equal(outcome.kind, 'success')
    assert.equal(store.has(key), false)

    harness.page.onUnload()
    assert.equal(store.has(key), false)
  } finally {
    harness.teardown()
  }
})

test('period edit restores a stored draft with symptoms and prompts the restore notice', () => {
  const store = new Map()
  const toasts = []
  const symptomGroupCalls = []
  const harness = loadPageHarness('pages/period/edit/edit.js', {
    mocks: createPeriodEditMocks({}, symptomGroupCalls),
    wxOverrides: createWxOverrides(store, toasts)
  })

  try {
    store.set(
      recordDraft.buildDraftKey({ collection: 'periods', id: 'p1' }),
      JSON.stringify({
        startDate: '2026-09-02',
        endDate: '2026-09-04',
        note: '熬夜了',
        flow: 'light',
        symptoms: ['cramps']
      })
    )

    harness.page.onLoad({ id: 'p1', startDate: '2026-09-01', endDate: '2026-09-03' })

    assert.equal(harness.page.data.startDate, '2026-09-02')
    assert.equal(harness.page.data.endDate, '2026-09-04')
    assert.equal(harness.page.data.note, '熬夜了')
    assert.equal(harness.page.data.flow, 'light')
    assert.deepEqual(harness.page.data.symptoms, ['cramps'])
    assert.deepEqual(symptomGroupCalls[symptomGroupCalls.length - 1], ['cramps'])
    assert.deepEqual(toasts, [{ title: '已恢复上次未完成的输入', icon: 'none' }])
    assert.equal(harness.page.data.draftRestored, true)
  } finally {
    harness.teardown()
  }
})

test('period edit persists the in-progress form on hide', () => {
  const store = new Map()
  const harness = loadPageHarness('pages/period/edit/edit.js', {
    mocks: createPeriodEditMocks(),
    wxOverrides: createWxOverrides(store, [])
  })

  try {
    const key = recordDraft.buildDraftKey({ collection: 'periods', id: '' })

    harness.page.onLoad({})
    harness.page.onStartChange({ detail: { value: '2026-09-15' } })
    harness.page.selectFlow({ currentTarget: { dataset: { value: 'heavy' } } })
    harness.page.toggleSymptom({ currentTarget: { dataset: { value: 'cramps' } } })
    harness.page.onHide()

    assert.deepEqual(JSON.parse(store.get(key)), {
      startDate: '2026-09-15',
      endDate: '2026-09-20',
      note: '',
      flow: 'heavy',
      symptoms: ['cramps']
    })
  } finally {
    harness.teardown()
  }
})

test('edit forms carry a persistent visible draft-restore notice, not only the toast', () => {
  for (const relativePath of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const wxml = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    assert.match(
      wxml,
      /wx:if="\{\{draftRestored\}\}"[^>]*>[^<]*已恢复上次未完成的输入/,
      `${relativePath} keeps the in-form restore notice bound to draftRestored`
    )
  }
})

function createMemoryEditMocks(commandOverrides = {}) {
  return {
    'utils/util.js': createUtilStub(),
    'utils/cloud.js': {
      createRoomDataClient() {
        return {}
      }
    },
    'utils/recordCommands.js': {
      async runRecordSave() {
        return { kind: 'success', result: {} }
      },
      async runRecordDelete() {
        return { kind: 'success' }
      },
      ...commandOverrides
    },
    'utils/recordPageSync.js': {
      getSavedRecord(outcome) {
        return outcome && outcome.result && outcome.result.record ? outcome.result.record : null
      },
      notifyPreviousPageRecordChange() {}
    }
  }
}

function createPeriodEditMocks(commandOverrides = {}, symptomGroupCalls = null) {
  return {
    ...createMemoryEditMocks(commandOverrides),
    'utils/cycle.js': {
      FLOW_OPTIONS: [{ value: 'heavy', label: '量大' }],
      buildSymptomOptions(selected = []) {
        if (symptomGroupCalls) symptomGroupCalls.push(selected.slice())
        return selected.map(value => ({ value, label: value, selected: true }))
      },
      buildPeriodPayload(payload) {
        return payload
      }
    }
  }
}

function createUtilStub() {
  return {
    formatDate() {
      return '2026-09-20'
    },
    isValidDateString(value) {
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    }
  }
}

function createWxOverrides(store, toasts) {
  return {
    getStorageSync(key) {
      return store.has(key) ? store.get(key) : ''
    },
    setStorageSync(key, value) {
      store.set(key, value)
    },
    removeStorageSync(key) {
      store.delete(key)
    },
    showToast(options) {
      toasts.push(options)
    }
  }
}

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
  global.wx = {
    navigateBack() {},
    navigateTo() {},
    showToast() {},
    showModal() {},
    getStorageSync() {
      return ''
    },
    setStorageSync() {},
    removeStorageSync() {},
    ...wxOverrides
  }
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
