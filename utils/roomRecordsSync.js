const cloud = require('./cloud')
const room = require('./room')
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

const UNKNOWN_LISTED_ROOM = { roomCode: '', roomStatus: '' }

// A collection holding nothing yet: the start, and what a Room change resets it to.
function emptyCollection() {
  return { records: [], revision: 0, pendingRevision: null, synced: false }
}

// The app's one copy of the current Room's records (#193): it owns the records and their
// reconciliation, not just decisions for a Page to execute. Pages subscribe on load and
// unsubscribe on unload; a listener's calendarChanged/recordChange describe one atomic
// projection update, while loading and pill-only updates leave calendar feedback and
// animation marks alone. Listeners only render; prompts come from the result of load(), and
// claimPrompt keeps one result to one prompt.
function createRoomRecordsSync() {
  const collections = Object.fromEntries(COLLECTIONS.map(collection => [collection, emptyCollection()]))
  const listeners = new Set()
  // Every held record, sync mark, pending change and the pairing belong to this room code
  // ('' when the device holds no Room); null until the first checkpoint, when nothing is held yet.
  let roomCode = null
  // Moves on whenever held content is dropped for another Room; a load started before that is superseded.
  let generation = 0
  let inFlight = null
  let hasLoadedRecords = false
  let loading = true
  let refreshing = false
  let failedCollections = []
  let blockedOutcome = null
  let pill = null
  // The Room pairing as the lists last brought it back, with the room code it belongs to (#191).
  let listedRoom = UNKNOWN_LISTED_ROOM
  // Load results some caller has already presented a prompt for (#194).
  const promptedResults = new WeakSet()

  function getState() {
    const scope = failedCollections.length === 2 ? 'all' : failedCollections[0]
    const copy = hasLoadedRecords && SYNC_FAILURE_COPY[scope]
    return {
      collections: Object.fromEntries(COLLECTIONS.map(collection => [collection, {
        records: collections[collection].records,
        synced: collections[collection].synced,
        pending: collections[collection].pendingRevision !== null
      }])),
      roomPaired: listedRoom.roomStatus === 'paired',
      hasLoadedRecords,
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
    const state = getState()
    for (const listener of [...listeners]) listener(state, { calendarChanged, recordChange })
  }

  // A page subscribes on load and reads the state right away, so the Room ownership rule runs
  // first; earlier subscribers hear about anything dropped, the new one reads the result.
  function subscribe(listener) {
    if (claimRoom(room.getRoomCode())) publish(true)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  // The period edit session reads the held periods for its hint, its overlap question and whether they are synced
  // without loading, and it stays open while its own save's Room repair moves the device to another Room or to none.
  // So each such read checks the device's current room code too: content held for another code is dropped first,
  // subscribers hear about it, and the session finds its periods unsynced and asks for one load (#189 review).
  function readCurrentRoom() {
    if (claimRoom(room.getRoomCode())) publish(true)
    return getState()
  }

  function hasPending() {
    return COLLECTIONS.some(collection => collections[collection].pendingRevision !== null)
  }

  // The Room ownership rule (#193): content found to belong to another room code than `code`,
  // including when the device no longer holds a Room, is dropped before anything else happens,
  // and a load still running for the previous code is superseded: nothing it reads lands here.
  // Returns whether anything was dropped, which is a calendar change.
  function claimRoom(code) {
    if (roomCode === null || code === roomCode) {
      roomCode = code
      return false
    }
    COLLECTIONS.forEach(collection => { Object.assign(collections[collection], emptyCollection()) })
    hasLoadedRecords = false
    failedCollections = []
    blockedOutcome = null
    pill = null
    listedRoom = UNKNOWN_LISTED_ROOM
    roomCode = code
    generation += 1
    if (inFlight) {
      inFlight = null
      loading = false
      refreshing = false
    }
    return true
  }

  // Callers never choose: holding data already read for this Room makes any load a silent refresh.
  // The result is what the calling page presents from: success / partial-success (with only the
  // roomStatus this load's own lists brought back), retryable-failure / blocked (with the outcome
  // for roomAccessOutcome), or superseded when a Room change made this load stale.
  function load() {
    const cleared = claimRoom(room.getRoomCode())
    // One promise per Room serializes all callers, which also keeps an older load from
    // arriving after a newer one. Local changes have their own revision gate.
    if (inFlight) return inFlight
    const background = hasLoadedRecords
    const startGeneration = generation
    let startRevisions = currentRevisions()
    loading = !background
    refreshing = background
    blockedOutcome = null
    if (!background) failedCollections = []
    pill = background && hasPending() ? syncingPill() : null
    const loaded = Promise.resolve().then(async () => {
      try {
        let snapshot = await readSnapshot()
        // The revision gate sets aside a list read before a local change (failure mode 7). A collection with no
        // complete list yet would then rest unsynced as if its read had failed, so this load reads both lists again
        // before it ends; every caller sharing it waits for that read.
        while (startGeneration === generation && setsAsideUnsynced(snapshot, startRevisions)) {
          startRevisions = currentRevisions()
          snapshot = await readSnapshot()
        }
        if (startGeneration !== generation) return { kind: 'superseded' }
        if (snapshot.kind === 'blocked') {
          block(snapshot.outcome)
          return { kind: 'blocked', outcome: snapshot.outcome }
        }
        if (snapshot.kind === 'retryable-failure') {
          fail(snapshot.outcome, background)
          return { kind: 'retryable-failure', outcome: snapshot.outcome }
        }
        return resolveSnapshot(snapshot, startRevisions, background)
      } catch (error) {
        console.error('load error', error)
        if (startGeneration !== generation) return { kind: 'superseded' }
        const outcome = { kind: 'retryable-failure', message: error && error.message ? error.message : String(error || '未知错误') }
        fail(outcome, background)
        return { kind: 'retryable-failure', outcome }
      }
    }).finally(() => {
      if (inFlight === loaded) inFlight = null
    })
    inFlight = loaded
    publish(cleared)
    return loaded
  }

  // A blocked load ends with the room code the device holds now: a Room repair may have moved it
  // to another Room or to none, and what was held for the previous code goes with that.
  function block(outcome) {
    const cleared = claimRoom(room.getRoomCode())
    COLLECTIONS.forEach(collection => { collections[collection].synced = false })
    hasLoadedRecords = false
    loading = false
    refreshing = false
    failedCollections = []
    blockedOutcome = outcome
    pill = null
    publish(cleared)
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

  function currentRevisions() {
    return Object.fromEntries(COLLECTIONS.map(collection => [collection, collections[collection].revision]))
  }

  function readSnapshot() {
    return roomRecordsSnapshot.loadSharedRecordsSnapshot({ client: cloud.createRoomDataClient() })
  }

  // Whether the revision gate would set aside a list this snapshot read for the held Room, of a collection that has
  // never synced: a local change landed while it was read. Blocked and failed snapshots reach no gate.
  function setsAsideUnsynced(snapshot, startRevisions) {
    if (snapshot.kind !== 'success' && snapshot.kind !== 'partial-success') return false
    return COLLECTIONS.some(collection => {
      const outcome = snapshot.collections[collection]
      const current = collections[collection]
      return outcome.kind === 'success' && outcome.roomCode === roomCode
        && !current.synced && current.revision !== startRevisions[collection]
    })
  }

  function resolveSnapshot(snapshot, startRevisions, startedInBackground) {
    // Adopting list results follows the room code they were read for: a load that started without a
    // local room code reads the Room its lookup finds. Content held for another code goes first,
    // local changes included, so this load's revision baseline and background start no longer apply.
    let cleared = false
    for (const collection of COLLECTIONS) {
      const outcome = snapshot.collections[collection]
      if (outcome.kind === 'success' && claimRoom(outcome.roomCode)) cleared = true
    }
    const revisions = cleared ? currentRevisions() : startRevisions
    const background = startedInBackground && !cleared
    // Both lists of one load read the same room code; a list read for a code no longer held is not adopted.
    const adopted = COLLECTIONS.filter(collection => {
      const outcome = snapshot.collections[collection]
      return outcome.kind === 'success' && outcome.roomCode === roomCode
    })
    const wasLoaded = hasLoadedRecords
    const wasPaired = listedRoom.roomStatus === 'paired'
    let listedStatus = ''
    let recordsChanged = false
    let syncedChanged = false
    let confirmedPending = false
    for (const collection of adopted) {
      const outcome = snapshot.collections[collection]
      const current = collections[collection]
      // Local record changes invalidate a snapshot's records, not the pairing it brought back.
      listedRoom = adoptListedRoomStatus(listedRoom, outcome)
      if (outcome.roomStatus) listedStatus = outcome.roomStatus
      if (current.revision !== revisions[collection]) continue
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
    hasLoadedRecords = true
    loading = false
    refreshing = false
    failedCollections = COLLECTIONS.filter(collection => !adopted.includes(collection))
    pill = resolvedPill({ background, recordsChanged, confirmedPending })
    // Record authors show only when paired, so a pairing change alone is a calendar update.
    const pairingChanged = (listedRoom.roomStatus === 'paired') !== wasPaired
    publish(!wasLoaded || recordsChanged || syncedChanged || pairingChanged)
    const kind = failedCollections.length ? 'partial-success' : 'success'
    return listedStatus ? { kind, roomStatus: listedStatus } : { kind }
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

  // Edit sessions hand each confirmed save or delete over once (#195), and every one is published as
  // recordChange, even before any load has completed or when the held records already match it: the
  // record tab lands on each, while Home plays record feedback only for a calendar change over records
  // it has loaded.
  function applyRecordChange({ collection, record, mode } = {}) {
    if (!COLLECTIONS.includes(collection) || !record || typeof record !== 'object') return
    // A local change belongs to the Room this device holds now.
    const cleared = claimRoom(room.getRoomCode())
    const current = collections[collection]
    const before = current.records
    const records = mergeRecordChange(before, record, mode)
    const change = { collection, record, mode, before }
    if (stableRecordListKey(records) === stableRecordListKey(before)) {
      publish(cleared, change)
      return
    }
    current.records = records
    current.revision += 1
    if (hasLoadedRecords) {
      current.pendingRevision = current.revision
      pill = syncingPill()
    }
    publish(true, change)
  }

  // Every caller of one in-flight load gets the same result: a page showing, pulling down and
  // retrying at once, or two pages sharing it. The first caller in front to claim a result
  // presents its prompt; later claims of that result return false, so one failure prompts once.
  function claimPrompt(result) {
    if (!result || typeof result !== 'object' || promptedResults.has(result)) return false
    promptedResults.add(result)
    return true
  }

  return { subscribe, load, applyRecordChange, getState, readCurrentRoom, claimPrompt }
}

function syncingPill() {
  return { kind: 'syncing', text: '已更新，正在同步', autoHide: false }
}

// Pairing comes only from RoomDataClient list results (#191): a brought-back waiting/paired is adopted;
// a success without one keeps the last value of the same room code and is unpaired for any other code;
// a failure brings no new value. `held` is { roomCode, roomStatus }; roomStatus '' means unpaired.
function adoptListedRoomStatus(held, outcome) {
  const current = held || UNKNOWN_LISTED_ROOM
  if (!outcome || outcome.kind !== 'success') return current
  if (outcome.roomStatus) return { roomCode: outcome.roomCode, roomStatus: outcome.roomStatus }
  return current.roomCode === outcome.roomCode ? current : { roomCode: outcome.roomCode, roomStatus: '' }
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

const shared = createRoomRecordsSync()

module.exports = {
  subscribe: shared.subscribe,
  load: shared.load,
  applyRecordChange: shared.applyRecordChange,
  getState: shared.getState,
  readCurrentRoom: shared.readCurrentRoom,
  claimPrompt: shared.claimPrompt
}
