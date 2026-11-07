const SRGB_LINEAR_CUTOFF = 0.04045
const RELATIVE_LUMINANCE_RED = 0.2126
const RELATIVE_LUMINANCE_GREEN = 0.7152
const RELATIVE_LUMINANCE_BLUE = 0.0722
const CONTRAST_OFFSET = 0.05
const AA_NORMAL_TEXT_RATIO = 4.5

function channelToLinear(srgb) {
  return srgb <= SRGB_LINEAR_CUTOFF
    ? srgb / 12.92
    : ((srgb + 0.055) / 1.055) ** 2.4
}

function parseHexColor(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!match) {
    throw new Error(`Invalid hex color: ${hex}`)
  }

  const value = match[1]
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255
  }
}

function relativeLuminance(hex) {
  const { r, g, b } = parseHexColor(hex)
  return (
    RELATIVE_LUMINANCE_RED * channelToLinear(r) +
    RELATIVE_LUMINANCE_GREEN * channelToLinear(g) +
    RELATIVE_LUMINANCE_BLUE * channelToLinear(b)
  )
}

function contrastRatio(foreground, background) {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET)
}

function meetsContrast(foreground, background, minimum = AA_NORMAL_TEXT_RATIO) {
  return contrastRatio(foreground, background) >= minimum
}

// ===== 极光最亮处（issue #163）=====
// 页面内容画在极光之上：静止基底 .page::before 加三个色团 .aurora-bloom-*。
// 取基底渐变里最亮的色标，再叠上每个让它更亮的色团最浓的色标。色团的透明度动画不超过 1，
// 三团也不会都压在同一点，所以这是保守上界。直接压在背景上的文字和半透明面，
// 在画布和这里都要过线。

function cssRgb(value) {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) return { ...parseHexColor(hex[0]), a: 1 }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(value)
  if (!rgba) throw new Error(`Unsupported aurora color: ${value}`)
  return { r: rgba[1] / 255, g: rgba[2] / 255, b: rgba[3] / 255, a: Number(rgba[4]) }
}

function toHexColor({ r, g, b }) {
  return `#${[r, g, b].map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
}

function auroraPeakHex(appCss) {
  const { parseWxssRules } = require('./designTokens')
  const rules = parseWxssRules(appCss)
  const backgroundOf = (selector) => {
    const rule = rules.find((item) => item.selectors.includes(selector) && item.decls.background)
    if (!rule) throw new Error(`expected a background on ${selector}`)
    return rule.decls.background
  }
  const colorsOf = (value) => [...value.matchAll(/#[0-9a-f]{6}\b|rgba\([^)]*\)/gi)].map((match) => cssRgb(match[0]))

  const luminance = (color) => relativeLuminance(toHexColor(color))
  let peak = colorsOf(backgroundOf('.page::before'))
    .reduce((best, color) => (luminance(color) > luminance(best) ? color : best))
  const blooms = [...new Set(rules.flatMap((rule) => rule.selectors))]
    .filter((selector) => /^\.aurora-bloom-[a-z]+$/.test(selector))
  if (blooms.length === 0) throw new Error('expected aurora blooms in app.wxss')
  for (const selector of blooms) {
    const strongest = colorsOf(backgroundOf(selector)).reduce((best, color) => (color.a > best.a ? color : best))
    const lifted = {
      r: strongest.r * strongest.a + peak.r * (1 - strongest.a),
      g: strongest.g * strongest.a + peak.g * (1 - strongest.a),
      b: strongest.b * strongest.a + peak.b * (1 - strongest.a)
    }
    if (luminance(lifted) > luminance(peak)) peak = lifted
  }
  return toHexColor(peak)
}

module.exports = {
  auroraPeakHex,
  contrastRatio,
  meetsContrast
}
