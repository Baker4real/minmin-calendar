const ALLOWED_COLLECTIONS = ['periods', 'memories']
const RESERVED_FIELDS = ['_id', 'roomCode', 'createdBy', 'createdAt']
const PERIOD_FIELDS = ['startDate', 'endDate', 'status', 'note', 'duration', 'flow', 'symptoms']
const MEMORY_FIELDS = ['date', 'note']
const FLOW_VALUES = new Set(['light', 'normal', 'heavy'])
const SYMPTOM_VALUES = new Set(['cramps', 'headache', 'tired', 'mood', 'sleep', 'acne', 'cravings'])
const PERIOD_STATUS_VALUES = new Set(['ongoing', 'unknown-end', 'known-end'])
const MAX_NOTE_LENGTH = 500

function createRoomRecords({ db, serverDate, today }) {
  const resolveToday = buildTodayResolver(today)
  return {
    async list({ collection, roomCode }) {
      const order = collection === 'periods'
        ? ['startDate', 'desc']
        : ['date', 'desc']
      const res = await db.collection(collection)
        .where({ roomCode })
        .orderBy(order[0], order[1])
        .get()
      return { code: 0, data: res.data }
    },

    async add({ collection, roomCode, openid, data }) {
      const normalized = normalizeRecord(collection, data, { today: resolveToday() })
      if (normalized.code !== 0) return normalized

      if (collection === 'periods' && normalized.data.status === 'ongoing') {
        return addOngoingPeriod({ roomCode, openid, normalized })
      }

      const payload = {
        ...normalized.data,
        roomCode,
        createdBy: openid,
        createdAt: serverDate()
      }
      const res = await db.collection(collection).add({ data: payload })
      return {
        code: 0,
        id: res._id,
        record: buildClientRecord(res._id, normalized.data)
      }
    },

    async update({ collection, roomCode, id, data }) {
      const existing = await findRecord(collection, roomCode, id)
      if (!existing) return { code: -1, msg: '记录不存在或无权修改' }

      const normalized = normalizeRecord(collection, data, { today: resolveToday() })
      if (normalized.code !== 0) return normalized

      if (collection === 'periods' && normalized.data.status === 'ongoing') {
        const conflict = await findOtherOngoingPeriod(roomCode, id)
        if (conflict) return { code: -1, msg: '已有进行中的经期记录，请编辑原记录' }
      }

      const updateResult = await db.collection(collection).doc(id).update({ data: normalized.data })
      if (getUpdatedCount(updateResult) === 0 && !(await findRecord(collection, roomCode, id))) {
        return { code: -1, msg: '记录不存在或无权修改' }
      }

      if (collection === 'periods' && normalized.data.status === 'ongoing') {
        // 预检查与提交之间的窗口里，并发写入可能把另一条记录也改成进行中：
        // 提交后按确定性赢家对账，输家降为结束日期不详；本条若是输家，按原冲突语义拒绝。
        const winner = await convergeOngoingPeriods(roomCode)
        if (winner && winner._id !== id) {
          return { code: -1, msg: '已有进行中的经期记录，请编辑原记录' }
        }
      }

      return {
        code: 0,
        id,
        record: buildClientRecord(id, normalized.data)
      }
    },

    async remove({ collection, roomCode, id }) {
      const existing = await findRecord(collection, roomCode, id)
      if (!existing) return { code: -1, msg: '记录不存在或无权删除' }

      await db.collection(collection).doc(id).remove()
      return { code: 0 }
    }
  }

  // 一个 Room 至多一条进行中经期记录：新增进行中时先找已有记录重开（同一条 _id），
  // 未命中才插入；写入后再对账一次，并发写入也收敛回一条。
  // 重开不把新表单写进原记录：开始日期、备注、经量、症状保持已记录的数据，
  // 返回的也是持久化的原样数据，过期表单不会静默覆盖另一成员已保存的内容。
  async function addOngoingPeriod({ roomCode, openid, normalized }) {
    const ongoingRecords = await findOngoingPeriods(roomCode)
    const existing = pickEarliestOngoing(ongoingRecords)
    if (existing) {
      // 既有竞态可能已留下多条进行中：重开最早一条，其余降为结束日期不详
      await demoteOngoingRecords(roomCode, ongoingRecords, [existing._id])
      return {
        code: 0,
        id: existing._id,
        reopened: true,
        record: buildPersistedPeriodRecord(existing)
      }
    }

    const payload = {
      ...normalized.data,
      roomCode,
      createdBy: openid,
      createdAt: serverDate()
    }
    const res = await db.collection('periods').add({ data: payload })

    const ongoingAfterInsert = await findOngoingPeriods(roomCode)
    const winner = pickEarliestOngoing(ongoingAfterInsert)
    if (winner && winner._id !== res._id) {
      // 并发写入方先落了一条更早的进行中记录：保留赢家已记录的数据，撤回本次插入
      await demoteOngoingRecords(roomCode, ongoingAfterInsert, [winner._id, res._id])
      await db.collection('periods').doc(res._id).remove()
      return {
        code: 0,
        id: winner._id,
        reopened: true,
        record: buildPersistedPeriodRecord(winner)
      }
    }
    await demoteOngoingRecords(roomCode, ongoingAfterInsert, [res._id])
    return {
      code: 0,
      id: res._id,
      record: buildClientRecord(res._id, normalized.data)
    }
  }

  async function findOngoingPeriods(roomCode) {
    const res = await db.collection('periods')
      .where({ roomCode, status: 'ongoing' })
      .limit(20)
      .get()
    return res.data
  }

  // 对账收敛：按确定性赢家保留一条进行中，其余降为「结束日期不详」。
  // 不发明结束日期、不删除既有记录；两个并发写入方对同一快片算出同一赢家，收敛回一条。
  async function convergeOngoingPeriods(roomCode) {
    const ongoingRecords = await findOngoingPeriods(roomCode)
    const winner = pickEarliestOngoing(ongoingRecords)
    if (winner) {
      await demoteOngoingRecords(roomCode, ongoingRecords, [winner._id])
    }
    return winner
  }

  // 降级只打仍处于进行中的记录：快照里的输家若在降级落库前刚被并发补填完成
  //（known-end 及其结束日期、时长已提交），条件更新不再匹配它，已提交的事实不被抹掉。
  async function demoteOngoingRecords(roomCode, records, keepIds) {
    const losers = records.filter(record => !keepIds.includes(record._id))
    for (const loser of losers) {
      await db.collection('periods')
        .where({ _id: loser._id, roomCode, status: 'ongoing' })
        .update({ data: { status: 'unknown-end', endDate: '', duration: 0 } })
    }
  }

  async function findOtherOngoingPeriod(roomCode, id) {
    const records = await findOngoingPeriods(roomCode)
    return records.find(record => record._id !== id) || null
  }

  async function findRecord(collection, roomCode, id) {
    if (!id) return null
    const existing = await db.collection(collection)
      .where({ _id: id, roomCode })
      .limit(1)
      .get()
    return existing.data[0] || null
  }
}

function buildTodayResolver(today) {
  if (typeof today === 'function') return today
  if (typeof today === 'string' && today) return () => today
  return () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// 并发对账的确定性赢家：createdAt 最早，其次 _id 最小；两个并发写入方收敛到同一条。
function pickEarliestOngoing(records) {
  let winner = null
  records.forEach(record => {
    if (!winner) {
      winner = record
      return
    }
    const time = recordTime(record)
    const winnerTime = recordTime(winner)
    if (time < winnerTime || (time === winnerTime && record._id < winner._id)) {
      winner = record
    }
  })
  return winner
}

function recordTime(record) {
  const value = record && record.createdAt
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function getUpdatedCount(result) {
  if (!result) return null
  return result.updated ?? result.modified ?? result.stats?.updated ?? null
}

function buildClientRecord(id, data) {
  return {
    _id: id,
    ...data
  }
}

// 持久化文档到客户端记录投影：只暴露经期字段，不泄露 roomCode、createdBy、createdAt。
// 重开进行中记录时返回它，而不是未经保存的新表单数据。
function buildPersistedPeriodRecord(record) {
  const client = { _id: record._id }
  PERIOD_FIELDS.forEach(field => {
    if (Object.prototype.hasOwnProperty.call(record, field)) client[field] = record[field]
  })
  return client
}

function normalizeRecord(collection, rawData, options = {}) {
  if (!ALLOWED_COLLECTIONS.includes(collection)) {
    return { code: -1, msg: '不支持的数据集合' }
  }

  const data = stripReservedFields(rawData)
  const fields = collection === 'periods' ? PERIOD_FIELDS : MEMORY_FIELDS
  const unknownFields = Object.keys(data).filter(key => !fields.includes(key))
  if (unknownFields.length > 0) {
    return { code: -1, msg: `不支持的字段: ${unknownFields.join(', ')}` }
  }

  return collection === 'periods'
    ? normalizePeriodRecord(data, options)
    : normalizeMemoryRecord(data, options)
}

function normalizePeriodRecord(data, { today = '' } = {}) {
  const startDate = data.startDate

  if (!isValidDateString(startDate)) return { code: -1, msg: '经期开始日期格式不正确' }
  if (startDate > today) return { code: -1, msg: '开始日期不能晚于今天' }
  const status = resolvePeriodStatus(data)
  if (!status) return { code: -1, msg: '经期状态不正确' }

  let endDate = ''
  if (status === 'known-end') {
    endDate = data.endDate
    if (!isValidDateString(endDate)) return { code: -1, msg: '经期结束日期格式不正确' }
    if (startDate > endDate) return { code: -1, msg: '结束日期不能早于开始日期' }
    if (endDate > today) return { code: -1, msg: '结束日期不能晚于今天' }
  }

  return {
    code: 0,
    data: {
      startDate,
      endDate,
      status,
      note: normalizeNote(data.note),
      duration: status === 'known-end' ? daysBetween(startDate, endDate) + 1 : 0,
      flow: FLOW_VALUES.has(data.flow) ? data.flow : '',
      symptoms: normalizeSymptoms(data.symptoms)
    }
  }
}

function resolvePeriodStatus(data) {
  // 旧客户端不传 status 但始终带结束日期：兼容解释为已知结束；
  // 缺 status 也缺结束日期的写入保守落为结束日期不详，绝不隐含进行中。
  if (data.status === undefined || data.status === null || data.status === '') {
    return isValidDateString(data.endDate) ? 'known-end' : 'unknown-end'
  }
  return PERIOD_STATUS_VALUES.has(data.status) ? data.status : null
}

function normalizeMemoryRecord(data, { today = '' } = {}) {
  if (!isValidDateString(data.date)) return { code: -1, msg: '欢乐时光日期格式不正确' }
  if (data.date > today) return { code: -1, msg: '日期不能晚于今天' }

  return {
    code: 0,
    data: {
      date: data.date,
      note: normalizeNote(data.note)
    }
  }
}

function stripReservedFields(rawData) {
  const data = { ...(rawData || {}) }
  RESERVED_FIELDS.forEach(key => {
    delete data[key]
  })
  return data
}

function normalizeNote(note) {
  if (note === undefined || note === null) return ''
  return String(note).slice(0, MAX_NOTE_LENGTH)
}

function normalizeSymptoms(symptoms) {
  if (!Array.isArray(symptoms)) return []

  const seen = new Set()
  const normalized = []
  symptoms.forEach(value => {
    if (!SYMPTOM_VALUES.has(value) || seen.has(value)) return
    seen.add(value)
    normalized.push(value)
  })
  return normalized
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
}

function daysBetween(startDate, endDate) {
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  return Math.round((end - start) / (24 * 60 * 60 * 1000))
}

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

module.exports = {
  ALLOWED_COLLECTIONS,
  FLOW_VALUES,
  SYMPTOM_VALUES,
  PERIOD_STATUS_VALUES,
  createRoomRecords,
  normalizeRecord
}
