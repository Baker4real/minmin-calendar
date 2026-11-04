const assert = require('node:assert/strict')
const test = require('node:test')

const { buildMemoryMonthGroups } = require('../utils/memoryMonthGroups')

function rowsById(groups) {
  return Object.fromEntries(groups.flatMap(group => group.records).map(row => [row._id, row]))
}

// issue #157：「记录」tab 欢乐时光月份列表的每一行，读屏名说出日期、非空备注的短摘要，
// 房间已配对时（页面给行加了作者标签）再说出作者；空白备注不留多余标点；可见字段不变
test('memory month rows read out the date, a short note and the paired author', () => {
  const today = '2026-10-20'
  const longNote = '第一次一起做饭\n结果把锅烧糊了只好叫外卖再看一部电影'

  const paired = rowsById(buildMemoryMonthGroups([
    { _id: 'a1', date: '2026-10-08', note: '海边散步', authorLabel: '我记的' },
    { _id: 'a2', date: '2026-10-08', note: '  ', authorLabel: 'TA 记的' },
    { _id: 'a3', date: '2026-10-02', note: longNote, authorLabel: '我记的' },
    { _id: 'nye', date: '2025-12-31', note: '' }
  ], { today }))
  assert.equal(paired.a1.ariaLabel, '编辑欢乐时光，10月8日，海边散步，我记的')
  assert.equal(paired.a2.ariaLabel, '编辑欢乐时光，10月8日，TA 记的')
  assert.equal(paired.a3.ariaLabel, '编辑欢乐时光，10月2日，第一次一起做饭 结果把锅烧糊了只好叫外卖…，我记的')
  assert.equal(paired.nye.ariaLabel, '编辑欢乐时光，2025年12月31日')
  assert.deepEqual(
    [paired.a1.dayLabel, paired.a1.note, paired.a1.authorLabel],
    ['10月8日', '海边散步', '我记的']
  )
  assert.equal(paired.a3.note, longNote)

  // 未配对：页面不给作者标签，读屏名也不新增作者
  const unpaired = rowsById(buildMemoryMonthGroups([
    { _id: 'a1', date: '2026-10-08', note: '海边散步' },
    { _id: 'a2', date: '2026-10-08', note: '  ' },
    { _id: 'a3', date: '2026-10-02', note: longNote }
  ], { today }))
  assert.equal(unpaired.a1.ariaLabel, '编辑欢乐时光，10月8日，海边散步')
  assert.equal(unpaired.a2.ariaLabel, '编辑欢乐时光，10月8日')
  assert.equal(unpaired.a3.ariaLabel, '编辑欢乐时光，10月2日，第一次一起做饭 结果把锅烧糊了只好叫外卖…')
  assert.equal(unpaired.a1.authorLabel, undefined)
})
