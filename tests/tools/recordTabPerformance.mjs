import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { withStandin } from './devtoolsStandin.mjs'
import { confirmRuntimeProbe, fingerprintRuntimeSources } from './captureEvidence.mjs'

const HOME = 'pages/index/index'
const RECORDS = 'pages/period/period'
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const elapsed = started => Number(process.hrtime.bigint() - started) / 1e6
const round = value => Math.round(value * 100) / 100

export function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function shouldLazyMount({ readyMs, segmentMs }) {
  return readyMs > 1500 || segmentMs > 300
}

export function performanceDecision(metrics, mountMode = 'eager') {
  if (!shouldLazyMount(metrics)) return 'keep-mounted'
  return mountMode === 'lazy' ? 'lazy-mounted-above-threshold' : 'lazy-mount-required'
}

function monthDate(today, monthOffset, day) {
  const [year, month] = today.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 - monthOffset, day))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function addDays(dateString, offset) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + offset))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function buildRecords(total, today) {
  const periodCount = Math.floor(total * 0.4)
  const memoryCount = total - periodCount
  const periods = Array.from({ length: periodCount }, (_, index) => {
    const startDate = monthDate(today, index % 24, Math.floor(index / 24) % 20 + 1)
    return {
      _id: `standin-performance-period-${index}`,
      startDate,
      endDate: addDays(startDate, 4),
      status: 'known-end',
      flow: 'normal',
      symptoms: [],
      note: '',
      createdByMe: index % 2 === 0
    }
  })
  const memories = Array.from({ length: memoryCount }, (_, index) => ({
    _id: `standin-performance-memory-${index}`,
    date: monthDate(today, index % 24, Math.floor(index / 24) % 25 + 1),
    note: `构造记录 ${index}`,
    createdByMe: index % 2 === 0
  }))
  return { periods, memories }
}

async function measureScale(total, options) {
  const recordsByDate = ({ today }) => buildRecords(total, today)
  const { result, report } = await withStandin({
    ws: options.ws,
    outDir: path.join(options.out, `scale-${total}`),
    scenario: { room: 'paired', records: recordsByDate, storage: { recordTabSegment: 'period' }, latencyMs: 0 }
  }, async h => {
    if (options.probe) await h.evaluate(function () { return require('utils/__captureProbe.js') }).then(loaded => confirmRuntimeProbe(PROJECT_ROOT, options.probe, loaded))
    const ready = []
    for (let run = 0; run < 5; run += 1) {
      await h.goto(HOME, { settle: 0 })
      const started = process.hrtime.bigint()
      await h.goto(RECORDS, { waitFor: data => data.hasLoaded === true && data.memoryHasLoaded === true, settle: 0 })
      ready.push(round(elapsed(started)))
    }
    const segment = []
    for (let run = 0; run < 10; run += 1) {
      const target = run % 2 === 0 ? 'memory' : 'period'
      const label = target === 'memory' ? '欢乐时光' : '经期'
      const started = process.hrtime.bigint()
      await h.tapText('.segment-option', label, { settle: 0 })
      await h.until(async () => {
        const page = await h.page()
        return (await page.data()).segment === target
      }, 5000, `segment ${target}`)
      segment.push(round(elapsed(started)))
    }
    return { ready, segment }
  })
  if (!report.storageMatches || !report.stubGone) throw new Error(`scale ${total} did not restore the real app`)
  return {
    total,
    ...result,
    readyMedianMs: round(median(result.ready)),
    segmentMedianMs: round(median(result.segment)),
    restored: true
  }
}

async function main() {
  const args = { ws: 'ws://127.0.0.1:9420', out: path.join(PROJECT_ROOT, '.scratch', 'record-performance'), 'mount-mode': 'eager' }
  for (let index = 2; index < process.argv.length; index += 2) {
    args[process.argv[index].replace(/^--/, '')] = process.argv[index + 1]
  }
  args.out = path.resolve(args.out)
  if (!['eager', 'lazy'].includes(args['mount-mode'])) throw new Error('--mount-mode must be eager|lazy')
  args.probe = args['runtime-proof'] ? JSON.parse(readFileSync(path.resolve(args['runtime-proof']), 'utf8')) : null
  mkdirSync(args.out, { recursive: true })
  const source = fingerprintRuntimeSources(PROJECT_ROOT)
  const scales = []
  for (const total of [500, 1000]) scales.push(await measureScale(total, args))
  const large = scales.find(scale => scale.total === 1000)
  const metrics = { readyMs: large.readyMedianMs, segmentMs: large.segmentMedianMs }
  const summary = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    source,
    mountMode: args['mount-mode'],
    thresholdExceeded: shouldLazyMount(metrics),
    scales,
    decision: performanceDecision(metrics, args['mount-mode'])
  }
  writeFileSync(path.join(args.out, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify(summary))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exit(1) })
}
