const assert = require('node:assert/strict')
const test = require('node:test')

test('indexTests extracts single, double and nested template literal test titles with exact line numbers', async () => {
  const { extractTestTitles } = await import('./tools/indexTests.mjs')
  const fixture = [
    '// test("commented out title", () => {})',
    '/* test(\'block commented\', () => {}) */',
    "test('single quoted \\'escaped\\'', () => {})",
    'test("double quoted", () => {})',
    'obj.test("method call ignored", () => {})',
    'test(`${a} × ${b}${c ? ` (${c.kind})` : \'\'}: nested template`, () => {})',
  ].join('\n')

  assert.deepEqual(extractTestTitles(fixture), [
    { line: 3, title: "single quoted \\'escaped\\'", template: false },
    { line: 4, title: 'double quoted', template: false },
    { line: 6, title: "${a} × ${b}${c ? ` (${c.kind})` : ''}: nested template", template: true },
  ])
})

test('indexTests reads the real nested template title in room-failure-presentation.test.js without truncation', async () => {
  const { indexTestFiles } = await import('./tools/indexTests.mjs')
  const indexed = indexTestFiles({ files: ['tests/room-failure-presentation.test.js'] })
  const list = indexed['tests/room-failure-presentation.test.js']
  assert.equal(list.length, 2)
  assert.equal(list[0].template, true)
  assert.equal(list[0].title, '${operation}: ${unavailable} falls back to the same advice without navigating or retrying')
  assert.equal(list[1].template, true)
  assert.equal(
    list[1].title,
    "${scenario.failure} × ${spec.operation}${spec.record ? ` (${spec.record.kind})` : ''}: form, copy and actual recovery"
  )
  assert.ok(list[1].line > list[0].line)
})
