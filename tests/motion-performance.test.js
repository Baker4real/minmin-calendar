// 动效护栏（issue #58 起；issue #197 收窄为只守不变量）。每条断言属于下面一类：
// 声明了动画或过渡的选择器在减弱动效下有覆盖；已退役的缓动、token 与符号不再出现；一次性动效的时长与曲线只经共享 token；
// 常驻动画和模糊不超出登记的预算；状态通道在减弱动效下仍可感知；JS 里的时长常量与对应的样式 token 一致。
// 具体时长、缩放和色值以 app.wxss 与 docs/motion-and-interaction.md 为准，这里不复写：在规则允许的范围内改值时测试保持通过。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { FILL_PROPERTIES, fillOf, listWxssFiles } = require('./designTokens')
const { createMiniProgram } = require('./helpers/miniProgram')
const { renderWxmlClasses, wxmlOpeningTags } = require('./wxmlTemplate')

const repoRoot = path.join(__dirname, '..')

function readRepo(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8')
}

function maskComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

// 顶层块切分：@media/@keyframes 与普通规则分开，保留所属 at-rule 上下文
function topLevelBlocks(css) {
  const text = maskComments(css)
  const blocks = []
  let cursor = 0

  while (cursor < text.length) {
    const open = text.indexOf('{', cursor)
    if (open === -1) break

    let depth = 0
    let close = open
    for (; close < text.length; close += 1) {
      if (text[close] === '{') depth += 1
      else if (text[close] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }

    blocks.push({ header: text.slice(cursor, open).trim(), body: text.slice(open + 1, close) })
    cursor = close + 1
  }

  return blocks
}

function parseDecls(body) {
  const decls = {}
  for (const part of body.split(';')) {
    const separator = part.indexOf(':')
    if (separator === -1) continue
    const prop = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (prop) decls[prop] = value
  }
  return decls
}

function splitSelectors(header) {
  return header.split(',').map((selector) => selector.trim()).filter(Boolean)
}

function analyzeFile(css) {
  const rules = []
  const reducedMotionRules = []
  const keyframes = {}

  for (const block of topLevelBlocks(css)) {
    if (block.header.startsWith('@media')) {
      const isReducedMotion = /prefers-reduced-motion\s*:\s*reduce/.test(block.header)
      for (const inner of topLevelBlocks(block.body)) {
        const rule = {
          selectors: splitSelectors(inner.header),
          decls: parseDecls(inner.body),
          inReducedMotion: isReducedMotion
        }
        rules.push(rule)
        if (isReducedMotion) reducedMotionRules.push(rule)
      }
    } else if (block.header.startsWith('@keyframes')) {
      const name = block.header.replace('@keyframes', '').trim()
      const props = new Set()
      for (const frame of topLevelBlocks(block.body)) {
        for (const prop of Object.keys(parseDecls(frame.body))) props.add(prop)
      }
      keyframes[name] = props
    } else if (block.header) {
      rules.push({ selectors: splitSelectors(block.header), decls: parseDecls(block.body), inReducedMotion: false })
    }
  }

  return { rules, reducedMotionRules, keyframes }
}

const ANIMATION_KEYWORDS = new Set([
  'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'infinite',
  'alternate', 'alternate-reverse', 'reverse', 'both', 'forwards', 'backwards',
  'none', 'running', 'paused'
])

function parseAnimationShorthand(value) {
  // 先抹掉带逗号的函数值（cubic-bezier/var），再按逗号拆多组动画
  const maskedValue = String(value)
    .replace(/cubic-bezier\([^)]*\)/g, ' ')
    .replace(/var\([^)]*\)/g, ' ')
  return maskedValue.split(',').map((segment) => {
    let name = null
    let durationSec = null
    let infinite = false
    for (const token of segment.trim().split(/\s+/)) {
      const time = /^([\d.]+)(m?s)$/.exec(token)
      if (time) {
        durationSec = Number(time[1]) / (time[2] === 'ms' ? 1000 : 1)
        continue
      }
      if (ANIMATION_KEYWORDS.has(token)) {
        if (token === 'infinite') infinite = true
        continue
      }
      if (!name) name = token
    }
    return { name, durationSec, infinite }
  }).filter((entry) => entry.name && entry.name !== 'none')
}

function ruleAnimations(rule) {
  const entries = []
  if (rule.decls.animation) entries.push(...parseAnimationShorthand(rule.decls.animation))
  if (rule.decls['animation-name']) {
    const duration = /^([\d.]+)(m?s)$/.exec(rule.decls['animation-duration'] || '')
    entries.push({
      name: rule.decls['animation-name'].trim(),
      durationSec: duration ? Number(duration[1]) / (duration[2] === 'ms' ? 1000 : 1) : null,
      infinite: /infinite/.test(rule.decls['animation-iteration-count'] || '')
    })
  }
  return entries.filter((entry) => entry.name && entry.name !== 'none')
}

function selectorSignature(selector) {
  const classes = [...selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((match) => match[1])
  const pseudo = /::(?:before|after)/.exec(selector)
  return { classes, pseudo: pseudo ? pseudo[0] : null }
}

// sameElement：标记里和某个类总在同一个元素上的类（类名 → 类名数组）
function reducedMotionSelectorCovers(animatedSelector, rmSelector, sameElement = {}) {
  const animated = selectorSignature(animatedSelector)
  const rm = selectorSignature(rmSelector)
  if (rm.classes.length === 0) return false
  // 覆盖必须落在同一元素同一层级：类的个数相同（低特异的 RM 规则压不住高特异动画声明），
  // 每个类都写在动画选择器里，或在标记里和它同在一个元素上；
  // 伪元素 scope 相同（.page::before 的动画不能被只写 .page 的 RM 规则覆盖）
  if (rm.classes.length !== animated.classes.length) return false
  const onElement = new Set(animated.classes.flatMap((cls) => [cls, ...(sameElement[cls] || [])]))
  if (!rm.classes.every((cls) => onElement.has(cls))) return false
  if (animated.pseudo !== rm.pseudo) return false
  return true
}

test('reduced-motion coverage requires matching pseudo-element scope', () => {
  assert.equal(reducedMotionSelectorCovers('.page::before', '.page'), false)
  assert.equal(reducedMotionSelectorCovers('.page::before', '.page::after'), false)
  assert.equal(reducedMotionSelectorCovers('.page::before', '.page::before'), true)
  assert.equal(reducedMotionSelectorCovers('.glow-orb', '.glow-orb'), true)
  assert.equal(reducedMotionSelectorCovers('.sync-pill.syncing .sync-dot', '.sync-pill'), false)
  assert.equal(reducedMotionSelectorCovers('.sync-pill.syncing .sync-dot', '.sync-pill.syncing .sync-dot'), true)
  // 共有类只在标记证明它和动画类同在一个元素上时才算覆盖
  assert.equal(reducedMotionSelectorCovers('.bloom-a', '.bloom'), false)
  assert.equal(reducedMotionSelectorCovers('.bloom-a', '.bloom', { 'bloom-a': ['bloom'] }), true)
  assert.equal(reducedMotionSelectorCovers('.bloom-a::before', '.bloom', { 'bloom-a': ['bloom'] }), false)
})

function analyzedWxssFiles() {
  return listWxssFiles(repoRoot).map((file) => {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    return { relative, ...analyzeFile(fs.readFileSync(file, 'utf8')) }
  })
}

// 一个选择器的有效声明。files 是一份分析过的 WXSS，或按加载顺序排的几份（app.wxss 在前、页面在后：
// 共享层写在 app.wxss、各页只写自己的值时两边一起看）；同一选择器的各条规则按出现顺序层叠。
// reduced 为 true 时只看减弱动效块里的规则，否则只看块外的
function declsOf(files, selector, { reduced = false } = {}) {
  const rules = [files].flat().flatMap((file) => file.rules)
    .filter((rule) => rule.inReducedMotion === reduced && rule.selectors.includes(selector))
  assert.ok(rules.length > 0, `expected ${selector}${reduced ? ' under reduced motion' : ''}`)
  return Object.assign({}, ...rules.map((rule) => rule.decls))
}

// app.wxss 的 page 上定义的一档时长 token，以毫秒计
function appTokenMs(name) {
  const value = declsOf(analyzeFile(readRepo('app.wxss')), 'page')[name]
  const ms = /^(\d+)ms$/.exec(value || '')
  assert.ok(ms, `app.wxss defines ${name} in ms`)
  return Number(ms[1])
}

test('bounce/elastic/spring easing keywords are retired from every WXSS', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    for (const keyword of ['bounce', 'elastic', 'spring']) {
      const pattern = new RegExp(keyword, 'i')
      if (pattern.test(masked)) violations.push(`${relative} still names "${keyword}"`)
    }
  }
  assert.deepEqual(violations, [])
})

test('no cubic-bezier overshoots: both y parameters stay within 0-1', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    for (const match of masked.matchAll(/cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)) {
      const [y1, y2] = [Number(match[2]), Number(match[4])]
      if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) {
        violations.push(`${relative} uses overshoot cubic-bezier(${match.slice(1, 5).join(',')})`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

// 过渡和动画引用的时长、延迟与曲线都是 app.wxss page 上的共享 token，别处不另定义同族 token
test('motion tokens the styles use are the shared ones defined on the app page', () => {
  const shared = declsOf(analyzeFile(readRepo('app.wxss')), 'page')
  const used = new Set()
  const violations = []
  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      for (const prop of ['transition', 'animation']) {
        for (const match of (rule.decls[prop] || '').matchAll(/var\((--[\w-]+)\)/g)) used.add(match[1])
      }
      const sharedRule = file.relative === 'app.wxss' && !rule.inReducedMotion && rule.selectors.includes('page')
      for (const prop of Object.keys(rule.decls)) {
        if (/^--(?:duration|delay|ease)-/.test(prop) && !sharedRule) {
          violations.push(`${file.relative} ${rule.selectors.join(', ')} redefines ${prop}`)
        }
      }
    }
  }
  assert.ok(used.size > 0, 'the survey reaches the motion tokens')
  for (const name of used) {
    if (!shared[name]) violations.push(`${name} is not a shared token on the app.wxss page`)
  }
  assert.deepEqual(violations, [])
})

// 常驻动画注册表，与 docs/motion-and-interaction.md「常驻动画注册表」是同一张表，新增或删除时两边一起改（issue #163）。
// decorative：装饰，周期 6–12s，弹层遮挡和页面不可见时暂停在当前帧，减弱动效下静止；
// functional：状态指示，只在对应状态期间存在，可以快于 6s，遮挡和隐藏时照常；
// reduced-motion：减弱动效下的无位移替代。
const CONTINUOUS_ANIMATIONS = {
  auroraViolet: 'decorative',
  auroraRose: 'decorative',
  auroraLavender: 'decorative',
  float: 'decorative',
  pulse: 'decorative',
  spin: 'functional',
  syncDotPulse: 'functional',
  skeletonPulse: 'functional',
  loadingPulse: 'reduced-motion'
}
const RETIRED_ANIMATIONS = ['orbRotate', 'bounceIn', 'auroraPulse', 'orbFloat']
const DECORATIVE_CYCLE_SEC = [6, 12]

// 共享极光标记里和每个类同在一个元素上的类。色团元素都带 aurora-bloom 和自己的色名类，
// 所以暂停规则和减弱动效名单写一个 .aurora-bloom 就落在每个色团上，增减色团不用改这两处
const AURORA_SHARED_MARKUP = 'pages/shared/aurora.wxml'

function auroraSameElementClasses() {
  const sameElement = {}
  for (const match of readRepo(AURORA_SHARED_MARKUP).matchAll(/<view class="([^"]+)"/g)) {
    const classes = match[1].split(/\s+/)
    for (const cls of classes) {
      const others = classes.filter((other) => other !== cls)
      sameElement[cls] = sameElement[cls] ? sameElement[cls].filter((other) => others.includes(other)) : others
    }
  }
  return sameElement
}
const AURORA_SAME_ELEMENT = auroraSameElementClasses()

function appPages() {
  return JSON.parse(readRepo('app.json')).pages
}

function continuousRole(name) {
  return Object.prototype.hasOwnProperty.call(CONTINUOUS_ANIMATIONS, name) ? CONTINUOUS_ANIMATIONS[name] : null
}

// issue #111：一次性时长必须引用六档 token（issue #165 加 --duration-emphasis）；常驻动画、其周期、减弱动效替代和 heroIn 保持字面时长。
// 与 docs/motion-and-interaction.md「一次性动效注册表」是同一张表（heroIn 也登记在那里），新增或删除时两边一起改。
// delay：一次性动画的延迟也登记在这里，只有记录成功反馈等返回转场（--delay-return，issue #167），别的一次性动画不写延迟。
// reducedMotion：注册表的「减弱动效」一栏。stays 是只动透明度、照常播放的温和反馈；fades 换成只动透明度的替代，
// 不能整段停掉；不写就是停掉（none）或换成只动透明度的替代。
// 每条钉的是具体哪一档 token，不只是「经共享 token」：docs/motion-and-interaction.md「动效与性能边界」逐档登记了
// 每个 token 管哪些动效（例如 dayDetailFade 归 --duration-state，bindReveal 归 --duration-enter），注册表的
// 「时长与曲线」一栏逐条写同一档。换档是改登记的规则，先改那两处文档再改这里。
const LITERAL_DURATION_ANIMATIONS = new Set([...Object.keys(CONTINUOUS_ANIMATIONS), 'heroIn'])
const RETURN_DELAY = 'var(--delay-return)'
const ONE_SHOT_ANIMATIONS = {
  pageEnter: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  bindReveal: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  heroBloom: { duration: 'var(--duration-emphasis)', easing: 'var(--ease-out)' },
  dayDetailFade: { duration: 'var(--duration-state)', easing: 'var(--ease-out)' },
  calendarFlipNextA: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarFlipNextB: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarFlipPrevA: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarFlipPrevB: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarHaloA: { duration: 'var(--duration-emphasis)', easing: 'var(--ease-out)', reducedMotion: 'stays' },
  calendarHaloB: { duration: 'var(--duration-emphasis)', easing: 'var(--ease-out)', reducedMotion: 'stays' },
  recordBloom: { duration: 'var(--duration-emphasis)', easing: 'var(--ease-out)', delay: RETURN_DELAY, reducedMotion: 'fades' },
  recordAppear: { duration: 'var(--duration-emphasis)', easing: 'var(--ease-out)', delay: RETURN_DELAY, reducedMotion: 'stays' }
}
const COLOR_TRANSITION_PROPS = new Set(['background', 'background-color', 'color', 'border-color'])
const PRESS_DURATION = 'var(--duration-press)'
const STATE_DURATION = 'var(--duration-state)'
const EASE_OUT_TOKEN = 'var(--ease-out)'

function splitTopLevelComma(value) {
  const parts = []
  let current = ''
  let depth = 0
  for (const ch of value) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function lastCompound(selector) {
  // :not(.non-interactive) 只排除不可点行，按压时长仍按控件本体（.menu-item / .list-item）归类
  const stripped = selector.replace(/:active/g, '').replace(/:not\([^)]*\)/g, '').trim()
  const parts = stripped.split(/\s+/).filter(Boolean)
  return parts[parts.length - 1] || ''
}

function pressScaleTargets(files) {
  const targets = new Set()
  for (const file of files) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      if (!/scale\(\s*0\.\d+/.test(rule.decls.transform || '')) continue
      for (const selector of rule.selectors) {
        if (selector.includes(':active')) targets.add(lastCompound(selector))
      }
    }
  }
  return targets
}

function activeSetsProperty(files, target, prop) {
  for (const file of files) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      for (const selector of rule.selectors) {
        if (!selector.includes(':active') || lastCompound(selector) !== target) continue
        if (prop === 'background' || prop === 'background-color') {
          if (rule.decls.background || rule.decls['background-color']) return true
        } else if (prop === 'border-color') {
          if (rule.decls['border-color'] || rule.decls.border) return true
        } else if (rule.decls[prop]) return true
      }
    }
  }
  return false
}

// issue #154：设置「使用说明」弹层的面板与遮罩沿用首页弹层的进出时长；
// issue #166：内容块的错相也是同一套
const SHEET_MOTION_TWINS = {
  '.help-slide': '.sheet-slide',
  '.help-slide.sheet-open': '.sheet-slide.sheet-open',
  '.help-mask': '.day-sheet-mask',
  '.help-mask.sheet-open': '.day-sheet-mask.sheet-open',
  '.help-slide.sheet-open .sheet-body': '.sheet-slide.sheet-open .sheet-body'
}
// 全仓唯一允许写进 transition 第四段的延迟：弹层内容块进场晚标题一拍（issue #166）
const STAGGER_DELAY = 'var(--delay-stagger)'

// 弹层与同步胶囊每一段用哪档 token 同样是登记的规则：docs/motion-and-interaction.md「首页底部弹层进出」
// 「设置「使用说明」弹层」「弹层标题与内容错相」「首页同步胶囊进出」逐段写了时长、曲线和延迟，
// 「动效与性能边界」写了每档 token 的角色。换档先改那几条文档再改这里。
function sheetMotionExpectation(selector, prop) {
  const spaced = selector.replace(/\s+/g, ' ').trim()
  const normalized = SHEET_MOTION_TWINS[spaced] || spaced
  if (normalized === '.sheet-body' && (prop === 'opacity' || prop === 'transform')) {
    return { duration: 'var(--duration-exit)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.sheet-slide.sheet-open .sheet-body' && (prop === 'opacity' || prop === 'transform')) {
    return { duration: 'var(--duration-enter)', easing: 'var(--ease-out)', delay: STAGGER_DELAY }
  }
  if (normalized === '.sheet-slide' && prop === 'transform') {
    return { duration: 'var(--duration-exit)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.sheet-slide.sheet-open' && prop === 'transform') {
    return { duration: 'var(--duration-sheet)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.sheet-slide.sheet-open.sheet-reset' && prop === 'transform') {
    return { duration: 'var(--duration-exit)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.day-sheet-mask' && prop === 'opacity') {
    return { duration: 'var(--duration-exit)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.day-sheet-mask.sheet-open' && prop === 'opacity') {
    return { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.sync-pill' && (prop === 'opacity' || prop === 'transform')) {
    return { duration: 'var(--duration-exit)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.sync-pill.sync-open' && (prop === 'opacity' || prop === 'transform')) {
    return { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' }
  }
  return null
}

function expectedTransitionDuration(files, pressTargets, selector, prop) {
  const target = lastCompound(selector)
  if (prop === 'transform') return pressTargets.has(target) ? PRESS_DURATION : STATE_DURATION
  if (COLOR_TRANSITION_PROPS.has(prop)) {
    return activeSetsProperty(files, target, prop) ? PRESS_DURATION : STATE_DURATION
  }
  // 按压会改的透明度（柔光层，issue #166）跟着按压走；其余透明度变化是状态
  if (prop === 'opacity') return activeSetsProperty(files, target, 'opacity') ? PRESS_DURATION : STATE_DURATION
  return null
}

test('one-shot transitions and animations use the shared duration tokens and role curves', () => {
  const files = analyzedWxssFiles()
  const pressTargets = pressScaleTargets(files)
  const violations = []

  for (const file of files) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      const where = `${file.relative} ${rule.selectors.join(', ')}`

      // 周期只写在 animation 简写里，注册表和错相检查才读得到（issue #163 起没有长写例外）
      if (rule.decls['animation-duration']) {
        violations.push(`${where} animation-duration ${rule.decls['animation-duration']} must live in the animation shorthand`)
      }

      if (rule.decls.animation && rule.decls.animation !== 'none') {
        for (const part of splitTopLevelComma(rule.decls.animation)) {
          const parsed = /^([A-Za-z_][\w-]*)\s+(\S+)\s+(\S+)/.exec(part)
          if (!parsed) {
            violations.push(`${where} animation "${part}" is not a named duration`)
            continue
          }
          const [, name, duration, easing] = parsed
          // 常驻动画的周期由注册表的预算管；heroIn 是登记的字面时长例外，曲线仍走 token
          if (LITERAL_DURATION_ANIMATIONS.has(name)) {
            if (name === 'heroIn' && easing !== EASE_OUT_TOKEN) {
              violations.push(`${where} heroIn must ease on ${EASE_OUT_TOKEN}, got ${easing}`)
            }
            continue
          }
          const expected = ONE_SHOT_ANIMATIONS[name]
          if (!expected) {
            violations.push(`${where} runs unregistered one-shot animation ${name}`)
            continue
          }
          if (duration !== expected.duration || easing !== expected.easing) {
            violations.push(`${where} ${name} must be ${expected.duration} ${expected.easing}, got ${duration} ${easing}`)
          }
          // 时长、曲线之后的时间值就是延迟：只能是注册表里给这段动画登记的那一档
          const delay = part.slice(parsed[0].length).trim().split(/\s+/)
            .find((token) => /^var\(--delay-[a-z-]+\)$/.test(token) || /^-?[\d.]+m?s$/.test(token))
          if (delay !== expected.delay) {
            violations.push(`${where} ${name} delay must be ${expected.delay || 'none'}, got ${delay || 'none'}`)
          }
        }
      }

      // 时长、曲线和延迟只写在 transition 简写里，角色检查才读得到（issue #166 补上长写这个缺口）
      for (const longhand of ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay']) {
        if (rule.decls[longhand]) violations.push(`${where} ${longhand} must live in the transition shorthand`)
      }

      if (!rule.decls.transition || rule.decls.transition === 'none') continue
      for (const segment of splitTopLevelComma(rule.decls.transition)) {
        // 阴影没有时长角色：按压柔光落在柔光层透明度上（issue #166）
        if (segment.startsWith('box-shadow')) {
          violations.push(`${where} still transitions box-shadow ("${segment}")`)
          continue
        }
        const parsed = /^([a-z-]+)\s+(\S+)\s+(\S+)(?:\s+(\S+))?$/.exec(segment)
        if (!parsed) {
          violations.push(`${where} transition "${segment}" must be a property, duration token, and curve`)
          continue
        }
        const [, prop, duration, easing, delay] = parsed
        const sheetExpectations = rule.selectors.map((selector) => sheetMotionExpectation(selector, prop))
        if (sheetExpectations.every(Boolean)) {
          const expected = sheetExpectations[0]
          const same = sheetExpectations.every((item) =>
            item.duration === expected.duration && item.easing === expected.easing && item.delay === expected.delay)
          if (!same) {
            violations.push(`${where} ${prop} has no single sheet-motion duration`)
            continue
          }
          if (duration !== expected.duration || easing !== expected.easing || delay !== expected.delay) {
            violations.push(`${where} ${prop} must be ${[expected.duration, expected.easing, expected.delay].filter(Boolean).join(' ')}, got ${segment}`)
          }
          continue
        }
        if (delay !== undefined) {
          violations.push(`${where} ${prop} delays its transition; only the registered sheet stagger may ("${segment}")`)
          continue
        }
        const expectedDurations = rule.selectors.map((selector) =>
          expectedTransitionDuration(files, pressTargets, selector, prop))
        if (expectedDurations.some((value) => value == null) || new Set(expectedDurations).size !== 1) {
          violations.push(`${where} ${prop} has no single duration role`)
          continue
        }
        const expectedDuration = expectedDurations[0]
        const expectedEasing = prop === 'transform' ? EASE_OUT_TOKEN : 'ease'
        if (duration !== expectedDuration || easing !== expectedEasing) {
          violations.push(`${where} ${prop} must be ${expectedDuration} ${expectedEasing}, got ${duration} ${easing}`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('cubic-bezier survives only as the --ease-out definition', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const stripped = maskComments(fs.readFileSync(file, 'utf8'))
      .replace(/--ease-out\s*:\s*cubic-bezier\([^)]*\)/g, '')
    if (/cubic-bezier\s*\(/i.test(stripped)) violations.push(relative)
  }
  assert.deepEqual(violations, [])
})

test('the single-use --transition token stays retired', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    if (/(^|[^\w-])--transition(?![\w-])/.test(masked)) violations.push(relative)
  }
  assert.deepEqual(violations, [])
})

test('infinite animations stay inside the registered registry with slow decorative cycles', () => {
  const violations = []

  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      for (const animation of ruleAnimations(rule)) {
        if (!animation.infinite) continue
        const where = `${file.relative} ${rule.selectors.join(', ')} ${animation.name}`
        const role = continuousRole(animation.name)
        if (rule.inReducedMotion) {
          if (role !== 'reduced-motion') violations.push(`${where} is not a registered reduced-motion substitute`)
          continue
        }
        if (!role || role === 'reduced-motion') {
          violations.push(`${where} is an unregistered infinite animation`)
          continue
        }
        // 周期写成字面时长，预算才读得到
        const duration = animation.durationSec
        if (duration == null) {
          violations.push(`${where} cycle is not a literal duration`)
          continue
        }
        if (role === 'decorative' && !(duration >= DECORATIVE_CYCLE_SEC[0] && duration <= DECORATIVE_CYCLE_SEC[1])) {
          violations.push(`${where} decorative cycle ${duration}s is outside the ${DECORATIVE_CYCLE_SEC.join('-')}s slow band`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('retired second-layer / bounce animations and the month-change dim stay gone', () => {
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    for (const name of RETIRED_ANIMATIONS) {
      assert.equal(masked.includes(name), false, `${relative} should not define or reference ${name}`)
    }
  }
  // 翻月改为 .calendar-days 滑入后，网格的 .changing 变暗退役（issue #165）
  const changing = analyzedWxssFiles().flatMap((file) => file.rules.flatMap((rule) => rule.selectors))
    .filter((selector) => selector.includes('.calendar-grid.changing'))
  assert.deepEqual(changing, [])
})

// issue #163：模糊是材质选择，不是减层预算。模糊的面逐个登记在这里和 DESIGN.md「玻璃叠层」，
// 新增时两边一起改；单面 ≤20px，全屏遮罩 ≤8px（docs/motion-and-interaction.md「动效与性能边界」）。
const BLUR_RADIUS_CAP_PX = 20
const MASK_BLUR_CAP_PX = 8
const BLURRED_SURFACES = {
  'pages/index/index.wxss': ['.day-sheet-mask'],
  'pages/settings/settings.wxss': ['.help-mask']
}

test('blurred surfaces stay among the registered ones and within the radius caps', () => {
  const violations = []
  let checked = 0
  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      for (const prop of ['backdrop-filter', '-webkit-backdrop-filter']) {
        if (!Object.prototype.hasOwnProperty.call(rule.decls, prop)) continue
        checked += 1
        const where = `${file.relative} ${rule.selectors.join(', ')} ${prop}`
        const radius = Number(/blur\((\d+)px\)/.exec(rule.decls[prop])?.[1])
        if (!(radius > 0 && radius <= BLUR_RADIUS_CAP_PX)) violations.push(`${where} blur ${radius}px exceeds ${BLUR_RADIUS_CAP_PX}px`)
        if (rule.selectors.some((selector) => /mask/.test(selector)) && radius > MASK_BLUR_CAP_PX) {
          violations.push(`${where} full-screen mask blur ${radius}px exceeds ${MASK_BLUR_CAP_PX}px`)
        }
        const registered = BLURRED_SURFACES[file.relative] || []
        const unregistered = rule.selectors.filter((selector) => !registered.includes(selector))
        if (unregistered.length) violations.push(`${where} blurs unregistered ${unregistered.join(', ')}`)
      }
    }
  }
  assert.ok(checked > 0, 'the survey reaches the blurred surfaces')
  assert.deepEqual(violations, [])
})

// 减弱动效块里能覆盖 file 的规则：app.wxss 的减弱动效块作用于每一页；app.wxss 的共享规则也可以由用到它的页面各自覆盖
function reducedMotionRulesFor(files, file) {
  if (file.relative === 'app.wxss') return files.flatMap((item) => item.reducedMotionRules)
  return files.filter((item) => item === file || item.relative === 'app.wxss').flatMap((item) => item.reducedMotionRules)
}

function reducedMotionCoverage(files, file, selector, prop) {
  return reducedMotionRulesFor(files, file).filter((rm) => rm.decls[prop] !== undefined &&
    rm.selectors.some((rmSelector) => reducedMotionSelectorCovers(selector, rmSelector, AURORA_SAME_ELEMENT)))
}

function movementFreeIn(files, file) {
  const app = files.find((item) => item.relative === 'app.wxss')
  const keyframes = { ...app.keyframes, ...file.keyframes }
  return (name) => Boolean(keyframes[name]) && [...keyframes[name]].every((prop) => prop === 'opacity')
}

// 减弱动效政策：去掉位移、缩放、旋转的动画和装饰动画，状态反馈走无位移通道。
// 每段动画在减弱动效下停掉（none）或换成只动透明度的替代；只有注册表登记为照常、本身只动透明度的反馈保留
test('every animation stops or turns movement-free under reduced motion unless registered to stay', () => {
  const files = analyzedWxssFiles()
  const violations = []
  for (const file of files) {
    const movementFree = movementFreeIn(files, file)
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      for (const animation of ruleAnimations(rule)) {
        if (ONE_SHOT_ANIMATIONS[animation.name]?.reducedMotion === 'stays' && movementFree(animation.name)) continue
        for (const selector of rule.selectors) {
          const covering = reducedMotionCoverage(files, file, selector, 'animation')
          if (covering.length === 0) {
            violations.push(`${file.relative} ${selector} (${animation.name}) has no reduced-motion coverage`)
            continue
          }
          for (const substitute of covering.flatMap((rm) => parseAnimationShorthand(rm.decls.animation))) {
            if (!movementFree(substitute.name)) {
              violations.push(`${file.relative} ${selector} reduced-motion replacement ${substitute.name} still moves`)
            }
          }
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

// 减弱动效下过渡全部即时切换：按压只剩即时缩放和底色变化，弹层和胶囊立即到位，编辑页边框即时切换（issue #106）
test('every transition switches instantly under reduced motion', () => {
  const files = analyzedWxssFiles()
  const violations = []
  for (const file of files) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion || !rule.decls.transition || rule.decls.transition === 'none') continue
      for (const selector of rule.selectors) {
        const covering = reducedMotionCoverage(files, file, selector, 'transition')
        if (!covering.some((rm) => rm.decls.transition === 'none')) {
          violations.push(`${file.relative} ${selector} transition has no reduced-motion coverage`)
        }
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('loading keeps an opacity-only pulse under reduced motion instead of going silent', () => {
  const app = analyzeFile(readRepo('app.wxss'))
  const replacements = parseAnimationShorthand(declsOf(app, '.loading-spinner', { reduced: true }).animation || '')
  assert.ok(replacements.length > 0, 'the spinner is replaced, not silenced')
  for (const { name, infinite } of replacements) {
    assert.equal(infinite, true, `${name} keeps pulsing while loading`)
    const props = app.keyframes[name]
    assert.ok(props, `expected @keyframes ${name} in app.wxss`)
    assert.deepEqual([...props], ['opacity'], `${name} must be opacity-only (movement-free)`)
  }
})

// 微信逻辑层没有 matchMedia：有弹层的页面放一个探针，减弱动效下它变宽，tabBar 的隐藏和恢复据此不播动画
const SHEET_PAGES = ['pages/index/index', 'pages/settings/settings']
const REDUCED_MOTION_PROBE = '.reduced-motion-probe'

test('reduced motion makes native tab bar hide and restore instant', () => {
  const { readReducedMotionProbe, sheetTabBarAnimates } = require('../utils/sheetLifecycle')
  assert.equal(readReducedMotionProbe('1px'), true)
  assert.equal(readReducedMotionProbe('0px'), false)
  assert.equal(readReducedMotionProbe(''), false)
  assert.equal(sheetTabBarAnimates(true), false)
  assert.equal(sheetTabBarAnimates(false), true)

  for (const page of SHEET_PAGES) {
    const file = analyzeFile(readRepo(`${page}.wxss`))
    assert.equal(readReducedMotionProbe(declsOf(file, REDUCED_MOTION_PROBE).width), false, `${page} probe reads as full motion`)
    assert.equal(readReducedMotionProbe(declsOf(file, REDUCED_MOTION_PROBE, { reduced: true }).width), true,
      `${page} probe reads as reduced motion`)
    const probes = wxmlOpeningTags(readRepo(`${page}.wxml`)).filter((tag) => tag.classes.includes(REDUCED_MOTION_PROBE.slice(1)))
    assert.ok(probes.length > 0, `${page}.wxml carries the probe node`)
  }
})

// issue #166：按压改变的每一路——缩放、底色、描边、柔光层透明度——都在 --duration-press 里一起走，
// 松手按同一拍回来，没有哪一路先跳到位。按压不换 box-shadow：阴影不能过渡，柔光的变化落在柔光层的透明度上。
// 禁用与加载变体不算按压，这里跳过它们。它们按下时每一路都不动，这一条已经没有护栏：#196 按 spec 决定 29/30
// 删了 interaction-semantics 里那条检查（它不在保留的不变量里），interaction-semantics 现在只钉它们读作禁用。
// 唯一例外是「记录」tab 欢乐时光卡头：issue #109 让卡头不写过渡，它的按压只有一层底色，没有第二路要对齐。
const PRESS_BEAT_EXCEPTIONS = {
  'pages/period/period.wxss .month-header': 'issue #109: the collapsible month header writes no transition'
}
// 按压会改的各路；两种底色写法在 transition 里都走 background-color 这一路
const PRESS_CHANNELS = ['transform', ...FILL_PROPERTIES, 'border-color', 'opacity', 'color']
const transitionChannel = (prop) => (FILL_PROPERTIES.includes(prop) ? 'background-color' : prop)
const INERT_CLASSES = ['disabled', 'loading']
const PURE_CLASS_COMPOUND = /^(?:\.[A-Za-z_][\w-]*)+(?:::(?:before|after))?$/

test('a press moves every channel it changes on the press beat, and never swaps a shadow', () => {
  const files = analyzedWxssFiles()
  // 基类候选：只由类组成的单段选择器（可带 ::before/::after），类集合是按压目标的子集、伪元素相同。
  // 页面里的按压看本页和 app.wxss 的基类；app.wxss 的按压落在各页元素上，看所有页面。
  // 页面 WXSS 在 app.wxss 之后加载：同特异度时页面侧的 transition 生效
  const bases = files.flatMap((file) => file.rules
    .filter((rule) => !rule.inReducedMotion && rule.decls.transition)
    .flatMap((rule) => rule.selectors
      .filter((selector) => PURE_CLASS_COMPOUND.test(selector))
      .map((selector) => ({ ...selectorSignature(selector), relative: file.relative, transition: rule.decls.transition }))))
  const effectiveTransition = (relative, target) => {
    const { classes, pseudo } = selectorSignature(target)
    const candidates = bases.filter((base) =>
      (relative === 'app.wxss' || base.relative === relative || base.relative === 'app.wxss') &&
      base.pseudo === pseudo && base.classes.every((cls) => classes.includes(cls)))
    const pageFirst = (base) => (base.relative === 'app.wxss' ? 0 : 1)
    candidates.sort((a, b) => (b.classes.length - a.classes.length) || (pageFirst(b) - pageFirst(a)))
    return candidates[0] ? candidates[0].transition : null
  }

  const violations = []
  let checked = 0
  for (const file of files) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      for (const selector of rule.selectors.filter((item) => item.includes(':active'))) {
        const target = lastCompound(selector)
        // 惰性变体的按压不查：既不查同拍，也不查它是否真的静止（见上方说明，那一条不再受护栏）
        if (selectorSignature(target).classes.some((cls) => INERT_CLASSES.includes(cls))) continue
        const where = `${file.relative} ${selector}`
        if (rule.decls['box-shadow']) violations.push(`${where} swaps its box-shadow; dim a glow layer instead`)
        if (PRESS_BEAT_EXCEPTIONS[`${file.relative} ${target}`]) continue
        const transition = effectiveTransition(file.relative, target)
        const segments = splitTopLevelComma(transition || '')
        for (const prop of PRESS_CHANNELS) {
          if (!rule.decls[prop]) continue
          checked += 1
          const channel = transitionChannel(prop)
          const segment = segments.find((part) => part.startsWith(`${channel} `))
          if (!segment || !segment.includes(PRESS_DURATION)) {
            violations.push(`${where} changes ${prop} but ${target} does not move ${channel} on ${PRESS_DURATION} (transition: ${transition || 'none'})`)
          }
        }
      }
    }
  }
  assert.ok(checked > 0, 'the survey reaches the press rules')
  assert.deepEqual(violations, [])
})

// 按压在减弱动效下仍是即时缩放，缩放落在登记的 0.94–0.98 区间（docs/motion-and-interaction.md：Pressed 用 scale(0.94–0.98)）
const PRESS_SCALE_BAND = [0.94, 0.98]

test('every press scale stays inside the registered 0.94-0.98 band', () => {
  const violations = []
  let checked = 0
  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion || !rule.selectors.some((selector) => selector.includes(':active'))) continue
      for (const match of (rule.decls.transform || '').matchAll(/scale\(\s*([\d.]+)\s*\)/g)) {
        checked += 1
        const scale = Number(match[1])
        if (scale < PRESS_SCALE_BAND[0] || scale > PRESS_SCALE_BAND[1]) {
          violations.push(`${file.relative} ${rule.selectors.join(', ')} presses to scale(${scale})`)
        }
      }
    }
  }
  assert.ok(checked > 0, 'the survey reaches the press scales')
  assert.deepEqual(violations, [])
})

// 减弱动效下状态改走无位移的通道：减弱动效块只改时序（animation / transition），状态的颜色、透明度、缩放和遮罩层级照旧；
// 探针宽度是给 JS 读的开关，不是状态。同步中靠颜色就看得出，后台刷新的变暗看得见又不消失
test('state channels survive reduced motion: timing changes only, sync color and refresh dim stay visible', () => {
  const violations = []
  for (const file of analyzedWxssFiles()) {
    for (const rule of file.reducedMotionRules) {
      const selectors = rule.selectors.filter((selector) => selector !== REDUCED_MOTION_PROBE)
      if (selectors.length === 0) continue
      const props = Object.keys(rule.decls).filter((prop) => prop !== 'animation' && prop !== 'transition')
      if (props.length) violations.push(`${file.relative} ${selectors.join(', ')} changes ${props.join(', ')} under reduced motion`)
    }
  }
  assert.deepEqual(violations, [])

  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const syncing = fillOf(declsOf(index, '.sync-pill.syncing .sync-dot'))
  assert.ok(syncing, 'the syncing dot paints a fill of its own')
  assert.notEqual(syncing, fillOf(declsOf(index, '.sync-dot')), 'syncing reads as a color, not only as syncDotPulse')

  const dim = Number(declsOf(index, '.content-refreshing .calendar-grid').opacity)
  assert.ok(dim > 0 && dim < 1, `the background-refresh dim ${dim} stays visible and distinct`)
})

// 注册表登记为照常的反馈（今天与「预」的光晕、色带淡入）只动透明度，减弱动效下照常播；
// 登记为 fades 的（记录成功的 ♥）换成只动透明度的淡入，不整段停掉
test('opacity-only feedback keeps playing under reduced motion and the heart still fades in', () => {
  const files = analyzedWxssFiles()
  const violations = []
  let checked = 0
  for (const file of files) {
    const movementFree = movementFreeIn(files, file)
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      for (const animation of ruleAnimations(rule)) {
        const policy = ONE_SHOT_ANIMATIONS[animation.name]?.reducedMotion
        if (!policy) continue
        for (const selector of rule.selectors) {
          checked += 1
          const where = `${file.relative} ${selector} (${animation.name})`
          const covering = reducedMotionCoverage(files, file, selector, 'animation')
          if (policy === 'stays') {
            if (!movementFree(animation.name)) violations.push(`${where} may only stay under reduced motion if it moves nothing but opacity`)
            if (covering.length) violations.push(`${where} is a state channel and must keep playing under reduced motion`)
            continue
          }
          const substitutes = covering.flatMap((rm) => parseAnimationShorthand(rm.decls.animation))
          if (substitutes.length === 0 || !substitutes.every((substitute) => movementFree(substitute.name))) {
            violations.push(`${where} must fade in without moving under reduced motion, not disappear`)
          }
        }
      }
    }
  }
  assert.ok(checked > 0, 'the survey reaches the registered feedback')
  assert.deepEqual(violations, [])
})

// 弹层内容块晚标题一拍进场，最晚和面板同时落定：错相加进场时长不超过面板升起的时长（issue #166）
test('sheet content trails the title row and lands no later than the panel', () => {
  assert.ok(appTokenMs('--delay-stagger') + appTokenMs('--duration-enter') <= appTokenMs('--duration-sheet'),
    'the staggered content lands no later than the panel it rides in')
})

// 弹层离场到点卸载的计时写在 utils/sheetLifecycle.js，离场过渡的时长是 --duration-exit：两边对不上时，
// 面板没走完就被卸下，或走完了还挂着拦住点按。翻月滑入与 --duration-enter 的对齐在 home-calendar 测试里
test('a sheet unmounts when its --duration-exit transition ends', async (t) => {
  const exitMs = appTokenMs('--duration-exit')
  const app = createMiniProgram()
  t.after(() => app.teardown())
  app.cloud.when('getMyRoom').reply({ code: 0, room: { roomCode: 'ROOM01', status: 'waiting' } })
  const page = app.launch('/pages/settings/settings')
  await app.settle()
  await app.dispatch(page, 'openHelp')
  await app.settle()
  await app.dispatch(page, 'closeHelp')
  assert.equal(page.data.helpPhase, 'leaving')
  await app.advance(exitMs - 1)
  assert.equal(page.data.helpMounted, true, 'the panel is still on its way out')
  await app.advance(1)
  assert.equal(page.data.helpMounted, false, 'the panel unmounts as the exit transition ends')
})

// 有弹层的页面（弹层开着时根节点带 page-obscured）；兼容路由 memory 在 onShow 里立即 switchTab 被关掉，
// 没有「被隐藏」这一态，其余页面都在 onHide 到下一次 onShow 之间带 page-hidden（issue #163）
const PAGE_HIDDEN_EXEMPT = { 'pages/memory/memory': 'compat route closed by its own switchTab' }

function rootClassAttribute(page) {
  const root = /^<view\b[^>]*\bclass="([^"]*)"/.exec(readRepo(`${page}.wxml`))
  assert.ok(root, `${page}.wxml starts with the page root`)
  return root[1]
}

// issue #118 → #163：弹层遮挡和页面不可见时，装饰性常驻动画只暂停在当前帧，不在后台空转
test('obscured or hidden pages pause every decorative continuous animation on the current frame', () => {
  const files = analyzedWxssFiles()
  const paused = new Set(files.flatMap((file) => file.rules
    .filter((rule) => !rule.inReducedMotion && rule.decls['animation-play-state'] === 'paused')
    .flatMap((rule) => rule.selectors)))

  const decorative = new Set()
  for (const file of files) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      if (!ruleAnimations(rule).some((entry) => entry.infinite && continuousRole(entry.name) === 'decorative')) continue
      for (const selector of rule.selectors) decorative.add(selector)
    }
  }
  assert.ok(decorative.size > 0)
  // 色团的暂停写在它们同一元素上共有的 .aurora-bloom，其余装饰写自己的选择器
  const pauseTarget = (selector) => {
    const [shared, ...more] = AURORA_SAME_ELEMENT[selector.slice(1)] || []
    return shared && more.length === 0 ? `.${shared}` : selector
  }
  const missing = [...new Set([...decorative].map(pauseTarget))]
    .flatMap((selector) => [`.page.page-obscured ${selector}`, `.page.page-hidden ${selector}`])
    .filter((selector) => !paused.has(selector))
  assert.deepEqual(missing, [])

  // 暂停规则挂在页面根的标记上：有弹层的页面被盖住时带 page-obscured，页面不可见时带 page-hidden
  for (const page of appPages()) {
    const classes = renderWxmlClasses(rootClassAttribute(page), { pageObscured: true, pageHidden: true })
    assert.ok(classes.includes('page'), `${page} root is the .page the pause rule hangs on`)
    if (!PAGE_HIDDEN_EXEMPT[page]) assert.ok(classes.includes('page-hidden'), `${page} root takes page-hidden while hidden`)
    if (SHEET_PAGES.includes(page)) assert.ok(classes.includes('page-obscured'), `${page} root takes page-obscured under a sheet`)
  }
})

// @keyframes 的逐帧声明，按源码顺序；at 是 from / to / 百分比
function keyframeFrames(css, name) {
  const block = topLevelBlocks(css).find((item) => item.header === `@keyframes ${name}`)
  assert.ok(block, `expected @keyframes ${name}`)
  return topLevelBlocks(block.body).map((frame) => ({ at: frame.header, decls: parseDecls(frame.body) }))
}

// issue #163：每个极光色团只有一层动画，只动位移、0.94–1.08 的轻微缩放和透明度（DESIGN.md「极光」）
const AURORA_SCALE_BAND = [0.94, 1.08]

test('aurora blooms breathe inside the registered motion budget', () => {
  const css = readRepo('app.wxss')
  const blooms = analyzeFile(css).rules.filter((rule) =>
    !rule.inReducedMotion && rule.selectors.some((selector) => /^\.aurora-bloom\b/.test(selector)))
  const violations = []
  let checked = 0
  for (const rule of blooms) {
    const where = rule.selectors.join(', ')
    const animations = ruleAnimations(rule)
    if (animations.length > 1) violations.push(`${where} runs ${animations.length} animation layers`)
    for (const { name } of animations) {
      for (const frame of keyframeFrames(css, name)) {
        checked += 1
        const extra = Object.keys(frame.decls).filter((prop) => prop !== 'opacity' && prop !== 'transform')
        if (extra.length) violations.push(`${name} ${frame.at} animates ${extra.join(', ')}`)
        for (const match of (frame.decls.transform || '').matchAll(/scale\(\s*([\d.]+)\s*\)/g)) {
          const scale = Number(match[1])
          if (scale < AURORA_SCALE_BAND[0] || scale > AURORA_SCALE_BAND[1]) {
            violations.push(`${name} ${frame.at} scales to ${scale}, outside ${AURORA_SCALE_BAND.join('-')}`)
          }
        }
      }
    }
  }
  assert.ok(checked > 0, 'the survey reaches the aurora blooms')
  assert.deepEqual(violations, [])
})
