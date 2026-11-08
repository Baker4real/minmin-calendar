// 为视觉审计提供按组件裁剪的只读证据；用法见 README.md Verification。

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { classifyCaptureEvidence, fingerprintRuntimeSources } from './tools/captureEvidence.mjs'

const COMPONENTS = {
  calendar: {
    label: '日历日期、今天与记录标记',
    sources: ['app.wxss', 'pages/index/index.wxml', 'pages/index/index.wxss', 'pages/index/index.js'],
    terms: ['.day-cell.today', '.period-band', '.day-num', '.day-lunar', 'isToday', 'CALENDAR_LEGEND_ITEMS', '今天', '经期'],
    selectors: ['day-cell', 'today', 'period-band', 'day-num', 'day-lunar'],
    motion: ['day-cell', 'day-num', 'period-band', 'calendar'],
    routes: ['pages/index/index']
  },
  atmosphere: {
    label: '极光、玻璃与色彩材质',
    sources: ['app.wxss', 'pages/index/index.wxml', 'pages/index/index.wxss'],
    terms: ['.premium-card', '.glow-orb', '.aurora', '--glass', '--rose', '极光', '玻璃', 'Colors'],
    selectors: ['premium-card', 'glow-orb', 'header-gradient'],
    motion: ['page', 'glow-orb', 'header-gradient', 'premium-card'],
    routes: ['pages/index/index']
  },
  typography: {
    label: '字体、数字与信息层级',
    sources: ['app.wxss', 'pages/index/index.wxss', 'pages/period/period.wxss', 'pages/memory/memory.wxss'],
    terms: ['--font-size-', '--font-weight-', '--line-height-', '--letter-spacing-', '.day-num', '.stat-num', 'Typography'],
    selectors: ['month-title', 'day-num', 'stat-num', 'cycle-num'],
    motion: [],
    routes: []
  },
  sheets: {
    label: '月份选择、底部弹层与按触反馈',
    sources: ['app.wxss', 'pages/index/index.wxml', 'pages/index/index.wxss', 'pages/index/index.js', 'pages/settings/settings.wxss'],
    terms: ['.sheet-slide', '.day-sheet-mask', '.jump-', 'sheetLifecycle', '--duration-sheet', '弹层', 'Pressed'],
    selectors: ['sheet-slide', 'day-sheet-mask', 'sheet-close', 'jump-option', 'jump-year-step'],
    motion: ['sheet', 'mask', 'jump', 'day-detail', 'page-obscured', 'hover', 'btn-'],
    routes: ['pages/index/index', 'pages/settings/settings']
  },
  feedback: {
    label: '同步、记录与品牌反馈',
    sources: ['app.wxss', 'pages/index/index.wxml', 'pages/index/index.wxss', 'pages/bind/bind.wxss', 'pages/period/edit/edit.wxss', 'pages/memory/edit/edit.wxss'],
    terms: ['.sync-pill', '.sync-dot', '.hero-', '.bound-status', 'heroIn', 'bindReveal', '同步胶囊', '成功'],
    selectors: ['sync-pill', 'sync-dot', 'hero-title', 'bound-status', 'btn-premium'],
    motion: ['sync', 'hero', 'bound', 'pulse', 'page', 'btn-'],
    routes: []
  },
  motion: {
    label: '动效注册表与减弱动效',
    sources: ['app.wxss', 'pages/index/index.wxss', 'pages/bind/bind.wxss', 'pages/settings/settings.wxss', 'pages/period/period.wxss', 'pages/memory/memory.wxss'],
    terms: ['--duration-', '--ease-', '@keyframes', 'prefers-reduced-motion', 'auroraPulse', 'heroIn', '动效与性能边界'],
    selectors: ['glow-orb', 'sync-pill', 'sheet-slide', 'hero-title'],
    motion: null,
    routes: []
  }
}

function relative(projectPath, file) {
  return path.relative(projectPath, file).replaceAll(path.sep, '/')
}

function readSource(projectPath, file) {
  const absolute = path.join(projectPath, file)
  if (!existsSync(absolute)) throw new Error(`Audit source missing: ${file}`)
  return { file, text: readFileSync(absolute, 'utf8') }
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length
}

function excerpt(text, index, term) {
  const start = Math.max(0, index - 150)
  const end = Math.min(text.length, index + term.length + 270)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

function designSections(projectPath, terms) {
  const { text } = readSource(projectPath, 'DESIGN.md')
  const lines = text.split('\n')
  const sections = []
  const sectionTerms = new Map()
  let heading = 'DESIGN.md'
  let headingLine = 1
  let paragraph = []
  let paragraphLine = 1

  function collectParagraph() {
    if (!paragraph.length) return
    const body = paragraph.join('\n')
    const matched = terms.filter(term => body.toLowerCase().includes(term.toLowerCase()))
    if (matched.length) {
      const first = matched.map(term => body.toLowerCase().indexOf(term.toLowerCase())).sort((a, b) => a - b)[0]
      const term = matched.find(candidate => body.toLowerCase().indexOf(candidate.toLowerCase()) === first)
      let section = sections.find(item => item.heading === heading && item.line === headingLine)
      if (!section) {
        section = { file: 'DESIGN.md', line: headingLine, heading, matches: [] }
        sections.push(section)
        sectionTerms.set(section, new Set())
      }
      matched.forEach(item => sectionTerms.get(section).add(item))
      if (section.matches.length < 3) {
        section.matches.push({ line: paragraphLine, terms: matched, excerpt: excerpt(body, first, term) })
      }
    }
    paragraph = []
  }

  lines.forEach((line, index) => {
    if (/^#{1,4} /.test(line)) {
      collectParagraph()
      heading = line.replace(/^#{1,4} /, '').trim()
      headingLine = index + 1
    } else if (!line.trim()) {
      collectParagraph()
    } else {
      if (!paragraph.length) paragraphLine = index + 1
      paragraph.push(line)
    }
  })
  collectParagraph()
  // 只留命中关键词种类最多的 8 节（同分取靠前的），输出仍按文档顺序；按文档顺序截断会让后面的专门章节被前文的零星提及挤掉
  const kept = new Set([...sections].sort((a, b) => sectionTerms.get(b).size - sectionTerms.get(a).size).slice(0, 8))
  return sections.filter(section => kept.has(section))
}

function sourceReferences(source, selectors) {
  const references = []
  for (const selector of selectors) {
    const token = selector.replace(/^\./, '')
    const pattern = new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g')
    for (const match of source.text.matchAll(pattern)) {
      references.push({ selector, line: lineAt(source.text, match.index) })
    }
  }
  return references.sort((a, b) => a.line - b.line).slice(0, 24)
}

function componentStatus(sources, component) {
  const references = sources.flatMap(source => sourceReferences(source, component.selectors)
    .map(reference => ({ file: source.file, ...reference })))
  return component.selectors.map(selector => {
    const found = references.filter(reference => reference.selector === selector)
    return {
      selector,
      status: found.length ? 'statically-referenced' : 'not-found-in-selected-sources',
      evidence: found.slice(0, 4)
    }
  })
}

function motionInventory(sources, terms) {
  const inventory = []
  function collectDeclarations(text, selector, file, line) {
    for (const match of text.matchAll(/\b(animation(?:-[\w-]+)?|transition(?:-[\w-]+)?)\s*:\s*([^;}]+)/g)) {
      if (terms !== null && !terms.some(term => selector.toLowerCase().includes(term.toLowerCase()))) continue
      inventory.push({ file, line, type: match[1], selector, declaration: match[0].trim() })
    }
  }
  for (const source of sources) {
    if (!source.file.endsWith('.wxss')) continue
    let selector = ''
    const lines = source.text.split('\n')
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('@media')) return
      if (trimmed.includes('{')) {
        const candidate = trimmed.slice(0, trimmed.indexOf('{')).trim()
        if (candidate.startsWith('@keyframes')) {
          if (terms === null || terms.some(term => candidate.toLowerCase().includes(term.toLowerCase()))) {
            inventory.push({ file: source.file, line: index + 1, type: 'keyframes', selector: candidate, declaration: candidate })
          }
          selector = ''
        } else if (!candidate.startsWith('@') && !candidate.startsWith('//')) {
          selector = candidate
        }
        collectDeclarations(trimmed.slice(trimmed.indexOf('{') + 1), selector, source.file, index + 1)
      } else {
        collectDeclarations(trimmed, selector, source.file, index + 1)
      }
    })
  }
  return inventory.slice(0, 60)
}

function relatedTests(projectPath, terms) {
  const directory = path.join(projectPath, 'tests')
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
    .map(entry => {
      const file = `tests/${entry.name}`
      const text = readFileSync(path.join(directory, entry.name), 'utf8')
      const matched = terms.filter(term => text.toLowerCase().includes(term.toLowerCase()))
      if (!matched.length) return null
      const offsets = matched.map(term => text.toLowerCase().indexOf(term.toLowerCase()))
      return { file, line: lineAt(text, Math.min(...offsets)), matchedTerms: matched, matches: matched.length }
    })
    .filter(Boolean)
    .sort((a, b) => b.matches - a.matches || a.file.localeCompare(b.file))
    .slice(0, 8)
    .map(({ matches, ...test }) => test)
}

function captureEvidence(projectPath, captureFile, routes) {
  const absolute = path.resolve(projectPath, captureFile)
  const current = fingerprintRuntimeSources(projectPath)
  if (!existsSync(absolute)) {
    return { file: relative(projectPath, absolute), status: 'not-captured', currentFingerprint: current.fingerprint, counts: {}, entries: [] }
  }
  const entries = readFileSync(absolute, 'utf8').split('\n').filter(line => line.trim()).map((line, index) => {
    let evidence
    try {
      evidence = JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid capture evidence at ${relative(projectPath, absolute)}:${index + 1}: ${error.message}`)
    }
    if (routes.length && !routes.some(route => typeof evidence.route === 'string' &&
      (evidence.route === route || evidence.route.startsWith(`${route}:`) || evidence.route.startsWith(`${route}#`)))) return null
    return {
      file: evidence.file,
      route: evidence.route,
      state: evidence.state,
      density: evidence.density,
      viewport: evidence.viewport,
      capturedAt: evidence.capturedAt,
      classification: classifyCaptureEvidence(evidence, current.fingerprint)
    }
  }).filter(Boolean)
  const counts = {}
  for (const entry of entries) counts[entry.classification] = (counts[entry.classification] || 0) + 1
  return {
    file: relative(projectPath, absolute),
    status: entries.length ? 'captured' : 'no-matching-route',
    currentFingerprint: current.fingerprint,
    counts,
    entries: entries.slice(-12)
  }
}

export function listAuditComponents() {
  return Object.entries(COMPONENTS).map(([id, component]) => ({ id, label: component.label, sources: component.sources }))
}

export function buildAuditSummary({ projectPath, component = 'calendar', captureFile = '.scratch/screenshots/captures.jsonl' }) {
  const root = path.resolve(projectPath)
  const definition = COMPONENTS[component]
  if (!definition) throw new Error(`Unknown component "${component}". Use --list-components.`)
  const sources = definition.sources.map(file => readSource(root, file))
  return {
    schemaVersion: 1,
    component,
    label: definition.label,
    intent: 'Evidence index only: verify aesthetic judgment against current rendered UI; detector findings are candidates, not requirements.',
    designSections: designSections(root, definition.terms),
    componentStatus: componentStatus(sources, definition),
    motion: motionInventory(sources, definition.motion),
    tests: relatedTests(root, definition.terms),
    evidence: captureEvidence(root, captureFile, definition.routes)
  }
}

export function parseAuditArguments(argv) {
  const result = { projectPath: process.cwd(), component: 'calendar', captureFile: '.scratch/screenshots/captures.jsonl', list: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--list-components') {
      result.list = true
    } else if (['--component', '--project', '--captures'].includes(argument)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`)
      index += 1
      if (argument === '--component') result.component = value
      if (argument === '--project') result.projectPath = path.resolve(value)
      if (argument === '--captures') result.captureFile = value
    } else {
      throw new Error(`Unknown argument: ${argument}`)
    }
  }
  return result
}

function main() {
  try {
    const options = parseAuditArguments(process.argv.slice(2))
    const output = options.list ? { components: listAuditComponents() } : buildAuditSummary(options)
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  } catch (error) {
    console.error(`Impeccable audit summary failed: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main()
