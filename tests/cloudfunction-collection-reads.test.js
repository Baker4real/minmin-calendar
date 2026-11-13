const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { trackedFiles } = require('./tools/verify.cjs')

// 云函数集合读取的条数检查（#190）：锁定的 SDK 在 get() 未指定条数时只取 100 条，指定时单次最多 1000 条，
// 超出的记录被静默截掉。云函数源码里每次集合读取（无参的 get() 调用）必须满足其一：
// 1. 链上写出整数条数上限，且不超过平台单次上限 1000（limit(0) 等于没写，取 100 条）；
// 2. 按记录标识读取单条：doc(id).get()；
// 3. 位于下面登记的分页读取函数内，它的取全行为由处理器测试守住。
// 目前云函数只用 get() 读集合；以后用 aggregate 等其他方式读取时，先扩展这条检查。

const repoRoot = path.join(__dirname, '..')
const PLATFORM_MAX_LIMIT = 1000

// 登记的分页读取函数：文件 → 函数名 → 为什么它可以不写数字上限
const PAGED_READERS = {
  'cloudfunctions/dataOp/roomRecords.js': {
    readAllPages: '按 LIST_PAGE_SIZE 逐页读到不满一页为止；取全、跨页不重不漏、某页失败整次失败由 tests/data-op-list.test.js 验证'
  }
}

function cloudFunctionSources() {
  return trackedFiles(repoRoot).filter(file => /^cloudfunctions\/.+\.(?:c|m)?js$/.test(file))
}

// 每次集合读取：所在行、读取链原文、分类（limited / by-id / paged / unbounded）
function collectionReads(source, pagedFunctions = []) {
  const code = codeOnly(source)
  const pagedRanges = pagedFunctions.map(name => {
    const range = functionBodyRange(code, name)
    if (!range) throw new Error(`没有找到登记的分页读取函数 ${name}`)
    return range
  })
  return [...code.matchAll(/\.\s*get\s*\(\s*\)/g)].map(match => {
    const start = receiverStart(code, match.index)
    const calls = chainCalls(code.slice(start, match.index))
    return {
      line: code.slice(0, match.index).split('\n').length,
      chain: source.slice(start, match.index + match[0].length).replace(/\s+/g, ' '),
      kind: classify(calls, match.index, pagedRanges)
    }
  })
}

function classify(calls, index, pagedRanges) {
  const last = calls[calls.length - 1]
  if (last && last.name === 'doc') return 'by-id'
  const limit = calls.find(call => call.name === 'limit')
  if (limit && /^\d+$/.test(limit.args) && Number(limit.args) >= 1 && Number(limit.args) <= PLATFORM_MAX_LIMIT) {
    return 'limited'
  }
  if (pagedRanges.some(([open, close]) => index > open && index < close)) return 'paged'
  return 'unbounded'
}

// 注释和字符串内容换成空格，保留换行与位置；云函数源码里的正则字面量不含引号或 //，原样保留
function codeOnly(source) {
  let out = ''
  let state = 'code'
  let quote = ''
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    const next = source[i + 1]
    if (state === 'code') {
      if (ch === '/' && (next === '/' || next === '*')) {
        state = next === '/' ? 'line' : 'block'
        out += '  '
        i += 1
      } else {
        if (ch === '\'' || ch === '"' || ch === '`') {
          state = 'string'
          quote = ch
        }
        out += ch
      }
    } else if (state === 'line') {
      if (ch === '\n') state = 'code'
      out += ch === '\n' ? ch : ' '
    } else if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code'
        out += '  '
        i += 1
      } else {
        out += ch === '\n' ? ch : ' '
      }
    } else if (ch === '\\') {
      out += ' ' + (next === '\n' ? '\n' : ' ')
      i += 1
    } else {
      if (ch === quote) state = 'code'
      out += ch === quote || ch === '\n' ? ch : ' '
    }
  }
  if (state === 'block' || state === 'string') throw new Error(`源码在${state === 'block' ? '块注释' : '字符串'}里结束，无法检查`)
  return out
}

// 从 .get() 的点号往回找读取链的起点：标识符、成员访问、调用和下标，链内可换行
function receiverStart(code, dotIndex) {
  let start = dotIndex
  for (;;) {
    const end = lastNonSpace(code, start - 1)
    let k = end
    let segmentStart = end + 1
    while (code[k] === ')' || code[k] === ']') {
      k = matchingOpen(code, k)
      segmentStart = k
      k -= 1
    }
    while (k >= 0 && /[\w$]/.test(code[k])) {
      segmentStart = k
      k -= 1
    }
    if (segmentStart > end) return start
    const join = lastNonSpace(code, segmentStart - 1)
    if (code[join] !== '.') return segmentStart
    start = join
  }
}

// 链上第一层的方法调用：名字和参数原文（参数里的嵌套调用不算）
function chainCalls(chain) {
  const calls = []
  let depth = 0
  for (let i = 0; i < chain.length; i += 1) {
    const ch = chain[i]
    if ('([{'.includes(ch)) depth += 1
    else if (')]}'.includes(ch)) depth -= 1
    else if (ch === '.' && depth === 0) {
      const call = /^\.\s*([\w$]+)\s*\(/.exec(chain.slice(i))
      if (call) {
        const open = i + call[0].length - 1
        calls.push({ name: call[1], args: chain.slice(open + 1, matchingClose(chain, open)).trim() })
      }
    }
  }
  return calls
}

function functionBodyRange(code, name) {
  const declaration = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(code)
  if (!declaration) return null
  const paramsClose = matchingClose(code, declaration.index + declaration[0].length - 1)
  const bodyOpen = code.indexOf('{', paramsClose)
  return [bodyOpen, matchingClose(code, bodyOpen)]
}

function lastNonSpace(code, index) {
  let k = index
  while (k >= 0 && /\s/.test(code[k])) k -= 1
  return k
}

function matchingOpen(code, close) {
  let depth = 0
  for (let i = close; i >= 0; i -= 1) {
    if (')]}'.includes(code[i])) depth += 1
    else if ('([{'.includes(code[i])) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  throw new Error(`括号不配对：位置 ${close}`)
}

function matchingClose(code, open) {
  let depth = 0
  for (let i = open; i < code.length; i += 1) {
    if ('([{'.includes(code[i])) depth += 1
    else if (')]}'.includes(code[i])) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  throw new Error(`括号不配对：位置 ${open}`)
}

test('every collection read in cloud function source has a row limit, reads one record by id, or sits in a registered paging function', () => {
  const files = cloudFunctionSources()
  assert.notEqual(files.length, 0)
  const violations = []
  let readCount = 0
  for (const file of files) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    for (const read of collectionReads(source, Object.keys(PAGED_READERS[file] || {}))) {
      readCount += 1
      if (read.kind === 'unbounded') violations.push(`${file}:${read.line} ${read.chain}`)
    }
  }
  assert.ok(readCount > 0, '没有找到任何集合读取：检查是否还能识别 get() 读取链')
  assert.deepEqual(violations, [], '这些读取会被平台静默截到 100 条（或 1000 条）：写出不超过 1000 的整数条数、改成 doc(id).get()，或放进登记的分页读取函数')
})

test('registered paging functions are tracked cloud function source and still read inside their body', () => {
  const files = new Set(cloudFunctionSources())
  for (const [file, functions] of Object.entries(PAGED_READERS)) {
    assert.ok(files.has(file), `${file} 不是入库的云函数源码：删掉这条登记`)
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8')
    for (const [name, reason] of Object.entries(functions)) {
      assert.ok(reason.trim(), `${file} 的 ${name} 要写明登记原因`)
      const paged = collectionReads(source, [name]).filter(read => read.kind === 'paged')
      assert.notEqual(paged.length, 0, `${file} 的 ${name} 里已经没有分页读取：删掉这条登记`)
    }
  }
})

test('the classifier flags unlimited reads and accepts row limits, single reads by id and registered paging functions', () => {
  const sample = [
    'async function readAllPages(query) {',
    '  const page = await query.skip(offset).limit(PAGE_SIZE).get()',
    '}',
    'async function list() {',
    '  const res = await db.collection(name)',
    '    .where({ roomCode })',
    "    .orderBy(field, 'desc')",
    '    .get()',
    "  const rooms = await db.collection('rooms').where({ roomCode }).limit(100).get()",
    '  const one = await collection.doc(id).get()',
    "  const capped = await db.collection('x').limit(5000).get()",
    "  const zero = await db.collection('x').limit(0).get()",
    "  const named = await db.collection('x').limit(PAGE_SIZE).get()",
    "  const nested = await db.collection('x').where({ a: b.limit(5) }).get()",
    '  const cached = memo.get(key)',
    '  // 注释里的 db.collection(name).get() 不算读取',
    "  const text = 'db.collection(name).get()'",
    '}'
  ].join('\n')

  assert.deepEqual(collectionReads(sample, ['readAllPages']).map(read => [read.line, read.kind]), [
    [2, 'paged'],
    [8, 'unbounded'],
    [9, 'limited'],
    [10, 'by-id'],
    [11, 'unbounded'],
    [12, 'unbounded'],
    [13, 'unbounded'],
    [14, 'unbounded']
  ])
  assert.equal(collectionReads(sample)[1].chain, "db.collection(name) .where({ roomCode }) .orderBy(field, 'desc') .get()")
  assert.throws(() => collectionReads(sample, ['readEverything']), /没有找到登记的分页读取函数 readEverything/)
})
