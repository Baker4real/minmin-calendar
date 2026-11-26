import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { confirmRuntimeProbe } from './captureEvidence.mjs'
import { defaultRecords, withStandin } from './devtoolsStandin.mjs'
import { runtimeProbeCommand } from './runtimeProbe.mjs'

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..')
const DEFAULT_WS = 'ws://127.0.0.1:9420'
const DEFAULT_OUT = path.join(PROJECT_ROOT, '.scratch', 'standin', 'sheet-runtime-proof')

export function parseCliArgs(argv) {
  const options = { ws: DEFAULT_WS, outDir: DEFAULT_OUT }
  const seen = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag !== '--ws' && flag !== '--out') throw new Error(`Unknown argument: ${flag}`)
    if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`)
    seen.add(flag)
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    index += 1
    if (flag === '--ws') {
      const endpoint = new URL(value)
      if (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:') throw new Error('--ws must use ws:// or wss://')
      options.ws = value
    } else {
      options.outDir = path.resolve(value)
    }
  }
  return options
}

function transformY(value) {
  if (typeof value !== 'string') return NaN
  const translate = value.match(/^translateY\((-?\d+(?:\.\d+)?)px\)$/)
  if (translate) return Number(translate[1])
  const matrix = value.match(/^matrix\(([^)]+)\)$/)
  if (matrix) {
    const parts = matrix[1].split(',').map(part => Number(part.trim()))
    if (parts.length === 6 && parts.slice(0, 4).every((part, index) => part === [1, 0, 0, 1][index])) return parts[5]
  }
  return NaN
}

function identityTransform(value) {
  return value === '' || value === 'none' || transformY(value) === 0
}

function closeTo(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual), `${label} must be finite`)
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected} +/- ${tolerance}, got ${actual}`)
}

export function assertSheetRuntimeProof(result) {
  assert.ok(result?.viewport?.width > 0 && result?.viewport?.height > 0, 'actual viewport dimensions are required')
  assert.equal(result?.runtime?.status, 'confirmed', 'compiled runtime must be confirmed')
  assert.equal(result?.runtime?.method, 'compiled-module-challenge')

  const scroll = result.scroll
  assert.ok(scroll.scrollHeight > scroll.viewportHeight, 'native scrollHeight must exceed the scroll-view viewport')
  closeTo(scroll.before.scrollTop, 0, 0.01, 'initial native scrollTop')
  closeTo(scroll.after.scrollTop, 60, 0.5, 'native scrollTop after element.scrollTo')
  closeTo(scroll.before.lastTopicTop - scroll.after.lastTopicTop, 60, 1, 'actual content offset')
  closeTo(scroll.after.chrome.top, scroll.before.chrome.top, 0.01, 'sheet chrome top')
  closeTo(scroll.after.chrome.height, scroll.before.chrome.height, 0.01, 'sheet chrome height')

  const { settings, home, upwardReset } = result.gestures
  for (const [name, gesture] of [['Settings', settings], ['Home', home]]) {
    closeTo(transformY(gesture.duringTransform), 85, 1.5, `${name} drag must follow the finger`)
  }
  assert.ok(settings.pauseMs > 80, 'Settings flick must pause for more than 80ms')
  assert.equal(settings.releasePhase, 'leaving', 'Settings pause-then-flick must enter leaving')
  assert.equal(settings.finalPhase, 'closed', 'Settings pause-then-flick must finish closed')
  assert.equal(settings.finalMounted, false, 'Settings sheet must unmount after closing')

  assert.ok(upwardReset.releaseDisplacement > upwardReset.panelHeight * 0.25, 'upward release must remain beyond the close-distance threshold')
  assert.ok(upwardReset.beyondDisplacement > upwardReset.releaseDisplacement, 'reversal must move upward')
  closeTo(transformY(upwardReset.beyondTransform), upwardReset.beyondDisplacement, 1.5, 'beyond-threshold drag')
  assert.equal(upwardReset.dragClear?.action, 'reset', 'fast upward reversal must reset')
  assert.equal(upwardReset.phase, 'open', 'fast upward reversal must keep the sheet open')
  assert.equal(upwardReset.mounted, true)
  assert.ok(identityTransform(upwardReset.afterTransform), 'reset must clear the inline transform to identity')

  assert.equal(result.restore?.storageMatches, true, 'stand-in storage restore must be verified')
  assert.equal(result.restore?.cloud, 'restored')
  assert.equal(result.restore?.realAccessor, true, 'the real wx.cloud accessor must be restored')
  assert.equal(result.restore?.stubGone, true, 'the stand-in stub must be removed')
  return result
}

const HOME = 'pages/index/index'
const SETTINGS = 'pages/settings/settings'
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function readCompiledProbe() {
  return require('utils/__captureProbe.js')
}

function readViewport() {
  var info = wx.getWindowInfo()
  return { width: info.windowWidth, height: info.windowHeight }
}

function readHelpGeometry() {
  return new Promise(resolve => {
    var query = wx.createSelectorQuery()
    query.select('.sheet-drag-zone').boundingClientRect()
    query.select('.sheet-body').boundingClientRect()
    query.selectAll('.help-topic').boundingClientRect()
    query.exec(function (result) {
      var topics = Array.isArray(result[2]) ? result[2] : []
      var last = topics[topics.length - 1]
      resolve({
        chrome: result[0] && { top: result[0].top, height: result[0].height },
        bodyHeight: result[1] && result[1].height,
        lastTopicTop: last && last.top
      })
    })
  })
}

async function openHelp(h) {
  await h.goto(SETTINGS)
  await h.tapText('.menu-item', '使用说明')
  await h.until(async () => (await h.pageData()).helpPhase === 'open', 3000, 'Settings help open')
}

async function scrollState(h, node) {
  const geometry = await h.evaluate(readHelpGeometry)
  return {
    scrollTop: await node.property('scrollTop'),
    scrollHeight: await node.scrollHeight(),
    ...geometry
  }
}

async function proveNativeScroll(h) {
  await openHelp(h)
  const node = await (await h.page()).$('.sheet-body')
  assert.ok(node, 'native Settings help scroll-view must exist')
  const before = await scrollState(h, node)
  await node.scrollTo(0, 60)
  await sleep(300)
  const after = await scrollState(h, node)
  return {
    viewportHeight: before.bodyHeight,
    scrollHeight: before.scrollHeight,
    before: { scrollTop: before.scrollTop, lastTopicTop: before.lastTopicTop, chrome: before.chrome },
    after: { scrollTop: after.scrollTop, scrollHeight: after.scrollHeight, lastTopicTop: after.lastTopicTop, chrome: after.chrome }
  }
}

async function dragContext(h, sheet) {
  const page = await h.page()
  const zone = await page.$('.sheet-drag-zone')
  const panel = await page.$(`.sheet-slide-${sheet}`)
  assert.ok(zone && panel, `${sheet} drag zone and panel must exist`)
  const offset = await zone.offset()
  const size = await zone.size()
  const x = Number(offset.left) + Number(size.width) / 2
  const y = Number(offset.top) + 20
  const point = (pageY, identifier = 61) => ({ identifier, pageX: x, pageY })
  const event = (pageY, identifier) => {
    const touch = point(pageY, identifier)
    return { touches: [touch], changedTouches: [touch] }
  }
  return { page, zone, panel, y, point, event }
}

async function observePhase(page, phaseKey, accepted, label, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  let phase = await page.data(phaseKey)
  while (!accepted(phase)) {
    if (Date.now() >= deadline) throw new Error(`${label} timed out; last phase=${phase}`)
    await sleep(20)
    phase = await page.data(phaseKey)
  }
  return phase
}

async function probeFollow(h, { sheet, phaseKey, mountedKey, waitForClose }) {
  const { page, zone, panel, y, point, event } = await dragContext(h, sheet)
  await zone.touchstart(event(y))
  await zone.touchmove(event(y + 25))
  const pauseStarted = performance.now()
  await sleep(220)
  const pauseMs = Math.round((performance.now() - pauseStarted) * 10) / 10
  await zone.touchmove(event(y + 55))
  await sleep(25)
  await zone.touchmove(event(y + 85))
  await sleep(25)
  const duringTransform = await panel.style('transform')
  await zone.touchend({ touches: [], changedTouches: [point(y + 105)] })
  const releasePhase = await observePhase(page, phaseKey, phase => phase === 'leaving' || phase === 'closed', `${sheet} release`)
  const result = { pauseMs, duringTransform, releasePhase }
  if (waitForClose) {
    result.finalPhase = await observePhase(page, phaseKey, phase => phase === 'closed', `${sheet} closed after flick`)
    result.finalMounted = await page.data(mountedKey)
  }
  return result
}

async function probeUpwardReset(h) {
  await openHelp(h)
  const { page, zone, panel, y, point, event } = await dragContext(h, 'help')
  const panelHeight = Number((await panel.size()).height)
  assert.ok(panelHeight > 0, 'help panel height is required for the distance threshold')
  const releaseDisplacement = Math.ceil(panelHeight * 0.30)
  const beyondDisplacement = releaseDisplacement + 90
  await zone.touchstart(event(y, 62))
  await zone.touchmove(event(y + 70, 62))
  await sleep(90)
  await zone.touchmove(event(y + beyondDisplacement, 62))
  await sleep(120)
  const beyondTransform = await panel.style('transform')
  await zone.touchmove(event(y + beyondDisplacement - 30, 62))
  await sleep(20)
  await zone.touchmove(event(y + beyondDisplacement - 60, 62))
  await sleep(20)
  await zone.touchend({ touches: [], changedTouches: [point(y + releaseDisplacement, 62)] })
  await sleep(300)
  return {
    panelHeight,
    beyondDisplacement,
    releaseDisplacement,
    beyondTransform,
    afterTransform: await panel.style('transform'),
    dragClear: await page.data('helpDragClear'),
    phase: await page.data('helpPhase'),
    mounted: await page.data('helpMounted')
  }
}

async function collectProof(h) {
  const viewport = await h.evaluate(readViewport)
  const scroll = await proveNativeScroll(h)
  await openHelp(h)
  const settings = await probeFollow(h, {
    sheet: 'help', phaseKey: 'helpPhase', mountedKey: 'helpMounted', waitForClose: true
  })
  await h.goto(HOME)
  await h.tapSelector('.home-status')
  await h.until(async () => (await h.pageData()).infoSheetPhase === 'open', 3000, 'Home information sheet open')
  const home = await probeFollow(h, {
    sheet: 'infoSheet', phaseKey: 'infoSheetPhase', mountedKey: 'infoSheetMounted', waitForClose: false
  })
  const upwardReset = await probeUpwardReset(h)
  return { viewport, scroll, gestures: { settings, home, upwardReset } }
}

export async function runSheetRuntimeProof(options = {}, dependencies = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT)
  const proofFile = path.resolve(options.proofFile || path.join(projectRoot, '.scratch', 'runtime-probe.json'))
  const standin = dependencies.withStandin || withStandin
  const confirm = dependencies.confirmRuntimeProbe || confirmRuntimeProbe
  const probeCommand = dependencies.runtimeProbeCommand || runtimeProbeCommand
  const proof = JSON.parse(readFileSync(proofFile, 'utf8'))
  let result
  try {
    const outcome = await standin({
      ws: options.ws || DEFAULT_WS,
      outDir: options.outDir || DEFAULT_OUT,
      scenario: { room: 'paired', records: ({ today }) => defaultRecords(today) }
    }, async h => {
      const runtime = confirm(projectRoot, proof, await h.evaluate(readCompiledProbe))
      return { runtime, ...await collectProof(h) }
    })
    const report = outcome.report
    result = {
      ...outcome.result,
      restore: {
        storageMatches: report.storageMatches,
        cloud: report.cloud,
        realAccessor: report.realAccessor,
        stubGone: report.stubGone,
        wxMethodsMissing: report.wxMethodsMissing,
        relaunched: report.relaunched
      }
    }
    assertSheetRuntimeProof(result)
    return result
  } finally {
    const cleaned = probeCommand('clean', proofFile, projectRoot)
    assert.equal(cleaned.status, 'cleaned', 'runtime probe cleanup must complete')
    if (result) result.runtime.cleanup = cleaned.status
  }
}

async function main(argv) {
  const options = parseCliArgs(argv)
  const result = await runSheetRuntimeProof(options)
  mkdirSync(options.outDir, { recursive: true })
  const file = path.join(options.outDir, 'result.json')
  writeFileSync(file, JSON.stringify(result, null, 2) + '\n')
  console.log(`[sheet-proof] PASS viewport=${result.viewport.width}x${result.viewport.height} scroll=${result.scroll.after.scrollTop}/${result.scroll.scrollHeight} Settings=${result.gestures.settings.finalPhase} Home=follow reset=${result.gestures.upwardReset.dragClear.action}`)
  console.log(`[sheet-proof] runtime=${result.runtime.status}/${result.runtime.cleanup} restore=${result.restore.storageMatches && result.restore.stubGone} result=${file}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`[sheet-proof] FAIL ${error.message}`)
    process.exitCode = 1
  })
}
