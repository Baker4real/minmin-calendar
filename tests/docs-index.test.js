const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { PUBLISHED_HOLIDAY_START_YEAR, PUBLISHED_HOLIDAY_END_YEAR } = require('../utils/chinaHolidays')

// 文档索引与代码对账：README 承诺每个模块的职责都在 CONTEXT.md 的 Technical Shape 一节，ADR 索引按每篇的标题链接它。
// 两处都曾悄悄落后于代码（2026-11-14 epic #189 收口时靠一次全文档审计才发现），这里把能机械判断的部分钉住；
// 句子是否仍符合代码属于评审判断，见 CODING_STANDARDS.md。
const repoRoot = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8').replace(/\r\n/g, '\n')

function section(markdown, heading) {
  const start = markdown.indexOf(`\n## ${heading}\n`)
  assert.ok(start >= 0, `missing section ## ${heading}`)
  const end = markdown.indexOf('\n## ', start + 1)
  return markdown.slice(start, end < 0 ? undefined : end)
}

test('every utils module is named in CONTEXT.md Technical Shape', () => {
  const shape = section(read('CONTEXT.md'), 'Technical Shape')
  // The compile challenge is a generated, git-ignored diagnostic module; package-contents owns its release rejection.
  const modules = fs.readdirSync(path.join(repoRoot, 'utils')).filter(name => name.endsWith('.js') && name !== '__captureProbe.js')
  assert.ok(modules.length > 0)
  assert.deepEqual(modules.filter(name => !shape.includes(`utils/${name}`)), [], 'add each module above to CONTEXT.md Technical Shape with its responsibility')
})

test('the ADR index links every ADR under its own title', () => {
  const index = read('docs/adr/README.md')
  const adrs = fs.readdirSync(path.join(repoRoot, 'docs', 'adr')).filter(name => /^\d{4}-.+\.md$/.test(name))
  assert.ok(adrs.length > 0)
  const unlisted = adrs.filter(name => {
    const heading = read(`docs/adr/${name}`).match(/^# (?:ADR(?:-\d+)?:\s*)?(.+?)\s*$/m)
    return !heading || !index.includes(`[${name.slice(0, 4)} ${heading[1]}](${name})`)
  })
  assert.deepEqual(unlisted, [], 'link each ADR above from docs/adr/README.md as [NNNN <its # title>](<file>)')
})

test('every spec in docs/specs aligns frontmatter title with H1 and links ready-for-agent epics to GitHub Issues', () => {
  const specsDir = path.join(repoRoot, 'docs', 'specs')
  const specs = fs.readdirSync(specsDir).filter(name => name.endsWith('.md')).sort()
  assert.ok(specs.length > 0)
  const violations = []
  for (const name of specs) {
    const raw = read(`docs/specs/${name}`)
    if (!raw.endsWith('\n') || raw.endsWith('\n\n')) {
      violations.push(`${name}: must end with exactly one trailing newline`)
    }
    const header = /^---\n([\s\S]+?)\n---\n\n# (.+)\n\n([^\n]+)/.exec(raw)
    if (!header) {
      violations.push(`${name}: missing frontmatter or top-level # heading`)
      continue
    }
    const [, frontmatter, h1, firstMetaLine] = header
    if (!/^type:\s*(?:spec|reference)\s*$/m.test(frontmatter)) {
      violations.push(`${name}: frontmatter must declare type: spec (or reference)`)
    }
    if (!frontmatter.includes(`title: "${h1}"`)) {
      violations.push(`${name}: frontmatter title must match "# ${h1}"`)
    }
    if (!/^intent:\s*"\S[\s\S]*?"\s*$/m.test(frontmatter)) {
      violations.push(`${name}: frontmatter must declare a non-empty quoted intent`)
    }
    if (/^label:\s*ready-for-agent\s*$/m.test(frontmatter)) {
      const epicMatch = /^\*\*Issue:\*\* \[#(\d+)\]\(https:\/\/github\.com\/Baker4real\/minmin-calendar\/issues\/\1\)$/.exec(firstMetaLine)
      if (!epicMatch) {
        violations.push(`${name}: ready-for-agent epic replica must follow H1 with **Issue:** [#<n>](https://github.com/Baker4real/minmin-calendar/issues/<n>)`)
      } else {
        const breakdownHeading = '\n## 拆分记录（仓库副本独有，不在父票正文里）\n'
        const breakdownIndex = raw.indexOf(breakdownHeading)
        if (breakdownIndex >= 0) {
          const breakdown = raw.slice(breakdownIndex + breakdownHeading.length)
          const linkedIssues = [...breakdown.matchAll(/https:\/\/github\.com\/Baker4real\/minmin-calendar\/issues\/(\d+)/g)]
            .map(match => match[1])
            .filter(id => id !== epicMatch[1])
          if (linkedIssues.length === 0) {
            violations.push(`${name}: 拆分记录 must link at least one sub-ticket GitHub Issue distinct from parent #${epicMatch[1]}`)
          }
          if (/(?<![\w/])#[0-2]\d\b/.test(breakdown)) {
            violations.push(`${name}: 拆分记录 must not leave raw two-digit #00-#29 ticket placeholders`)
          }
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('CONTEXT.md and PRODUCT.md keep published holiday year bounds aligned with utils/chinaHolidays.js', () => {
  const asciiRange = `${PUBLISHED_HOLIDAY_START_YEAR}-${PUBLISHED_HOLIDAY_END_YEAR}`
  const enDashRange = `${PUBLISHED_HOLIDAY_START_YEAR}–${PUBLISHED_HOLIDAY_END_YEAR}`
  assert.ok(
    read('CONTEXT.md').includes(asciiRange),
    `CONTEXT.md Holiday Data Boundary must state ${asciiRange}`
  )
  assert.ok(
    read('PRODUCT.md').includes(enDashRange) || read('PRODUCT.md').includes(asciiRange),
    `PRODUCT.md Capabilities and Constraints must state ${enDashRange}`
  )
})

test('tracked markdown documents never use local drive-letter or UNC paths as markdown link targets', () => {
  const walkMarkdown = dir => {
    const results = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['.git', 'node_modules', 'cloudfunctions', '.scratch', '.agents', '.claude', '.codex', '.serena', '.zcode', '_external'].includes(entry.name)) continue
        results.push(...walkMarkdown(full))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(path.relative(repoRoot, full).replace(/\\/g, '/'))
      }
    }
    return results
  }

  const violations = []
  for (const rel of walkMarkdown(repoRoot)) {
    const lines = read(rel).split('\n')
    lines.forEach((line, idx) => {
      if (/\]\((?:[A-Za-z]:[\\/]|\\\\)/.test(line)) {
        violations.push(`${rel}:${idx + 1}: local drive/UNC markdown link target`)
      }
    })
  }
  assert.deepEqual(violations, [])
})
