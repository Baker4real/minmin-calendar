// 云数据库替身：按仓库锁定的 wx-server-sdk 3.0.4（@cloudbase/database 1.4.1）的读取行为建模。
// - get() 没指定条数时最多返回 100 条；指定条数时单次不超过 1000 条（SDK Query.get 里的 param.limit）。
// - orderBy 可连续调用，按调用先后合成一个复合排序；skip 设偏移；链上每一步返回新查询，原查询不变。
// - 读取失败时 get() 的 promise 被拒绝（wx-server-sdk 遇到错误码会抛出），这次读取没有任何结果。
// - 排序键相同的记录，平台不保证每次读取的先后一致：替身每读一次就换一种次序（存入顺序与其倒序交替），
//   所以排序不是全序时，跨页读取会重复或漏掉记录。
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000
const ORDER_DIRECTIONS = { asc: 1, desc: -1 }

function createCloudDatabase(collections = {}, hooks = {}) {
  const data = {}
  Object.entries(collections).forEach(([name, records]) => {
    data[name] = clone(records || [])
  })
  const readCounts = {}
  let hasNextUpdateResult = false
  let nextUpdateResult

  function consumeUpdateResult(defaultResult) {
    if (!hasNextUpdateResult) return defaultResult
    hasNextUpdateResult = false
    return nextUpdateResult
  }

  function recordsOf(name) {
    if (!data[name]) data[name] = []
    return data[name]
  }

  function createQuery(name, state) {
    const records = recordsOf(name)
    const matches = record => Object.keys(state.filter).every(key => record[key] === state.filter[key])
    const next = change => createQuery(name, { ...state, ...change })

    return {
      where(filter) {
        return next({ filter: { ...filter } })
      },
      orderBy(field, direction) {
        if (!(direction in ORDER_DIRECTIONS)) throw new Error(`orderBy direction must be asc or desc: ${direction}`)
        return next({ order: { ...state.order, [field]: ORDER_DIRECTIONS[direction] } })
      },
      skip(offset) {
        if (!Number.isInteger(offset)) throw new Error('offset must be an integer')
        return next({ offset })
      },
      limit(count) {
        if (!Number.isInteger(count)) throw new Error('limit must be an integer')
        return next({ limit: count })
      },
      async get() {
        if (hooks.beforeGet) {
          hooks.beforeGet({ collection: name, query: clone(state.filter), offset: state.offset, limit: state.limit })
        }
        readCounts[name] = (readCounts[name] || 0) + 1
        const matched = records.filter(matches)
        const tieOrder = readCounts[name] % 2 === 0 ? matched.reverse() : matched
        const sorted = tieOrder.sort(compareByOrder(state.order))
        const pageSize = state.limit ? Math.min(state.limit, MAX_LIMIT) : DEFAULT_LIMIT
        return { data: clone(sorted.slice(state.offset, state.offset + pageSize)) }
      },
      // 条件更新：服务端按当前数据匹配 where 后整批写入
      async update({ data: changes }) {
        if (hooks.beforeWhereUpdate) hooks.beforeWhereUpdate({ records, query: state.filter })
        const matched = records.filter(matches)
        matched.forEach(record => Object.assign(record, clone(changes)))
        return { stats: { updated: matched.length } }
      }
    }
  }

  return {
    data,
    setNextUpdateResult(result) {
      hasNextUpdateResult = true
      nextUpdateResult = result
    },
    collection(name) {
      const records = recordsOf(name)
      return {
        ...createQuery(name, { filter: {}, order: {}, offset: 0, limit: undefined }),
        async add({ data: payload }) {
          if (hooks.beforeAdd) hooks.beforeAdd({ records, data: payload })
          const id = `${name}-${records.length + 1}`
          records.push({ _id: id, ...clone(payload) })
          return { _id: id }
        },
        doc(id) {
          return {
            async update({ data: changes }) {
              if (hooks.beforeUpdate) hooks.beforeUpdate({ records, id })
              const record = records.find(item => item._id === id)
              const changed = record && Object.keys(changes).some(key =>
                JSON.stringify(record[key]) !== JSON.stringify(changes[key])
              )
              if (record) Object.assign(record, clone(changes))
              return consumeUpdateResult({ stats: { updated: changed ? 1 : 0 } })
            },
            async remove() {
              const index = records.findIndex(item => item._id === id)
              if (index >= 0) records.splice(index, 1)
              return {}
            }
          }
        }
      }
    }
  }
}

function compareByOrder(order) {
  const keys = Object.entries(order)
  return (left, right) => {
    for (const [field, direction] of keys) {
      const a = sortValue(left[field])
      const b = sortValue(right[field])
      if (a !== b) return (a < b ? -1 : 1) * direction
    }
    return 0
  }
}

// 缺字段的记录排在最小值处（倒序时排在最后），与平台对缺失字段的排序一致
function sortValue(value) {
  return value === undefined || value === null ? '' : String(value)
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  createCloudDatabase
}
