// Collection outcomes are addressed directly, without synthesizing *Outcome keys.
// The shared records' load (roomRecordsSync) accepts retryable partial success; export stops at the first failed list.
async function loadSharedRecordsSnapshot(options = {}) {
  const client = requireRoomDataClient(options.client)
  const [periods, memories] = await Promise.all([
    listRecordCollection({ client, collection: 'periods' }),
    listRecordCollection({ client, collection: 'memories' })
  ])
  const collections = { periods, memories }
  const outcomes = Object.values(collections)
  const blockingOutcome = outcomes.find(outcome => outcome.kind !== 'success' && outcome.kind !== 'retryable-failure')
  if (blockingOutcome) return { kind: 'blocked', outcome: blockingOutcome, collections }
  const successes = outcomes.filter(outcome => outcome.kind === 'success').length
  if (successes) return { kind: successes === 2 ? 'success' : 'partial-success', collections }
  return { kind: 'retryable-failure', outcome: periods, collections }
}

async function loadExportRecordsSnapshot(options = {}) {
  const client = requireRoomDataClient(options.client)
  const periods = await listRecordCollection({ client, collection: 'periods' })
  if (periods.kind !== 'success') {
    return { kind: 'failure', outcome: periods, collections: { periods } }
  }
  const memories = await listRecordCollection({ client, collection: 'memories' })
  const collections = { periods, memories }
  if (memories.kind !== 'success') return { kind: 'failure', outcome: memories, collections }
  return { kind: 'success', collections }
}

function requireRoomDataClient(client) {
  if (!client || typeof client.list !== 'function') {
    throw new Error('RoomDataClient is required')
  }
  return client
}

async function listRecordCollection({ client, collection }) {
  const outcome = await client.list(collection)
  if (outcome && typeof outcome.kind === 'string') {
    return outcome.kind === 'success'
      ? { ...outcome, data: Array.isArray(outcome.data) ? outcome.data : [] }
      : outcome
  }
  return { kind: 'malformed-failure', message: '导出失败' }
}

module.exports = { loadExportRecordsSnapshot, loadSharedRecordsSnapshot }
