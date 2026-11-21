import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))

function readQuoted(source, start, quote) {
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === quote) return { raw: source.slice(start + 1, i), end: i + 1 }
    i += 1
  }
  return null
}

function readTemplateLiteral(source, start) {
  let i = start + 1
  while (i < source.length) {
    const ch = source[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === '`') return { raw: source.slice(start + 1, i), end: i + 1 }
    if (ch === '$' && source[i + 1] === '{') {
      i += 2
      let depth = 1
      while (i < source.length && depth > 0) {
        const inner = source[i]
        if (inner === "'" || inner === '"') {
          const q = readQuoted(source, i, inner)
          i = q ? q.end : source.length
        } else if (inner === '`') {
          const nested = readTemplateLiteral(source, i)
          i = nested ? nested.end : source.length
        } else if (inner === '/' && source[i + 1] === '/') {
          const nl = source.indexOf('\n', i + 2)
          i = nl === -1 ? source.length : nl + 1
        } else if (inner === '/' && source[i + 1] === '*') {
          const end = source.indexOf('*/', i + 2)
          i = end === -1 ? source.length : end + 2
        } else {
          if (inner === '{') depth += 1
          else if (inner === '}') depth -= 1
          i += 1
        }
      }
      continue
    }
    i += 1
  }
  return null
}

function skipWhitespaceAndComments(source, start) {
  let i = start
  while (i < source.length) {
    if (/\s/.test(source[i])) { i += 1; continue }
    if (source[i] === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i + 2)
      i = nl === -1 ? source.length : nl + 1
      continue
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    break
  }
  return i
}

function lineAt(source, offset) {
  let line = 1
  for (let i = 0; i < offset; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1
  }
  return line
}

// Extract exact `test(<literal>, ...)` definitions with 1-based line numbers, supporting nested template literals.
export function extractTestTitles(source) {
  const entries = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i + 2)
      i = nl === -1 ? source.length : nl + 1
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
      continue
    }
    if (ch === "'" || ch === '"') {
      const q = readQuoted(source, i, ch)
      i = q ? q.end : source.length
      continue
    }
    if (ch === '`') {
      const t = readTemplateLiteral(source, i)
      i = t ? t.end : source.length
      continue
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const idStart = i
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i += 1
      const ident = source.slice(idStart, i)
      const prevChar = idStart > 0 ? source[idStart - 1] : ''
      if (ident === 'test' && prevChar !== '.' && !/[A-Za-z0-9_$]/.test(prevChar)) {
        let cursor = skipWhitespaceAndComments(source, i)
        if (source[cursor] === '(') {
          cursor = skipWhitespaceAndComments(source, cursor + 1)
          const open = source[cursor]
          if (open === "'" || open === '"') {
            const q = readQuoted(source, cursor, open)
            if (q) {
              entries.push({ line: lineAt(source, idStart), title: q.raw, template: false })
              i = q.end
              continue
            }
          } else if (open === '`') {
            const t = readTemplateLiteral(source, cursor)
            if (t) {
              entries.push({ line: lineAt(source, idStart), title: t.raw, template: true })
              i = t.end
              continue
            }
          }
        }
      }
      continue
    }
    i += 1
  }
  return entries
}

export function indexTestFiles({ root = repoRoot, files = null } = {}) {
  const testDir = path.join(root, 'tests')
  const selected = files
    ? files.map(file => file.replace(/\\/g, '/'))
    : readdirSync(testDir).filter(name => name.endsWith('.test.js')).sort().map(name => `tests/${name}`)
  const index = {}
  for (const rel of selected) {
    const source = readFileSync(path.join(root, rel), 'utf8')
    index[rel] = extractTestTitles(source)
  }
  return index
}

function main(argv = process.argv.slice(2)) {
  const files = []
  let search = ''
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--file' && argv[i + 1]) files.push(argv[++i])
    else if (arg === '--search' && argv[i + 1]) search = argv[++i]
    else throw new Error('Usage: indexTests.mjs [--file tests/a.test.js ...] [--search text]')
  }
  const index = indexTestFiles({ files: files.length ? files : null })
  if (search) {
    const needle = search.toLowerCase()
    const hits = []
    for (const [file, list] of Object.entries(index)) {
      for (const entry of list) {
        if (entry.title.toLowerCase().includes(needle)) hits.push({ file, ...entry })
      }
    }
    console.log(JSON.stringify(hits, null, 2))
    return
  }
  console.log(JSON.stringify(index, null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
