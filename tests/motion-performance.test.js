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

// 持续动画注册表（DESIGN.md「动效与性能边界」登记为同一清单）：
// 装饰性 = 慢周期 6–12s；功能性 = 加载/同步/骨架等状态指示（可快）；reducedMotion = RM 下的无位移替代。
const DECORATIVE_INFINITE = { auroraPulse: true, orbFloat: true, float: true, pulse: true }
const FUNCTIONAL_INFINITE = { spin: true, syncDotPulse: true, skeletonPulse: true }
const REDUCED_MOTION_INFINITE = { loadingPulse: true }
const RETIRED_ANIMATIONS = ['orbRotate', 'bounceIn']

// issue #111：一次性时长必须引用五档 token；常驻动画、其周期、减弱动效替代和 heroIn 保持字面时长。
const LITERAL_DURATION_ANIMATIONS = new Set([
  ...Object.keys(DECORATIVE_INFINITE),
  ...Object.keys(FUNCTIONAL_INFINITE),
  ...Object.keys(REDUCED_MOTION_INFINITE),
  'heroIn'
])
const ONE_SHOT_ANIMATIONS = {
  pageEnter: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  bindReveal: { duration: 'var(--duration-enter)', easing: 'var(--ease-out)' },
  dayDetailFade: { duration: 'var(--duration-state)', easing: 'var(--ease-out)' }
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

function sheetMotionExpectation(selector, prop) {
  const normalized = selector.replace(/\s+/g, ' ').trim()
  if (normalized === '.sheet-slide' && prop === 'transform') {
    return { duration: 'var(--duration-exit)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.day-sheet-mask.sheet-open .sheet-slide' && prop === 'transform') {
    return { duration: 'var(--duration-sheet)', easing: 'var(--ease-out)' }
  }
  if (normalized === '.day-sheet-mask.sheet-open .sheet-slide.sheet-reset' && prop === 'transform') {
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

      if (rule.decls['animation-duration']) {
        const duration = rule.decls['animation-duration']
        const orbCycle = rule.selectors.includes('.glow-orb-2') && duration === '8s'
        if (!orbCycle) violations.push(`${where} animation-duration ${duration} is not a registered ambient cycle`)
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

test('infinite animations stay inside the registered registry with slow decorative cycles', () => {
  const foundDecorative = new Map()
  const foundFunctional = new Map()
  const violations = []

  for (const file of analyzedWxssFiles()) {
    for (const rule of file.rules) {
      for (const animation of ruleAnimations(rule)) {
        if (!animation.infinite) continue
        if (rule.inReducedMotion) {
          if (!REDUCED_MOTION_INFINITE[animation.name]) {
            violations.push(`${file.relative} reduced-motion block runs unregistered infinite ${animation.name}`)
          }
          continue
        }
        if (DECORATIVE_INFINITE[animation.name]) {
          foundDecorative.set(animation.name, animation.durationSec)
          const duration = animation.durationSec
          if (!(duration >= 6 && duration <= 12)) {
            violations.push(`${file.relative} decorative ${animation.name} runs ${duration}s outside the 6-12s slow band`)
          }
          continue
        }
        if (FUNCTIONAL_INFINITE[animation.name]) {
          foundFunctional.set(animation.name, animation.durationSec)
          continue
        }
        violations.push(`${file.relative} runs unregistered infinite animation ${animation.name}`)
      }
    }
  }

  assert.deepEqual(violations, [])
  assert.deepEqual([...foundDecorative.keys()].sort(), Object.keys(DECORATIVE_INFINITE).sort())
  assert.deepEqual([...foundFunctional.keys()].sort(), Object.keys(FUNCTIONAL_INFINITE).sort())
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

// blur 预算：单面 ≤20px；每页玻璃面数量上限（棘轮，只允许收紧）；全屏遮罩 ≤8px。
const BLUR_RADIUS_CAP_PX = 20
const MASK_BLUR_CAP_PX = 8
const BLUR_RULE_CEILINGS = {
  'app.wxss': 4,
  'pages/index/index.wxss': 5,
  'pages/bind/bind.wxss': 2,
  'pages/settings/settings.wxss': 0,
  'pages/period/period.wxss': 3,
  'pages/memory/memory.wxss': 2,
  'pages/period/edit/edit.wxss': 2,
  'pages/memory/edit/edit.wxss': 2
}

test('backdrop blur stays within the radius cap and per-file glass surface budget', () => {
  const files = analyzedWxssFiles()
  for (const file of files) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(BLUR_RULE_CEILINGS, file.relative),
      `${file.relative} is not registered in BLUR_RULE_CEILINGS`
    )
    const blurRules = file.rules.filter(
      (rule) => !rule.inReducedMotion && Object.prototype.hasOwnProperty.call(rule.decls, 'backdrop-filter')
    )
    assert.ok(
      blurRules.length <= BLUR_RULE_CEILINGS[file.relative],
      `${file.relative} has ${blurRules.length} blurred surfaces, budget ${BLUR_RULE_CEILINGS[file.relative]}`
    )
    for (const rule of blurRules) {
      const radius = Number(/blur\((\d+)px\)/.exec(rule.decls['backdrop-filter'])?.[1])
      assert.ok(radius > 0 && radius <= BLUR_RADIUS_CAP_PX, `${file.relative} ${rule.selectors.join(', ')} blur ${radius}px exceeds ${BLUR_RADIUS_CAP_PX}px`)
      assert.equal(
        rule.decls['-webkit-backdrop-filter'],
        rule.decls['backdrop-filter'],
        `${file.relative} ${rule.selectors.join(', ')} must pair -webkit-backdrop-filter`
      )
      if (rule.selectors.some((selector) => /mask/.test(selector))) {
        assert.ok(radius <= MASK_BLUR_CAP_PX, `${file.relative} ${rule.selectors.join(', ')} full-screen mask blur ${radius}px exceeds ${MASK_BLUR_CAP_PX}px`)
      }
    }
  }
})

// 阴影预算：颜色由 design-token-guardrail 的阴影注册表管，本表管每文件声明数上限（棘轮）。
const SHADOW_DECL_CEILINGS = {
  'app.wxss': 6,
  'pages/index/index.wxss': 26,
  'pages/bind/bind.wxss': 1,
  'pages/settings/settings.wxss': 2,
  'pages/period/period.wxss': 1,
  'pages/memory/memory.wxss': 1,
  'pages/period/edit/edit.wxss': 3,
  'pages/memory/edit/edit.wxss': 2
}

test('box-shadow declaration counts stay within per-file ceilings', () => {
  for (const file of analyzedWxssFiles()) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(SHADOW_DECL_CEILINGS, file.relative),
      `${file.relative} is not registered in SHADOW_DECL_CEILINGS`
    )
    const shadowDecls = file.rules.filter(
      (rule) => !rule.inReducedMotion && rule.decls['box-shadow'] && rule.decls['box-shadow'] !== 'none'
    )
    assert.ok(
      shadowDecls.length <= SHADOW_DECL_CEILINGS[file.relative],
      `${file.relative} declares ${shadowDecls.length} box-shadows, ceiling ${SHADOW_DECL_CEILINGS[file.relative]}`
    )
  }
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

test('month flips keep only the refresh dim, and day colors switch immediately', () => {
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

  for (const selector of [
    '.day-cell.today',
    '.day-cell.holiday:not(.today)',
    '.day-cell.workday:not(.today)',
    '.day-cell.today .day-num'
  ]) {
    const rule = index.rules.find((item) => !item.inReducedMotion && item.selectors.includes(selector))
    assert.ok(rule, `expected ${selector}`)
    assert.equal(rule.decls.transition, undefined, `${selector} must switch fill and text color immediately`)
  }

  assert.match(design, /翻月没有计时器，即时替换/)
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
    '.day-sheet-mask.sheet-open .sheet-slide',
    '.day-sheet-mask.sheet-open .sheet-slide.sheet-reset',
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
    '.page::before',
    '.glow-orb',
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

  const openSlide = index.rules.find((rule) => rule.selectors.includes('.day-sheet-mask.sheet-open .sheet-slide'))
  assert.equal(openSlide.decls.transform, 'translateY(0)')
  assert.equal(openSlide.decls.transition, 'transform var(--duration-sheet) var(--ease-out)')

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #117/)
  assert.match(design, /sheet-handoff/)
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

  const openSlide = index.rules.find((rule) => rule.selectors.includes('.day-sheet-mask.sheet-open .sheet-slide'))
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
  for (const selector of ['.sheet-slide', '.day-sheet-mask.sheet-open', '.day-sheet-mask.sheet-open .sheet-slide', '.day-sheet-mask.sheet-open .sheet-slide.sheet-reset']) {
    assert.ok(covered.has(selector), `reduced motion must cover ${selector}`)
    const rmRule = index.reducedMotionRules.find((rule) => rule.selectors.includes(selector))
    assert.equal(rmRule.decls.transition, 'none', `${selector} must finish immediately under reduced motion`)
  }

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #116/)
  assert.match(design, /translateY\(100%\)/)
  assert.match(design, /issue #119/)
  assert.match(design, /10px/)
  assert.match(design, /25%/)
  assert.match(design, /0\.11 px\/ms/)
  assert.match(design, /0\.55/)
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

test('DESIGN.md registers the motion and performance budgets', () => {
  const design = readRepo('DESIGN.md')
  for (const name of [
    'auroraPulse',
    'orbFloat',
    'float',
    'pulse',
    'spin',
    'syncDotPulse',
    'skeletonPulse',
    'loadingPulse'
  ]) {
    assert.ok(design.includes(name), `DESIGN.md is missing the ${name} registration`)
  }
  for (const retired of ['--ease-spring', '--transition-spring', 'orbRotate']) {
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

// issue #118：遮挡只暂停播放，不改动画名或周期；animation: none 会丢掉当前帧。
test('an obscured homepage pauses the five covered decorations on the current frame', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const paused = index.rules.filter((rule) => rule.decls['animation-play-state'] === 'paused')
  assert.equal(paused.length, 1)
  assert.equal(paused[0].inReducedMotion, false)
  assert.deepEqual(Object.keys(paused[0].decls), ['animation-play-state'])
  assert.deepEqual([...paused[0].selectors].sort(), [
    '.page.page-obscured .glow-orb',
    '.page.page-obscured .header-gradient::after',
    '.page.page-obscured .header-gradient::before',
    '.page.page-obscured::before'
  ])

  const design = readRepo('DESIGN.md')
  assert.match(design, /issue #118/)
  assert.match(design, /page-obscured/)
  assert.match(design, /animation-play-state: paused/)
})

// issue #118：月份箭头嵌在月份栏的模糊里，自身再模糊一次看不见。首页玻璃面上限收到 5。
test('month arrows do not add a second blur, and the homepage glass cap is 5', () => {
  const index = analyzeFile(readRepo('pages/index/index.wxss'))
  const navBtn = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.nav-btn'))
  assert.ok(navBtn, 'expected .nav-btn')
  assert.equal(navBtn.decls['backdrop-filter'], undefined)
  assert.equal(navBtn.decls['-webkit-backdrop-filter'], undefined)
  assert.equal(BLUR_RULE_CEILINGS['pages/index/index.wxss'], 5)

  const monthNav = index.rules.find((rule) => !rule.inReducedMotion && rule.selectors.includes('.month-nav'))
  assert.equal(monthNav.decls['backdrop-filter'], 'blur(20px)')

  const design = readRepo('DESIGN.md')
  assert.match(design, /玻璃面数量上限收紧为 5/)
})
