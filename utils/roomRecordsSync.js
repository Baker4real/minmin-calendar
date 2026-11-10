const cloud = require('./cloud')
const roomRecordsSnapshot = require('./roomRecordsSnapshot')

const COLLECTIONS = ['periods', 'memories']
const SYNC_FAILURE_COPY = {
  all: { refreshRetryText: '刷新失败，点按重试', refreshRetryLabel: '日历刷新失败，点按重试' },
  periods: {
    refreshRetryText: '经期同步失败，点按重试',
    refreshRetryLabel: '经期同步失败，点按重试',
    initialStatusText: '已显示欢乐时光',
    backgroundStatusText: '已保留旧经期数据'
  },
  memories: {
    refreshRetryText: '欢乐时光同步失败，点按重试',
    refreshRetryLabel: '欢乐时光同步失败，点按重试',
    initialStatusText: '已显示经期数据',
    backgroundStatusText: '已保留上次的欢乐时光'
  }
}

// Own the records and reconciliation, not just decisions for a Page to execute.
// The callback's calendarChanged/recordChange describe one atomic projection update;
// loading and pill-only updates leave calendar feedback and animation marks alone.
function createRoomRecordsSync({ onChange }) {
  const collections = Object.fromEntries(COLLECTIONS.map(collection => [collection, {
    records: [], revision: 0, pendingRevision: null, synced: false
  }]))
  let inFlight = null
  let hasLoadedHomeData = false
  let loading = true
  let refreshing = false
  let failedCollections = []
  let blockedOutcome = null
  let pill = null

  function getState() {
    const scope = failedCollections.length === 2 ? 'all' : failedCollections[0]
    const copy = hasLoadedHomeData && SYNC_FAILURE_COPY[scope]
    return {
      collections: Object.fromEntries(COLLECTIONS.map(collection => [collection, {
        records: collections[collection].records,
        synced: collections[collection].synced,
        pending: collections[collection].pendingRevision !== null
      }])),
      hasLoadedHomeData,
      loading,
      refreshing,
      failedCollections: [...failedCollections],
      blockedOutcome,
      pill,
      retry: copy ? {
        refreshRetryVisible: true,
        refreshRetryText: copy.refreshRetryText,
        refreshRetryLabel: copy.refreshRetryLabel
      } : { refreshRetryVisible: false }
    }
  }

  function publish(calendarChanged = false, recordChange = null) {
    onChange(getState(), { calendarChanged, recordChange })
  }

  function hasPending() {
    return COLLECTIONS.some(collection => collections[collection].pendingRevision !== null)
  }

  function load({ background = false } = {}) {
    // Serializing all callers with this one promise also prevents an older load
    // from arriving after a newer load. Local changes have their own revision gate.
    if (inFlight) return inFlight
    const startRevisions = Object.fromEntries(COLLECTIONS.map(collection => [collection, collections[collection].revision]))
    loading = !background
    refreshing = background
    blockedOutcome = null
    if (!background) failedCollections = []
    pill = background && hasPending() ? syncingPill() : null
    inFlight = Promise.resolve().then(async () => {
      try {
        const snapshot = await roomRecordsSnapshot.loadHomeRecordsSnapshot({ client: cloud.createRoomDataClient() })
        if (snapshot.kind === 'blocked') {
          block(snapshot.outcome)
          return snapshot.outcome
        }
        if (snapshot.kind === 'retryable-failure') {
          fail(snapshot.outcome, background)
          return snapshot
        }
        resolveSnapshot(snapshot, startRevisions, background)
        return snapshot
      } catch (error) {
        console.error('load error', error)
        const outcome = { kind: 'retryable-failure', message: error && error.message ? error.message : String(error || '未知错误') }
        fail(outcome, background)
        return outcome
      }
    }).finally(() => { inFlight = null })
    publish()
    return inFlight
  }

  function block(outcome) {
    COLLECTIONS.forEach(collection => { collections[collection].synced = false })
    hasLoadedHomeData = false
    loading = false
    refreshing = false
    failedCollections = []
    blockedOutcome = outcome
    pill = null
    publish()
  }

  function fail(outcome, background) {
    if (!background) {
      block(outcome)
      return
    }
    loading = false
    refreshing = false
    failedCollections = [...COLLECTIONS]
    pill = hasPending() ? { kind: 'failure', text: '同步失败，稍后重试', autoHide: true } : null
    publish()
  }

  function resolveSnapshot(snapshot, startRevisions, background) {
    const wasLoaded = hasLoadedHomeData
    let recordsChanged = false
    let syncedChanged = false
    let confirmedPending = false
    for (const collection of COLLECTIONS) {
      const outcome = snapshot.collections[collection]
      const current = collections[collection]
      if (outcome.kind !== 'success' || current.revision !== startRevisions[collection]) continue
      // A successful reply only confirms the collection if no local change has
      // invalidated this load's snapshot. Other collections can still advance.
      if (!current.synced) syncedChanged = true
      current.synced = true
      if (stableRecordListKey(current.records) !== stableRecordListKey(outcome.data)) {
        current.records = outcome.data
        recordsChanged = true
      }
      if (current.pendingRevision !== null) confirmedPending = true
      current.pendingRevision = null
    }
    hasLoadedHomeData = true
    loading = false
    refreshing = false
    failedCollections = COLLECTIONS.filter(collection => snapshot.collections[collection].kind !== 'success')
    pill = resolvedPill({ background, recordsChanged, confirmedPending })
    publish(!wasLoaded || recordsChanged || syncedChanged)
  }

  function resolvedPill({ background, recordsChanged, confirmedPending }) {
    if (failedCollections.length) {
      if (background && !hasPending() && !confirmedPending && !recordsChanged) return null
      const copy = SYNC_FAILURE_COPY[failedCollections[0]]
      return {
        kind: 'partial-failure',
        text: background ? copy.backgroundStatusText : copy.initialStatusText,
        autoHide: false
      }
    }
    if (hasPending()) return syncingPill()
    if (background && (confirmedPending || recordsChanged)) {
      return { kind: 'synced', text: '已同步', autoHide: true }
    }
    return null
  }

  function applyRecordChange({ collection, record, mode = 'upsert' } = {}) {
    if (!COLLECTIONS.includes(collection) || !record || typeof record !== 'object') return
    const current = collections[collection]
    const before = current.records
    const records = mergeRecordChange(before, record, mode)
    if (stableRecordListKey(records) === stableRecordListKey(before)) return
    current.records = records
    current.revision += 1
    if (hasLoadedHomeData) {
      current.pendingRevision = current.revision
      pill = syncingPill()
    }
    publish(true, hasLoadedHomeData ? { collection, record, mode, before } : null)
  }

  return { load, applyRecordChange, getState }
}

function syncingPill() {
  return { kind: 'syncing', text: '已更新，正在同步', autoHide: false }
}

function mergeRecordChange(records, record, mode) {
  const current = [...records]
  const recordId = record._id || record.id || ''
  const normalized = recordId && !record._id ? { ...record, _id: recordId } : { ...record }
  const index = recordId ? current.findIndex(item => (item._id || item.id || '') === recordId) : -1
  if (mode === 'remove') return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current
  if (index >= 0) {
    current[index] = { ...current[index], ...normalized }
    return current
  }
  return [normalized, ...current]
}

function stableRecordListKey(records) {
  return JSON.stringify(records.map(stableValue).sort(compareStableRecordValues))
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function compareStableRecordValues(left, right) {
  const leftIdentity = getStableRecordIdentity(left)
  const rightIdentity = getStableRecordIdentity(right)
  if (leftIdentity < rightIdentity) return -1
  if (leftIdentity > rightIdentity) return 1
  const leftJson = JSON.stringify(left)
  const rightJson = JSON.stringify(right)
  if (leftJson < rightJson) return -1
  if (leftJson > rightJson) return 1
  return 0
}

function getStableRecordIdentity(record) {
  if (!record || typeof record !== 'object') return ''
  return record._id || record.id || record.date || record.startDate || ''
}

module.exports = { createRoomRecordsSync }
