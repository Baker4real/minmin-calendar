const util = require('./util')

/**
 * 月份键（issue #107）：记录日期（合法 YYYY-MM-DD）所属的公历月份 = 日期前 7 位（YYYY-MM）。
 * 分组模块与页面保存通知（period.js applyRecordChange）共用，避免各自内联日期切片
 */
function monthKey(date) {
  return date.slice(0, 7)
}

// 卡头摘要：该月按从新到旧排列后的第一条写下的备注，折成单行。空白备注跳过
function firstNoteExcerpt(records) {
  for (const record of records) {
    const excerpt = String(record.note || '').replace(/\s+/g, ' ').trim()
    if (excerpt) return excerpt
  }
  return ''
}

// 展开选择的两个取值（issue #109）：页面内存按月份键记「用户点过卡头」的月份，
// 值只有这两个；收敛为模块常量，页面写选择与这里的展开推导共用同一对值
const EXPANDED = 'expanded'
const COLLAPSED = 'collapsed'
// 没被手动点过的月份：最近三个有记录的月份默认展开（issue #143，修订 #109 的「只展开最近一个月」）
const DEFAULT_EXPANDED_MONTHS = 3

/**
 * 欢乐时光月份分组（Memory month group，issue #108/#107）：
 * 「记录」tab 欢乐时光分段的显示结构——同一公历月份的 Memory record 放进一张月份卡。
 * 这只是显示归组，不是一种新记录：每条记录保留自己的日期，每月不存任何数据。
 * 条数口径 = 日期落在该月的记录条数，与首页 Monthly recap / 小结的同月计数一致。
 * 分组前提与列表一致：日期都是云端写入时校验过的合法 YYYY-MM-DD。
 * 读屏名（ariaLabel）带展开状态，由 applyMemoryMonthExpansion 独家产出；build 不写死。
 */
function buildMemoryMonthGroups(memories, options = {}) {
  const today = options.today
  const records = Array.isArray(memories) ? memories : []
  const groupsByKey = new Map()

  for (const memory of records) {
    const date = memory.date
    const key = monthKey(date)
    let group = groupsByKey.get(key)
    if (!group) {
      group = {
        key,
        year: Number(date.slice(0, 4)),
        month: Number(date.slice(5, 7)),
        count: 0,
        records: []
      }
      groupsByKey.set(key, group)
    }
    group.count += 1
    const row = {
      _id: memory._id,
      date,
      note: memory.note || '',
      dayLabel: util.formatDisplayDate(date, { today })
    }
    if (memory.authorLabel) row.authorLabel = memory.authorLabel
    group.records.push(row)
  }

  // 月份从新到旧；组内从新到旧（同一天多条保持原有相对顺序）
  return [...groupsByKey.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map(group => {
      const records = [...group.records].sort((a, b) => b.date.localeCompare(a.date))
      return {
        ...group,
        records,
        excerpt: firstNoteExcerpt(records),
        title: `${group.year}年${group.month}月 · ${group.count} 条`
      }
    })
}

/**
 * 展开推导（issue #109，默认窗口由 #143 改为三个月）：月份卡的展开/收起是显示状态，
 * 不进数据、不落本地存储。默认展开最近三个有记录的月份（不足三个则全部展开；
 * 本月没记录时窗口从最近一个有记录的月份往回数）。
 * 用户手动点过卡头的月份按月份键覆盖（页面内存持有 choices，见 period.js）。
 * 出现更新的月份时窗口前移：仍落在窗口里、且没点过的月份保持展开；
 * 被挤出窗口、且没点过的月份收起。手动展开或收起的月份不因窗口移动而改口。
 * 幂等：对已装饰的分组重复应用结果不变（toggle 只翻转目标月份的选择）。
 * 卡头读屏名「YYYY年M月，N 条欢乐时光，已展开/已收起」由本函数独家产出——
 * 展开态只有这里有，build 不写死一版再被覆写。
 */
function applyMemoryMonthExpansion(groups, choices) {
  const manual = choices || {}
  return (Array.isArray(groups) ? groups : []).map((group, index) => {
    const expanded = Object.prototype.hasOwnProperty.call(manual, group.key)
      ? manual[group.key] === EXPANDED
      : index < DEFAULT_EXPANDED_MONTHS
    const status = expanded ? '已展开' : '已收起'
    const detail = !expanded && group.excerpt ? `${group.excerpt}，${status}` : status
    return {
      ...group,
      expanded,
      toggleLabel: expanded ? '收起' : '展开',
      ariaLabel: `${group.year}年${group.month}月，${group.count} 条欢乐时光，${detail}`
    }
  })
}

module.exports = {
  monthKey,
  EXPANDED,
  COLLAPSED,
  buildMemoryMonthGroups,
  applyMemoryMonthExpansion
}
