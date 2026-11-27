import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { withStandin, defaultRecords } from './devtoolsStandin.mjs'
import { confirmRuntimeProbe, fingerprintRuntimeSources } from './captureEvidence.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function main() {
  const args = { ws: 'ws://127.0.0.1:9420', out: path.join(ROOT, '.scratch', 'standin', 'aesthetic-runtime-proof', 'result.json') }
  for (let index = 2; index < process.argv.length; index += 2) args[process.argv[index].replace(/^--/, '')] = process.argv[index + 1]
  if (!args['runtime-proof']) throw new Error('--runtime-proof is required')
  args.out = path.resolve(args.out)
  const probe = JSON.parse(readFileSync(path.resolve(args['runtime-proof']), 'utf8'))
  const source = fingerprintRuntimeSources(ROOT)
  mkdirSync(path.dirname(args.out), { recursive: true })
  const baseRecords = defaultRecords('2026-11-27')
  const records = {
    ...baseRecords,
    memories: [...baseRecords.memories, { _id: 'standin-old-month', date: '2026-10-10', note: '旧月份构造记录', createdByMe: true }]
  }
  const confirmLoaded = async h => {
    const loaded = await h.evaluate(function () { return require('utils/__captureProbe.js') })
    return confirmRuntimeProbe(ROOT, probe, loaded)
  }
  const output = { schemaVersion: 1, source, paired: null, waiting: null }

  {
    const { result, report } = await withStandin({
      ws: args.ws,
      outDir: path.join(path.dirname(args.out), 'paired'),
      scenario: { room: 'paired', records, latencyMs: 0 }
    }, async h => {
      const runtime = await confirmLoaded(h)
      await h.goto('pages/index/index', { settle: 0 })
      let page = await h.page()
      const home = { roomPaired: (await page.data()).roomPaired, pairMarks: (await page.$$('.nav-pair-mark')).length, pairedTitles: (await page.$$('.nav-title-paired')).length }
      await h.goto('pages/period/period', { waitFor: data => data.hasLoaded === true && data.memoryHasLoaded === true, settle: 0 })
      page = await h.page()
      const quietPeriodCards = (await page.$$('.month-card.quiet-card')).length
      await h.tapText('.segment-option', '欢乐时光', { settle: 0 })
      const totalMemories = (await page.data()).memoryCount
      const mountedBefore = (await page.$$('.list-item')).length
      const headers = await page.$$('.month-header')
      await headers.at(-1).tap()
      await sleep(0)
      const mountedAfter = (await page.$$('.list-item')).length
      await h.goto('pages/settings/settings', { settle: 0 })
      page = await h.page()
      const quietSettingsCards = (await page.$$('.quiet-card')).length
      await h.goto('pages/memory/edit/edit?date=2026-11-27', { settle: 0 })
      page = await h.page()
      const input = await page.$('.memory-note-input')
      const memoryEditorStyle = await input.attribute('style')
      await confirmLoaded(h)
      return { runtime, home, quietPeriodCards, totalMemories, mountedBefore, mountedAfter, quietSettingsCards, memoryEditorStyle }
    })
    if (!report.storageMatches || !report.stubGone) throw new Error('paired proof did not restore the real app')
    output.paired = result
  }

  {
    const { result, report } = await withStandin({
      ws: args.ws,
      outDir: path.join(path.dirname(args.out), 'waiting'),
      scenario: { room: 'waiting', records, latencyMs: 0 }
    }, async h => {
      const runtime = await confirmLoaded(h)
      await h.goto('pages/index/index', { settle: 0 })
      const page = await h.page()
      return { runtime, roomPaired: (await page.data()).roomPaired, pairMarks: (await page.$$('.nav-pair-mark')).length }
    })
    if (!report.storageMatches || !report.stubGone) throw new Error('waiting proof did not restore the real app')
    output.waiting = result
  }

  writeFileSync(args.out, JSON.stringify(output, null, 2))
  console.log(JSON.stringify(output))
  const { paired, waiting } = output
  if (!paired.home.roomPaired || paired.home.pairMarks !== 1 || paired.home.pairedTitles !== 1) throw new Error('paired mark missing')
  if (waiting.roomPaired || waiting.pairMarks !== 0) throw new Error('waiting mark leaked')
  if (paired.quietPeriodCards < 1 || paired.quietSettingsCards !== 3) throw new Error('quiet cards missing')
  if (!(paired.mountedBefore < paired.totalMemories && paired.mountedAfter === paired.totalMemories)) throw new Error('lazy rows did not retain the default month and mount the first expansion')
  if (!paired.memoryEditorStyle.includes('min-height:')) throw new Error('memory geometry missing')
}

main().catch(error => { console.error(error.message); process.exit(1) })
