const RECORD_COLLECTIONS = ['periods', 'memories']

async function loadHomeRecordsSnapshot(options = {}) {
  const [periodsOutcome, memoriesOutcome] = await Promise.all([
    listRecordCollection({ ...options, collection: 'periods' }),
    listRecordCollection({ ...options, collection: 'memories' })
  ])
  return buildHomeRecordsSnapshot({ periodsOutcome, memoriesOutcome })
}

async function loadExportRecordsSnapshot(options = {}) {
  const periodsOutcome = await listRecordCollection({ ...options, collection: 'periods' })
  if (!isSuccessfulCollectionOutcome(periodsOutcome)) {
    return buildExportFailureSnapshot({ periodsOutcome, outcome: periodsOutcome })
  }

  const memoriesOutcome = await listRecordCollection({ ...options, collection: 'memories' })
  if (!isSuccessfulCollectionOutcome(memoriesOutcome)) {
    return buildExportFailureSnapshot({ periodsOutcome, memoriesOutcome, outcome: memoriesOutcome })
  }

  return {
    kind: 'success',
    periodsOutcome,
    memoriesOutcome,
    periods: normalizeRecords(periodsOutcome.data),
    memories: normalizeRecords(memoriesOutcome.data)
  }
}

function buildHomeRecordsSnapshot({ periodsOutcome, memoriesOutcome }) {
  const blockingOutcome = [periodsOutcome, memoriesOutcome]
    .find(outcome => isBlockingCollectionOutcome(outcome))
  if (blockingOutcome) {
    return {
      kind: 'blocked',
      outcome: blockingOutcome,
      periodsOutcome,
      memoriesOutcome
    }
  }

  const periodsSucceeded = isSuccessfulCollectionOutcome(periodsOutcome)
  const memoriesSucceeded = isSuccessfulCollectionOutcome(memoriesOutcome)

  if (periodsSucceeded || memoriesSucceeded) {
    return {
      kind: periodsSucceeded && memoriesSucceeded ? 'success' : 'partial-success',
      periodsOutcome,
      memoriesOutcome,
      periods: periodsSucceeded ? normalizeRecords(periodsOutcome.data) : [],
      memories: memoriesSucceeded ? normalizeRecords(memoriesOutcome.data) : []
    }
  }

  const retryableOutcome = [periodsOutcome, memoriesOutcome]
    .find(outcome => isRetryableCollectionFailure(outcome))

  return {
    kind: 'retryable-failure',
    outcome: retryableOutcome || {
      kind: 'retryable-failure',
      message: '日历加载失败'
    },
    periodsOutcome,
    memoriesOutcome
  }
}

function getHomeRecordsForSnapshot(snapshot, currentRecords = {}) {
  return {
    periods: getRecordsForCollection(snapshot, currentRecords, 'periods'),
    memories: getRecordsForCollection(snapshot, currentRecords, 'memories')
  }
}

function hasHomeSnapshotRecordChanges(snapshot, currentRecords = {}) {
  return RECORD_COLLECTIONS.some(collection => {
    const outcome = getOutcomeForCollection(snapshot, collection)
    if (!isSuccessfulCollectionOutcome(outcome)) return false
    const nextRecords = collection === 'periods' ? snapshot.periods : snapshot.memories
    return stableRecordListKey(currentRecords[collection]) !== stableRecordListKey(nextRecords)
  })
}

function buildHomePartialSyncStatus(snapshot, options = {}) {
  const background = Boolean(options.background)
  const periodsOutcome = snapshot && snapshot.periodsOutcome
  const memoriesOutcome = snapshot && snapshot.memoriesOutcome
  const periodsFailed = isRetryableCollectionFailure(periodsOutcome)
  const memoriesFailed = isRetryableCollectionFailure(memoriesOutcome)
  const periodsSucceeded = isSuccessfulCollectionOutcome(periodsOutcome)
  const memoriesSucceeded = isSuccessfulCollectionOutcome(memoriesOutcome)

  if (periodsFailed && memoriesSucceeded) {
    return background ? '经期同步失败，已保留旧经期数据' : '经期同步失败，已显示记忆数据'
  }
  if (memoriesFailed && periodsSucceeded) {
    return background ? '记忆同步失败，已保留旧记忆数据' : '记忆同步失败，已显示经期数据'
  }
  return background ? '部分数据同步失败，已保留旧数据' : '部分数据同步失败'
}

async function listRecordCollection({ cloud, client, collection }) {
  if (client && typeof client.list === 'function') {
    return normalizeCollectionOutcome(await client.list(collection))
  }

  try {
    const getter = collection === 'periods' ? cloud.getPeriods : cloud.getMemories
    const data = await getter()
    return { kind: 'success', data }
  } catch (error) {
    return {
      kind: 'retryable-failure',
      message: getErrorMessage(error),
      retry: () => listRecordCollection({ cloud, client, collection })
    }
  }
}

function normalizeCollectionOutcome(outcome) {
  if (outcome && typeof outcome.kind === 'string') return outcome
  return {
    kind: 'malformed-failure',
    message: '导出失败'
  }
}

function buildExportFailureSnapshot({ periodsOutcome = null, memoriesOutcome = null, outcome }) {
  return {
    kind: 'failure',
    outcome,
    periodsOutcome,
    memoriesOutcome
  }
}

function getRecordsForCollection(snapshot, currentRecords, collection) {
  const outcome = getOutcomeForCollection(snapshot, collection)
  if (!isSuccessfulCollectionOutcome(outcome)) {
    return normalizeRecords(currentRecords[collection])
  }
  return collection === 'periods' ? normalizeRecords(snapshot.periods) : normalizeRecords(snapshot.memories)
}

function getOutcomeForCollection(snapshot, collection) {
  if (!snapshot) return null
  return collection === 'periods' ? snapshot.periodsOutcome : snapshot.memoriesOutcome
}

function isSuccessfulCollectionOutcome(outcome) {
  return outcome && outcome.kind === 'success'
}

function isRetryableCollectionFailure(outcome) {
  return outcome && outcome.kind === 'retryable-failure'
}

function isBlockingCollectionOutcome(outcome) {
  return outcome && outcome.kind !== 'success' && outcome.kind !== 'retryable-failure'
}

function normalizeRecords(records) {
  return Array.isArray(records) ? records : []
}

function stableRecordListKey(records) {
  if (!Array.isArray(records)) return '[]'
  return JSON.stringify(records.map(stableValue).sort(compareStableRecordValues))
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = stableValue(value[key])
    return result
  }, {})
}

function compareStableRecordValues(left, right) {
  const leftId = getStableRecordIdentity(left)
  const rightId = getStableRecordIdentity(right)
  if (leftId < rightId) return -1
  if (leftId > rightId) return 1

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

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  buildHomePartialSyncStatus,
  buildHomeRecordsSnapshot,
  getHomeRecordsForSnapshot,
  hasHomeSnapshotRecordChanges,
  loadExportRecordsSnapshot,
  loadHomeRecordsSnapshot
}
