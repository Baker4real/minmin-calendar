const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadModule() {
  return import(pathToFileURL(path.join(__dirname, 'tools', 'sheetRuntimeProof.mjs')).href)
}

test('CLI accepts ws and out overrides and otherwise uses the documented defaults', async () => {
  const { parseCliArgs } = await loadModule()
  const root = path.resolve(__dirname, '..')
  assert.deepEqual(parseCliArgs([]), {
    ws: 'ws://127.0.0.1:9420',
    outDir: path.join(root, '.scratch', 'standin', 'sheet-runtime-proof')
  })
  assert.deepEqual(parseCliArgs(['--ws', 'ws://127.0.0.1:9275', '--out', 'evidence/sheet']), {
    ws: 'ws://127.0.0.1:9275',
    outDir: path.resolve('evidence/sheet')
  })
})

test('CLI rejects unknown flags, missing values and non-websocket endpoints', async () => {
  const { parseCliArgs } = await loadModule()
  for (const argv of [
    ['--ws'],
    ['--out'],
    ['--unknown', 'value'],
    ['--ws', 'http://127.0.0.1:9420'],
    ['--ws', 'ws://127.0.0.1:9420', '--ws', 'ws://127.0.0.1:9275']
  ]) assert.throws(() => parseCliArgs(argv))
})

function validResult() {
  return {
    viewport: { width: 390, height: 844 },
    runtime: { status: 'confirmed', method: 'compiled-module-challenge' },
    scroll: {
      viewportHeight: 565,
      scrollHeight: 646,
      before: { scrollTop: 0, lastTopicTop: 720, chrome: { top: 154, height: 69 } },
      after: { scrollTop: 60, lastTopicTop: 660, chrome: { top: 154, height: 69 } }
    },
    gestures: {
      settings: {
        pauseMs: 220,
        duringTransform: 'translateY(85px)',
        releasePhase: 'leaving',
        finalPhase: 'closed',
        finalMounted: false
      },
      home: { duringTransform: 'matrix(1, 0, 0, 1, 0, 85)' },
      upwardReset: {
        panelHeight: 600,
        beyondDisplacement: 280,
        releaseDisplacement: 190,
        beyondTransform: 'translateY(280px)',
        afterTransform: 'matrix(1, 0, 0, 1, 0, 0)',
        dragClear: { action: 'reset' },
        phase: 'open',
        mounted: true
      }
    },
    restore: { storageMatches: true, cloud: 'restored', realAccessor: true, stubGone: true }
  }
}

test('proof assertions accept the worked example and reject every broken critical observable', async () => {
  const { assertSheetRuntimeProof } = await loadModule()
  assert.doesNotThrow(() => assertSheetRuntimeProof(validResult()))
  const broken = [
    ['native overflow', result => { result.scroll.scrollHeight = result.scroll.viewportHeight }],
    ['native scrollTop', result => { result.scroll.after.scrollTop = 0 }],
    ['actual content offset', result => { result.scroll.after.lastTopicTop = result.scroll.before.lastTopicTop }],
    ['fixed chrome', result => { result.scroll.after.chrome.top += 2 }],
    ['Settings follow', result => { result.gestures.settings.duringTransform = 'none' }],
    ['Home follow', result => { result.gestures.home.duringTransform = 'translateY(2px)' }],
    ['pause duration', result => { result.gestures.settings.pauseMs = 80 }],
    ['leaving phase', result => { result.gestures.settings.releasePhase = 'open' }],
    ['closed phase', result => { result.gestures.settings.finalPhase = 'leaving' }],
    ['distance threshold', result => { result.gestures.upwardReset.releaseDisplacement = 150 }],
    ['reset decision', result => { result.gestures.upwardReset.dragClear.action = 'close' }],
    ['open phase', result => { result.gestures.upwardReset.phase = 'leaving' }],
    ['identity transform', result => { result.gestures.upwardReset.afterTransform = 'translateY(20px)' }],
    ['storage restore', result => { result.restore.storageMatches = false }],
    ['stub removal', result => { result.restore.stubGone = false }],
    ['runtime confirmation', result => { result.runtime.status = 'unconfirmed' }]
  ]
  for (const [label, mutate] of broken) {
    const result = validResult()
    mutate(result)
    assert.throws(() => assertSheetRuntimeProof(result), undefined, label)
  }
})

test('runtime proof cleanup runs after a stand-in failure without simulating DevTools', async t => {
  const { runSheetRuntimeProof } = await loadModule()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minmin-sheet-proof-cleanup-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const proofFile = path.join(root, '.scratch', 'runtime-probe.json')
  fs.mkdirSync(path.dirname(proofFile), { recursive: true })
  fs.writeFileSync(proofFile, '{}')
  const expected = new Error('stop before any runtime interaction')
  const events = []
  await assert.rejects(runSheetRuntimeProof({ projectRoot: root, proofFile }, {
    withStandin: async () => {
      events.push('standin')
      throw expected
    },
    runtimeProbeCommand: (action, file, projectRoot) => {
      events.push(`${action}:${file}:${projectRoot}`)
      return { status: 'cleaned' }
    }
  }), error => error === expected)
  assert.deepEqual(events, ['standin', `clean:${proofFile}:${root}`])
})
