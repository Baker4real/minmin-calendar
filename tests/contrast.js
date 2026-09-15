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

module.exports = {
  contrastRatio,
  meetsContrast
}
