// Issue #58：动效、玻璃与 reduced-motion 行为护栏。
// 覆盖五条验收：bounce/elastic 退役、blur/阴影/持续动画预算、reduced-motion 状态反馈、
// 加载/按压/弹层/日历切换的非运动替代反馈、Impeccable bounce-easing 类 warning 收口。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { listWxssFiles } = require('./designTokens')

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

function reducedMotionSelectorCovers(animatedSelector, rmSelector) {
  const animated = selectorSignature(animatedSelector)
  const rm = selectorSignature(rmSelector)
  if (rm.classes.length === 0) return false
  // 覆盖必须落在同一元素同一层级：类集合完全相同（低特异的 RM 规则压不住高特异动画声明），
  // 伪元素 scope 相同（.page::before 的动画不能被只写 .page 的 RM 规则覆盖）
  if (rm.classes.length !== animated.classes.length) return false
  if (!rm.classes.every((cls) => animated.classes.includes(cls))) return false
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
})

function analyzedWxssFiles() {
  return listWxssFiles(repoRoot).map((file) => {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    return { relative, ...analyzeFile(fs.readFileSync(file, 'utf8')) }
  })
}

const REGISTERED_EASE_OUT = [0.16, 1, 0.3, 1]

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

test('every cubic-bezier is the registered ease-out curve (no overshoot y>1)', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    for (const match of masked.matchAll(/cubic-bezier\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g)) {
      const params = match.slice(1, 5).map(Number)
      const [x1, y1, x2, y2] = params
      if (y1 < 0 || y1 > 1 || y2 < 0 || y2 > 1) {
        violations.push(`${relative} uses overshoot cubic-bezier(${match.slice(1, 5).join(',')})`)
        continue
      }
      if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
        violations.push(`${relative} uses out-of-range cubic-bezier x params`)
        continue
      }
      if (!params.every((value, index) => value === REGISTERED_EASE_OUT[index])) {
        violations.push(`${relative} uses unregistered curve cubic-bezier(${match.slice(1, 5).join(',')})`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

test('app.wxss defines the five shared one-shot duration tokens', () => {
  const app = maskComments(readRepo('app.wxss'))
  const expected = {
    '--duration-press': '160ms',
    '--duration-state': '200ms',
    '--duration-enter': '240ms',
    '--duration-exit': '200ms',
    '--duration-sheet': '280ms'
  }
  for (const [name, value] of Object.entries(expected)) {
    assert.match(app, new RegExp(`${name}\\s*:\\s*${value}\\s*;`), `${name} must be ${value}`)
  }
})

test('--ease-spring / --transition-spring tokens stay retired; --ease-out remains the single curve token', () => {
  const app = maskComments(readRepo('app.wxss'))
  assert.equal(app.includes('--ease-spring'), false, 'app.wxss should no longer define --ease-spring')
  assert.equal(app.includes('--transition-spring'), false, 'app.wxss should no longer define --transition-spring')
  assert.match(app, /--ease-out\s*:\s*cubic-bezier\(0\.16,\s*1,\s*0\.3,\s*1\)/)

  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    if (/var\(--ease-spring\)|var\(--transition-spring\)/.test(masked)) {
      violations.push(`${relative} still references a retired spring token`)
    }
  }
  assert.deepEqual(violations, [])
})

// 常驻动画注册表，与 DESIGN.md「常驻动画注册表」是同一张表，新增或删除时两边一起改（issue #163）。
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

// 每个页面根下的极光色团（issue #163）
const AURORA_BLOOMS = ['violet', 'rose', 'lavender']
const AURORA_MARKUP = new RegExp(
  '<view class="aurora" aria-hidden="true">\\s*' +
  AURORA_BLOOMS.map((name) => `<view class="aurora-bloom aurora-bloom-${name}"></view>\\s*`).join('') +
  '</view>'
)

function appPages() {
  return JSON.parse(readRepo('app.json')).pages
}

function continuousRole(name) {
  return Object.prototype.hasOwnProperty.call(CONTINUOUS_ANIMATIONS, name) ? CONTINUOUS_ANIMATIONS[name] : null
}

function namesWithRole(role) {
  return Object.keys(CONTINUOUS_ANIMATIONS).filter((name) => CONTINUOUS_ANIMATIONS[name] === role).sort()
}

// issue #111：一次性时长必须引用五档 token；常驻动画、其周期、减弱动效替代和 heroIn 保持字面时长。
const LITERAL_DURATION_ANIMATIONS = new Set([...Object.keys(CONTINUOUS_ANIMATIONS), 'heroIn'])
const ONE_SHOT_ANIMATIONS = {
  pageEnter: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  bindReveal: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  dayDetailFade: { duration: 'var(--duration-state)', easing: 'var(--ease-out)' },
  calendarFlipNextA: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarFlipNextB: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarFlipPrevA: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  calendarFlipPrevB: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' }
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

// issue #154：设置「使用说明」弹层的面板与遮罩沿用首页弹层的进出时长
const SHEET_MOTION_TWINS = {
  '.help-slide': '.sheet-slide',
  '.help-slide.sheet-open': '.sheet-slide.sheet-open',
  '.help-mask': '.day-sheet-mask',
  '.help-mask.sheet-open': '.day-sheet-mask.sheet-open'
}

function sheetMotionExpectation(selector, prop) {
  const spaced = selector.replace(/\s+/g, ' ').trim()
  const normalized = SHEET_MOTION_TWINS[spaced] || spaced
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
  if (prop === 'opacity') return STATE_DURATION
  return null
}

test('one-shot transitions and animations use the shared duration tokens and role curves', () => {
  const files = analyzedWxssFiles()
  const pressTargets = pressScaleTargets(files)
  const violations = []
  const floatDurations = []

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
          if (LITERAL_DURATION_ANIMATIONS.has(name)) {
            if (/^var\(--duration-/.test(duration)) {
              violations.push(`${where} ${name} cycle must stay a literal duration`)
            }
            if (name === 'heroIn' && (duration !== '0.6s' || easing !== EASE_OUT_TOKEN)) {
              violations.push(`${where} heroIn must stay 0.6s ${EASE_OUT_TOKEN}`)
            }
            if (name === 'float') {
              floatDurations.push(duration)
              if (easing !== 'ease-in-out' || (duration !== '8s' && duration !== '6s')) {
                violations.push(`${where} float must stay 8s/6s ease-in-out, got ${duration} ${easing}`)
              }
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
        }
      }

      if (!rule.decls.transition || rule.decls.transition === 'none') continue
      for (const segment of splitTopLevelComma(rule.decls.transition)) {
        if (segment.startsWith('box-shadow')) {
          violations.push(`${where} still transitions box-shadow ("${segment}")`)
          continue
        }
        const parsed = /^([a-z-]+)\s+(\S+)\s+(\S+)$/.exec(segment)
        if (!parsed) {
          violations.push(`${where} transition "${segment}" must be a property, duration token, and curve`)
          continue
        }
        const [, prop, duration, easing] = parsed
        const sheetExpectations = rule.selectors.map((selector) => sheetMotionExpectation(selector, prop))
        if (sheetExpectations.every(Boolean)) {
          const expected = sheetExpectations[0]
          const same = sheetExpectations.every((item) =>
            item.duration === expected.duration && item.easing === expected.easing)
          if (!same) {
            violations.push(`${where} ${prop} has no single sheet-motion duration`)
            continue
          }
          if (duration !== expected.duration || easing !== expected.easing) {
            violations.push(`${where} ${prop} must be ${expected.duration} ${expected.easing}, got ${duration} ${easing}`)
          }
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

  assert.deepEqual(floatDurations.sort(), ['6s', '8s'])
  assert.deepEqual(violations, [])
})

test('cubic-bezier survives only as the --ease-out definition', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const stripped = maskComments(fs.readFileSync(file, 'utf8'))
      .replace(/--ease-out\s*:\s*cubic-bezier\(\s*0\.16\s*,\s*1\s*,\s*0\.3\s*,\s*1\s*\)/g, '')
    if (/cubic-bezier\s*\(/i.test(stripped)) violations.push(relative)
  }
  assert.deepEqual(violations, [])
})

test('single-use --transition token and unused app-level .nav-btn rule are retired', () => {
  const violations = []
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    if (/(^|[^\w-])--transition(?![\w-])/.test(masked)) violations.push(relative)
  }
  assert.deepEqual(violations, [])

  const app = analyzeFile(readRepo('app.wxss'))
  const leftovers = app.rules.filter((rule) =>
    !rule.inReducedMotion &&
    rule.selectors.some((selector) => selector === '.nav-btn' || selector === '.nav-btn:active')
  )
  assert.equal(leftovers.length, 0)
})

// 每个常驻动画在 WXSS 里实际跑的周期（float 两个光斑各一个周期）
function continuousCycles() {
  const cycles = new Map()
  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      for (const animation of ruleAnimations(rule)) {
        if (!animation.infinite) continue
        if (!cycles.has(animation.name)) cycles.set(animation.name, new Set())
        cycles.get(animation.name).add(animation.durationSec)
      }
    }
  }
  return cycles
}

test('infinite animations stay inside the registered registry with slow decorative cycles', () => {
  const found = { decorative: new Set(), functional: new Set(), 'reduced-motion': new Set() }
  const violations = []

  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      for (const animation of ruleAnimations(rule)) {
        if (!animation.infinite) continue
        const role = continuousRole(animation.name)
        if (rule.inReducedMotion) {
          if (role !== 'reduced-motion') {
            violations.push(`${file.relative} reduced-motion block runs ${animation.name}, which is not a registered substitute`)
          }
          found['reduced-motion'].add(animation.name)
          continue
        }
        if (!role || role === 'reduced-motion') {
          violations.push(`${file.relative} runs unregistered infinite animation ${animation.name}`)
          continue
        }
        found[role].add(animation.name)
        const duration = animation.durationSec
        if (role === 'decorative' && !(duration >= 6 && duration <= 12)) {
          violations.push(`${file.relative} decorative ${animation.name} runs ${duration}s outside the 6-12s slow band`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
  for (const role of Object.keys(found)) {
    assert.deepEqual([...found[role]].sort(), namesWithRole(role), `every registered ${role} animation is in use`)
  }
})

test('retired second-layer / bounce animations stay gone', () => {
  for (const file of listWxssFiles(repoRoot)) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    const masked = maskComments(fs.readFileSync(file, 'utf8'))
    for (const name of RETIRED_ANIMATIONS) {
      assert.equal(masked.includes(name), false, `${relative} should not define or reference ${name}`)
    }
  }
})

// issue #163：模糊是材质选择，不是减层预算。取代 issue #58 的按文件玻璃面棘轮、阴影声明数棘轮，
// 以及 issue #146 的「近不透明面不模糊」默认规则。模糊的面逐个登记在这里和 DESIGN.md「玻璃叠层」，
// 新增或拿掉都两边一起改。仍然有效的：-webkit- 成对写，单面 ≤20px，全屏遮罩 ≤8px，
// 实色回退由 glass-fallback 管，阴影颜色由 design-token-guardrail 的阴影注册表管。
const BLUR_RADIUS_CAP_PX = 20
const MASK_BLUR_CAP_PX = 8
const BLURRED_SURFACES = {
  'pages/index/index.wxss': ['.day-sheet-mask'],
  'pages/settings/settings.wxss': ['.help-mask']
}

test('blurred surfaces are the registered ones, paired and within the radius caps', () => {
  const found = {}
  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      if (rule.inReducedMotion || !Object.prototype.hasOwnProperty.call(rule.decls, 'backdrop-filter')) continue
      const where = `${file.relative} ${rule.selectors.join(', ')}`
      const radius = Number(/blur\((\d+)px\)/.exec(rule.decls['backdrop-filter'])?.[1])
      assert.ok(radius > 0 && radius <= BLUR_RADIUS_CAP_PX, `${where} blur ${radius}px exceeds ${BLUR_RADIUS_CAP_PX}px`)
      assert.equal(rule.decls['-webkit-backdrop-filter'], rule.decls['backdrop-filter'], `${where} must pair -webkit-backdrop-filter`)
      if (rule.selectors.some((selector) => /mask/.test(selector))) {
        assert.ok(radius <= MASK_BLUR_CAP_PX, `${where} full-screen mask blur ${radius}px exceeds ${MASK_BLUR_CAP_PX}px`)
      }
      found[file.relative] = [...(found[file.relative] || []), ...rule.selectors]
    }
  }
  assert.deepEqual(found, BLURRED_SURFACES)

  // 两个弹层遮罩是同一种材质：frontmatter modal-overlay 登记的模糊
  const design = readRepo('DESIGN.md')
  const overlay = /modal-overlay:\s*\n\s*backgroundColor:\s*"([^"]+)"\s*\n\s*backdropFilter:\s*"([^"]+)"/.exec(design)
  assert.ok(overlay, 'DESIGN.md frontmatter registers the modal overlay')
  for (const [relative, selectors] of Object.entries(BLURRED_SURFACES)) {
    const rules = analyzeFile(readRepo(relative)).rules
    for (const selector of selectors) {
      const mask = rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes(selector) && rule.decls['backdrop-filter'])
      assert.equal(mask.decls['backdrop-filter'], overlay[2], `${relative} ${selector} uses the registered overlay blur`)
      assert.equal(mask.decls.background, overlay[1], `${relative} ${selector} uses the registered overlay fill`)
      assert.ok(design.includes(`\`${selector}\``), `DESIGN.md registers ${selector} as a blurred surface`)
    }
  }
  assert.doesNotMatch(design, /只允许收紧|玻璃面数量上限|声明数上限/, 'the retired blur and shadow ratchets stay retired')
})

test('every transform-based animation is neutralized or replaced under reduced motion', () => {
  const files = analyzedWxssFiles()
  const app = files.find((file) => file.relative === 'app.wxss')
  const violations = []

  for (const file of files) {
    const keyframeScope = { ...app.keyframes, ...file.keyframes }
    const rmRules = [...app.reducedMotionRules, ...file.reducedMotionRules]

    for (const rule of file.rules) {
      if (rule.inReducedMotion) continue
      for (const animation of ruleAnimations(rule)) {
        const props = keyframeScope[animation.name]
        assert.ok(props, `${file.relative} references undefined @keyframes ${animation.name}`)
        if ([...props].every((prop) => prop === 'opacity')) continue

        const covering = rmRules.find((rmRule) =>
          rmRule.selectors.some((rmSelector) =>
            rule.selectors.some((selector) => reducedMotionSelectorCovers(selector, rmSelector)
            )
          )
        )
        if (!covering) {
          violations.push(`${file.relative} ${rule.selectors.join(', ')} (${animation.name}) has no reduced-motion coverage`)
          continue
        }
        const replacement = covering.decls.animation
        if (replacement && replacement !== 'none') {
          for (const substitute of parseAnimationShorthand(replacement)) {
            const substituteProps = keyframeScope[substitute.name]
            const movementFree = substituteProps && [...substituteProps].every((prop) => prop === 'opacity')
            if (!movementFree) {
              violations.push(`${file.relative} ${rule.selectors.join(', ')} reduced-motion replacement ${substitute.name} still moves`)
            }
          }
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('loading keeps an opacity-only pulse under reduced motion instead of going silent', () => {
  const app = analyzeFile(readRepo('app.wxss'))
  const spinnerRules = app.reducedMotionRules.filter((rule) => rule.selectors.includes('.loading-spinner'))
  assert.equal(spinnerRules.length, 1, 'reduced-motion block keeps exactly one .loading-spinner rule')

  const replacements = parseAnimationShorthand(spinnerRules[0].decls.animation || '')
  assert.equal(replacements.length, 1, 'the spinner is replaced, not silenced')
  assert.equal(replacements[0].name, 'loadingPulse')
  assert.equal(replacements[0].infinite, true)

  const props = app.keyframes.loadingPulse
  assert.ok(props, 'expected @keyframes loadingPulse in app.wxss')
  assert.deepEqual([...props].sort(), ['opacity'], 'loadingPulse must be opacity-only (movement-free)')
})

// issue #73：月份箭头与弹层关闭的按压缩放落在登记的 0.94–0.98 区间；
// 减弱动效下仍是「立即缩放」——RM 块移除 transition，按压态变化瞬时发生，不另加动画。
test('month arrows and sheet close press inside the registered 0.94-0.98 band and stay instant under reduced motion', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))

  const pressScale = (selector) => {
    const active = index.rules.find((item) => item.selectors.includes(`${selector}:active`))
    assert.ok(active, `expected rule ${selector}:active`)
    assert.ok(active.decls.transform, `${selector}:active must declare a press scale`)
    const scale = /^scale\(([\d.]+)\)$/.exec(active.decls.transform.trim())
    assert.ok(scale, `${selector}:active press transform must be a plain scale, got ${active.decls.transform}`)
    return Number(scale[1])
  }

  for (const selector of ['.nav-btn', '.sheet-close']) {
    const scale = pressScale(selector)
    assert.ok(
      scale >= 0.94 && scale <= 0.98,
      `${selector}:active press scale ${scale} is outside the registered 0.94-0.98 band`
    )
  }

  // 减弱动效：两个控件都在 RM 名单里（transition: none），按下时缩放立即生效，无第二段动画
  const covered = new Set(index.reducedMotionRules.flatMap((rule) => rule.selectors))
  for (const selector of ['.nav-btn', '.sheet-close']) {
    assert.ok(covered.has(selector), `reduced-motion block must neutralize ${selector} transitions`)
    const rmRule = index.reducedMotionRules.find((rule) => rule.selectors.includes(selector))
    assert.equal(rmRule.decls.animation, 'none', `${selector} must not gain a second animation under reduced motion`)
    assert.equal(rmRule.decls.transition, 'none', `${selector} press must be instant under reduced motion`)
  }
})

test('state channels survive reduced motion: sync color, refresh dim, sheet mask hierarchy', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const app = analyzeFile(readRepo('app.wxss'))

  // 同步进行中：玫瑰点是颜色通道，不依赖 syncDotPulse 动画
  const syncDot = index.rules.find((rule) => rule.selectors.includes('.sync-pill.syncing .sync-dot'))
  assert.ok(syncDot, 'expected .sync-pill.syncing .sync-dot rule')
  assert.match(syncDot.decls.background, /#E8909E/i)

  // 翻月不再使用 .changing；后台刷新变暗仍是可辨的透明度
  assert.equal(
    app.rules.some((rule) => rule.selectors.includes('.calendar-grid.changing')),
    false
  )
  const dim = index.rules.find((rule) => rule.selectors.includes('.content-refreshing .calendar-grid'))
  assert.ok(dim, 'expected the background-refresh dim on .calendar-grid')
  assert.equal(dim.decls.opacity, '0.94')

  // 弹层：遮罩 88% 海军保留层级（动画移除 ≠ 层级丢失）
  const mask = index.rules.find((rule) => rule.selectors.includes('.day-sheet-mask'))
  assert.ok(mask, 'expected .day-sheet-mask rule')
  assert.match(mask.decls.background, /rgba\(10,\s*14,\s*39,\s*0\.88\)/)
})

// @keyframes 的逐帧声明，按源码顺序；at 是 from / to / 百分比
function keyframeFrames(css, name) {
  const block = topLevelBlocks(css).find((item) => item.header === `@keyframes ${name}`)
  assert.ok(block, `expected @keyframes ${name}`)
  return topLevelBlocks(block.body).map((frame) => ({ at: frame.header, decls: parseDecls(frame.body) }))
}

// 模板里一段 class 属性按页面数据求值后的类名
function renderedClasses(template, data) {
  const text = template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const value = new Function(...Object.keys(data), `return (${expr})`)(...Object.values(data))
    return value === undefined || value === null ? '' : String(value)
  })
  return text.split(/\s+/).filter(Boolean)
}

// issue #165：翻月记号（index.js 的 calendarFlip）与它对应的关键帧。a、b 两份内容相同，记号交替才会从头重播
const CALENDAR_FLIPS = {
  'next-a': 'calendarFlipNextA',
  'next-b': 'calendarFlipNextB',
  'prev-a': 'calendarFlipPrevA',
  'prev-b': 'calendarFlipPrevB'
}

// issue #165：新月份的格子和月标题同一次更新换上，再从翻月方向滑入：下一月从右、上一月从左，透明度从半透明到实。
// 动的是格子外的一层 .calendar-days；卡片、周头和月份标题不动，日期格仍只有自己的按压缩放。
// 这一层没有盒子，日期格宽度和几何账本不变；位移不超过网格左右内边距，内容不出卡片。减弱动效下即时替换。
test('month flips slide the new days in from the flip direction inside the card, and land instantly under reduced motion', () => {
  const css = readRepo('pages/index/index.wxss')
  const index = analyzeFile(css)
  const declsOf = (selector) => {
    const rule = index.rules.find((item) => !item.inReducedMotion && item.selectors.includes(selector))
    assert.ok(rule, `expected ${selector}`)
    return rule.decls
  }

  const wxml = readRepo('pages/index/index.wxml')
  const grid = wxml.slice(wxml.indexOf('class="calendar-grid'), wxml.indexOf('class="quick-actions"'))
    .replace(/<!--[\s\S]*?-->/g, '')
  const layer = /^[^>]*>\s*<view class="(calendar-days[^"]*)">\s*<view\s+class="day-cell/.exec(grid)
  assert.ok(layer, 'the day cells sit in one .calendar-days layer, the only child of .calendar-grid')
  assert.deepEqual(renderedClasses(layer[1], { calendarFlip: '' }), ['calendar-days'], 'no flip, no slide')
  for (const token of Object.keys(CALENDAR_FLIPS)) {
    assert.deepEqual(renderedClasses(layer[1], { calendarFlip: token }), ['calendar-days', `calendar-flip-${token}`])
  }

  const days = declsOf('.calendar-days')
  assert.equal(days.display, 'flex')
  assert.equal(days['flex-wrap'], 'wrap')
  const boxProps = Object.keys(days).filter((prop) => /^(?:padding|margin|border|width|height)/.test(prop))
  assert.deepEqual(boxProps, [], 'the flip layer adds no box: cell widths and the row-height ledger stay as they were')
  const gridPadding = declsOf('.calendar-grid').padding.split(/\s+/)
  const inlinePaddingRpx = Number(/^(\d+)rpx$/.exec(gridPadding[1] || gridPadding[0])[1])

  for (const [token, name] of Object.entries(CALENDAR_FLIPS)) {
    const selector = `.calendar-days.calendar-flip-${token}`
    assert.equal(declsOf(selector).animation, `${name} var(--duration-enter) var(--ease-out)`)

    const frames = keyframeFrames(css, name)
    assert.deepEqual(frames.map((frame) => frame.at), ['from', 'to'])
    for (const frame of frames) {
      assert.deepEqual(Object.keys(frame.decls).sort(), ['opacity', 'transform'], `${name} moves only on the compositor`)
    }
    const [from, to] = frames
    const opacity = Number(from.decls.opacity)
    assert.ok(opacity >= 0.5 && opacity < 1, `${name} starts at ${opacity}: soft, never blank`)
    const offset = Number(/^translateX\((-?\d+(?:\.\d+)?)rpx\)$/.exec(from.decls.transform)?.[1])
    assert.ok(token.startsWith('next') ? offset > 0 : offset < 0, `${name} enters from the ${token.startsWith('next') ? 'right' : 'left'}`)
    assert.ok(Math.abs(offset) <= inlinePaddingRpx, `${name} travels ${offset}rpx, past the ${inlinePaddingRpx}rpx grid padding`)
    assert.deepEqual(to.decls, { opacity: '1', transform: 'translateX(0)' })

    const reduced = index.reducedMotionRules.find((rule) => rule.selectors.includes(selector))
    assert.ok(reduced, `reduced motion must cover ${selector}`)
    assert.equal(reduced.decls.animation, 'none', `${selector} lands instantly under reduced motion`)
  }
  assert.deepEqual(keyframeFrames(css, 'calendarFlipNextA'), keyframeFrames(css, 'calendarFlipNextB'))
  assert.deepEqual(keyframeFrames(css, 'calendarFlipPrevA'), keyframeFrames(css, 'calendarFlipPrevB'))

  // 卡片和日期格自己不跟着滑：网格只有刷新变暗，日期格只有按压缩放
  for (const selector of ['.calendar-grid', '.day-cell']) {
    assert.equal(declsOf(selector).animation, undefined, `${selector} must not slide`)
  }
})

test('day cells keep only their press scale, and day colors switch immediately', () => {
  const app = analyzeFile(readRepo('app.wxss'))
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const design = readRepo('DESIGN.md')

  const grid = app.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.calendar-grid'))
  assert.ok(grid, 'expected .calendar-grid')
  assert.equal(grid.decls.transition, 'opacity var(--duration-state) ease')

  const dayCell = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.day-cell'))
  assert.ok(dayCell, 'expected .day-cell')
  assert.equal(dayCell.decls.transition, 'transform var(--duration-press) var(--ease-out)')
  const pressed = index.rules.find((rule) => rule.selectors.includes('.day-cell:active'))
  assert.equal(pressed.decls.transform, 'scale(0.94)')

  const dayNum = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.day-num'))
  assert.ok(dayNum, 'expected .day-num')
  assert.equal(dayNum.decls.transition, undefined)

  // issue #162：今天胶囊挂在日期上，和日期颜色一样即时出现、即时消失
  for (const selector of [
    '.day-cell.today:not(.period) .day-num::before',
    '.day-cell.workday',
    '.day-cell.today .day-num'
  ]) {
    const rule = index.rules.find((item) => !item.inReducedMotion && item.selectors.includes(selector))
    assert.ok(rule, `expected ${selector}`)
    assert.equal(rule.decls.transition, undefined, `${selector} must switch fill and text color immediately`)
  }

  assert.match(design, /日期格不做颜色过渡/)
})

test('reduced-motion blocks keep covering the named sheet, sync, and ambient layers', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const indexCovered = new Set(index.reducedMotionRules.flatMap((rule) => rule.selectors))
  for (const selector of [
    '.sync-pill',
    '.sync-pill.syncing .sync-dot',
    '.day-sheet-mask',
    '.day-sheet-mask.sheet-open',
    '.sheet-slide.sheet-open',
    '.sheet-slide.sheet-open.sheet-reset',
    '.sheet-slide',
    '.day-action-sheet',
    '.calendar-jump-sheet',
    '.no-room-icon',
    '.day-cell',
    '.nav-btn',
    '.quick-btn'
  ]) {
    assert.ok(indexCovered.has(selector), `index reduced-motion block must cover ${selector}`)
  }

  const app = analyzeFile(readRepo('app.wxss'))
  const appCovered = new Set(app.reducedMotionRules.flatMap((rule) => rule.selectors))
  for (const selector of [
    '.page',
    ...AURORA_BLOOMS.map((name) => `.aurora-bloom-${name}`),
    '.header-gradient::before',
    '.header-gradient::after',
    '.hero-icon',
    '.calendar-grid',
    '.btn-premium',
    '.premium-card'
  ]) {
    assert.ok(appCovered.has(selector), `app reduced-motion block must cover ${selector}`)
  }
})

test('edit page border and background transitions switch instantly under reduced motion', () => {
  // issue #106：两个编辑页的 transition 全部被本文件 reduced-motion 块覆盖（DESIGN.md 政策：即时切换）；
  // 覆盖判定与动画同规——同类集合、同伪元素层级，RM 规则必须把 transition 置 none
  for (const relative of ['pages/period/edit/edit.wxss', 'pages/memory/edit/edit.wxss']) {
    const file = analyzeFile(readRepo(relative))
    const violations = []
    for (const rule of file.rules) {
      if (rule.inReducedMotion || !rule.decls.transition) continue
      const covering = file.reducedMotionRules.find((rmRule) =>
        rmRule.decls.transition === 'none' &&
        rmRule.selectors.some((rmSelector) =>
          rule.selectors.some((selector) => reducedMotionSelectorCovers(selector, rmSelector))))
      if (!covering) {
        violations.push(`${relative} ${rule.selectors.join(', ')} transition has no reduced-motion coverage`)
      }
    }
    assert.deepEqual(violations, [])
  }
})

test('day detail content fades opacity only and shows immediately under reduced motion', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const fade = index.rules.find((rule) =>
    !rule.inReducedMotion && rule.selectors.includes('.day-detail-fade'))
  assert.ok(fade, 'expected .day-detail-fade')
  assert.equal(fade.decls.animation, 'dayDetailFade var(--duration-state) var(--ease-out) both')
  assert.equal(fade.decls.transition, undefined)
  assert.equal(fade.decls.height, undefined)
  assert.equal(fade.decls['max-height'], undefined)

  const props = index.keyframes.dayDetailFade
  assert.ok(props, 'expected @keyframes dayDetailFade')
  assert.deepEqual([...props].sort(), ['opacity'])

  const panel = index.rules.find((rule) =>
    !rule.inReducedMotion && rule.selectors.includes('.day-action-sheet'))
  assert.ok(panel, 'expected .day-action-sheet')
  assert.equal(panel.decls.transition, undefined)

  const reduced = index.reducedMotionRules.find((rule) => rule.selectors.includes('.day-detail-fade'))
  assert.ok(reduced, 'reduced motion must cover .day-detail-fade')
  assert.equal(reduced.decls.animation, 'none')

  const design = readRepo('DESIGN.md')
  assert.match(design, /dayDetailFade/)
  assert.match(design, /只动透明度/)
})

test('a handed-off info mask stays fully visible and does not fade in', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const handoff = index.rules.find((rule) =>
    !rule.inReducedMotion && rule.selectors.includes('.day-sheet-mask.sheet-handoff'))
  assert.ok(handoff, 'expected .day-sheet-mask.sheet-handoff')
  assert.equal(handoff.decls.opacity, '1')
  assert.equal(handoff.decls.transition, 'none')

  const openSlide = index.rules.find((rule) => rule.selectors.includes('.sheet-slide.sheet-open'))
  assert.equal(openSlide.decls.transform, 'translateY(0)')
  assert.equal(openSlide.decls.transition, 'transform var(--duration-sheet) var(--ease-out)')

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #117/)
  assert.match(design, /sheet-handoff/)
})

test('reduced motion makes native tab bar hide and restore instant', () => {
  const { readReducedMotionProbe, sheetTabBarAnimates } = require('../utils/sheetLifecycle')
  assert.equal(readReducedMotionProbe('1px'), true)
  assert.equal(readReducedMotionProbe('0px'), false)
  assert.equal(readReducedMotionProbe(''), false)
  assert.equal(sheetTabBarAnimates(true), false)
  assert.equal(sheetTabBarAnimates(false), true)

  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const probe = index.rules.find((rule) =>
    !rule.inReducedMotion && rule.selectors.includes('.reduced-motion-probe'))
  assert.ok(probe, 'expected a reduced-motion probe')
  assert.equal(probe.decls.width, '0')
  const reduced = index.reducedMotionRules.find((rule) => rule.selectors.includes('.reduced-motion-probe'))
  assert.ok(reduced, 'reduced motion must widen the probe')
  assert.equal(reduced.decls.width, '1px')
  assert.equal(
    index.reducedMotionRules.find((rule) => rule.selectors.includes('.sheet-slide.sheet-open')).decls.transition,
    'none'
  )
})

test('homepage sheets slide in and out with reversible transitions', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const wxss = maskComments(readRepo('pages/index/index.wxss'))
  assert.equal(wxss.includes('sheetRise'), false, 'sheet entrance keyframes are retired')
  assert.equal(wxss.includes('sheetFadeIn'), false, 'sheet entrance keyframes are retired')

  const slide = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.sheet-slide'))
  assert.ok(slide, 'expected .sheet-slide')
  assert.equal(slide.decls.transform, 'translateY(100%)')
  assert.equal(slide.decls.transition, 'transform var(--duration-exit) var(--ease-out)')
  assert.doesNotMatch(slide.decls.transform, /px|rpx/)

  const openSlide = index.rules.find((rule) => rule.selectors.includes('.sheet-slide.sheet-open'))
  assert.ok(openSlide, 'expected the open sheet pose')
  assert.equal(openSlide.decls.transform, 'translateY(0)')
  assert.equal(openSlide.decls.transition, 'transform var(--duration-sheet) var(--ease-out)')

  const mask = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.day-sheet-mask'))
  assert.ok(mask, 'expected .day-sheet-mask')
  assert.match(mask.decls.background, /rgba\(10,\s*14,\s*39,\s*0\.88\)/)
  assert.equal(mask.decls.opacity, '0')
  assert.equal(mask.decls.transition, 'opacity var(--duration-exit) var(--ease-out)')

  const openMask = index.rules.find((rule) => rule.selectors.includes('.day-sheet-mask.sheet-open'))
  assert.ok(openMask, 'expected the open mask pose')
  assert.equal(openMask.decls.opacity, '1')
  assert.equal(openMask.decls.transition, 'opacity var(--duration-enter) var(--ease-out)')

  const leaving = index.rules.find((rule) => rule.selectors.includes('.day-sheet-mask.sheet-leaving'))
  assert.ok(leaving, 'expected the leaving mask')
  assert.equal(leaving.decls['pointer-events'], 'none')

  const covered = new Set(index.reducedMotionRules.flatMap((rule) => rule.selectors))
  for (const selector of ['.sheet-slide', '.day-sheet-mask.sheet-open', '.sheet-slide.sheet-open', '.sheet-slide.sheet-open.sheet-reset']) {
    assert.ok(covered.has(selector), `reduced motion must cover ${selector}`)
    const rmRule = index.reducedMotionRules.find((rule) => rule.selectors.includes(selector))
    assert.equal(rmRule.decls.transition, 'none', `${selector} must finish immediately under reduced motion`)
  }

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #116/)
  assert.match(design, /translateY\(100%\)/)
  assert.match(design, /issue #119/)
  assert.match(design, /原生 tabBar 在弹层处于 open 或 leaving 时隐藏/)
  assert.match(design, /减弱动效下这次隐藏和恢复不播放动画/)
  assert.match(design, /10px/)
  assert.match(design, /25%/)
  assert.match(design, /0\.11 px\/ms/)
  assert.match(design, /0\.55/)
})

// issue #154：设置「使用说明」复用首页弹层的进出——面板 translateY(100%) 升降、遮罩只动透明度，
// 时长与曲线跟首页弹层同一来源；离场时不拦截点按；减弱动效下全部即时到位，探针与首页同一套。
test('settings help slides and fades on the homepage sheet motion and lands instantly under reduced motion', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const settings = analyzeFile(readRepo('pages/settings/settings.wxss'))
  const declsOf = (file, selector) => {
    const rule = file.rules.find((item) => !item.inReducedMotion && item.selectors.includes(selector))
    assert.ok(rule, `expected ${selector}`)
    return rule.decls
  }
  const segment = (decls, prop) =>
    splitTopLevelComma(decls.transition || '').find((part) => part.startsWith(`${prop} `))

  assert.equal(declsOf(settings, '.help-slide').transform, 'translateY(100%)')
  for (const [help, home] of [['.help-slide', '.sheet-slide'], ['.help-slide.sheet-open', '.sheet-slide.sheet-open']]) {
    assert.equal(declsOf(settings, help).transform, declsOf(index, home).transform, `${help} pose`)
    assert.equal(segment(declsOf(settings, help), 'transform'), segment(declsOf(index, home), 'transform'), `${help} timing`)
  }
  for (const [help, home] of [['.help-mask', '.day-sheet-mask'], ['.help-mask.sheet-open', '.day-sheet-mask.sheet-open']]) {
    assert.equal(declsOf(settings, help).opacity, declsOf(index, home).opacity, `${help} pose`)
    assert.equal(segment(declsOf(settings, help), 'opacity'), segment(declsOf(index, home), 'opacity'), `${help} timing`)
  }

  assert.equal(declsOf(settings, '.help-layer')['pointer-events'], 'none')
  assert.equal(declsOf(settings, '.help-mask')['pointer-events'], 'auto')
  assert.equal(declsOf(settings, '.help-slide')['pointer-events'], 'auto')
  assert.equal(declsOf(settings, '.help-mask.sheet-leaving')['pointer-events'], 'none')
  assert.equal(declsOf(settings, '.help-slide.sheet-leaving')['pointer-events'], 'none')

  for (const selector of ['.help-mask', '.help-mask.sheet-open', '.help-slide', '.help-slide.sheet-open', '.sheet-close']) {
    const rmRule = settings.reducedMotionRules.find((rule) => rule.selectors.includes(selector))
    assert.ok(rmRule, `reduced motion must cover ${selector}`)
    assert.equal(rmRule.decls.transition, 'none', `${selector} must land immediately under reduced motion`)
    assert.equal(rmRule.decls.animation, 'none')
  }
  assert.equal(declsOf(settings, '.reduced-motion-probe').width, '0')
  const probe = settings.reducedMotionRules.find((rule) => rule.selectors.includes('.reduced-motion-probe'))
  assert.ok(probe, 'reduced motion must widen the settings probe')
  assert.equal(probe.decls.width, '1px')
  assert.match(readRepo('pages/settings/settings.wxml'), /<view class="reduced-motion-probe" aria-hidden="true"><\/view>/)

  assert.match(readRepo('DESIGN.md'), /设置「使用说明」弹层（issue #154）/)
})

test('sync pill fades and rises with reversible transitions', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const wxss = maskComments(readRepo('pages/index/index.wxss'))
  assert.equal(wxss.includes('syncPillIn'), false, 'sync pill entrance keyframes are retired')

  const pill = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.sync-pill'))
  assert.ok(pill, 'expected .sync-pill')
  assert.equal(pill.decls.opacity, '0')
  assert.equal(pill.decls.transform, 'translateY(-8rpx)')
  assert.equal(
    pill.decls.transition,
    'opacity var(--duration-exit) var(--ease-out), transform var(--duration-exit) var(--ease-out)'
  )

  const shown = index.rules.find((rule) => rule.selectors.includes('.sync-pill.sync-open'))
  assert.ok(shown, 'expected the shown sync pill pose')
  assert.equal(shown.decls.opacity, '1')
  assert.equal(shown.decls.transform, 'translateY(0)')
  assert.equal(
    shown.decls.transition,
    'opacity var(--duration-enter) var(--ease-out), transform var(--duration-enter) var(--ease-out)'
  )

  const syncDot = index.rules.find((rule) => rule.selectors.includes('.sync-pill.syncing .sync-dot'))
  assert.ok(syncDot, 'expected the syncing dot')
  assert.equal(syncDot.decls.animation, 'syncDotPulse 1s ease-in-out infinite')

  for (const selector of ['.sync-pill', '.sync-pill.sync-open']) {
    const rmRule = index.reducedMotionRules.find((rule) => rule.selectors.includes(selector))
    assert.ok(rmRule, `reduced motion must cover ${selector}`)
    assert.equal(rmRule.decls.transition, 'none', `${selector} must finish immediately under reduced motion`)
  }

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #120/)
  assert.match(design, /translateY\(-8rpx\)/)
})

// DESIGN.md「常驻动画注册表」：每行一个动画，列为 动画 / 挂在 / 用途 / 节奏 / 弹层遮挡 / 页面不可见 / 减弱动效
function designAnimationRegistry(design) {
  const start = design.indexOf('\n## 常驻动画注册表')
  assert.ok(start !== -1, 'DESIGN.md needs a 常驻动画注册表 section')
  const rest = design.slice(start + 1)
  const end = rest.indexOf('\n## ')
  const section = end === -1 ? rest : rest.slice(0, end)
  const rows = new Map()
  for (const line of section.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    const name = /^`([A-Za-z]+)`$/.exec(cells[0] || '')
    if (name) rows.set(name[1], cells)
  }
  return rows
}

// issue #163：每个常驻动画逐项登记用途、节奏、弹层遮挡与页面不可见时的行为、减弱动效替代
test('DESIGN.md registers every continuous animation with its rhythm, cover, hidden and reduced-motion behavior', () => {
  const rows = designAnimationRegistry(readRepo('DESIGN.md'))
  assert.deepEqual([...rows.keys()].sort(), Object.keys(CONTINUOUS_ANIMATIONS).sort())
  const cycles = continuousCycles()
  for (const [name, cells] of rows) {
    assert.equal(cells.length, 7, `${name} row fills 动画 / 挂在 / 用途 / 节奏 / 弹层遮挡 / 页面不可见 / 减弱动效`)
    assert.ok(cells.every(Boolean), `${name} row leaves no column empty`)
    const [, , , rhythm, covered, hidden] = cells
    for (const seconds of cycles.get(name) || []) {
      assert.ok(rhythm.includes(`${seconds}s`), `${name} rhythm must name its ${seconds}s cycle`)
    }
    if (CONTINUOUS_ANIMATIONS[name] === 'decorative') {
      assert.match(covered, /暂停在当前帧/, `${name} pauses under a sheet`)
      assert.match(hidden, /暂停在当前帧/, `${name} pauses while the page is hidden`)
    } else {
      assert.doesNotMatch(`${covered}${hidden}`, /暂停/, `${name} is a state indicator and keeps running`)
    }
  }
})

test('DESIGN.md registers the motion and performance budgets', () => {
  const design = readRepo('DESIGN.md')
  for (const retired of ['--ease-spring', '--transition-spring', ...RETIRED_ANIMATIONS]) {
    assert.ok(design.includes(retired), `DESIGN.md is missing the ${retired} retirement note`)
  }
  assert.match(design, /prefers-reduced-motion/)
  for (const token of [
    '--duration-press',
    '--duration-state',
    '--duration-enter',
    '--duration-exit',
    '--duration-sheet'
  ]) {
    assert.ok(design.includes(token), `DESIGN.md is missing ${token}`)
  }
  assert.match(design, /--duration-press` 160ms/)
  assert.match(design, /--duration-state` 200ms/)
  assert.match(design, /--duration-enter` 240ms/)
  assert.match(design, /--duration-exit` 200ms/)
  assert.match(design, /--duration-sheet` 280ms/)
  assert.match(
    design,
    /按压只属于可点控件，容器和不可点的行不缩放、不变底色/,
    'press belongs only to tappable controls; containers and inert rows are not exemptions'
  )
})

// 有弹层的页面（弹层开着时根节点带 page-obscured）；兼容路由 memory 在 onShow 里立即 switchTab 被关掉，
// 没有「被隐藏」这一态，其余页面都在 onHide 到下一次 onShow 之间带 page-hidden（issue #163）
const SHEET_PAGES = ['pages/index/index', 'pages/settings/settings']
const PAGE_HIDDEN_EXEMPT = { 'pages/memory/memory': 'compat route closed by its own switchTab' }

function rootClassAttribute(page) {
  const root = /^<view\b[^>]*\bclass="([^"]*)"/.exec(readRepo(`${page}.wxml`))
  assert.ok(root, `${page}.wxml starts with the page root`)
  return root[1]
}

// issue #118 → #163：弹层遮挡和页面不可见都只暂停播放，不改动画名或周期；animation: none 会丢掉当前帧。
// 全仓只有一条暂停规则，在 app.wxss，盖住注册表里每个装饰性常驻动画。
test('obscured or hidden pages pause every decorative continuous animation on the current frame', () => {
  const files = analyzedWxssFiles()
  const pauses = files.flatMap((file) => file.rules
    .filter((rule) => rule.decls['animation-play-state'] === 'paused')
    .map((rule) => ({ relative: file.relative, rule })))
  assert.equal(pauses.length, 1, 'one pause rule for the whole app')
  const [{ relative, rule }] = pauses
  assert.equal(relative, 'app.wxss')
  assert.equal(rule.inReducedMotion, false)
  assert.deepEqual(Object.keys(rule.decls), ['animation-play-state'])

  const decorative = new Set()
  for (const file of files) {
    for (const item of file.rules) {
      if (item.inReducedMotion) continue
      if (!ruleAnimations(item).some((entry) => entry.infinite && continuousRole(entry.name) === 'decorative')) continue
      for (const selector of item.selectors) decorative.add(selector)
    }
  }
  assert.ok(decorative.size > 0)
  const expected = [...decorative].flatMap((selector) => [
    `.page.page-obscured ${selector}`,
    `.page.page-hidden ${selector}`
  ])
  assert.deepEqual([...rule.selectors].sort(), expected.sort())

  for (const page of appPages()) {
    const classes = rootClassAttribute(page)
    assert.match(classes, /^page safe-top\b/)
    const obscures = classes.includes("{{pageObscured ? 'page-obscured' : ''}}")
    assert.equal(obscures, SHEET_PAGES.includes(page), `${page} binds page-obscured only when it has sheets`)
    const hides = classes.includes("{{pageHidden ? 'page-hidden' : ''}}")
    assert.equal(hides, !PAGE_HIDDEN_EXEMPT[page], `${page} binds page-hidden`)
  }

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #118/)
  assert.match(design, /page-obscured/)
  assert.match(design, /page-hidden/)
  assert.match(design, /animation-play-state: paused/)
})

// issue #163：极光是一层静止基底加三个有边界的色团，取代整页缩放的 auroraPulse（issue #146 的 105% 尺寸随之退役）。
// 色团各自一层动画，周期和起点都错开；基底与色团固定在视口，滚动时不跟着走（不拦截点按见 interaction-semantics）。
test('the aurora is a still base under three bounded blooms that breathe out of phase', () => {
  const app = analyzeFile(readRepo('app.wxss'))
  const declsOf = (selector) => {
    const rule = app.rules.find((item) => !item.inReducedMotion && item.selectors.includes(selector))
    assert.ok(rule, `expected ${selector} in app.wxss`)
    return rule.decls
  }

  const base = declsOf('.page::before')
  assert.equal(base.position, 'fixed')
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.equal(base[side], '0', `the base covers the viewport exactly (${side})`)
  }
  assert.equal(base.animation, undefined, 'the base gradient holds still')

  const layer = declsOf('.aurora')
  assert.equal(layer.position, 'fixed')
  assert.equal(layer.overflow, 'hidden')
  assert.equal(layer.animation, undefined)

  const cycles = new Set()
  const offsets = new Set()
  const keyframeNames = new Set()
  for (const name of AURORA_BLOOMS) {
    const bloom = declsOf(`.aurora-bloom-${name}`)
    const stops = /^radial-gradient\(closest-side,\s*(.+)\)$/.exec(bloom.background || '')
    assert.ok(stops, `.aurora-bloom-${name} fades out inside its own box (closest-side radial)`)
    const colors = [...stops[1].matchAll(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/g)]
    assert.ok(colors.length >= 2, `.aurora-bloom-${name} needs at least two stops`)
    assert.equal(new Set(colors.map((color) => color.slice(1, 4).join(','))).size, 1, `.aurora-bloom-${name} keeps one hue`)
    assert.equal(Number(colors[colors.length - 1][4]), 0, `.aurora-bloom-${name} ends fully transparent: no hard edge`)

    const [animation, ...extra] = parseAnimationShorthand(bloom.animation || '')
    assert.ok(animation && extra.length === 0, `.aurora-bloom-${name} runs exactly one animation`)
    assert.equal(animation.infinite, true)
    assert.ok(/\balternate\b/.test(bloom.animation), `.aurora-bloom-${name} breathes back and forth`)
    const offset = /\s(-\d+(?:\.\d+)?s)\s/.exec(bloom.animation)
    assert.ok(offset, `.aurora-bloom-${name} starts mid-cycle through a negative delay`)
    cycles.add(animation.durationSec)
    offsets.add(offset[1])
    keyframeNames.add(animation.name)
    assert.deepEqual([...app.keyframes[animation.name]].sort(), ['opacity', 'transform'],
      `${animation.name} moves only on the compositor`)
  }
  assert.equal(keyframeNames.size, AURORA_BLOOMS.length, 'each bloom has its own path')
  assert.equal(cycles.size, AURORA_BLOOMS.length, 'bloom cycles differ, so the phases keep drifting apart')
  assert.equal(offsets.size, AURORA_BLOOMS.length, 'bloom start offsets differ')

  // 不再整页缩放：页面根、基底和色团容器都没有常驻动画
  for (const selector of ['.page', '.page::before', '.aurora']) {
    const looping = app.rules.filter((rule) => !rule.inReducedMotion && rule.selectors.includes(selector))
      .flatMap(ruleAnimations).filter((entry) => entry.infinite)
    assert.deepEqual(looping, [], `${selector} must not loop`)
  }
  const source = maskComments(readRepo('app.wxss'))
  for (const match of source.matchAll(/scale\(\s*([\d.]+)\s*\)/g)) {
    assert.ok(Number(match[1]) <= 1.1, `ambient scale ${match[1]} grows past 1.1`)
  }

  // 每个页面根下第一层都有同一份极光，放在顶栏之前
  for (const page of appPages()) {
    const wxml = readRepo(`${page}.wxml`)
    const found = wxml.match(new RegExp(AURORA_MARKUP.source, 'g')) || []
    assert.equal(found.length, 1, `${page}.wxml renders the aurora once`)
    const at = wxml.search(AURORA_MARKUP)
    assert.ok(at < wxml.indexOf('class="nav-bar'), `${page}.wxml paints the aurora before the nav bar`)
  }

  const design = readRepo('DESIGN.md')
  assert.match(design, /三个有边界的色团/)
  assert.doesNotMatch(design, /105%×105%/)
})

// 极光基底不透明、和色团一样是 z-index 0 的固定层：根下没有定位的块会画在它下面，整块看不见。
// 页面根下每个可见块都要定位并且 z-index ≥ 1（issue #163 发现首页骨架屏缺这一条）。
test('every visible block at a page root paints above the aurora', () => {
  const app = analyzeFile(readRepo('app.wxss'))
  const decorative = new Set(['aurora', 'reduced-motion-probe'])
  const violations = []
  for (const page of appPages()) {
    const own = analyzeFile(readRepo(`${page}.wxss`))
    const wxml = readRepo(`${page}.wxml`)
    const body = wxml.slice(0, wxml.search(/\n<template\b/) === -1 ? wxml.length : wxml.search(/\n<template\b/))
    for (const match of body.matchAll(/^ {2}<view\b[^>]*?\bclass="([^"]*)"/gm)) {
      const token = match[1].replace(/\{\{[^}]*\}\}/g, ' ').trim().split(/\s+/)[0]
      if (!token || decorative.has(token)) continue
      const selector = `.${token}`
      const decls = [...app.rules, ...own.rules]
        .filter((rule) => !rule.inReducedMotion && rule.selectors.includes(selector))
        .reduce((merged, rule) => ({ ...merged, ...rule.decls }), {})
      const positioned = ['relative', 'absolute', 'fixed'].includes(decls.position)
      if (!positioned || !(Number(decls['z-index']) >= 1)) {
        violations.push(`${page} ${selector} (position ${decls.position}, z-index ${decls['z-index']})`)
      }
    }
  }
  assert.deepEqual(violations, [])
})

// issue #137：滑动翻月不跟手、没有翻页动画；减弱动效下同样是一次即时替换。
test('calendar month swipe stays instant under reduced motion', () => {
  const design = readRepo('DESIGN.md')
  assert.match(design, /滑动翻月（issue #137）/)
  assert.match(design, /水平位移超过 48px 且大于竖直位移才翻月/)
  assert.match(design, /不跟手、不加翻页动画/)
  assert.match(design, /减弱动效下同样即时/)

  const inline = readRepo('pages/index/index.wxml').match(/<wxs module="monthSwipe">([\s\S]*?)<\/wxs>/)
  assert.ok(inline, 'month swipe script is inline')
  const wxs = inline[1]
  assert.doesNotMatch(wxs, /setStyle|translate|animation/)

  const app = analyzeFile(readRepo('app.wxss'))
  const grid = app.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.calendar-grid'))
  assert.equal(grid.decls.transition, 'opacity var(--duration-state) ease')
  const reducedGrid = app.reducedMotionRules.find((rule) => rule.selectors.includes('.calendar-grid'))
  assert.ok(reducedGrid, 'reduced motion must cover .calendar-grid')
  assert.equal(reducedGrid.decls.transition, 'none')
  assert.equal(reducedGrid.decls.animation, 'none')

  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const swipeRule = index.rules.find((rule) =>
    rule.selectors.some((selector) => selector.includes('calendar-swipe'))
  )
  assert.equal(swipeRule, undefined)
})
