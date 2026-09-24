const fs = require('node:fs')
const path = require('node:path')

// 色板唯一权威是 DESIGN.md（含警示红、极光中间色、tab 未选中等补登色）；色板变更时同步本表
const PALETTE_HEXES = [
  '#E8909E',
  '#C4A0D2',
  '#F0C4C0',
  '#D4A574',
  '#FFFFFF',
  '#0A0E27',
  '#1A0A2E',
  '#12163D',
  '#2D1B69',
  // 绑定页紫域试点（issue #87）：深紫画布两端，只允许 pages/bind/bind.wxss 的 --bind-canvas-* token 引用
  '#2E2350',
  '#1A1433',
  // 绑定页粉按钮族（issue #88）：胶囊实色粉与幽灵粉，只允许 pages/bind/bind.wxss 的 --bind-cta-pink / --bind-ghost-pink token 引用
  '#FF7FB0',
  '#FF8FBE',
  // 绑定页紫域试点（issue #89 换装复核）：成功标题升档玫瑰，只允许 pages/bind/bind.wxss 的 --bind-status-rose token 引用
  '#F2A3B0',
  '#F97373',
  '#7A7C8C'
]

function maskComments(css) {
  return String(css).replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function maskWxmlComments(wxml) {
  return String(wxml).replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function normalizeHex(raw) {
  let digits = String(raw).slice(1).toUpperCase()
  if (digits.length === 3 || digits.length === 4) {
    digits = [...digits].map((digit) => digit + digit).join('')
  }
  return `#${digits.slice(0, 6)}`
}

function findOffPaletteHexes(css, palette = PALETTE_HEXES) {
  const allowed = new Set(palette.map(normalizeHex))
  const violations = []
  const lines = maskComments(css).split('\n')

  lines.forEach((line, index) => {
    for (const match of line.matchAll(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi)) {
      const normalized = normalizeHex(match[0])
      if (!allowed.has(normalized)) {
        violations.push({ line: index + 1, hex: match[0], normalized })
      }
    }
  })

  return violations
}

function definedRadiusTokens(css) {
  const tokens = new Set()
  for (const match of String(css).matchAll(/--(radius-[a-z0-9-]+)\s*:/gi)) {
    tokens.add(match[1].toLowerCase())
  }
  return tokens
}

function findOffPaletteHexesInInlineStyles(wxml, palette = PALETTE_HEXES) {
  const allowed = new Set(palette.map(normalizeHex))
  const violations = []
  const masked = maskWxmlComments(wxml)

  for (const match of masked.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const value = match[1] ?? match[2] ?? ''
    const line = masked.slice(0, match.index).split('\n').length
    for (const hexMatch of value.matchAll(/#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi)) {
      const normalized = normalizeHex(hexMatch[0])
      if (!allowed.has(normalized)) {
        violations.push({ line, hex: hexMatch[0], normalized })
      }
    }
  }

  return violations
}

function findOffTokenRadii(css, definedTokens) {
  const violations = []
  const lines = maskComments(css).split('\n')

  lines.forEach((line, index) => {
    for (const match of line.matchAll(/\bborder(?:-(?:top|bottom)-(?:left|right))?-radius\s*:\s*([^;}]+)/gi)) {
      const value = match[1].trim().replace(/var\(\s+/g, 'var(').replace(/\s+\)/g, ')')
      for (const component of value.split(/\s+/)) {
        if (component === '0') continue
        const tokenRef = /^var\(--(radius-[a-z0-9-]+)\)$/i.exec(component)
        if (tokenRef && definedTokens.has(tokenRef[1].toLowerCase())) continue
        violations.push({ line: index + 1, value, component })
      }
    }
  })

  return violations
}

function parseWxssRules(css) {
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
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

    const selectorText = text.slice(cursor, open).trim()
    const body = text.slice(open + 1, close)

    if (selectorText.startsWith('@')) {
      for (const nested of parseWxssRules(body)) {
        rules.push({ selectors: nested.selectors, decls: nested.decls })
      }
    } else if (selectorText) {
      const selectors = selectorText.split(',').map((selector) => selector.trim()).filter(Boolean)
      const decls = {}
      for (const part of body.split(';')) {
        const separator = part.indexOf(':')
        if (separator === -1) continue
        const prop = part.slice(0, separator).trim()
        const value = part.slice(separator + 1).trim()
        if (prop) decls[prop] = value
      }
      rules.push({ selectors, decls })
    }

    cursor = close + 1
  }

  return rules
}

function listFilesByExtension(root, extension) {
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
      if (entry.name.endsWith(extension)) files.push(full)
    }
  }

  walk(root)
  return files
}

function listWxssFiles(root) {
  return listFilesByExtension(root, '.wxss')
}

function listWxmlFiles(root) {
  return listFilesByExtension(root, '.wxml')
}

module.exports = {
  PALETTE_HEXES,
  definedRadiusTokens,
  findOffPaletteHexes,
  findOffPaletteHexesInInlineStyles,
  findOffTokenRadii,
  listWxmlFiles,
  listWxssFiles,
  normalizeHex,
  parseWxssRules
}
