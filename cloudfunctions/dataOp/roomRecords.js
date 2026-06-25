const ALLOWED_COLLECTIONS = ['periods', 'memories']
const RESERVED_FIELDS = ['_id', 'roomCode', 'createdBy', 'createdAt']
const PERIOD_FIELDS = ['startDate', 'endDate', 'note', 'duration', 'flow', 'symptoms']
const MEMORY_FIELDS = ['date', 'note']
const FLOW_VALUES = new Set(['light', 'normal', 'heavy'])
const SYMPTOM_VALUES = new Set(['cramps', 'headache', 'tired', 'mood', 'sleep', 'acne', 'cravings'])
const MAX_NOTE_LENGTH = 500

function createRoomRecords({ db, serverDate }) {
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
      const normalized = normalizeRecord(collection, data)
      if (normalized.code !== 0) return normalized

      const payload = {
        ...normalized.data,
        roomCode,
        createdBy: openid,
        createdAt: serverDate()
      }
      const res = await db.collection(collection).add({ data: payload })
      return { code: 0, id: res._id }
    },

    async update({ collection, roomCode, id, data }) {
      const existing = await findRecord(collection, roomCode, id)
      if (!existing) return { code: -1, msg: '记录不存在或无权修改' }

      const normalized = normalizeRecord(collection, data)
      if (normalized.code !== 0) return normalized

      await db.collection(collection).doc(id).update({ data: normalized.data })
      return { code: 0 }
    },

    async remove({ collection, roomCode, id }) {
      const existing = await findRecord(collection, roomCode, id)
      if (!existing) return { code: -1, msg: '记录不存在或无权删除' }

      await db.collection(collection).doc(id).remove()
      return { code: 0 }
    }
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

function normalizeRecord(collection, rawData) {
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
    ? normalizePeriodRecord(data)
    : normalizeMemoryRecord(data)
}

function normalizePeriodRecord(data) {
  const startDate = data.startDate
  const endDate = data.endDate

  if (!isValidDateString(startDate)) return { code: -1, msg: '经期开始日期格式不正确' }
  if (!isValidDateString(endDate)) return { code: -1, msg: '经期结束日期格式不正确' }
  if (startDate > endDate) return { code: -1, msg: '结束日期不能早于开始日期' }

  return {
    code: 0,
    data: {
      startDate,
      endDate,
      note: normalizeNote(data.note),
      duration: daysBetween(startDate, endDate) + 1,
      flow: FLOW_VALUES.has(data.flow) ? data.flow : '',
      symptoms: normalizeSymptoms(data.symptoms)
    }
  }
}

function normalizeMemoryRecord(data) {
  if (!isValidDateString(data.date)) return { code: -1, msg: '欢乐时光日期格式不正确' }

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
  createRoomRecords,
  normalizeRecord
}
