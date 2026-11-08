import { appendFileSync } from 'node:fs'

if (process.env.IMPECCABLE_STUB_CAPTURE) {
  appendFileSync(process.env.IMPECCABLE_STUB_CAPTURE, JSON.stringify(process.argv.slice(2)) + '\n')
}

const findings = process.env.IMPECCABLE_STUB_FINDINGS === '1'
  ? [
      { antipattern: 'dark-glow', severity: 'warning', file: 'index-index.html' },
      { antipattern: 'side-tab', severity: 'advisory', file: 'index-index.html' }
    ]
  : []
console.log(JSON.stringify(findings))
process.exit(findings.length ? 2 : 0)
