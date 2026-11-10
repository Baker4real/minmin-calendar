const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { trackedFiles } = require('./tools/verify.cjs')

// 测试 seam 守护检查（#169）：页面测试只经两个 seam 观察行为——共享的微信平台 harness 和 Calendar projection 表格。
// 下面三种写法把测试绑在实现上，重构一动测试就得跟着改。这里逐个数 tests/ 下入库的 JS 文件（测试和 helper，
// 共享 harness 也在内，旧写法挪进 helper 照样计数），和 BUDGET 对账：
// 多了就红，别把旧写法带进新测试；少了也红，迁移有进展，把预算调到新数锁住。
// 计数是逐行的启发式，前后一致就能当棘轮用。#185 收口时 BUDGET 应为空；确属合理的例外移进 EXEMPT 并写明原因。

const repoRoot = path.join(__dirname, '..')
const SELF = 'tests/test-seam-guardrail.test.js'

const PATTERNS = {
  // 改写模块加载器，用替身顶掉应用自己的 module（改写与还原各算一次）
  moduleLoad: /\bModule\._load\s*=(?!=)/g,
  // 读写页面实例的下划线私有字段或方法
  privateField: /\b(?:[A-Za-z]*[Pp]age|instance)\._[A-Za-z]\w*/g,
  // 读取 JS 源码文本，随后对它做正则或字符串断言；读 WXML / WXSS、列目录不算
  jsSourceRead: /\bread(?!dir)\w*\([^;\n]*?['"`][^'"`\n]*\.js['"`]/g
}

// 2026-11-08 入库时的计数。#170–#175 迁移页面测试时把对应的数调低，调到 0 就删掉这一项。
const BUDGET = {
  'tests/calendar-display.test.js': { moduleLoad: 3, jsSourceRead: 7 },
  'tests/index-page.test.js': { moduleLoad: 3, privateField: 6, jsSourceRead: 2 },
  'tests/interaction-semantics.test.js': { jsSourceRead: 1 },
  'tests/narrow-screen-geometry.test.js': { jsSourceRead: 6 },
  'tests/page-registration.test.js': { moduleLoad: 3 },
  'tests/record-draft.test.js': { moduleLoad: 3 },
  'tests/record-flow.test.js': { moduleLoad: 3, privateField: 2, jsSourceRead: 14 },
  'tests/settings-flow.test.js': { moduleLoad: 3, jsSourceRead: 7 }
}

// 不计入的合理例外：文件 → 写法 → 原因。
const EXEMPT = {
  'tests/cloudfunction-dependencies.test.js': {
    jsSourceRead: '查的是 Room 生命周期云函数的部署打包：每个云函数入口只能加载本地生成的副本，不是小程序页面行为'
  }
}

function countPatterns(text) {
  return Object.fromEntries(Object.entries(PATTERNS).map(([key, pattern]) => [key, (text.match(pattern) || []).length]))
}

function trackedTestCode() {
  return trackedFiles(repoRoot).filter(file => /^tests\/.+\.(?:c|m)?js$/.test(file) && file !== SELF)
}

test('page tests stay on the #169 seams: legacy pattern counts match the ratchet budget', () => {
  const drift = []
  for (const file of trackedTestCode()) {
    const counts = countPatterns(fs.readFileSync(path.join(repoRoot, file), 'utf8'))
    for (const [key, actual] of Object.entries(counts)) {
      if (EXEMPT[file] && EXEMPT[file][key]) continue
      const budget = (BUDGET[file] && BUDGET[file][key]) || 0
      if (actual > budget) {
        drift.push(`${file} ${key}: ${actual} > 预算 ${budget}。新测试不再用这种写法，改经共享微信平台 harness 或 projection 表格观察行为（#169 Testing Decisions）`)
      } else if (actual < budget) {
        drift.push(`${file} ${key}: ${actual} < 预算 ${budget}。迁移有进展，把 BUDGET 里的数调到 ${actual}；调到 0 就删掉这一项`)
      }
    }
  }
  assert.deepEqual(drift, [])
})

test('the budget and exemptions name tracked files under tests/, known patterns and nonzero counts', () => {
  const tracked = new Set(trackedTestCode())
  for (const [file, counts] of Object.entries(BUDGET)) {
    assert.ok(tracked.has(file), `${file} 不是 tests/ 下入库的 JS 文件：删掉这条预算`)
    for (const [key, value] of Object.entries(counts)) {
      assert.ok(key in PATTERNS, `${file} 的预算里有未知写法 ${key}`)
      assert.ok(value > 0, `${file} 的 ${key} 预算是 0：删掉这一项`)
    }
  }
  for (const [file, reasons] of Object.entries(EXEMPT)) {
    assert.ok(tracked.has(file), `${file} 不是 tests/ 下入库的 JS 文件：删掉这条例外`)
    for (const [key, reason] of Object.entries(reasons)) {
      assert.ok(key in PATTERNS, `${file} 的例外里有未知写法 ${key}`)
      assert.ok(reason.trim(), `${file} 的 ${key} 例外要写明原因`)
    }
  }
})

test('the counters see each legacy pattern and leave page loads, WXML reads, JSON reads and directory listings alone', () => {
  const sample = [
    'Module._load = function patchedLoad () {}',
    'Module._load = originalLoad',
    'if (Module._load === originalLoad) {}',
    'page._homeRecords.periods.push(record)',
    'assert.equal(indexPage._syncState.synced, true)',
    "instance._draftKey = ''",
    'page.data._hidden = 1',
    "const js = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')",
    'const copy = readRepo(`${pagePath}.js`)',
    "const wxml = readPage('pages/index/index.wxml')",
    "const pkg = fs.readFileSync('package.json', 'utf8')",
    "const names = fs.readdirSync(dir).filter(name => name.endsWith('.test.js'))",
    "require('../pages/index/index.js')"
  ].join('\n')
  assert.deepEqual(countPatterns(sample), { moduleLoad: 2, privateField: 3, jsSourceRead: 2 })
})
