// Stand-in Room harness for WeChat DevTools (first written for epic #148): drive the real app on a fake Room.
//
// DevTools runs the maintainer's real WeChat account bound to a real room. This module connects to an
// already-listening automator port (two-step --ws form, 15 s handshake bound), snapshots every wx storage
// key, swaps the app-service `wx.cloud` accessor for a stand-in that answers every cloud function itself
// (fake room ABC123, stand-in records relative to today; nothing is forwarded to the real cloud), proves
// the interception through the app's own modules, and only then lets the caller navigate and capture.
// close() restores storage and the real wx.cloud in one synchronous app-side turn, verifies the storage
// hash, and reLaunches pages/index/index so the real app state comes back.
//
//   import { withStandin } from './devtoolsStandin.mjs'
//   await withStandin({ scenario: { listFailure: 'periods' } }, async h => {
//     await h.goto('pages/index/index')
//     await h.screenshot('home-periods-failed')                         // full viewport
//     await h.screenshot('home-calendar', { crop: '.calendar-swipe' })  // element crop
//   })
//
// Edit pages: goto() the tab page, then openFrom('<entry method>', arg) runs that page's own entry and opens
// the URL it builds on top of the tab page, so save, delete and back return to it (see openFrom).
//
// Scenario: { room: 'paired'|'waiting'|'none', records: {periods, memories} | ({today, day}) => {...},
//   listFailure: null|'periods'|'memories'|'both', partnerWelcome: 'pending'|'seen'|null,
//   density: 'compact'|'full', roomStatusSeen, storage: {key: value}, latencyMs,
//   failures: { 'getMyRoom' | 'dataOp' | 'dataOp:add' | 'dataOp:list:periods' | ...: 'network'|'business'|{code,msg} } }
// CLI:  npm run devtools:standin -- --demo [--simulate-reset] [--out <dir>] [--ws ws://127.0.0.1:9420]
//       npm run devtools:standin -- --restore   (after a hard kill: puts the saved storage snapshot back)
// Screenshots, captures.jsonl and the recovery file live under .scratch/standin/ (git-ignored).
// Never logs storage values, the real room code or record contents; the recovery file holds the snapshot
// only while a run is active and is overwritten without values after a verified restore.

import { createRequire } from 'node:module'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { probeEndpoint } from './devtoolsPreflight.mjs'

const require = createRequire(import.meta.url)
const MiniProgram = require('miniprogram-automator/out/MiniProgram').default
const Connection = require('miniprogram-automator/out/Connection').default
const Transport = require('miniprogram-automator/out/Transport').default
const WebSocket = require('ws')

export const FAKE_ROOM_CODE = 'ABC123'
const DEFAULT_WS = 'ws://127.0.0.1:9420'
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(MODULE_DIR, '..', '..')
const SCRATCH_DIR = path.join(PROJECT_ROOT, '.scratch', 'standin')
const DEFAULT_OUT = path.join(SCRATCH_DIR, 'shots')
// A fixed path, so --restore still finds the snapshot after a hard kill or a host restart.
const DEFAULT_RECOVERY = path.join(SCRATCH_DIR, 'recovery.json')
const RESTORE_HINT = 'npm run devtools:standin -- --restore'
const ID_PREFIX = 'standin-'
const HOME = 'pages/index/index'
const RECORD_TAB = 'pages/period/period'
const DEFAULT_READY = {
  [HOME]: data => data.loading === false && (data.hasLoadedHomeData === true || data.noRoom === true)
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const log = message => console.log(`[standin] ${message}`)
const warn = message => console.warn(`[standin] ${message}`)

class StandinTimeout extends Error {}
class StandinReset extends Error {}
// Safety stop: never retried, never followed by a capture.
export class StandinAbort extends Error {}

function bounded(promise, ms, label) {
  let timer
  Promise.resolve(promise).catch(() => {}) // a late rejection after the timeout must not crash the process
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new StandinTimeout(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

// automator.connect() cannot be cancelled; build the same MiniProgram on a socket we can terminate.
async function connectBounded(wsEndpoint, ms = 15000) {
  await probeEndpoint(wsEndpoint)
  const socket = new WebSocket(wsEndpoint)
  socket.on('error', () => {}) // surfaced through 'close' / rejected calls instead of an uncaught 'error'
  const attempt = (async () => {
    await new Promise((resolve, reject) => {
      socket.once('open', resolve)
      socket.once('close', () => reject(new Error('automator socket closed during handshake')))
    })
    const mp = new MiniProgram(new Connection(new Transport(socket)))
    await mp.checkVersion()
    return mp
  })()
  try {
    return { mp: await bounded(attempt, ms, 'automator handshake'), socket }
  } catch (error) {
    socket.terminate()
    throw new Error(`${error.message}; check npm run devtools:preflight, MCP fallback in docs/devtools-verification.md`)
  }
}

// ---------------------------------------------------------------------------------------------
// App-service functions. Each is stringified and sent through automator evaluate: no closures over
// this module, ES2017 syntax, JSON-serializable arguments and results.

function appReady() {
  return typeof wx !== 'undefined' && typeof getCurrentPages === 'function' && getCurrentPages().length > 0
}

function appToday() {
  var d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function readStorageEntries() {
  return wx.getStorageInfoSync().keys.slice().sort().map(function (k) {
    var v = wx.getStorageSync(k)
    if (v instanceof Date) return { k: k, t: 'date', v: v.getTime() }
    if (v === undefined) return { k: k, t: 'undefined' }
    return { k: k, t: 'json', v: v }
  })
}

// Clean slate: the stand-in run starts from exactly the scenario's keys.
function applyStorageEntries(entries) {
  wx.getStorageInfoSync().keys.forEach(function (k) { wx.removeStorageSync(k) })
  entries.forEach(function (e) { wx.setStorageSync(e.k, e.t === 'date' ? new Date(e.v) : e.v) })
  return wx.getStorageInfoSync().keys.length
}

function installStandin(cfg) {
  var KEY = '__standinState'
  var holder = Object.getOwnPropertyDescriptor(wx, KEY)
  var prev = holder && holder.value
  // A stale state (earlier run, simulated reset) still carries the true original accessor.
  var original = prev && prev.original ? prev.original : Object.getOwnPropertyDescriptor(wx, 'cloud')
  if (!original) return { ok: false, reason: 'wx.cloud descriptor missing' }
  if (!original.configurable) return { ok: false, reason: 'wx.cloud is not configurable' }
  var clone = function (v) { return JSON.parse(JSON.stringify(v)) }
  var state = {
    token: cfg.token,
    ctxId: cfg.ctxId,
    pid: cfg.pid,
    original: original,
    scenario: clone(cfg.scenario),
    store: { periods: clone(cfg.scenario.records.periods), memories: clone(cfg.scenario.records.memories) },
    seq: 0,
    blocked: 0,
    log: [],
    nextId: 1,
    pendingInit: prev && prev.pendingInit ? prev.pendingInit : null
  }
  var FIELDS = {
    periods: ['startDate', 'endDate', 'status', 'note', 'duration', 'flow', 'symptoms'],
    memories: ['date', 'note']
  }
  var ok = function (result) { return { result: result } }
  var record = function (entry) {
    state.log.push(entry)
    if (state.log.length > 300) state.log.shift()
  }
  var pick = function (collection, data) {
    var out = {}
    FIELDS[collection].forEach(function (f) { if (data && Object.prototype.hasOwnProperty.call(data, f)) out[f] = clone(data[f]) })
    return out
  }
  var sortDesc = function (collection, list) {
    var key = collection === 'periods' ? 'startDate' : 'date'
    return list.slice().sort(function (a, b) { return String(b[key] || '').localeCompare(String(a[key] || '')) })
  }
  var roomDoc = function () {
    var paired = state.scenario.room === 'paired'
    return {
      _id: 'standin-room',
      roomCode: state.scenario.fakeRoomCode,
      createdByName: 'TA',
      partnerName: paired ? 'TA' : '',
      partnerOpenid: paired ? 'standin-partner' : '',
      status: paired ? 'paired' : 'waiting'
    }
  }
  var failureFor = function (name, data) {
    var failures = state.scenario.failures || {}
    var keys = [
      [name, data.action, data.collection].filter(Boolean).join(':'),
      [name, data.action].filter(Boolean).join(':'),
      name
    ]
    for (var i = 0; i < keys.length; i++) if (failures[keys[i]]) return failures[keys[i]]
    return null
  }
  var dataOp = function (data) {
    var collection = data.collection
    if (collection !== 'periods' && collection !== 'memories') return ok({ code: -1, msg: '不支持的数据集合' })
    if (!data.roomCode) return ok({ code: -1, msg: '缺少房间码', errorCode: 'ROOM_CODE_REQUIRED' })
    var code = String(data.roomCode).trim().toUpperCase()
    if (state.scenario.room === 'none' || code !== state.scenario.fakeRoomCode) {
      return ok({ code: -1, msg: '无权访问该房间', errorCode: 'ROOM_ACCESS_DENIED' })
    }
    var list = state.store[collection]
    var index = list.findIndex(function (r) { return r._id === data.id })
    // Like cloudfunctions/dataOp, a list answer carries the Room pairing status (waiting / paired).
    if (data.action === 'list') return ok({ code: 0, data: sortDesc(collection, clone(list)), roomStatus: state.scenario.room })
    if (data.action === 'add') {
      var added = pick(collection, data.data)
      added._id = 'standin-' + collection + '-new-' + (state.nextId++)
      added.createdByMe = true
      list.unshift(added)
      return ok({ code: 0, id: added._id, record: clone(added) })
    }
    if (data.action === 'update') {
      if (index < 0) return ok({ code: -1, msg: '记录不存在或无权修改' })
      list[index] = Object.assign({}, list[index], pick(collection, data.data))
      return ok({ code: 0, id: data.id, record: clone(list[index]) })
    }
    if (data.action === 'remove') {
      if (index < 0) return ok({ code: -1, msg: '记录不存在或无权删除' })
      list.splice(index, 1)
      return ok({ code: 0 })
    }
    return ok({ code: -1, msg: '未知操作' })
  }
  var decide = function (name, data) {
    var failure = failureFor(name, data)
    if (failure === 'network') return { reject: 'request:fail standin simulated network failure' }
    if (failure === 'business') return ok({ code: -1, msg: '操作失败' })
    if (failure && typeof failure === 'object') return ok(clone(failure))
    switch (name) {
      case '__standinProbe': return ok({ code: 0, standin: state.token })
      case 'getMyRoom':
        return state.scenario.room === 'none'
          ? ok({ code: 1, msg: '未加入任何房间', errorCode: 'NO_ACTIVE_ROOM' })
          : ok({ code: 0, room: roomDoc() })
      case 'createRoom': state.scenario.room = 'waiting'; return ok({ code: 0, room: roomDoc() })
      case 'joinRoom': state.scenario.room = 'paired'; return ok({ code: 0, msg: '加入成功', roomCode: state.scenario.fakeRoomCode })
      case 'leaveRoom': state.scenario.room = 'none'; return ok({ code: 0, removedCount: 1, deletedCount: 0 })
      case 'login': return ok({ openid: 'standin-openid' })
      case 'dataOp': return dataOp(data)
      default: return { reject: 'standin: no stand-in answer for cloud function ' + name }
    }
  }
  var callFunction = function (options) {
    var opts = options || {}
    var name = String(opts.name || '')
    var data = opts.data || {}
    var entry = { seq: ++state.seq, name: name, action: data.action || '', collection: data.collection || '', outcome: '' }
    record(entry)
    var outcome
    try { outcome = decide(name, data) } catch (e) { outcome = { reject: 'standin: ' + (e && e.message) } }
    entry.outcome = outcome.reject ? 'reject' : (outcome.result && outcome.result.code === 0 ? 'ok' : 'fail')
    var promise = new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (outcome.reject) {
          var error = new Error('cloud.callFunction:fail ' + outcome.reject)
          error.errMsg = error.message
          reject(error)
        } else {
          resolve({ result: outcome.result, errMsg: 'cloud.callFunction:ok', requestID: 'standin-' + entry.seq })
        }
      }, state.scenario.latencyMs || 0)
    })
    if (typeof opts.success === 'function' || typeof opts.fail === 'function' || typeof opts.complete === 'function') {
      promise.then(function (res) {
        if (typeof opts.success === 'function') opts.success(res)
        if (typeof opts.complete === 'function') opts.complete(res)
      }, function (err) {
        if (typeof opts.fail === 'function') opts.fail(err)
        if (typeof opts.complete === 'function') opts.complete(err)
      })
      return undefined
    }
    return promise
  }
  var blocked = function (prop) {
    return function () {
      state.blocked += 1
      record({ seq: ++state.seq, name: 'wx.cloud.' + prop, action: '', collection: '', outcome: 'blocked' })
      throw new Error('standin: wx.cloud.' + prop + ' is blocked during a stand-in run')
    }
  }
  var init = function () {
    state.pendingInit = Array.prototype.slice.call(arguments).map(clone)
    record({ seq: ++state.seq, name: 'wx.cloud.init', action: '', collection: '', outcome: 'deferred' })
  }
  var standinCloud = new Proxy({}, {
    get: function (target, prop) {
      if (prop === '__standinToken') return state.token
      if (prop === 'callFunction') return callFunction
      if (prop === 'init') return init
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      return blocked(String(prop))
    },
    has: function (target, prop) { return prop === 'callFunction' || prop === 'init' }
  })
  var getter = function () { return standinCloud }
  var setter = function (value) {
    record({ seq: ++state.seq, name: 'wx.cloud=', action: '', collection: '', outcome: 'forwarded' })
    if (state.original.set) state.original.set.call(wx, value)
  }
  Object.defineProperty(wx, 'cloud', { get: getter, set: setter, configurable: true, enumerable: !!original.enumerable })
  Object.defineProperty(wx, KEY, { value: state, configurable: true, enumerable: false, writable: true })
  // Judge the swap by what wx.cloud answers. The runtime stores the accessor wrapped, so the descriptor's get is
  // not this getter even when the swap took effect (2026-11-15, base library 3.18.0).
  return { ok: !!wx.cloud && wx.cloud.__standinToken === cfg.token, reusedOriginal: !!(prev && prev.original) }
}

// deep=false: installation status only. deep=true: also scan the top page's data and app-owned `_x` fields for
// record ids and 6-character room-code-like tokens (returned to Node, compared there; never printed).
function inspectStandin(token, deep) {
  var holder = Object.getOwnPropertyDescriptor(wx, '__standinState')
  var st = holder && holder.value
  var installed = !!(st && st.token === token && wx.cloud && wx.cloud.__standinToken === token)
  var pages = typeof getCurrentPages === 'function' ? getCurrentPages() : []
  var page = pages[pages.length - 1]
  var out = {
    installed: installed,
    foreign: !!(st && st.token !== token),
    foreignPid: st && st.token !== token ? st.pid : null,
    ctxId: st ? st.ctxId : null,
    route: page ? page.route : '',
    seq: st ? st.seq : -1,
    blocked: st ? st.blocked : 0
  }
  if (!deep) return out
  var ids = {}
  var codes = {}
  var nodes = 0
  var LIMIT = 60000
  var walk = function (v, depth) {
    if (v === null || v === undefined || nodes++ > LIMIT || depth > 9) return
    if (typeof v === 'string') {
      var re = /(?:^|[^A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])/g
      var m
      while ((m = re.exec(v))) codes[m[1]] = true
      return
    }
    if (typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(function (x) { walk(x, depth + 1) }); return }
    if (typeof v._id === 'string') ids[v._id] = true
    Object.keys(v).forEach(function (k) { walk(v[k], depth + 1) })
  }
  if (page) {
    walk(page.data, 0)
    Object.keys(page).forEach(function (k) {
      if (/^_[A-Za-z]/.test(k) && page[k] && typeof page[k] === 'object') walk(page[k], 0)
    })
  }
  out.ids = Object.keys(ids)
  out.codes = Object.keys(codes)
  out.truncated = nodes > LIMIT
  return out
}

async function probeStub(token) {
  var st = (Object.getOwnPropertyDescriptor(wx, '__standinState') || {}).value
  if (!st || st.token !== token || !wx.cloud || wx.cloud.__standinToken !== token) return { installed: false, marker: null }
  var res = await wx.cloud.callFunction({ name: '__standinProbe' })
  return { installed: true, marker: res && res.result ? res.result.standin : null }
}

// Calls the app's own modules (the same singletons the pages use) and reports only what reached the stub.
async function proveAppPath(token, expect) {
  var st = (Object.getOwnPropertyDescriptor(wx, '__standinState') || {}).value
  if (!st || st.token !== token) return { reason: 'stub missing before app-path probe' }
  var before = st.seq
  var room = await require('utils/room.js').getVerifiedActiveRoom()
  var list = await require('utils/cloud.js').createRoomDataClient().list(expect.collection)
  var calls = st.log.filter(function (e) { return e.seq > before }).map(function (e) {
    return [e.name, e.action, e.collection].filter(Boolean).join(':')
  })
  var ids = list && Array.isArray(list.data) ? list.data.map(function (r) { return String(r && r._id) }) : null
  return {
    calls: calls,
    roomBound: !!(room && room.bound),
    roomIsFake: !!(room && room.roomCode === expect.fakeRoomCode),
    listKind: list && list.kind,
    listIdsStandin: ids ? ids.every(function (id) { return id.indexOf('standin-') === 0 }) : null,
    listCount: ids ? ids.length : null
  }
}

function updateStandinScenario(token, cfg, resetStore) {
  var st = (Object.getOwnPropertyDescriptor(wx, '__standinState') || {}).value
  if (!st || st.token !== token) return false
  st.scenario = JSON.parse(JSON.stringify(cfg))
  if (resetStore) st.store = { periods: JSON.parse(JSON.stringify(cfg.records.periods)), memories: JSON.parse(JSON.stringify(cfg.records.memories)) }
  return true
}

function readStubLog(token) {
  var st = (Object.getOwnPropertyDescriptor(wx, '__standinState') || {}).value
  if (!st || st.token !== token) return null
  return st.log.map(function (e) { return { seq: e.seq, name: e.name, action: e.action, collection: e.collection, outcome: e.outcome } })
}

// openFrom: the navigateTo mock leaves the URL an entry built here instead of navigating.
function clearEntryUrl() {
  delete getApp().__standinEntryUrl
  return true
}

function takeEntryUrl() {
  var app = getApp()
  var url = app.__standinEntryUrl || null
  if (url) delete app.__standinEntryUrl
  return url
}

function missingWxMethods(names) {
  return names.filter(function (name) { return typeof wx[name] !== 'function' })
}

// Calls a method of the top page from inside the app service and waits for its promise, at most 10 s.
// automator's Page.callMethod answers "this.<name> is not a function" for this app's pages although the
// method is on the instance (2026-11-15, base library 3.18.0).
function callTopPage(name, args) {
  var pages = getCurrentPages()
  var page = pages[pages.length - 1]
  if (!page || typeof page[name] !== 'function') return { called: false, route: page ? page.route : '' }
  var settled = Promise.resolve(page[name].apply(page, args)).then(function (value) {
    try { return { called: true, value: value === undefined ? null : JSON.parse(JSON.stringify(value)) } } catch (e) { return { called: true, value: null } }
  }, function (error) {
    return { called: true, error: String((error && error.message) || error) }
  })
  var pending = new Promise(function (resolve) { setTimeout(function () { resolve({ called: true, pending: true }) }, 10000) })
  return Promise.race([settled, pending])
}

// Viewport-relative rect of the first match (SelectorQuery boundingClientRect: right for fixed sheets and
// transformed panels, unlike the automator's document offset), plus the page scroll offset.
function selectorRect(selector) {
  var pages = getCurrentPages()
  var page = pages[pages.length - 1]
  var q = page && typeof page.createSelectorQuery === 'function' ? page.createSelectorQuery() : wx.createSelectorQuery()
  q.select(selector).boundingClientRect()
  q.selectViewport().fields({ size: true, scrollOffset: true })
  return new Promise(function (resolve) {
    q.exec(function (res) {
      var r = res && res[0]
      var v = (res && res[1]) || {}
      resolve(r ? { left: r.left, top: r.top, width: r.width, height: r.height, scrollTop: v.scrollTop || 0, viewportHeight: v.height || 0 } : null)
    })
  })
}

function simulateLostStub(token) {
  var st = (Object.getOwnPropertyDescriptor(wx, '__standinState') || {}).value
  if (!st || st.token !== token) return false
  st.token = 'simulated-reset'
  st.ctxId = 'simulated-reset'
  return true // the stand-in keeps answering; only the harness's view of its install is invalidated
}

// One synchronous turn: storage back to the snapshot, then the original wx.cloud accessor. No app code
// can run in between, so nothing reaches the real cloud with stand-in storage.
function restoreRealState(entries, removeStub) {
  var keep = {}
  entries.forEach(function (e) { keep[e.k] = true })
  wx.getStorageInfoSync().keys.forEach(function (k) { if (!keep[k]) wx.removeStorageSync(k) })
  entries.forEach(function (e) {
    wx.setStorageSync(e.k, e.t === 'date' ? new Date(e.v) : (e.t === 'undefined' ? undefined : e.v))
  })
  var st = (Object.getOwnPropertyDescriptor(wx, '__standinState') || {}).value
  var cloud = 'no-stub-present'
  var realAccessor = null
  if (st && removeStub) {
    Object.defineProperty(wx, 'cloud', st.original)
    delete wx.__standinState
    var now = Object.getOwnPropertyDescriptor(wx, 'cloud')
    realAccessor = now.get === st.original.get && now.set === st.original.set && !(wx.cloud && wx.cloud.__standinToken)
    if (st.pendingInit) { try { wx.cloud.init.apply(wx.cloud, st.pendingInit) } catch (e) {} }
    cloud = 'restored'
  } else if (st) {
    cloud = 'left-in-place'
  }
  return { cloud: cloud, realAccessor: realAccessor }
}

// ---------------------------------------------------------------------------------------------
// Node-side helpers

function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']'
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}'
  }
  return JSON.stringify(value === undefined ? null : value)
}

// Salted per run: storage is low-entropy (a 6-character room code), so a bare digest that ends up in a
// shared log could be brute-forced back to the code. The salt lives only in the active recovery file.
function hashEntries(entries, salt) {
  const sorted = [...entries].sort((a, b) => a.k.localeCompare(b.k))
  return createHash('sha256').update(salt).update(stableStringify(sorted)).digest('hex')
}

function compareEntries(before, after) {
  const keys = [...new Set([...before.map(e => e.k), ...after.map(e => e.k)])].sort()
  return keys.map(key => {
    const a = before.find(e => e.k === key)
    const b = after.find(e => e.k === key)
    return { key, same: !!a && !!b && stableStringify(a) === stableStringify(b) }
  })
}

function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function readRecovery(file) {
  if (!existsSync(file)) return null
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
}

function writeRecovery(file, content) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(content, null, 1))
}

function addDays(dateString, offset) {
  const [y, m, d] = dateString.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + offset))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

export function defaultRecords(today) {
  const day = offset => addDays(today, offset)
  return {
    periods: [
      { _id: 'standin-period-3', startDate: day(-2), endDate: '', status: 'ongoing', duration: 0, flow: 'normal', symptoms: ['tired'], note: '替身记录', createdByMe: true },
      { _id: 'standin-period-2', startDate: day(-30), endDate: day(-26), status: 'known-end', duration: 5, flow: 'light', symptoms: [], note: '', createdByMe: false },
      { _id: 'standin-period-1', startDate: day(-58), endDate: day(-54), status: 'known-end', duration: 5, flow: 'normal', symptoms: ['cramps'], note: '', createdByMe: true }
    ],
    memories: [
      { _id: 'standin-memory-1', date: day(-3), note: '替身：一起散步', createdByMe: true },
      { _id: 'standin-memory-2', date: day(-17), note: '替身：看电影', createdByMe: false }
    ]
  }
}

function normalizeRecords(records) {
  const out = {}
  for (const collection of ['periods', 'memories']) {
    const list = records && Array.isArray(records[collection]) ? records[collection] : []
    out[collection] = list.map((record, index) => {
      const id = record._id || `${ID_PREFIX}${collection}-${index + 1}`
      if (!String(id).startsWith(ID_PREFIX)) throw new Error(`stand-in record ids must start with "${ID_PREFIX}" (got one in ${collection})`)
      return { ...record, _id: String(id) }
    })
  }
  return out
}

function resolveScenario(input = {}, today, previous = null) {
  const prev = previous || {}
  const pickValue = (key, fallback) => (input[key] !== undefined ? input[key] : (prev[key] !== undefined ? prev[key] : fallback))
  const room = pickValue('room', 'paired')
  if (!['paired', 'waiting', 'none'].includes(room)) throw new Error(`scenario.room must be paired|waiting|none, got ${room}`)
  const listFailure = pickValue('listFailure', null)
  if (![null, 'periods', 'memories', 'both'].includes(listFailure)) throw new Error('scenario.listFailure must be null|periods|memories|both')
  let records = prev.records
  if (input.records !== undefined) {
    const raw = typeof input.records === 'function' ? input.records({ today, day: offset => addDays(today, offset) }) : input.records
    records = normalizeRecords(raw)
  }
  if (!records) records = normalizeRecords(defaultRecords(today))
  return {
    room,
    records,
    listFailure,
    failures: { ...pickValue('failures', {}) },
    partnerWelcome: pickValue('partnerWelcome', null),
    roomStatusSeen: pickValue('roomStatusSeen', undefined),
    density: pickValue('density', null),
    storage: { ...(prev.storage || {}), ...(input.storage || {}) },
    latencyMs: pickValue('latencyMs', 60)
  }
}

function stubConfig(scenario) {
  const failures = { ...scenario.failures }
  if (scenario.listFailure === 'periods' || scenario.listFailure === 'both') failures['dataOp:list:periods'] ??= 'network'
  if (scenario.listFailure === 'memories' || scenario.listFailure === 'both') failures['dataOp:list:memories'] ??= 'network'
  return { room: scenario.room, records: scenario.records, failures, latencyMs: scenario.latencyMs, fakeRoomCode: FAKE_ROOM_CODE }
}

function encodeEntry(k, v) {
  if (v instanceof Date) return { k, t: 'date', v: v.getTime() }
  return { k, t: 'json', v }
}

function storagePlan(scenario) {
  const set = []
  if (scenario.room !== 'none') set.push(encodeEntry('roomCode', FAKE_ROOM_CODE))
  const seen = scenario.roomStatusSeen === undefined ? (scenario.room === 'none' ? null : scenario.room) : scenario.roomStatusSeen
  if (seen) set.push(encodeEntry('roomStatusSeen', seen))
  if (scenario.partnerWelcome) set.push(encodeEntry('partnerWelcome', scenario.partnerWelcome))
  if (scenario.density) set.push(encodeEntry('calendarDensity', scenario.density))
  for (const [k, v] of Object.entries(scenario.storage)) set.push(encodeEntry(k, v))
  return set
}

function summarizeScenario(scenario) {
  return {
    room: scenario.room,
    listFailure: scenario.listFailure,
    failures: Object.keys(stubConfig(scenario).failures),
    partnerWelcome: scenario.partnerWelcome,
    density: scenario.density || 'app-default',
    records: { periods: scenario.records.periods.length, memories: scenario.records.memories.length }
  }
}

function pngSize(buffer) {
  if (buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error('screenshot is not a PNG')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function cropPng(buffer, rect) {
  const { PNG } = require('pngjs')
  const src = PNG.sync.read(buffer)
  const x = Math.max(0, Math.min(src.width - 1, Math.floor(rect.x)))
  const y = Math.max(0, Math.min(src.height - 1, Math.floor(rect.y)))
  const width = Math.max(1, Math.min(src.width - x, Math.ceil(rect.x + rect.width) - x))
  const height = Math.max(1, Math.min(src.height - y, Math.ceil(rect.y + rect.height) - y))
  const dst = new PNG({ width, height })
  PNG.bitblt(src, dst, x, y, width, height, 0, 0)
  return { buffer: PNG.sync.write(dst), rect: { x, y, width, height } }
}

function sanitizeName(name) {
  const safe = String(name || '').replace(/\.png$/i, '').replace(/[^A-Za-z0-9._-]/g, '_')
  if (!safe) throw new Error('screenshot name is required')
  return safe
}

function describe(entry) {
  if (entry.kind === 'goto') return `goto ${entry.route}`
  if (entry.kind === 'screenshot') return `screenshot ${entry.name}`
  return `${entry.kind} ${entry.selector || entry.method || ''}`.trim()
}

// ---------------------------------------------------------------------------------------------
// Process guards: restore on signals and crashes. A hard kill cannot be caught; use --restore after it.

const ACTIVE = new Set()
let guardsInstalled = false
let emergencyStarted = false

function installProcessGuards() {
  if (guardsInstalled) return
  guardsInstalled = true
  const emergency = (code, why) => {
    if (emergencyStarted) return
    emergencyStarted = true
    console.error(`[standin] ${why}; restoring real storage and wx.cloud before exit`)
    Promise.allSettled([...ACTIVE].map(session => bounded(session.close(), 60000, 'emergency restore')))
      .then(results => {
        for (const r of results) {
          if (r.status === 'rejected') console.error(`[standin] restore failed: ${r.reason && r.reason.message}; run ${RESTORE_HINT}`)
        }
      })
      .finally(() => process.exit(code))
  }
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGBREAK', 149], ['SIGHUP', 129]]) {
    process.on(signal, () => emergency(code, signal))
  }
  const head = error => (error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : String(error))
  process.on('uncaughtException', error => emergency(1, `uncaught exception: ${head(error)}`))
  process.on('unhandledRejection', error => emergency(1, `unhandled rejection: ${head(error)}`))
  process.on('exit', () => {
    for (const session of ACTIVE) {
      if (session.snapshot && !session.restored) console.error(`[standin] exiting before restore; run: ${RESTORE_HINT}`)
    }
  })
}

// ---------------------------------------------------------------------------------------------

class StandinSession {
  constructor(options = {}) {
    this.ws = options.ws || DEFAULT_WS
    this.outDir = path.resolve(options.outDir || DEFAULT_OUT)
    this.recoveryFile = options.recoveryFile || DEFAULT_RECOVERY
    // copied into every captures.jsonl record (e.g. { runId, head, ticket }) so runs can be told apart
    this.captureMeta = options.captureMeta || null
    this.token = randomUUID()
    this.journal = []
    this.mocks = new Map()
    this.resets = 0
    this.closed = false
    this.restored = false
    this.snapshot = null
  }

  // ---- public API -------------------------------------------------------------------------

  goto(route, options = {}) {
    const clean = String(route).replace(/^\//, '')
    return this.step({ kind: 'goto', route: clean, waitFor: options.waitFor, settle: options.settle ?? 1200, root: options.root || '.page' })
  }

  tapSelector(selector, options = {}) {
    return this.step({ kind: 'tap', selector, settle: options.settle ?? 900 })
  }

  tapText(selector, text, options = {}) {
    return this.step({ kind: 'tapText', selector, text, settle: options.settle ?? 900 })
  }

  setData(data, options = {}) {
    return this.step({ kind: 'setData', data, settle: options.settle ?? 500 })
  }

  callMethod(method, ...args) {
    return this.step({ kind: 'callMethod', method, args, settle: 600 })
  }

  // Opens the page an entry method of the current page navigates to (e.g. 'addMemory', or 'editMemory' with
  // { currentTarget: { dataset: { id } } }): the entry runs with wx.navigateTo recording the URL it builds, then
  // automator opens that URL on top of the current page, so the page gets the same query as a tap on the entry.
  // Under automator, a page opened by the app's own wx.navigateTo often cannot be popped (2026-11-14: navigateBack
  // reported ok and the stack stayed, 6/6), while automator-opened pages pop (5/5): save, delete and back return.
  openFrom(method, ...args) {
    return this.step({ kind: 'open', method, args, settle: 800, root: '.page' })
  }

  // After a save or delete navigates back: waits until the current route is `route`.
  async waitForRoute(route, ms = 8000) {
    const target = String(route).replace(/^\//, '').split('?')[0]
    await this.until(async () => (await this.currentPath()) === target, ms, `route ${target}`)
  }

  scrollTo(top, options = {}) {
    return this.step({ kind: 'scroll', top, settle: options.settle ?? 500 })
  }

  // Returns { file, route, viewport, image, crop, ... } and appends the same record to <outDir>/captures.jsonl.
  // options.crop: CSS selector or { x, y, width, height } in viewport CSS px; options.padding: CSS px around it.
  screenshot(name, options = {}) {
    return this.step({ kind: 'screenshot', name: sanitizeName(name), crop: options.crop || null, padding: options.padding || 0 })
  }

  // Mock a wx API in the app-service context (automator mockWxMethod); re-applied after a context reset,
  // restored by close().
  async mockWx(method, result, ...args) {
    await this.call(`mock ${method}`, mp => mp.mockWxMethod(method, result, ...args), 10000)
    this.mocks.set(method, { result, args })
  }

  // DevTools dispatches a mocked result by its errMsg: ':fail' runs fail/complete and rejects the promise
  // form. (A function mock gets a copy of the options without callbacks, so it cannot fail them itself.)
  mockWxFailure(method, errMsg = 'standin simulated failure') {
    return this.mockWx(method, { errMsg: `${method}:fail ${errMsg}` })
  }

  // Restores only methods this session mocked: automator's restoreWxMethod on any other method sets it to
  // undefined (2026-11-14: showModal and navigateTo vanished until the project was closed and reopened).
  async restoreWx(method) {
    if (!this.mocks.has(method)) return
    await this.call(`restore ${method}`, mp => mp.restoreWxMethod(method), 10000)
    this.mocks.delete(method)
  }

  // Change the scenario mid-run (e.g. { listFailure: 'periods' }); goto() afterwards to load it.
  async setScenario(patch) {
    await this.ensureStandin()
    this.scenario = resolveScenario(patch, this.today, this.scenario)
    const updated = await this.evaluate(updateStandinScenario, this.token, stubConfig(this.scenario), patch.records !== undefined)
    if (!updated) await this.recover(false)
    await this.evaluate(applyStorageEntries, storagePlan(this.scenario))
  }

  // Current page data, read only after the same checks as a capture (stand-in data only).
  async pageData(dataPath) {
    await this.ensureStandin()
    await this.guardCapture()
    const page = await this.page()
    return this.call('page data', () => page.data(dataPath), 10000)
  }

  async stubLog() {
    await this.ensureStandin()
    return this.evaluate(readStubLog, this.token)
  }

  // Test aid: invalidate the harness's view of the install (the stand-in keeps blocking the cloud) so the
  // next step exercises detect -> re-install -> replay -> retry, as after a DevTools recompile.
  async simulateReset() {
    return this.evaluate(simulateLostStub, this.token)
  }

  // ---- lifecycle --------------------------------------------------------------------------

  async open(scenarioInput) {
    installProcessGuards()
    await recoverStaleRun({ ws: this.ws, recoveryFile: this.recoveryFile })
    await this.connect()
    await this.waitAppReady()
    const status = await this.evaluate(inspectStandin, this.token, false)
    if (status.foreign && status.foreignPid !== process.pid && pidAlive(status.foreignPid)) {
      throw new StandinAbort(`another stand-in session (pid ${status.foreignPid}) owns this simulator`)
    }
    if (status.foreign) warn('replacing a stale stand-in stub left by an earlier run (its saved real wx.cloud is kept)')
    const entries = await this.evaluate(readStorageEntries)
    const roomEntry = entries.find(e => e.k === 'roomCode')
    const realRoomCode = roomEntry && roomEntry.t === 'json' ? String(roomEntry.v || '').trim().toUpperCase() : ''
    if (realRoomCode === FAKE_ROOM_CODE) {
      throw new StandinAbort('storage already holds the stand-in room code, so it is not the real state; run --restore or re-open the project first')
    }
    this.salt = randomBytes(16).toString('hex')
    this.snapshot = entries
    this.snapshotHash = hashEntries(entries, this.salt)
    this.realRoomCode = realRoomCode
    writeRecovery(this.recoveryFile, { active: true, pid: process.pid, startedAt: new Date().toISOString(), ws: this.ws, salt: this.salt, hash: this.snapshotHash, entries })
    ACTIVE.add(this)
    this.today = await this.evaluate(appToday)
    this.scenario = resolveScenario(scenarioInput, this.today)
    await this.installStub()
    log(`stub installed and proven (app path: ${this.lastProof.join(', ')}); storage snapshot ${entries.length} key(s) salted-sha256:${this.snapshotHash.slice(0, 12)}`)
  }

  // Restores mocks, storage and wx.cloud, verifies storage against the snapshot hash, reLaunches the homepage.
  close() {
    if (!this.closing) this.closing = this.doClose().finally(() => {
      try { if (this.mp) this.mp.disconnect() } catch {}
    })
    return this.closing
  }

  async doClose() {
    this.closed = true
    const report = { keys: [], beforeSha256: this.snapshotHash || null, afterSha256: null, storageMatches: false, cloud: null, realAccessor: null, relaunched: false, stubGone: null, wxMethodsMissing: null, resetsRecovered: this.resets }
    if (!this.snapshot) { ACTIVE.delete(this); return report }
    if (!this.isConnected()) await this.reconnect()
    await this.waitAppReady().catch(() => {})
    for (const method of [...this.mocks.keys()]) {
      try { await this.restoreWx(method) } catch (error) { warn(`restoreWxMethod ${method} failed: ${error.message}`) }
    }
    const status = await this.evaluate(inspectStandin, this.token, false)
    const removeStub = status.installed || !status.foreign || status.foreignPid === process.pid || !pidAlive(status.foreignPid)
    let result = await this.evaluate(restoreRealState, this.snapshot, removeStub)
    let after = await this.evaluate(readStorageEntries)
    if (hashEntries(after, this.salt) !== this.snapshotHash) {
      warn('storage differs after restore; restoring once more')
      result = await this.evaluate(restoreRealState, this.snapshot, removeStub)
      after = await this.evaluate(readStorageEntries)
    }
    report.afterSha256 = hashEntries(after, this.salt)
    report.storageMatches = report.afterSha256 === this.snapshotHash
    report.keys = compareEntries(this.snapshot, after)
    report.cloud = result.cloud
    report.realAccessor = result.realAccessor
    if (!report.storageMatches) {
      throw new Error(`storage restore not verified (recovery file kept: ${this.recoveryFile}); run --restore`)
    }
    writeRecovery(this.recoveryFile, { active: false, restoredAt: new Date().toISOString() })
    this.restored = true
    ACTIVE.delete(this)
    try {
      await this.performGoto({ route: HOME, settle: 800, root: '.page', waitFor: null, skipReady: true })
      report.relaunched = true
    } catch (error) {
      warn(`reLaunch ${HOME} after restore failed: ${error.message}`)
    }
    const final = await this.evaluate(inspectStandin, this.token, false)
    report.stubGone = !final.installed && !final.foreign
    try {
      report.wxMethodsMissing = await this.evaluate(missingWxMethods, ['showModal', 'showToast', 'navigateTo', 'navigateBack', 'switchTab', 'reLaunch'])
      if (report.wxMethodsMissing.length) warn(`wx.${report.wxMethodsMissing.join(', wx.')} missing after restore; close and reopen the project with npm run devtools:cli`)
    } catch (error) {
      warn(`wx method check after restore failed: ${error.message}`)
    }
    return report
  }

  // ---- internals --------------------------------------------------------------------------

  isConnected() {
    return !!this.socket && this.socket.readyState === WebSocket.OPEN
  }

  async connect() {
    const { mp, socket } = await connectBounded(this.ws)
    this.mp = mp
    this.socket = socket
  }

  async reconnect() {
    try { if (this.mp) this.mp.disconnect() } catch {}
    warn('automator connection lost; reconnecting')
    await this.connect()
  }

  call(label, fn, ms) {
    return bounded(fn(this.mp), ms, label)
  }

  evaluate(fn, ...args) {
    return this.call(`evaluate ${fn.name}`, mp => mp.evaluate(fn, ...args), 15000)
  }

  async until(predicate, ms, label) {
    const deadline = Date.now() + ms
    let lastError = null
    while (Date.now() < deadline) {
      try { if (await predicate()) return } catch (error) { lastError = error }
      await sleep(200)
    }
    throw new StandinTimeout(`waiting for ${label} timed out after ${ms}ms${lastError ? ` (${lastError.message})` : ''}`)
  }

  async waitAppReady() {
    await this.until(() => this.evaluate(appReady), 30000, 'app service ready')
  }

  async page() {
    return this.call('currentPage', mp => mp.currentPage(), 10000)
  }

  async currentPath() {
    const page = await this.page()
    return page ? page.path : ''
  }

  async installStub() {
    const result = await this.evaluate(installStandin, { token: this.token, ctxId: randomUUID(), pid: process.pid, scenario: stubConfig(this.scenario) })
    if (!result || !result.ok) throw new StandinAbort(`stub install failed: ${(result && result.reason) || 'accessor not replaced'}`)
    await this.evaluate(applyStorageEntries, storagePlan(this.scenario))
    for (const [method, mock] of this.mocks) await this.call(`mock ${method}`, mp => mp.mockWxMethod(method, mock.result, ...mock.args), 10000)
    await this.proveInterception()
  }

  async proveInterception() {
    const probe = await this.evaluate(probeStub, this.token)
    if (!probe.installed || probe.marker !== this.token) throw new StandinAbort('stub not in place (probe marker missing); no capture will run')
    const sc = this.scenario
    const failures = stubConfig(sc).failures
    const collection = failures['dataOp:list:periods'] && !failures['dataOp:list:memories'] ? 'memories' : 'periods'
    const app = await this.evaluate(proveAppPath, this.token, { collection, fakeRoomCode: FAKE_ROOM_CODE })
    const problems = []
    if (!app || app.reason) problems.push(app ? app.reason : 'no result')
    else {
      if (!app.calls.includes('getMyRoom')) problems.push('room session call did not reach the stub')
      if (sc.room !== 'none' && !app.calls.includes(`dataOp:list:${collection}`)) problems.push(`list ${collection} did not reach the stub`)
      if (sc.room !== 'none' && !failures.getMyRoom && !app.roomIsFake) problems.push('room session did not resolve the stand-in room')
      if (app.listKind === 'success' && !(app.listIdsStandin && app.listCount === sc.records[collection].length)) problems.push('list returned non-stand-in records')
    }
    if (problems.length) throw new StandinAbort(`app path not intercepted: ${problems.join('; ')}`)
    this.lastProof = app.calls
  }

  async ensureStandin() {
    if (this.closed) throw new Error('stand-in session is closed')
    let status
    try {
      status = await this.evaluate(inspectStandin, this.token, false)
    } catch (error) {
      await this.recover(true)
      return
    }
    if (!status.installed) await this.recover(true)
  }

  // Lost connection or reset context: reconnect, wait for the app, re-install + re-prove the stub (fresh
  // stand-in store, scenario storage, mocks), then replay navigation/interaction since the last goto.
  async recover(replay) {
    if (!this.isConnected()) await this.reconnect()
    await this.waitAppReady()
    const status = await this.evaluate(inspectStandin, this.token, false)
    if (!status.installed) {
      if (status.foreign && status.foreignPid !== process.pid && pidAlive(status.foreignPid)) {
        throw new StandinAbort(`another stand-in session (pid ${status.foreignPid}) took over the simulator`)
      }
      this.resets += 1
      warn(`stand-in stub missing (context reset #${this.resets}); re-installing before continuing`)
      await this.installStub()
    }
    if (replay) for (const entry of this.journal) await this.perform(entry)
  }

  async step(entry) {
    await this.ensureStandin()
    try {
      const out = await this.perform(entry)
      this.remember(entry)
      return out
    } catch (error) {
      if (error instanceof StandinAbort || this.closed) throw error
      warn(`${describe(entry)} failed (${error.message}); checking the context and retrying once`)
      await this.recover(entry.kind !== 'goto')
      const out = await this.perform(entry)
      this.remember(entry)
      return out
    }
  }

  remember(entry) {
    if (entry.kind === 'goto') this.journal = [entry]
    else if (entry.kind !== 'screenshot') this.journal.push(entry)
  }

  async perform(entry) {
    switch (entry.kind) {
      case 'goto': return this.performGoto(entry)
      case 'open': return this.performOpen(entry)
      case 'tap': {
        const page = await this.page()
        const element = await this.call(`find ${entry.selector}`, () => page.$(entry.selector), 10000)
        if (!element) throw new Error(`element not found: ${entry.selector}`)
        await this.call(`tap ${entry.selector}`, () => element.tap(), 10000)
        await sleep(entry.settle)
        return undefined
      }
      case 'tapText': {
        const page = await this.page()
        const candidates = await this.call(`find ${entry.selector}`, () => page.$$(entry.selector), 10000)
        for (const element of candidates) {
          const text = await this.call('element text', () => element.text(), 10000)
          if (text && text.includes(entry.text)) {
            await this.call(`tap ${entry.text}`, () => element.tap(), 10000)
            await sleep(entry.settle)
            return undefined
          }
        }
        throw new Error(`"${entry.text}" not found among ${candidates.length} ${entry.selector} elements`)
      }
      case 'setData': {
        const page = await this.page()
        await this.call('setData', () => page.setData(entry.data), 10000)
        await sleep(entry.settle)
        return undefined
      }
      case 'callMethod': {
        const result = await this.callOnTopPage(entry.method, entry.args)
        await sleep(entry.settle)
        return result
      }
      case 'scroll':
        await this.call('pageScrollTo', mp => mp.pageScrollTo(entry.top), 10000)
        await sleep(entry.settle)
        return undefined
      case 'screenshot': return this.performScreenshot(entry)
      default: throw new Error(`unknown step ${entry.kind}`)
    }
  }

  async navigate(url) {
    const target = url.replace(/^\//, '').split('?')[0]
    await this.call(`reLaunch ${target}`, mp => mp.callWxMethod('reLaunch', { url }), 20000)
    await this.until(async () => (await this.currentPath()) === target, 15000, `route ${target}`)
  }

  // Always lands on a fresh page instance: reLaunching to the current route does not return in automator,
  // so detour through another tab page first.
  async performGoto({ route, waitFor, settle, root, skipReady }) {
    const target = route.split('?')[0]
    if ((await this.currentPath()) === target) {
      await this.navigate(target === 'pages/settings/settings' ? `/${HOME}` : '/pages/settings/settings')
      await sleep(600)
    }
    await this.navigate(`/${route}`)
    if (!skipReady) {
      await this.waitRendered(target, root)
      const ready = waitFor || DEFAULT_READY[target]
      if (ready) {
        await this.until(async () => {
          const page = await this.page()
          const data = await this.call('page data', () => page.data(), 10000)
          return typeof ready === 'function' ? ready(data) : Object.entries(ready).every(([k, v]) => data[k] === v)
        }, 12000, `${target} ready`)
      }
    }
    await sleep(settle)
    return target
  }

  // A missing method or a rejected promise stops the run without the one-step retry: calling again could
  // repeat a save or delete that already reached the stand-in.
  async callOnTopPage(method, args) {
    const out = await this.evaluate(callTopPage, method, args)
    if (!out.called) throw new StandinAbort(`page ${out.route || '(none)'} has no method ${method}`)
    if (out.error) throw new StandinAbort(`${method} rejected: ${out.error}`)
    if (out.pending) warn(`${method} still pending after 10 s; continuing`)
    return out.value
  }

  async waitRendered(target, root) {
    await this.until(async () => {
      const page = await this.page()
      if (!page || page.path !== target) return false
      const element = await this.call('page root', () => page.$(root), 5000)
      if (!element) return false
      const size = await this.call('page root size', () => element.size(), 5000)
      return Number(size.width) > 0 && Number(size.height) > 0
    }, 10000, `${root} rendered`)
  }

  async performOpen({ method, args, settle, root }) {
    if (this.mocks.has('navigateTo')) throw new Error('openFrom needs wx.navigateTo unmocked; restoreWx("navigateTo") first')
    await this.evaluate(clearEntryUrl)
    await this.mockWx('navigateTo', function (options) {
      getApp().__standinEntryUrl = (options && options.url) || ''
      return { errMsg: 'navigateTo:ok' }
    })
    let url = null
    try {
      await this.callOnTopPage(method, args)
      await this.until(async () => Boolean(url = await this.evaluate(takeEntryUrl)), 3000, `${method} calling wx.navigateTo`)
    } finally {
      await this.restoreWx('navigateTo')
    }
    const target = url.replace(/^\//, '').split('?')[0]
    await this.call(`navigateTo ${target}`, mp => mp.navigateTo(`/${url.replace(/^\//, '')}`), 20000)
    await this.waitRendered(target, root)
    await sleep(settle)
    return target
  }

  async guardCapture() {
    if (!this.journal.length) throw new StandinAbort('call goto() first: the page on screen was loaded before the stub and may hold real data')
    const s = await this.evaluate(inspectStandin, this.token, true)
    if (!s.installed) throw new StandinReset('stand-in stub not installed at capture time')
    const foreign = s.ids.filter(id => !id.startsWith(ID_PREFIX))
    if (foreign.length) throw new StandinAbort(`${foreign.length} non-stand-in record id(s) in page data; capture refused (goto a page after opening the stand-in first)`)
    if (this.realRoomCode && s.codes.includes(this.realRoomCode)) throw new StandinAbort('the real room code is present in page data; capture refused')
    if (s.truncated) warn('page data scan hit its node limit; ids beyond it were not checked')
    return s
  }

  async cropRect(crop, padding) {
    if (typeof crop === 'object') return { selector: null, x: crop.x - padding, y: crop.y - padding, width: crop.width + 2 * padding, height: crop.height + 2 * padding, scrollTop: null }
    // SelectorQuery rect, read until two reads 150 ms apart agree (a sheet still sliding in moves between reads)
    // and the element is inside the viewport: a sheet whose slide-in has not started yet sits still below the
    // bottom edge, so agreement alone would crop a 2px sliver (seen on the 151 recap sheet)
    let last = null
    const visible = r => r.top < (r.viewportHeight || Infinity) - 1 && r.top + r.height > 1 && r.height > 0
    for (let i = 0; i < 20; i++) {
      const r = await this.evaluate(selectorRect, crop)
      if (!r) break
      if (last && visible(r) && Math.abs(r.top - last.top) < 0.5 && Math.abs(r.left - last.left) < 0.5 && Math.abs(r.height - last.height) < 0.5) {
        return { selector: crop, x: r.left - padding, y: r.top - padding, width: r.width + 2 * padding, height: r.height + 2 * padding, scrollTop: r.scrollTop, source: 'selectorQuery' }
      }
      last = r
      await sleep(150)
    }
    if (last) warn(`crop rect for ${crop} did not settle inside the viewport in 20 reads; using the last one`)
    if (last) return { selector: crop, x: last.left - padding, y: last.top - padding, width: last.width + 2 * padding, height: last.height + 2 * padding, scrollTop: last.scrollTop, source: 'selectorQuery-unsettled' }
    const page = await this.page()
    const element = await this.call(`find ${crop}`, () => page.$(crop), 10000)
    if (!element) throw new Error(`crop element not found: ${crop}`)
    const offset = await this.call('element offset', () => element.offset(), 10000)
    const size = await this.call('element size', () => element.size(), 10000)
    const scrollTop = Number(await this.call('scrollTop', () => page.scrollTop(), 10000)) || 0
    // Element.getOffset is document-relative; the screenshot is the viewport.
    return { selector: crop, x: offset.left - padding, y: offset.top - scrollTop - padding, width: Number(size.width) + 2 * padding, height: Number(size.height) + 2 * padding, scrollTop }
  }

  async capture() {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.call('captureScreenshot', mp => mp.screenshot(), 30000)
      } catch (error) {
        if (attempt >= 2) throw error
        warn(`screenshot attempt ${attempt} failed (${error.message}); retrying`)
        await sleep(500)
      }
    }
  }

  async performScreenshot({ name, crop, padding }) {
    const pre = await this.guardCapture()
    const info = await this.call('systemInfo', mp => mp.systemInfo(), 10000)
    if (!(info.windowWidth > 0 && info.windowHeight > 0)) throw new Error('missing actual viewport dimensions')
    const rect = crop ? await this.cropRect(crop, padding) : null
    const base64 = await this.capture()
    const post = await this.evaluate(inspectStandin, this.token, false)
    if (!post.installed || post.ctxId !== pre.ctxId || post.route !== pre.route) {
      throw new StandinReset('context changed during capture; image discarded')
    }
    let png = Buffer.from(base64, 'base64')
    const full = pngSize(png)
    const scale = full.width / info.windowWidth
    // The simulator is zoomed uniformly and the frame can be taller than windowHeight (native tab bar), so one
    // scale serves both axes.
    const scaleY = scale
    let cropInfo = null
    if (rect) {
      const px = { x: rect.x * scale, y: rect.y * scaleY, width: rect.width * scale, height: rect.height * scaleY }
      const cropped = cropPng(png, px)
      png = cropped.buffer
      cropInfo = { selector: rect.selector, cssRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, scrollTop: rect.scrollTop, pxRect: cropped.rect }
    }
    mkdirSync(this.outDir, { recursive: true })
    const file = path.join(this.outDir, `${name}.png`)
    writeFileSync(file, png)
    const size = pngSize(png)
    const evidence = {
      file,
      route: pre.route,
      viewport: { width: info.windowWidth, height: info.windowHeight },
      image: { width: size.width, height: size.height, pxPerCssPx: Number(scale.toFixed(4)), fullFrame: full, frameCss: { width: Math.round(full.width / scale), height: Math.round(full.height / scale) } },
      crop: cropInfo,
      ...(this.captureMeta ? { run: this.captureMeta } : {}),
      scenario: summarizeScenario(this.scenario),
      standin: { verifiedBeforeAndAfter: true, recordIds: pre.ids.length, stubCalls: pre.seq, resetsRecovered: this.resets },
      capturedAt: new Date().toISOString()
    }
    appendFileSync(path.join(this.outDir, 'captures.jsonl'), JSON.stringify(evidence) + '\n')
    log(`captured ${info.windowWidth}x${info.windowHeight} ${pre.route}${cropInfo ? ` crop ${cropInfo.selector || 'rect'}` : ''}: ${file}`)
    return evidence
  }
}

export async function openStandin(options = {}) {
  const session = new StandinSession(options)
  try {
    await session.open(options.scenario || {})
    return session
  } catch (error) {
    if (session.snapshot) {
      try { await session.close() } catch (closeError) { warn(`restore after failed open: ${closeError.message}`) }
    } else {
      ACTIVE.delete(session)
      try { if (session.mp) session.mp.disconnect() } catch {}
    }
    throw error
  }
}

// Runs fn(session) and always restores. Resolves { result, report }; a failure from fn is rethrown after
// the restore with error.restoreReport attached.
export async function withStandin(options, fn) {
  const session = await openStandin(options)
  let result
  let failure = null
  try { result = await fn(session) } catch (error) { failure = error }
  let report
  try { report = await session.close() } catch (closeError) {
    if (failure) closeError.cause = failure
    throw closeError
  }
  if (failure) { failure.restoreReport = report; throw failure }
  return { result, report }
}

// Puts back the storage snapshot of a run that died before close() (hard kill, closed DevTools) and
// removes its stub. Refuses while the owning process is still alive.
export async function recoverStaleRun({ ws = DEFAULT_WS, recoveryFile = DEFAULT_RECOVERY } = {}) {
  const saved = readRecovery(recoveryFile)
  if (!saved || !saved.active) return { recovered: false }
  if (saved.pid !== process.pid && pidAlive(saved.pid)) {
    throw new StandinAbort(`stand-in run pid ${saved.pid} is still active (${recoveryFile})`)
  }
  warn(`run pid ${saved.pid} (started ${saved.startedAt}) did not restore; restoring its storage snapshot now`)
  const { mp } = await connectBounded(ws)
  try {
    const result = await bounded(mp.evaluate(restoreRealState, saved.entries, true), 15000, 'restore')
    const after = await bounded(mp.evaluate(readStorageEntries), 15000, 'read storage')
    if (hashEntries(after, saved.salt || '') !== saved.hash) throw new Error('recovered storage does not match the saved snapshot hash')
    writeRecovery(recoveryFile, { active: false, restoredAt: new Date().toISOString() })
    log(`recovered storage salted-sha256:${saved.hash.slice(0, 12)} (verified); wx.cloud ${result.cloud}`)
    let relaunched = false
    try { await relaunchHome(mp); relaunched = true } catch (error) { warn(`reLaunch ${HOME} after recovery failed: ${error.message}`) }
    return { recovered: true, cloud: result.cloud, relaunched }
  } finally {
    mp.disconnect()
  }
}

// Fresh homepage instance on the real cloud (detour first: reLaunching to the current route never returns).
async function relaunchHome(mp) {
  const current = await bounded(mp.currentPage(), 10000, 'currentPage')
  if (current && current.path === HOME) {
    await bounded(mp.callWxMethod('reLaunch', { url: '/pages/settings/settings' }), 20000, 'reLaunch detour')
    await sleep(800)
  }
  await bounded(mp.callWxMethod('reLaunch', { url: `/${HOME}` }), 20000, `reLaunch ${HOME}`)
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const page = await bounded(mp.currentPage(), 10000, 'currentPage')
    if (page && page.path === HOME) return
    await sleep(300)
  }
  throw new StandinTimeout(`route ${HOME} not reached`)
}

// ---------------------------------------------------------------------------------------------
// CLI

function homeMarks(data) {
  const pick = flag => (data.days || []).filter(day => day && !day.isEmpty && day[flag]).map(day => day.date)
  return { period: pick('isPeriod'), memory: pick('isMemory'), predict: pick('isPredict'), today: pick('isToday') }
}

function expectedMarks(session, periods, memories) {
  const { buildHomeCalendarState } = require(path.join(PROJECT_ROOT, 'utils', 'homeCalendarState.js'))
  const [year, month] = session.today.split('-').map(Number)
  return homeMarks(buildHomeCalendarState({ year, month: month - 1, periods, memories, today: session.today }))
}

// Record-tab edit page opened through its entry: saving adds one record and deleting removes it, and each time
// the app comes back to the record tab.
async function editRoundTrip(h) {
  await h.goto(RECORD_TAB, { waitFor: d => d.hasLoaded === true && d.memoryHasLoaded === true })
  await h.mockWx('showModal', { confirm: true, cancel: false, errMsg: 'showModal:ok' })
  const since = Math.max(0, ...(await h.stubLog()).map(e => e.seq))
  await h.openFrom('addMemory')
  await h.callMethod('onNoteInput', { detail: { value: '替身保存' } })
  await h.callMethod('save')
  await h.waitForRoute(RECORD_TAB)
  const newId = (JSON.stringify(await h.pageData()).match(/standin-memories-new-\d+/) || [null])[0]
  if (newId) {
    await h.openFrom('editMemory', { currentTarget: { dataset: { id: newId } } })
    await h.callMethod('delete')
    await h.waitForRoute(RECORD_TAB)
  }
  const stillListed = newId ? JSON.stringify(await h.pageData()).includes(newId) : null
  await h.restoreWx('showModal')
  const writes = (await h.stubLog()).filter(e => e.seq > since && e.name === 'dataOp' && e.action !== 'list')
  const count = action => writes.filter(e => e.action === action && e.collection === 'memories' && e.outcome === 'ok').length
  return { newId, stillListed, adds: count('add'), removes: count('remove'), otherWrites: writes.length - count('add') - count('remove') }
}

async function demo(args) {
  const outDir = args.out ? path.resolve(args.out) : DEFAULT_OUT
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'captures.jsonl'), '') // the demo regenerates its evidence set each run
  const { result, report } = await withStandin({ ws: args.ws, outDir }, async h => {
    const records = h.scenario.records
    await h.goto(HOME)
    const full = await h.screenshot('home-standin')
    const calendar = await h.screenshot('home-standin-calendar', { crop: '.calendar-swipe' })
    const okMarks = homeMarks(await h.pageData())
    const okExpected = expectedMarks(h, records.periods, records.memories)
    const roundTrip = await editRoundTrip(h)
    if (args['simulate-reset']) {
      await h.simulateReset()
      log('simulated a lost stub; the next step must detect it, re-install and replay')
    }
    await h.setScenario({ listFailure: 'periods' })
    await h.goto(HOME, { waitFor: d => d.loading === false && d.syncStatusPhase === 'open' })
    const failed = await h.screenshot('home-periods-list-failed')
    const failData = await h.pageData()
    const failMarks = homeMarks(failData)
    const failExpected = expectedMarks(h, [], records.memories)
    const stub = await h.stubLog()
    return { full, calendar, failed, okMarks, okExpected, roundTrip, failMarks, failExpected, syncText: failData.syncStatusText, stub }
  })
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  console.log('\n=== demo summary ===')
  for (const shot of [result.full, result.calendar, result.failed]) {
    console.log(`${path.relative(PROJECT_ROOT, shot.file)}  route=${shot.route} viewport=${shot.viewport.width}x${shot.viewport.height} image=${shot.image.width}x${shot.image.height}${shot.crop ? ` crop=${shot.crop.selector} css(${shot.crop.cssRect.x},${shot.crop.cssRect.y},${shot.crop.cssRect.width}x${shot.crop.cssRect.height})` : ''} recordIds=${shot.standin.recordIds} resets=${shot.standin.resetsRecovered}`)
  }
  console.log(`stand-in marks (rendered): ${JSON.stringify(result.okMarks)}`)
  console.log(`rendered == derived from stand-in records only: ${same(result.okMarks, result.okExpected)}`)
  const trip = result.roundTrip
  const tripOk = Boolean(trip.newId) && trip.stillListed === false && trip.adds === 1 && trip.removes === 1 && trip.otherWrites === 0
  console.log(`edit page via openFrom: add=${trip.adds} remove=${trip.removes} other writes=${trip.otherWrites}; new row listed after save=${Boolean(trip.newId)}, gone after delete=${trip.stillListed === false}`)
  console.log(`periods-failed marks (rendered): ${JSON.stringify(result.failMarks)}; == memories-only derivation: ${same(result.failMarks, result.failExpected)}; sync pill: ${result.syncText}`)
  const calls = result.stub.reduce((acc, e) => { const key = [e.name, e.action, e.collection].filter(Boolean).join(':') + `=${e.outcome}`; acc[key] = (acc[key] || 0) + 1; return acc }, {})
  console.log(`stub answered: ${JSON.stringify(calls)}`)
  console.log(`storage keys: ${report.keys.map(k => `${k.key}:${k.same ? 'same' : 'DIFFERENT'}`).join(', ')}`)
  console.log(`storage salted-sha256 before ${report.beforeSha256.slice(0, 16)}… after ${report.afterSha256.slice(0, 16)}… match=${report.storageMatches}`)
  const wxIntact = Array.isArray(report.wxMethodsMissing) && report.wxMethodsMissing.length === 0
  console.log(`wx.cloud ${report.cloud}, real accessor back=${report.realAccessor}, stub gone=${report.stubGone}, wx methods intact=${wxIntact}, reLaunched ${HOME}=${report.relaunched}, resets recovered=${report.resetsRecovered}`)
  if (!report.storageMatches || !report.stubGone || !wxIntact || !tripOk || !same(result.okMarks, result.okExpected) || !same(result.failMarks, result.failExpected)) process.exitCode = 1
}

async function main() {
  const args = {}
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, '')
    const next = process.argv[i + 1]
    if (next && !next.startsWith('--')) { args[key] = next; i++ } else args[key] = true
  }
  if (args.restore) {
    const outcome = await recoverStaleRun({ ws: args.ws })
    log(outcome.recovered ? `restore done; reLaunched ${HOME}=${outcome.relaunched}` : 'no active recovery snapshot; nothing to restore')
    return
  }
  if (args.demo) return demo(args)
  console.log('Usage: npm run devtools:standin -- --demo [--simulate-reset] [--out <dir>] [--ws <url>] | --restore [--ws <url>]')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(process.exitCode || 0), error => {
    console.error(`[standin] ${error.message}`)
    process.exit(1)
  })
}
