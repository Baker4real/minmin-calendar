const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createHomeRecordsSyncState,
  transitionHomeRecordsSync
} = require('../utils/homeRecordsSync')

test('a snapshot started before a canonical record change cannot roll it back', () => {
  const initialPeriod = period('p1', '2026-06-01')
  let state = createHomeRecordsSyncState({
    periods: [initialPeriod],
    memories: [],
    hasLoaded: true
  })

  const started = transitionHomeRecordsSync(state, {
    type: 'load-start',
    mode: 'background'
  })
  state = started.state
  const requestId = started.decision.requestId

  state = transitionHomeRecordsSync(state, {
    type: 'record-change',
    change: {
      collection: 'periods',
      mode: 'add',
      record: period('p2', '2026-06-29')
    }
  }).state

  const resolved = transitionHomeRecordsSync(state, {
    type: 'load-resolved',
    requestId,
    snapshot: successSnapshot([initialPeriod], [])
  })

  assert.deepEqual(resolved.state.records.periods.map(item => item._id), ['p2', 'p1'])
  assert.equal(resolved.state.pendingRevisions.periods, 1)
  assert.deepEqual(resolved.decision.syncStatus, {
    text: '已更新，正在同步',
    autoHide: false
  })
})

test('a partial snapshot confirms pending revisions independently by collection', () => {
  let state = createHomeRecordsSyncState({ hasLoaded: true })

  state = transitionHomeRecordsSync(state, {
    type: 'record-change',
    change: {
      collection: 'periods',
      mode: 'add',
      record: period('p1', '2026-06-01')
    }
  }).state
  state = transitionHomeRecordsSync(state, {
    type: 'record-change',
    change: {
      collection: 'memories',
      mode: 'add',
      record: memory('m1', '2026-06-02')
    }
  }).state

  const started = transitionHomeRecordsSync(state, {
    type: 'load-start',
    mode: 'background'
  })
  const result = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: {
      kind: 'partial-success',
      periodsOutcome: { kind: 'success', data: [period('p1', '2026-06-01')] },
      memoriesOutcome: { kind: 'retryable-failure', message: 'network down' },
      periods: [period('p1', '2026-06-01')],
      memories: []
    }
  })

  assert.equal(result.state.pendingRevisions.periods, null)
  assert.equal(result.state.pendingRevisions.memories, 1)
  assert.deepEqual(result.decision.syncStatus, {
    text: '记忆同步失败，已保留旧记忆数据',
    autoHide: false
  })
})

test('background load start keeps pending sync work visible', () => {
  let state = createHomeRecordsSyncState({ hasLoaded: true })
  state = transitionHomeRecordsSync(state, {
    type: 'record-change',
    change: {
      collection: 'periods',
      mode: 'add',
      record: period('p1', '2026-06-01')
    }
  }).state

  const started = transitionHomeRecordsSync(state, {
    type: 'load-start',
    mode: 'background'
  })

  assert.deepEqual(started.decision.syncStatus, {
    text: '已更新，正在同步',
    autoHide: false
  })
})

test('unchanged background partial success stays quiet without pending work', () => {
  const existingPeriod = period('p1', '2026-06-01')
  const state = createHomeRecordsSyncState({
    periods: [existingPeriod],
    memories: [],
    hasLoaded: true
  })
  const started = transitionHomeRecordsSync(state, {
    type: 'load-start',
    mode: 'background'
  })
  const resolved = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: partialSnapshot({
      periodsOutcome: { kind: 'success', data: [{ ...existingPeriod }] },
      memoriesOutcome: retryable('memory network down'),
      periods: [{ ...existingPeriod }]
    })
  })

  assert.equal(resolved.decision.recordsChanged, false)
  assert.equal(resolved.decision.syncStatus, null)
})

test('a reordered semantic match preserves the existing array reference', () => {
  const p1 = period('p1', '2026-06-01')
  const p2 = period('p2', '2026-06-29')
  let state = createHomeRecordsSyncState({
    periods: [p2, p1],
    memories: [],
    hasLoaded: true
  })
  const originalPeriods = state.records.periods
  const started = transitionHomeRecordsSync(state, {
    type: 'load-start',
    mode: 'background'
  })

  const resolved = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: successSnapshot([p1, p2], [])
  })

  assert.equal(resolved.state.records.periods, originalPeriods)
  assert.equal(resolved.decision.recordsChanged, false)
  assert.equal(resolved.decision.syncStatus, null)
})

test('background success reports confirmed pending work and remote record changes as synced', () => {
  let pendingState = createHomeRecordsSyncState({ hasLoaded: true })
  const savedPeriod = period('p1', '2026-06-01')
  pendingState = transitionHomeRecordsSync(pendingState, {
    type: 'record-change',
    change: { collection: 'periods', mode: 'add', record: savedPeriod }
  }).state
  const pendingStarted = transitionHomeRecordsSync(pendingState, {
    type: 'load-start',
    mode: 'background'
  })
  const confirmed = transitionHomeRecordsSync(pendingStarted.state, {
    type: 'load-resolved',
    requestId: pendingStarted.decision.requestId,
    snapshot: successSnapshot([savedPeriod], [])
  })

  assert.equal(confirmed.state.pendingRevisions.periods, null)
  assert.deepEqual(confirmed.decision.syncStatus, {
    text: '已同步',
    autoHide: true
  })

  const quietState = createHomeRecordsSyncState({ hasLoaded: true })
  const remoteStarted = transitionHomeRecordsSync(quietState, {
    type: 'load-start',
    mode: 'background'
  })
  const remoteChanged = transitionHomeRecordsSync(remoteStarted.state, {
    type: 'load-resolved',
    requestId: remoteStarted.decision.requestId,
    snapshot: successSnapshot([savedPeriod], [])
  })

  assert.equal(remoteChanged.decision.recordsChanged, true)
  assert.deepEqual(remoteChanged.decision.syncStatus, {
    text: '已同步',
    autoHide: true
  })
})

test('record revisions advance only for semantic collection changes', () => {
  const initialPeriod = period('p1', '2026-06-01')
  const initialState = createHomeRecordsSyncState({
    periods: [initialPeriod],
    hasLoaded: true
  })

  const sameUpdate = transitionHomeRecordsSync(initialState, {
    type: 'record-change',
    change: { collection: 'periods', mode: 'update', record: initialPeriod }
  })
  assert.equal(sameUpdate.state, initialState)
  assert.deepEqual(sameUpdate.decision, { recordsChanged: false, syncStatus: null })

  const missingRemove = transitionHomeRecordsSync(initialState, {
    type: 'record-change',
    change: {
      collection: 'periods',
      mode: 'remove',
      record: { _id: 'missing' }
    }
  })
  assert.equal(missingRemove.state, initialState)

  const invalidChange = transitionHomeRecordsSync(initialState, {
    type: 'record-change',
    change: { collection: 'unknown', record: { _id: 'x' } }
  })
  assert.equal(invalidChange.state, initialState)

  const updated = transitionHomeRecordsSync(initialState, {
    type: 'record-change',
    change: {
      collection: 'periods',
      mode: 'update',
      record: { _id: 'p1', note: 'changed' }
    }
  })
  assert.equal(updated.state.revisions.periods, 1)
  assert.equal(updated.state.pendingRevisions.periods, 1)
  assert.equal(updated.state.records.periods[0].note, 'changed')

  const removed = transitionHomeRecordsSync(updated.state, {
    type: 'record-change',
    change: {
      collection: 'periods',
      mode: 'remove',
      record: { _id: 'p1' }
    }
  })
  assert.equal(removed.state.revisions.periods, 2)
  assert.equal(removed.state.pendingRevisions.periods, 2)
  assert.deepEqual(removed.state.records.periods, [])
})

test('initial success publishes both collections and marks the state loaded', () => {
  const periods = [period('p1', '2026-06-01')]
  const memories = [memory('m1', '2026-06-02')]
  const initial = createHomeRecordsSyncState()
  const started = transitionHomeRecordsSync(initial, {
    type: 'load-start',
    mode: 'initial'
  })

  assert.deepEqual(started.decision, {
    requestId: 1,
    loading: true,
    refreshing: false,
    recordsChanged: false,
    syncStatus: null
  })

  const resolved = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: successSnapshot(periods, memories)
  })

  assert.equal(resolved.state.hasLoaded, true)
  assert.deepEqual(resolved.state.records, { periods, memories })
  assert.equal(resolved.state.activeRequest, null)
  assert.deepEqual(resolved.decision, {
    loading: false,
    refreshing: false,
    recordsChanged: true,
    hasLoaded: true,
    syncStatus: null
  })
})

test('initial partial success publishes memories and explains the period failure', () => {
  const memories = [memory('m1', '2026-06-02')]
  const initial = createHomeRecordsSyncState()
  const started = transitionHomeRecordsSync(initial, {
    type: 'load-start',
    mode: 'initial'
  })
  const resolved = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: partialSnapshot({
      periodsOutcome: retryable('period network down'),
      memoriesOutcome: { kind: 'success', data: memories },
      memories
    })
  })

  assert.equal(resolved.state.hasLoaded, true)
  assert.equal(resolved.decision.hasLoaded, true)
  assert.deepEqual(resolved.state.records.periods, [])
  assert.deepEqual(resolved.state.records.memories, memories)
  assert.deepEqual(resolved.decision.syncStatus, {
    text: '经期同步失败，已显示记忆数据',
    autoHide: false
  })
})

test('initial retryable snapshot failure stays unloaded and exposes the retry outcome', () => {
  const outcome = retryable('network down')
  const initial = createHomeRecordsSyncState()
  const started = transitionHomeRecordsSync(initial, {
    type: 'load-start',
    mode: 'initial'
  })
  const resolved = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: retryableSnapshot(outcome)
  })

  assert.equal(resolved.state.hasLoaded, false)
  assert.equal(resolved.state.activeRequest, null)
  assert.deepEqual(resolved.decision, {
    loading: false,
    refreshing: false,
    recordsChanged: false,
    outcome,
    syncStatus: null
  })
})

test('background retryable snapshot failure preserves pending records and reports only pending sync work', () => {
  let pendingState = createHomeRecordsSyncState({ hasLoaded: true })
  pendingState = transitionHomeRecordsSync(pendingState, {
    type: 'record-change',
    change: {
      collection: 'memories',
      mode: 'add',
      record: memory('m1', '2026-06-02')
    }
  }).state
  const pendingRecords = pendingState.records
  const pendingStarted = transitionHomeRecordsSync(pendingState, {
    type: 'load-start',
    mode: 'background'
  })
  const outcome = retryable('network down')
  const pendingFailed = transitionHomeRecordsSync(pendingStarted.state, {
    type: 'load-resolved',
    requestId: pendingStarted.decision.requestId,
    snapshot: retryableSnapshot(outcome)
  })

  assert.equal(pendingFailed.state.records, pendingRecords)
  assert.equal(pendingFailed.state.pendingRevisions.memories, 1)
  assert.deepEqual(pendingFailed.decision.syncStatus, {
    text: '同步失败，稍后重试',
    autoHide: true
  })

  const quietState = createHomeRecordsSyncState({
    periods: [period('p1', '2026-06-01')],
    hasLoaded: true
  })
  const quietStarted = transitionHomeRecordsSync(quietState, {
    type: 'load-start',
    mode: 'background'
  })
  const quietFailed = transitionHomeRecordsSync(quietStarted.state, {
    type: 'load-resolved',
    requestId: quietStarted.decision.requestId,
    snapshot: retryableSnapshot(outcome)
  })

  assert.equal(quietFailed.state.records, quietState.records)
  assert.equal(quietFailed.decision.syncStatus, null)
})

test('a blocking snapshot clears the request and exposes the blocking outcome', () => {
  const outcome = { kind: 'no-room' }
  const initial = createHomeRecordsSyncState()
  const started = transitionHomeRecordsSync(initial, {
    type: 'load-start',
    mode: 'initial'
  })
  const blocked = transitionHomeRecordsSync(started.state, {
    type: 'load-resolved',
    requestId: started.decision.requestId,
    snapshot: { kind: 'blocked', outcome }
  })

  assert.equal(blocked.state.hasLoaded, false)
  assert.equal(blocked.state.activeRequest, null)
  assert.deepEqual(blocked.decision, {
    loading: false,
    refreshing: false,
    recordsChanged: false,
    blockingOutcome: outcome,
    syncStatus: null
  })
})

test('a superseded request result is ignored without allocating state', () => {
  const initial = createHomeRecordsSyncState()
  const first = transitionHomeRecordsSync(initial, {
    type: 'load-start',
    mode: 'initial'
  })
  const second = transitionHomeRecordsSync(first.state, {
    type: 'load-start',
    mode: 'initial'
  })
  const stale = transitionHomeRecordsSync(second.state, {
    type: 'load-resolved',
    requestId: first.decision.requestId,
    snapshot: successSnapshot([], [])
  })

  assert.equal(stale.state, second.state)
  assert.deepEqual(stale.decision, {
    ignored: true,
    recordsChanged: false,
    syncStatus: null
  })
})

test('load-failed clears the active request and returns mode-specific retry feedback', () => {
  const outcome = retryable('unexpected rejection')
  const initial = createHomeRecordsSyncState()
  const initialStarted = transitionHomeRecordsSync(initial, {
    type: 'load-start',
    mode: 'initial'
  })
  const initialFailed = transitionHomeRecordsSync(initialStarted.state, {
    type: 'load-failed',
    requestId: initialStarted.decision.requestId,
    outcome
  })

  assert.equal(initialFailed.state.activeRequest, null)
  assert.deepEqual(initialFailed.decision, {
    loading: false,
    refreshing: false,
    recordsChanged: false,
    outcome,
    syncStatus: null
  })

  let backgroundState = createHomeRecordsSyncState({ hasLoaded: true })
  backgroundState = transitionHomeRecordsSync(backgroundState, {
    type: 'record-change',
    change: {
      collection: 'periods',
      record: period('p1', '2026-06-01')
    }
  }).state
  const backgroundStarted = transitionHomeRecordsSync(backgroundState, {
    type: 'load-start',
    mode: 'background'
  })
  const backgroundFailed = transitionHomeRecordsSync(backgroundStarted.state, {
    type: 'load-failed',
    requestId: backgroundStarted.decision.requestId,
    outcome
  })

  assert.equal(backgroundFailed.state.activeRequest, null)
  assert.equal(backgroundFailed.state.records, backgroundState.records)
  assert.equal(backgroundFailed.state.pendingRevisions.periods, 1)
  assert.deepEqual(backgroundFailed.decision.syncStatus, {
    text: '同步失败，稍后重试',
    autoHide: true
  })
})

test('unknown events throw an explicit error', () => {
  assert.throws(
    () => transitionHomeRecordsSync(createHomeRecordsSyncState(), { type: 'mystery' }),
    /Unsupported home records sync event: mystery/
  )
})

function period(id, startDate) {
  return {
    _id: id,
    startDate,
    endDate: startDate,
    note: '',
    duration: 1,
    flow: '',
    symptoms: []
  }
}

function memory(id, date) {
  return { _id: id, date, note: '' }
}

function successSnapshot(periods, memories) {
  return {
    kind: 'success',
    periodsOutcome: { kind: 'success', data: periods },
    memoriesOutcome: { kind: 'success', data: memories },
    periods,
    memories
  }
}

function partialSnapshot({ periodsOutcome, memoriesOutcome, periods = [], memories = [] }) {
  return {
    kind: 'partial-success',
    periodsOutcome,
    memoriesOutcome,
    periods,
    memories
  }
}

function retryableSnapshot(outcome) {
  return {
    kind: 'retryable-failure',
    outcome,
    periodsOutcome: outcome,
    memoriesOutcome: outcome
  }
}

function retryable(message) {
  return { kind: 'retryable-failure', message }
}
