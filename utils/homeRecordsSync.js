const COLLECTIONS = ['periods', 'memories']

function createHomeRecordsSyncState(initialState = {}) {
  return {
    records: {
      periods: normalizeRecords(initialState.periods),
      memories: normalizeRecords(initialState.memories)
    },
    revisions: { periods: 0, memories: 0 },
    pendingRevisions: { periods: null, memories: null },
    hasLoaded: Boolean(initialState.hasLoaded),
    nextRequestId: 1,
    activeRequest: null
  }
}

function transitionHomeRecordsSync(state, event = {}) {
  if (event.type === 'load-start') return startLoad(state, event)
  if (event.type === 'record-change') return applyRecordChange(state, event.change)
  if (event.type === 'load-resolved') return resolveLoad(state, event)
  if (event.type === 'load-failed') return failLoad(state, event)
  throw new Error('Unsupported home records sync event: ' + String(event.type || ''))
}

function startLoad(state, event) {
  const requestId = state.nextRequestId
  const mode = event.mode
  return {
    state: {
      ...state,
      nextRequestId: requestId + 1,
      activeRequest: {
        id: requestId,
        mode,
        startRevisions: { ...state.revisions }
      }
    },
    decision: {
      requestId,
      loading: mode === 'initial',
      refreshing: mode === 'background',
      recordsChanged: false,
      syncStatus: mode === 'background' && hasPending(state.pendingRevisions)
        ? { text: '已更新，正在同步', autoHide: false }
        : null
    }
  }
}

function applyRecordChange(state, change = {}) {
  const collection = change.collection
  const record = change.record
  if (!COLLECTIONS.includes(collection) || !record || typeof record !== 'object') {
    return unchanged(state)
  }

  const nextRecords = mergeRecordChange(state.records[collection], record, change.mode)
  if (stableRecordListKey(nextRecords) === stableRecordListKey(state.records[collection])) {
    return unchanged(state)
  }

  const revision = state.revisions[collection] + 1
  return {
    state: {
      ...state,
      records: { ...state.records, [collection]: nextRecords },
      revisions: { ...state.revisions, [collection]: revision },
      pendingRevisions: state.hasLoaded
        ? { ...state.pendingRevisions, [collection]: revision }
        : state.pendingRevisions
    },
    decision: {
      recordsChanged: true,
      syncStatus: state.hasLoaded
        ? { text: '已更新，正在同步', autoHide: false }
        : null
    }
  }
}

function resolveLoad(state, event) {
  const request = state.activeRequest
  if (!request || event.requestId !== request.id) {
    return {
      state,
      decision: { ignored: true, recordsChanged: false, syncStatus: null }
    }
  }

  const snapshot = event.snapshot || {}
  if (snapshot.kind === 'blocked') {
    return {
      state: { ...state, activeRequest: null },
      decision: {
        loading: false,
        refreshing: false,
        recordsChanged: false,
        blockingOutcome: snapshot.outcome,
        syncStatus: null
      }
    }
  }
  if (snapshot.kind === 'retryable-failure') {
    return finishRetryableFailure(state, request, snapshot.outcome)
  }

  let records = state.records
  const pendingRevisions = { ...state.pendingRevisions }
  let recordsChanged = false
  let confirmedPending = false
  for (const collection of COLLECTIONS) {
    const outcome = snapshot[collection + 'Outcome']
    if (!outcome || outcome.kind !== 'success') continue
    if (state.revisions[collection] > request.startRevisions[collection]) continue
    const snapshotRecords = normalizeRecords(snapshot[collection])
    if (stableRecordListKey(state.records[collection]) !== stableRecordListKey(snapshotRecords)) {
      records = { ...records, [collection]: snapshotRecords }
      recordsChanged = true
    }
    if (pendingRevisions[collection] !== null) confirmedPending = true
    pendingRevisions[collection] = null
  }

  return {
    state: {
      ...state,
      records,
      pendingRevisions,
      hasLoaded: true,
      activeRequest: null
    },
    decision: {
      loading: false,
      refreshing: false,
      recordsChanged,
      hasLoaded: true,
      syncStatus: buildResolvedSyncStatus({
        snapshot,
        mode: request.mode,
        pendingRevisions,
        recordsChanged,
        confirmedPending
      })
    }
  }
}

function failLoad(state, event) {
  const request = state.activeRequest
  if (!request || event.requestId !== request.id) {
    return {
      state,
      decision: { ignored: true, recordsChanged: false, syncStatus: null }
    }
  }
  return finishRetryableFailure(state, request, event.outcome)
}

function finishRetryableFailure(state, request, outcome) {
  return {
    state: { ...state, activeRequest: null },
    decision: {
      loading: false,
      refreshing: false,
      recordsChanged: false,
      outcome,
      syncStatus: request.mode === 'background' && hasPending(state.pendingRevisions)
        ? { text: '同步失败，稍后重试', autoHide: true }
        : null
    }
  }
}

function buildResolvedSyncStatus({
  snapshot,
  mode,
  pendingRevisions,
  recordsChanged,
  confirmedPending
}) {
  if (snapshot.kind === 'partial-success') {
    const periodsFailed = isRetryableFailure(snapshot.periodsOutcome)
    const memoriesFailed = isRetryableFailure(snapshot.memoriesOutcome)
    const background = mode === 'background'
    const shouldShowBackgroundPartial = hasPending(pendingRevisions) ||
      confirmedPending ||
      recordsChanged
    if (background && !shouldShowBackgroundPartial) return null
    if (periodsFailed && !memoriesFailed) {
      return {
        text: background
          ? '经期同步失败，已保留旧经期数据'
          : '经期同步失败，已显示记忆数据',
        autoHide: false
      }
    }
    if (memoriesFailed && !periodsFailed) {
      return {
        text: background
          ? '记忆同步失败，已保留旧记忆数据'
          : '记忆同步失败，已显示经期数据',
        autoHide: false
      }
    }
  }
  if (hasPending(pendingRevisions)) {
    return { text: '已更新，正在同步', autoHide: false }
  }
  if (mode === 'background' && (confirmedPending || recordsChanged)) {
    return { text: '已同步', autoHide: true }
  }
  return null
}

function isRetryableFailure(outcome) {
  return outcome && outcome.kind === 'retryable-failure'
}

function mergeRecordChange(records, record, mode = 'upsert') {
  const current = [...normalizeRecords(records)]
  const recordId = record._id || record.id || ''
  const normalized = recordId && !record._id ? { ...record, _id: recordId } : { ...record }
  const index = recordId
    ? current.findIndex(item => (item._id || item.id || '') === recordId)
    : -1

  if (mode === 'remove') {
    return index >= 0 ? current.filter((_, itemIndex) => itemIndex !== index) : current
  }
  if (index >= 0) {
    current[index] = { ...current[index], ...normalized }
    return current
  }
  return [normalized, ...current]
}

function unchanged(state) {
  return {
    state,
    decision: { recordsChanged: false, syncStatus: null }
  }
}

function hasPending(pendingRevisions) {
  return COLLECTIONS.some(collection => pendingRevisions[collection] !== null)
}

function normalizeRecords(records) {
  return Array.isArray(records) ? records : []
}

function stableRecordListKey(records) {
  return JSON.stringify(normalizeRecords(records).map(stableValue).sort(compareStableRecordValues))
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

module.exports = {
  createHomeRecordsSyncState,
  transitionHomeRecordsSync
}
