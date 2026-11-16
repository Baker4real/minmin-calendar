const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { PUBLISHED_HOLIDAY_RANGES } = require('../utils/chinaHolidays')
const { generateHolidayRanges } = require('./tools/generateHolidays.cjs')

function upstreamYear(year) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/holiday-cn', `${year}.json`), 'utf8'))
}

function publishedRanges(year) {
  return PUBLISHED_HOLIDAY_RANGES.filter(range => range.start.startsWith(`${year}-`))
}

test('holiday generator reproduces the published 2025 and 2026 ranges from local upstream fixtures', () => {
  for (const year of [2025, 2026]) {
    assert.deepEqual(generateHolidayRanges(upstreamYear(year)), publishedRanges(year))
  }
})

test('published 2027 ranges match the local upstream fixture', () => {
  assert.deepEqual(publishedRanges(2027), generateHolidayRanges(upstreamYear(2027)))
})
