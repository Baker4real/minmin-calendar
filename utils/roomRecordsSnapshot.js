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

function getErrorMessage(error) {
  return error && error.message ? error.message : String(error || '未知错误')
}

module.exports = {
  loadExportRecordsSnapshot,
  loadHomeRecordsSnapshot
}
