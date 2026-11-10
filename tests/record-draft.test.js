const assert = require('node:assert/strict')
const fs = require('node:fs')
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
