const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')

const MIN_FALLBACK_ALPHA = 0.85
const NAVY_FILLS = [
  [10, 14, 39],
  [26, 10, 46],
  [18, 22, 61]
]
const ROSE_FILL = [232, 144, 158]

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function customProperties(css) {
  const tokens = {}
  for (const match of stripComments(css).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens[`--${match[1]}`] = match[2].trim()
  }
  return tokens
}

function resolveVars(value, tokens) {
  let current = String(value)
  for (let step = 0; step < 4; step += 1) {
    const next = current.replace(
      /var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^)]+))?\)/gi,
      (_, name, fallback) => {
        if (Object.prototype.hasOwnProperty.call(tokens, name)) return tokens[name]
        return fallback != null ? fallback.trim() : ''
      }
    )
    if (next === current) break
    current = next
  }
  return current
}

function parseRules(css) {
  const text = stripComments(css)
  const rules = []
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

    const selector = text.slice(cursor, open).trim()
    const body = text.slice(open + 1, close)

    if (selector.startsWith('@')) {
      for (const nested of parseRules(body)) {
        rules.push({
          selector: `${selector} ${nested.selector}`.trim(),
          decls: nested.decls
        })
      }
    } else if (selector) {
      const decls = {}
      for (const part of body.split(';')) {
        const separator = part.indexOf(':')
        if (separator === -1) continue
        const prop = part.slice(0, separator).trim()
        const value = part.slice(separator + 1).trim()
        if (prop) decls[prop] = value
      }
      rules.push({ selector, decls })
    }

    cursor = close + 1
  }

  return rules
}

function parseHexColor(hex) {
  let digits = hex.slice(1)
  if (digits.length === 3) {
    digits = [...digits].map((digit) => digit + digit).join('')
  }

  let alpha = 1
  if (digits.length === 8) {
    alpha = Number.parseInt(digits.slice(6, 8), 16) / 255
    digits = digits.slice(0, 6)
  }

  return {
    r: Number.parseInt(digits.slice(0, 2), 16),
    g: Number.parseInt(digits.slice(2, 4), 16),
    b: Number.parseInt(digits.slice(4, 6), 16),
    a: alpha
  }
}

function extractColors(value) {
  const colors = []
  const source = String(value)

  for (const match of source.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi)) {
    colors.push(parseHexColor(match[0]))
  }

  for (const match of source.matchAll(
    /rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/gi
  )) {
    colors.push({
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] == null ? 1 : Number(match[4])
    })
  }

  if (/\btransparent\b/i.test(source)) {
    colors.push({ r: 0, g: 0, b: 0, a: 0 })
  }

  return colors
}

function channelsMatch(color, expected) {
  return color.r === expected[0] && color.g === expected[1] && color.b === expected[2]
}

function isSolidFallbackColor(color) {
  if (!(color.a >= MIN_FALLBACK_ALPHA)) return false
  if (NAVY_FILLS.some((navy) => channelsMatch(color, navy))) return true
  return channelsMatch(color, ROSE_FILL)
}

function backgroundValue(decls) {
  return [
    decls.background,
    decls['background-color'],
    decls['background-image']
  ].filter(Boolean).join(', ')
}

function ruleHasSolidFallback(decls, tokens) {
  if (!Object.prototype.hasOwnProperty.call(decls, 'backdrop-filter')) return true
  const raw = backgroundValue(decls)
  if (!raw) return false
  return extractColors(resolveVars(raw, tokens)).some(isSolidFallbackColor)
}

function appTokens() {
  // issue #104：绑定页 --bind-* 试点 token 整体退役，玻璃面解析只需 app 级 token
  return customProperties(fs.readFileSync(path.join(repoRoot, 'app.wxss'), 'utf8'))
}

function listWxssFiles() {
  const skipDirs = new Set(['node_modules', 'cloudfunctions', '_external'])
  const files = []

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || skipDirs.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      if (entry.name.endsWith('.wxss')) files.push(full)
    }
  }

  walk(repoRoot)
  return files
}

function splitTopLevelCommas(value) {
  const layers = []
  let depth = 0
  let start = 0
  const text = String(value)

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '(') depth += 1
    else if (char === ')') depth = Math.max(0, depth - 1)
    else if (char === ',' && depth === 0) {
      layers.push(text.slice(start, index))
      start = index + 1
    }
  }

  layers.push(text.slice(start))
  return layers.map((layer) => layer.trim()).filter(Boolean)
}

function isImageLayer(layer) {
  if (/^none$/i.test(layer)) return true
  return /(?:repeating-)?(?:linear|radial|conic)-gradient\(|\burl\(|\bimage-set\(/i.test(layer)
}

function nonFinalColorLayers(css) {
  const hits = []
  for (const rule of parseRules(css)) {
    const value = rule.decls.background
    if (!value) continue
    const layers = splitTopLevelCommas(value)
    for (const layer of layers.slice(0, -1)) {
      if (isImageLayer(layer)) continue
      hits.push(`${rule.selector} :: ${layer.replace(/\s+/g, ' ')}`)
    }
  }
  return hits
}

test('translucent white glass is not a solid calendar-covering fallback', () => {
  const decls = {
    background: 'rgba(255,255,255,0.08)',
    'backdrop-filter': 'blur(20px)'
  }
  assert.equal(ruleHasSolidFallback(decls, {}), false)
})

test('resolved --glass-bg overlay alone is not a solid fallback', () => {
  const decls = {
    background: 'var(--glass-bg)',
    'backdrop-filter': 'blur(20px)'
  }
  assert.equal(ruleHasSolidFallback(decls, { '--glass-bg': 'rgba(255,255,255,0.08)' }), false)
})

test('low-alpha navy does not count as a solid fallback', () => {
  const decls = {
    background: 'rgba(18,22,61,0.4)',
    'backdrop-filter': 'blur(20px)'
  }
  assert.equal(ruleHasSolidFallback(decls, {}), false)
})

test('opaque white is not an allowed navy or rose fallback', () => {
  const decls = {
    background: '#FFFFFF',
    'backdrop-filter': 'blur(20px)'
  }
  assert.equal(ruleHasSolidFallback(decls, {}), false)
})

test('high-alpha navy in the same rule is a solid fallback', () => {
  const decls = {
    background: 'var(--glass-bg), rgba(18,22,61,0.92)',
    'backdrop-filter': 'blur(20px)'
  }
  assert.equal(ruleHasSolidFallback(decls, { '--glass-bg': 'rgba(255,255,255,0.08)' }), true)
})

test('canvas navy hex in the same rule is a solid fallback', () => {
  const decls = {
    'background-color': '#0A0E27',
    'backdrop-filter': 'blur(16px)'
  }
  assert.equal(ruleHasSolidFallback(decls, {}), true)
})

test('every backdrop-filter rule keeps an opaque navy or rose fill', () => {
  const tokens = appTokens()
  const missing = []

  for (const file of listWxssFiles()) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseRules(fs.readFileSync(file, 'utf8'))) {
      if (!Object.prototype.hasOwnProperty.call(rule.decls, 'backdrop-filter')) continue
      if (ruleHasSolidFallback(rule.decls, tokens)) continue
      missing.push(`${relative} ${rule.selector}`)
    }
  }

  assert.deepEqual(missing, [])
})

// CSS 只允许 <color> 作为 background 简写的最后一层。更早的颜色（含颜色型 var()）
// 会让整条声明在计算值阶段失效，tint 和海军回退都不会画出来。
test('a background shorthand may not put a color on a non-final layer', () => {
  const samples = [
    ['.a { background: rgba(255,255,255,0.09), var(--glass-fallback); }', ['.a :: rgba(255,255,255,0.09)']],
    ['.a { background: var(--glass-bg), var(--glass-fallback); }', ['.a :: var(--glass-bg)']],
    ['.a { background: rgba(249,115,115,0.12), var(--glass-fallback); }', ['.a :: rgba(249,115,115,0.12)']],
    ['.a { background: linear-gradient(var(--glass-bg), var(--glass-bg)), var(--glass-fallback); }', []],
    ['.a { background: linear-gradient(rgba(255,255,255,0.09), rgba(255,255,255,0.09)), var(--glass-fallback); }', []],
    ['.a { background: linear-gradient(135deg, rgba(232,144,158,0.18), rgba(196,160,210,0.12)), var(--glass-fallback); }', []],
    ['.a { background: #0A0E27; }', []],
    ['.a { background: radial-gradient(circle, rgba(232,144,158,0.2), transparent), linear-gradient(135deg, #0A0E27, #1A0A2E); }', []]
  ]

  for (const [css, expected] of samples) {
    assert.deepEqual(nonFinalColorLayers(css), expected)
  }

  const violations = []
  for (const file of listWxssFiles()) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const hit of nonFinalColorLayers(fs.readFileSync(file, 'utf8'))) {
      violations.push(`${relative} ${hit}`)
    }
  }

  assert.deepEqual(violations, [])
})

// issue #146：玻璃回退实色约 0.92，再叠一层很淡的白，合成不透明度约 0.926。
// 这种面上的 backdrop-filter 几乎看不见，却会在动画背景上每帧重算。0.88 的弹层遮罩留在这条线下面。
const NEAR_OPAQUE_ALPHA = 0.9

function compositedAlpha(decls, tokens) {
  const raw = backgroundValue(decls)
  if (!raw) return 0
  const layers = splitTopLevelCommas(resolveVars(raw, tokens))
  let alpha = 0
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const colors = extractColors(layers[index])
    const src = colors.length ? Math.min(...colors.map((color) => color.a)) : 0
    alpha = src + alpha * (1 - src)
  }
  return alpha
}

test('a 0.92 navy fallback under an 0.08 white tint composites to 0.9264', () => {
  const alpha = compositedAlpha({
    background: 'linear-gradient(rgba(255,255,255,0.08), rgba(255,255,255,0.08)), rgba(18,22,61,0.92)'
  }, {})
  assert.ok(Math.abs(alpha - 0.9264) < 0.000001, `expected 0.9264, got ${alpha}`)
})

test('an 88% navy sheet mask stays below the near-opaque line', () => {
  const alpha = compositedAlpha({ background: 'rgba(10,14,39,0.88)' }, {})
  assert.ok(Math.abs(alpha - 0.88) < 0.000001)
  assert.ok(alpha < NEAR_OPAQUE_ALPHA)
})

test('near-opaque surfaces do not use backdrop-filter', () => {
  const tokens = appTokens()
  const violations = []

  for (const file of listWxssFiles()) {
    const relative = path.relative(repoRoot, file).replaceAll('\\', '/')
    for (const rule of parseRules(fs.readFileSync(file, 'utf8'))) {
      const filter = rule.decls['backdrop-filter']
      if (!filter || !/blur\(/i.test(filter)) continue
      const alpha = compositedAlpha(rule.decls, tokens)
      if (alpha < NEAR_OPAQUE_ALPHA) continue
      violations.push(`${relative} ${rule.selector} composites to ${alpha.toFixed(3)}`)
    }
  }

  assert.deepEqual(violations, [])
})
