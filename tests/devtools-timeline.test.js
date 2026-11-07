const assert = require('node:assert/strict')
const test = require('node:test')

const caller = '[Object.info (D:\\Program Files (x86)\\Tencent\\微信web开发者工具\\resources\\app.asar\\js\\x.js:2:907)]'
const record = (time, level, message, prefix = '[rt:0,win:s0] ') => `[2026-11-07 ${time}+08:00][${level}][2.02.2609250][PROJECT]${caller} ${prefix}${message}`

test('the timeline keeps reloads, page webviews and unexpected errors in order, drops known noise and redacts account data', async () => {
  const { timelineEvents } = await import('./tools/devtoolsTimeline.mjs')
  const log = [
    record('20:27:12.955', 'INFO', '[SimulatorService] simulator app compile'),
    record('20:27:13.344', 'WARN', '[SimulatorService] updateSimulatorCompileOptions: simulator not found s0'),
    record('20:27:13.400', 'INFO', "[hybirdLog]', 'init cache compile !!!!! openId: o6zAJs-Tabcdefghijklmnopqrst"),
    record('20:27:19.990', 'ERROR', '[timing] markDevLaunchEnv timingData not found'),
    record('20:27:21.144', 'ERROR', '[Devtools] devtools is not loaded properly'),
    record('20:27:21.388', 'INFO', '[appservice] appservice reload'),
    "  ignore: [ '.git' ]",
    record('20:27:21.535', 'INFO', "[RendererMessagerService] webview created { name: 'WEBVIEW_PAGEFRAME|5' }"),
    record('20:27:22.000', 'ERROR', 'login failed for o6zAJs-Tabcdefghijklmnopqrst token=abc123', ''),
    record('20:27:31.000', 'INFO', '[appservice] appservice reload'),
  ].join('\r\n')
  const events = timelineEvents(log, { from: new Date('2026-11-07T20:27:12+08:00'), to: new Date('2026-11-07T20:27:30+08:00') })
  assert.deepEqual(events.map(event => `${event.level} ${event.message}`), [
    'INFO [SimulatorService] simulator app compile',
    'ERROR [Devtools] devtools is not loaded properly',
    'INFO [appservice] appservice reload',
    "INFO [RendererMessagerService] webview created { name: 'WEBVIEW_PAGEFRAME|5' }",
    'ERROR login failed for [openid] token=[REDACTED]',
  ])
  assert.equal(events[0].at.getTime(), new Date('2026-11-07T20:27:12.955+08:00').getTime())
})

test('a --to given in minutes covers that whole minute and a bare time means today', async () => {
  const { parseTime } = await import('./tools/devtoolsTimeline.mjs')
  const now = new Date(2026, 10, 7, 9, 0, 0)
  assert.equal(parseTime('20:27', { now }).getTime(), new Date(2026, 10, 7, 20, 27, 0).getTime())
  assert.equal(parseTime('20:27', { end: true, now }).getTime(), new Date(2026, 10, 7, 20, 27, 59, 999).getTime())
  assert.equal(parseTime('2026-11-06T20:27:05', { end: true, now }).getTime(), new Date(2026, 10, 6, 20, 27, 5, 999).getTime())
  assert.throws(() => parseTime('8pm'), /HH:MM/)
})
