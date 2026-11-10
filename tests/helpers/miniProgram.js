const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { setImmediate: checkpoint } = require('node:timers')
const { isDeepStrictEqual } = require('node:util')
const { evaluateWxmlExpression, wxmlOpeningTags } = require('../wxmlTemplate')

const root = path.resolve(__dirname, '../..')
const config = require('../../app.json')
const copy = value => value === undefined ? undefined : structuredClone(value)

// Only the platform is replaced. Every application require resolves normally.
function clearApplicationCache() {
  for (const file of Object.keys(require.cache)) {
    const relative = path.relative(root, file).replaceAll('\\', '/')
    if (/^(?:pages|utils)\//.test(relative) || relative === 'app.js') delete require.cache[file]
  }
}

// Use one instance at a time in a test process; teardown restores the platform globals.
// cloud.when({ name, data }).reply(result) takes the raw cloud result (not { result }).
// defer() returns resolve/reject controls; replyOnce() queues responses before the fallback.
// settle() drains promises and work due now; advance(ms) also moves the shared clock.
// flush() drains all timers and rejects if a cloud response is still outstanding.
// autoCommit:false delays render callbacks until commit(page).
// Page registrations and application modules persist within an app, but never across test environments.
function createMiniProgram({ storage: initialStorage = {}, now = '2026-06-26T12:00:00+08:00', autoCommit = true, reducedMotion = false, selectors = {}, windowInfo = {} } = {}) {
  clearApplicationCache()
  const registrations = new Map()
  const keys = ['Page', 'wx', 'getCurrentPages', 'Date', 'setTimeout', 'clearTimeout']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(global, key)]))
  const NativeDate = global.Date
  let time = new NativeDate(now).getTime()
  assert.ok(Number.isFinite(time), 'now must be a valid date')
  let nextTimer = 0
  const timers = new Map()
  const storage = copy(initialStorage)
  const stack = []
  const tabs = new Map()
  const lifecycle = []
  const commits = []
  const rendered = new WeakMap()
  const livePages = new WeakSet()
  function commit(page) {
    const batch = commits.filter(item => !page || item.page === page)
    for (const item of batch) {
      const index = commits.indexOf(item)
      if (index === -1 || !livePages.has(item.page)) continue
      commits.splice(index, 1)
      applyPatch(rendered.get(item.page), item.patch)
      viewContext(item.page).deliverChanges(rendered.get(item.page))
      if (item.callback) track(item.callback.call(item.page))
    }
    return batch.length
  }
  const errors = []
  const rules = []
  const calls = []
  const pendingCloud = new Set()
  let registered
  let active = true
  const schedule = (fn, delay = 0, ...args) => {
    const id = ++nextTimer
    timers.set(id, { at: time + Math.max(0, Number(delay) || 0), fn: () => fn(...args) })
    return id
  }
  function FakeDate(...args) {
    if (!new.target) return new NativeDate(time).toString()
    return new NativeDate(...(args.length ? args : [time]))
  }
  FakeDate.prototype = NativeDate.prototype
  Object.setPrototypeOf(FakeDate, NativeDate)
  FakeDate.now = () => time

  const cloud = {
    calls,
    when(match) {
      const pattern = typeof match === 'string' ? { name: match } : match
      const rule = { pattern, replies: [], fallback: undefined }
      rules.push(rule)
      const route = {
        reply(result) { rule.fallback = () => Promise.resolve(copy(result)); return route },
        replyOnce(result) { rule.replies.push(() => Promise.resolve(copy(result))); return route },
        reject(error) { rule.fallback = () => Promise.reject(error); return route },
        defer() {
          let resolve
          let reject
          const promise = new Promise((yes, no) => { resolve = yes; reject = no })
          rule.replies.push(() => promise)
          return { resolve: result => resolve(copy(result)), reject }
        }
      }
      return route
    }
  }
  function track(result) {
    if (result && typeof result.then === 'function') result.catch(error => errors.push(error))
    return result
  }
  function invoke(page, name, argument) {
    return typeof page[name] === 'function' ? track(page[name](argument)) : undefined
  }
  function life(page, name, argument) {
    lifecycle.push({ route: page.route, name })
    const result = invoke(page, name, argument)
    if (name === 'onUnload') {
      livePages.delete(page)
      for (let index = commits.length - 1; index >= 0; index -= 1) {
        if (commits[index].page === page) commits.splice(index, 1)
      }
    }
    return result
  }
  function load(url) {
    const [route, query = ''] = url.replace(/^\//, '').replace(/\.js$/, '').split('?')
    assert.ok(config.pages.includes(route), `Unregistered page: ${route}`)
    if (!registrations.has(route)) {
      registered = null
      require(path.join(root, `${route}.js`))
      assert.ok(registered, `${route} must register a Page`)
      registrations.set(route, registered)
    }
    const definition = registrations.get(route)
    const page = { ...definition, route, options: Object.fromEntries(new URLSearchParams(query)), data: copy(definition.data || {}), setDataCalls: [] }
    livePages.add(page)
    rendered.set(page, copy(page.data))
    page.setData = (patch, callback) => {
      page.setDataCalls.push(copy(patch))
      applyPatch(page.data, patch)
      if (!livePages.has(page)) return
      commits.push({ page, patch: copy(patch), callback })
      if (autoCommit) schedule(() => commit(page))
    }
    return page
  }
  const viewContexts = new WeakMap()
  function viewContext(page) {
    if (viewContexts.has(page)) return viewContexts.get(page)
    const templatePath = path.join(root, `${page.route}.wxml`)
    const template = fs.readFileSync(templatePath, 'utf8')
    const modules = {}
    for (const [, attrs, body] of template.matchAll(/<wxs\b([^>]*)>([\s\S]*?)<\/wxs>/g)) {
      const name = /\bmodule=["']([^"']+)["']/.exec(attrs)[1]
      const source = /\bsrc=["']([^"']+)["']/.exec(attrs)
      const code = source ? fs.readFileSync(path.resolve(path.dirname(templatePath), source[1]), 'utf8') : body
      const module = { exports: {} }
      new Function('module', 'getDate', code)(module, (...args) => new FakeDate(...args))
      modules[name] = module.exports
    }
    const nodes = wxmlOpeningTags(template)
    const changes = nodes.flatMap((node, index) => Object.entries(node.attrs)
      .filter(([name]) => name.startsWith('change:'))
      .map(([name, handler]) => ({ index, attribute: node.attrs[name.slice(7)], handler, previous: undefined })))
    const elements = new Map()
    const styles = new Map()
    function nodeKey(selector) {
      const index = nodes.findIndex(node => selector.startsWith('.') ? node.classes.includes(selector.slice(1))
        : selector.startsWith('#') && node.attrs.id === selector.slice(1))
      return index < 0 ? selector : `node:${index}`
    }
    function element(selector, dataset = {}) {
      const key = nodeKey(selector)
      if (!elements.has(key)) {
        const state = {}
        const style = {}
        styles.set(key, style)
        const classes = new Set()
        elements.set(key, {
          getState: () => state,
          getDataset: () => dataset,
          getBoundingClientRect: () => copy(Object.entries(selectors).find(([query]) => nodeKey(query) === key)?.[1] || {}),
          setStyle: patch => Object.assign(style, patch),
          addClass: name => classes.add(name),
          removeClass: name => classes.delete(name),
          requestAnimationFrame: callback => schedule(callback, 16)
        })
      }
      return elements.get(key)
    }
    const context = {
      template, modules, element,
      viewStyle: selector => copy(styles.get(nodeKey(selector)) || {}),
      owner: { callMethod: (name, data) => invoke(page, name, data), selectComponent: selector => element(selector) },
      deliverChanges(data) {
        for (const binding of changes) {
          const valueExpression = /^\{\{([\s\S]*)\}\}$/.exec(binding.attribute)
          assert.ok(valueExpression, 'WXS change attributes must be bound expressions')
          const value = evaluateWxmlExpression(valueExpression[1], data)
          if (isDeepStrictEqual(value, binding.previous)) continue
          const handlerExpression = /^\{\{([\s\S]*)\}\}$/.exec(binding.handler)
          assert.ok(handlerExpression, 'WXS change handlers must be bound expressions')
          const handler = evaluateWxmlExpression(handlerExpression[1], modules)
          assert.equal(typeof handler, 'function')
          const previous = binding.previous
          binding.previous = copy(value)
          track(handler(copy(value), copy(previous), context.owner, element(`node:${binding.index}`)))
        }
      }
    }
    viewContexts.set(page, context)
    return context
  }
  const ready = new WeakSet()
  function show(page, first = false) {
    if (first) life(page, 'onLoad', page.options)
    life(page, 'onShow')
    if (!ready.has(page)) {
      ready.add(page)
      commits.push({ page, patch: {}, callback: () => { if (livePages.has(page)) life(page, 'onReady') } })
      if (autoCommit) schedule(() => commit(page))
    }
  }
  const navigation = []
  const navigationReplies = new Map()
  function navigate(method, options = {}) {
    navigation.push({ method, ...options })
    const failure = navigationReplies.get(method)
    if (failure && (typeof failure !== 'function' || failure(options))) {
      if (options.fail) track(options.fail({ errMsg: `${method}:fail harness` }))
      if (options.complete) track(options.complete({ errMsg: `${method}:fail harness` }))
      return
    }
    const current = stack.at(-1)
    if (method === 'navigateBack') {
      const delta = Math.min(options.delta || 1, stack.length - 1)
      for (let i = 0; i < delta; i += 1) life(stack.pop(), 'onUnload')
      if (delta && stack.length) show(stack.at(-1))
    } else if (method === 'navigateTo') {
      const page = load(options.url)
      if (current) life(current, 'onHide')
      stack.push(page)
      show(page, true)
    } else if (method === 'redirectTo') {
      const page = load(options.url)
      if (current) life(stack.pop(), 'onUnload')
      stack.push(page)
      show(page, true)
    } else if (method === 'switchTab') {
      const route = options.url.replace(/^\//, '').split('?')[0]
      assert.ok(config.tabBar.list.some(tab => tab.pagePath === route), `${route} is not a tab`)
      if (current && current.route === route && stack.length === 1) return
      if (current && tabs.has(current.route)) life(current, 'onHide')
      for (const page of [...stack].reverse()) if (!tabs.has(page.route)) life(page, 'onUnload')
      const first = !tabs.has(route)
      const page = tabs.get(route) || load(options.url)
      tabs.set(route, page)
      stack.splice(0, stack.length, page)
      show(page, first)
    } else {
      for (const page of new Set([...stack].reverse().concat([...tabs.values()]))) life(page, 'onUnload')
      tabs.clear()
      const page = load(options.url)
      stack.splice(0, stack.length, page)
      if (config.tabBar.list.some(tab => tab.pagePath === page.route)) tabs.set(page.route, page)
      show(page, true)
    }
    if (options.success) track(options.success({ errMsg: `${method}:ok` }))
    if (options.complete) track(options.complete({ errMsg: `${method}:ok` }))
  }
  const files = []
  const fileSystem = {
    writeFileSync(path, data, encoding) { files.push(copy({ path, data, encoding })) }
  }
  const clipboard = []
  const tabBar = { visible: true, calls: [] }
  const platformCalls = {}
  const responses = new Map()
  const answered = new WeakSet()
  function respond(method, index, result) {
    const options = (platformCalls[method] || [])[index]
    assert.ok(options, `No ${method} call at ${index}`)
    assert.ok(!answered.has(options), `${method} call ${index} already answered`)
    answered.add(options)
    const failed = result instanceof Error
    if (!failed && method === 'setClipboardData') clipboard.push(options.data)
    const response = failed ? { errMsg: result.message } : result
    const callback = failed ? options.fail : options.success
    if (callback) track(callback(response))
    if (options.complete) track(options.complete(response))
  }
  function platform(method, options = {}, defaultResult) {
    const history = platformCalls[method] || (platformCalls[method] = [])
    history.push(options)
    const queue = responses.get(method) || []
    const result = queue.length ? queue.shift() : defaultResult
    if (result !== undefined) {
      const index = history.length - 1
      track(Promise.resolve().then(() => { if (active) respond(method, index, result) }))
    }
  }
  function selectorQuery() {
    const queries = []
    let selection
    const query = {
      in() { return query },
      select(selector) { selection = { selector, all: false }; return query },
      selectAll(selector) { selection = { selector, all: true }; return query },
      selectViewport() { selection = { selector: ':viewport', all: false }; return query },
      fields(fields, callback) { queries.push({ ...selection, fields, callback }); return query },
      boundingClientRect(callback) { queries.push({ ...selection, callback }); return query },
      scrollOffset(callback) { queries.push({ ...selection, callback }); return query },
      exec(callback) {
        schedule(() => {
          const result = queries.map(item => {
            const value = copy(Object.hasOwn(selectors, item.selector) ? selectors[item.selector]
              : item.selector === '.reduced-motion-probe' ? { width: reducedMotion ? '1px' : '0px' } : null)
            const answer = item.all ? (Array.isArray(value) ? value : value ? [value] : []) : value
            if (item.callback) track(item.callback(answer))
            return answer
          })
          if (callback) track(callback(result))
        })
        return query
      }
    }
    return query
  }
  const viewport = { windowWidth: 375, windowHeight: 812, screenWidth: 375, screenHeight: 812, statusBarHeight: 44, safeArea: { top: 44, bottom: 778 }, ...windowInfo }
  const wx = {
    cloud: {
      callFunction(options) {
        const call = copy({ name: options.name, data: options.data })
        calls.push(call)
        const rule = [...rules].reverse().find(candidate => matches(options, candidate.pattern) && (candidate.replies.length || candidate.fallback))
        const respond = rule && (rule.replies.shift() || rule.fallback)
        if (!respond) {
          const error = new Error(`Unprogrammed cloud call: ${JSON.stringify(calls.at(-1))}`)
          errors.push(error)
          return Promise.reject(error)
        }
        pendingCloud.add(call)
        return respond().then(result => {
          const response = { result }
          if (options.success) track(options.success(response))
          if (options.complete) track(options.complete(response))
          return response
        }, error => {
          if (options.fail) track(options.fail(error))
          if (options.complete) track(options.complete(error))
          throw error
        }).finally(() => pendingCloud.delete(call))
      }
    },
    getStorageSync(key) { return Object.hasOwn(storage, key) ? copy(storage[key]) : '' },
    setStorageSync(key, value) { storage[key] = copy(value) },
    removeStorageSync(key) { delete storage[key] },
    nextTick(fn) { schedule(fn) },
    get toasts() { return platformCalls.showToast || [] },
    get modals() { return platformCalls.showModal || [] },
    get actionSheets() { return platformCalls.showActionSheet || [] },
    showToast: options => platform('showToast', options, {}),
    showModal: options => platform('showModal', options),
    showActionSheet: options => platform('showActionSheet', options),
    env: { USER_DATA_PATH: '/wx-user-data' },
    getFileSystemManager: () => fileSystem,
    shareFileMessage: options => platform('shareFileMessage', options, {}),
    setClipboardData: options => platform('setClipboardData', options, {}),
    getClipboardData: options => platform('getClipboardData', options, { data: clipboard.at(-1) || '' }),
    showLoading: options => platform('showLoading', options, {}),
    hideLoading: options => platform('hideLoading', options, {}),
    pageScrollTo: options => platform('pageScrollTo', options, {}),
    stopPullDownRefresh: options => platform('stopPullDownRefresh', options, {}),
    createSelectorQuery: selectorQuery,
    getWindowInfo: () => copy(viewport),
    getSystemInfoSync: () => copy(viewport),
    getMenuButtonBoundingClientRect: () => ({ top: 48, bottom: 80, left: 278, right: 365, width: 87, height: 32 }),
    hideTabBar(options = {}) { tabBar.visible = false; tabBar.calls.push({ visible: false, ...options }) },
    showTabBar(options = {}) { tabBar.visible = true; tabBar.calls.push({ visible: true, ...options }) },
    navigateTo: options => navigate('navigateTo', options),
    navigateBack: options => navigate('navigateBack', options),
    redirectTo: options => navigate('redirectTo', options),
    reLaunch: options => navigate('reLaunch', options),
    switchTab: options => navigate('switchTab', options)
  }
  Object.assign(global, { wx, Page: definition => { registered = definition }, getCurrentPages: () => [...stack], Date: FakeDate, setTimeout: schedule, clearTimeout: id => timers.delete(id) })

  const app = {
    wx, cloud, storage, lifecycle, navigation, commit, clipboard, files, tabBar, platformCalls, respond,
    respondNext(method, result) {
      if (!responses.has(method)) responses.set(method, [])
      responses.get(method).push(result)
    },
    rendered(page) { return copy(rendered.get(page)) },
    viewStyle(page, selector) { return viewContext(page).viewStyle(selector) },
    get pages() { return [...stack] },
    get currentPage() { return stack.at(-1) },
    get pendingTimers() { return timers.size },
    failNavigation(method, failure = true) { navigationReplies.set(method, failure) },
    launch(url) { navigate('reLaunch', { url }); return stack.at(-1) },
    hide() { if (stack.length) life(stack.at(-1), 'onHide') },
    show() { if (stack.length) show(stack.at(-1)) },
    share(page) {
      const template = fs.readFileSync(path.join(root, `${page.route}.wxml`), 'utf8')
      assert.match(template, /open-type=["']share["']/)
      return invoke(page, 'onShareAppMessage', { from: 'button' })
    },
    dispatch(page, handler, event = {}) {
      const view = viewContext(page)
      const bindings = [...view.template.matchAll(/(?:bind|catch):?[\w-]*=["']([^"']+)["']/g)].map(match => match[1].replace(/^\{\{|\}\}$/g, '').trim())
      assert.ok(bindings.includes(handler), `${handler} must be bound by ${page.route}.wxml`)
      const input = { currentTarget: { dataset: {} }, detail: {}, timeStamp: time, ...event }
      if (handler.includes('.')) {
        const [name, action] = handler.split('.')
        assert.equal(typeof view.modules[name]?.[action], 'function')
        input.instance = view.element(`${name}:${input.currentTarget.dataset.sheet || ''}`, input.currentTarget.dataset)
        return track(view.modules[name][action](input, view.owner))
      }
      assert.equal(typeof page[handler], 'function')
      return invoke(page, handler, input)
    },
    async settle() {
      await app.advance(0)
    },
    async advance(ms) {
      const target = time + ms
      let iterations = 0
      while (true) {
        // A native event-loop checkpoint drains promise chains without advancing the fake clock.
        await new Promise(checkpoint)
        if (errors.length) throw errors.shift()
        const due = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]
        if (!due) break
        assert.ok(++iterations <= 1000, 'Timer queue did not settle')
        time = due[1].at
        timers.delete(due[0])
        track(due[1].fn())
      }
      time = target
    },
    async flush() {
      await app.settle()
      for (let i = 0; timers.size; i += 1) {
        assert.ok(i < 1000, 'Timer queue did not drain')
        await app.advance(Math.min(...[...timers.values()].map(timer => timer.at)) - time)
      }
      assert.equal(pendingCloud.size, 0, `Unanswered cloud calls: ${[...pendingCloud].map(call => call.name).join(', ')}`)
    },
    teardown() {
      if (!active) return
      active = false
      for (const page of new Set([...stack].reverse().concat([...tabs.values()]))) life(page, 'onUnload')
      timers.clear()
      clearApplicationCache()
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(global, key, descriptor)
        else delete global[key]
      }
    }
  }
  return app
}

function matches(value, pattern) {
  if (typeof pattern === 'function') return pattern(value)
  if (pattern && typeof pattern === 'object') {
    return Object.entries(pattern).every(([key, expected]) => value != null && matches(value[key], expected))
  }
  return Object.is(value, pattern)
}

function applyPatch(data, patch) {
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
    let target = data
    for (let i = 0; i < parts.length - 1; i += 1) {
      if (target[parts[i]] == null) target[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {}
      target = target[parts[i]]
    }
    target[parts.at(-1)] = copy(value)
  }
}

module.exports = { createMiniProgram }
