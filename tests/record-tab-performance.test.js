const assert = require('node:assert/strict')
const test = require('node:test')

test('record performance fixture builds bounded multi-month data and deterministic thresholds', async () => {
  const { buildRecords, median, shouldLazyMount, performanceDecision } = await import('./tools/recordTabPerformance.mjs')
  for (const total of [500, 1000]) {
    const records = buildRecords(total, '2026-11-27')
    assert.equal(records.periods.length + records.memories.length, total)
    assert.ok(new Set(records.memories.map(record => record.date.slice(0, 7))).size >= 24)
    assert.ok(new Set(records.periods.map(record => record.startDate.slice(0, 7))).size >= 24)
    assert.ok(records.periods.every(record => record._id.startsWith('standin-')))
    assert.ok(records.memories.every(record => record._id.startsWith('standin-')))
  }
  assert.equal(median([5, 1, 3]), 3)
  assert.equal(median([10, 2, 4, 8]), 6)
  assert.equal(shouldLazyMount({ readyMs: 1500, segmentMs: 300 }), false)
  assert.equal(shouldLazyMount({ readyMs: 1500.01, segmentMs: 100 }), true)
  assert.equal(shouldLazyMount({ readyMs: 100, segmentMs: 300.01 }), true)
  assert.equal(performanceDecision({ readyMs: 1600, segmentMs: 100 }, 'eager'), 'lazy-mount-required')
  assert.equal(performanceDecision({ readyMs: 1600, segmentMs: 100 }, 'lazy'), 'lazy-mounted-above-threshold')
  assert.equal(performanceDecision({ readyMs: 100, segmentMs: 100 }, 'lazy'), 'keep-mounted')
})
