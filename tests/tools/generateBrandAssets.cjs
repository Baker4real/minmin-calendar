const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { browsersPath, workspaceRequire } = require('./playwrightBrowsers.cjs')
const { addIndexedBlueNoise, highPass } = require('./indexedBlueNoise.cjs')

const root = path.resolve(__dirname, '../..')
const out = path.join(root, '.scratch', 'brand-assets')
const checkOnly = process.argv.includes('--check')
const TRUECOLOR_LIMIT = 115 * 1024
const TRUECOLOR_MEDIA_LIMIT = 180 * 1024
const QUANTIZED_LIMIT = 95 * 1024
const PACKAGE_MEDIA_LIMIT = 200 * 1024
const ICON_FILES = ['calendar', 'calendar_active', 'list', 'list_active', 'settings', 'settings_active']
  .map(name => `images/${name}.png`)

fs.mkdirSync(out, { recursive: true })
process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath(root)
const { chromium } = workspaceRequire(root)('playwright')
const { Jimp } = workspaceRequire(root)('jimp-modern')

const HEART = 'M 0 82 C -11 69 -82 19 -82 -34 C -82 -76 -28 -92 0 -50 C 28 -92 82 -76 82 -34 C 82 19 11 69 0 82 Z'

function heart(id, color, transform) {
  return `
    <defs>
      <linearGradient id="${id}-fill" x1="0" y1="-88" x2="20" y2="84" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${color}" stop-opacity=".36"/>
        <stop offset=".46" stop-color="${color}" stop-opacity=".21"/>
        <stop offset="1" stop-color="${color}" stop-opacity=".10"/>
      </linearGradient>
      <linearGradient id="${id}-edge" x1="-75" y1="-75" x2="70" y2="75" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".80"/>
        <stop offset=".28" stop-color="${color}" stop-opacity=".82"/>
        <stop offset="1" stop-color="${color}" stop-opacity=".28"/>
      </linearGradient>
      <linearGradient id="${id}-sheen" x1="-60" y1="-65" x2="60" y2="30" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/>
        <stop offset=".48" stop-color="#FFFFFF" stop-opacity=".035"/>
        <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>
      <clipPath id="${id}-clip"><path d="${HEART}"/></clipPath>
      <filter id="${id}-shadow" x="-40%" y="-35%" width="180%" height="190%">
        <feDropShadow dx="0" dy="14" stdDeviation="13" flood-color="#050816" flood-opacity=".32"/>
      </filter>
    </defs>
    <g transform="${transform}">
      <path d="${HEART}" fill="url(#${id}-fill)" filter="url(#${id}-shadow)"/>
      <g clip-path="url(#${id}-clip)">
        <path d="M -80 -28 C -72 -66 -37 -82 -8 -57 C 22 -79 63 -65 79 -31 C 33 -47 -22 -31 -69 11 Z" fill="url(#${id}-sheen)"/>
        <path d="${HEART}" fill="none" stroke="url(#${id}-edge)" stroke-width="3.2"/>
        <path d="M -78 -29 C -80 -50 -66 -70 -48 -75" fill="none" stroke="#FFFFFF" stroke-opacity=".42" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M -52 35 C -30 57 -9 73 0 79" fill="none" stroke="${color}" stroke-opacity=".18" stroke-width="1.3" stroke-linecap="round"/>
      </g>
      <path d="${HEART}" fill="none" stroke="${color}" stroke-opacity=".50" stroke-width="1.15"/>
    </g>`
}

function artworkSvg(width, height, applicationIcon = false) {
  const hearts = applicationIcon
    ? `${heart('lavender', '#C4A0D2', 'translate(554 477) rotate(7) scale(2.12)')}${heart('rose', '#E8909E', 'translate(454 495) rotate(-7) scale(2.12)')}`
    : `${heart('lavender', '#C4A0D2', 'translate(550 318) rotate(7) scale(1.48)')}${heart('rose', '#E8909E', 'translate(450 338) rotate(-7) scale(1.48)')}`
  const lettering = applicationIcon ? '' : `
    <text x="500" y="625" text-anchor="middle" fill="#FFFFFF" fill-opacity=".94"
      font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="66" font-weight="600"
      letter-spacing="2">美少女的日历</text>
    <text x="500" y="688" text-anchor="middle" fill="#F0C4C0" fill-opacity=".88"
      font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="31" font-weight="400"
      letter-spacing="2">把这一份温柔，留给我们</text>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    ${hearts}
    ${lettering}
  </svg>`
}

function hexRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]
}

function mixColor(base, overlay, alpha) {
  for (let channel = 0; channel < 3; channel++) base[channel] += (overlay[channel] - base[channel]) * alpha
}

function createBackground(width, height, seed, withNoise) {
  const image = new Jimp({ width, height, color: 0x0a0e27ff })
  const top = hexRgb('#0A0E27')
  const middle = hexRgb('#12163D')
  const bottom = hexRgb('#1A0A2E')
  const blooms = [
    { x: .18, y: .17, rx: .56, ry: .54, color: hexRgb('#E8909E'), opacity: .18 },
    { x: .84, y: .32, rx: .54, ry: .64, color: hexRgb('#C4A0D2'), opacity: .17 },
    { x: .52, y: .86, rx: .68, ry: .60, color: hexRgb('#2D1B69'), opacity: .48 }
  ]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = Math.max(0, Math.min(1, 0.42 * x / (width - 1) + 0.58 * y / (height - 1)))
      const local = t <= .5 ? t * 2 : (t - .5) * 2
      const from = t <= .5 ? top : middle
      const to = t <= .5 ? middle : bottom
      const color = from.map((value, channel) => value + (to[channel] - value) * local)
      for (const bloom of blooms) {
        const radius = Math.hypot((x / width - bloom.x) / bloom.rx, (y / height - bloom.y) / bloom.ry)
        if (radius < 1) mixColor(color, bloom.color, bloom.opacity * (1 - radius))
      }
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++) image.bitmap.data[offset + channel] = Math.round(color[channel])
      image.bitmap.data[offset + 3] = 255
    }
  }
  if (withNoise) addBlueNoise(image.bitmap, seed)
  return image
}

function compositeOver(background, overlay) {
  const { width, height, data } = background.bitmap
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4
    const alpha = overlay.bitmap.data[offset + 3] / 255
    if (alpha === 0) continue
    for (let channel = 0; channel < 3; channel++) {
      data[offset + channel] = Math.round(overlay.bitmap.data[offset + channel] * alpha + data[offset + channel] * (1 - alpha))
    }
    data[offset + 3] = 255
  }
}

async function renderArtwork(browser, width, height, applicationIcon = false, withNoise = true) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  try {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}svg{display:block}</style></head><body>${artworkSvg(width, height, applicationIcon)}</body></html>`)
    await page.evaluate(() => document.fonts.ready)
    const screenshot = await page.screenshot({ type: 'png', omitBackground: true })
    const overlay = await Jimp.read(screenshot)
    const image = createBackground(width, height, applicationIcon ? 2651024 : 2651000, withNoise)
    compositeOver(image, overlay)
    return image.getBuffer('image/png', { colorType: 2, deflateLevel: 9, deflateStrategy: 3 })
  } finally {
    await page.close()
  }
}

// Zero-mean high-pass noise removes low-frequency clumps. Its RMS is about one percent of 255.
function addBlueNoise(bitmap, seed) {
  const { width, height, data } = bitmap
  const source = Buffer.from(data)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const noise = highPass(x, y, seed)
      const delta = Math.round((noise - 0.0) * 4.2)
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 3; channel++) {
        data[offset + channel] = Math.max(0, Math.min(255, source[offset + channel] + delta))
      }
      data[offset + 3] = 255
    }
  }
}

function smoothstep(min, max, value) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return t * t * (3 - 2 * t)
}

function roundedBoxDistance(x, y, cx, cy, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x - cx) - halfWidth + radius
  const qy = Math.abs(y - cy) - halfHeight + radius
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function capsuleDistance(x, y, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / (vx * vx + vy * vy)))
  return Math.hypot(x - (x1 + t * vx), y - (y1 + t * vy))
}

function iconPixel(kind, x, y) {
  if (kind === 'calendar') {
    const stroke = 5.5 / 2
    const frame = Math.abs(roundedBoxDistance(x, y, 54, 56, 33, 28, 9)) <= stroke
    const divider = capsuleDistance(x, y, 25, 44, 83, 44) <= stroke
    const leftRing = capsuleDistance(x, y, 38, 16, 38, 33) <= stroke
    const rightRing = capsuleDistance(x, y, 70, 16, 70, 33) <= stroke
    const dateSquares = [42, 66].some(cx => [59, 73].some(cy => roundedBoxDistance(x, y, cx, cy, 3, 3, 1.2) <= 0))
    return frame || divider || leftRing || rightRing || dateSquares
  }
  if (kind === 'list') {
    for (const rowY of [27, 54, 81]) {
      if (Math.hypot(x - 20, y - rowY) <= 6.5) return true
      if (capsuleDistance(x, y, 34, rowY, 92, rowY) <= 3.25) return true
    }
    return false
  }
  const dx = x - 54
  const dy = y - 54
  const radius = Math.hypot(dx, dy)
  const angle = Math.atan2(dy, dx)
  const lobe = smoothstep(0.18, 0.82, 0.5 + 0.5 * Math.cos(angle * 6))
  const outer = 35 + 9.5 * lobe
  return radius >= 31.25 && radius <= outer
}

async function renderIcon(kind, hex) {
  // The 108px deliverable is 3x the 36px logical icon. scale=4 is only the
  // internal 4x4 coverage grid per output pixel, not a 432px delivered asset.
  const scale = 4
  const size = 108
  const high = size * scale
  const color = Number.parseInt(hex.slice(1), 16)
  const rgba = {
    r: (color >>> 16) & 0xff,
    g: (color >>> 8) & 0xff,
    b: color & 0xff
  }
  const image = new Jimp({ width: size, height: size, color: 0x00000000 })
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let coverage = 0
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          if (iconPixel(kind, x + (sx + 0.5) / scale, y + (sy + 0.5) / scale)) coverage++
        }
      }
      const offset = (y * size + x) * 4
      image.bitmap.data[offset] = rgba.r
      image.bitmap.data[offset + 1] = rgba.g
      image.bitmap.data[offset + 2] = rgba.b
      image.bitmap.data[offset + 3] = Math.round(coverage * 255 / (scale * scale))
    }
  }
  assert.equal(high, 432)
  return image.getBuffer('image/png', { colorType: 6, deflateLevel: 9, deflateStrategy: 3 })
}

function quantizeInvite(smoothCandidate) {
  const input = path.join(out, 'invite-card-smooth.png')
  const palette = path.join(out, 'invite-palette.png')
  const baseOutput = path.join(out, 'invite-card-quantized-base.png')
  const output = path.join(out, 'invite-card-quantized.png')
  fs.writeFileSync(input, smoothCandidate)
  const common = ['-hide_banner', '-loglevel', 'error', '-y']
  execFileSync('ffmpeg', [...common, '-i', input, '-vf', 'palettegen=max_colors=256:stats_mode=full', '-frames:v', '1', palette], { stdio: ['ignore', 'ignore', 'inherit'] })
  execFileSync('ffmpeg', [...common, '-i', input, '-i', palette, '-lavfi', 'paletteuse=dither=floyd_steinberg:diff_mode=rectangle', '-frames:v', '1', '-compression_level', '9', '-pred', 'mixed', baseOutput], { stdio: ['ignore', 'ignore', 'inherit'] })
  const result = addIndexedBlueNoise(fs.readFileSync(baseOutput))
  fs.writeFileSync(output, result.bytes)
  return result
}

async function main() {
  const generated = new Map()
  for (const name of ['calendar', 'list', 'settings']) {
    generated.set(`images/${name}.png`, await renderIcon(name, '#7A7C8C'))
    generated.set(`images/${name}_active.png`, await renderIcon(name, '#E8909E'))
  }
  const browser = await chromium.launch({ headless: true })
  let candidate
  let smoothCandidate
  let appIcon
  try {
    candidate = await renderArtwork(browser, 1000, 800)
    smoothCandidate = await renderArtwork(browser, 1000, 800, false, false)
    appIcon = await renderArtwork(browser, 1024, 1024, true)
  } finally {
    await browser.close()
  }
  fs.writeFileSync(path.join(out, 'invite-card-24bit.png'), candidate)
  fs.writeFileSync(path.join(out, 'app-icon-24bit.png'), appIcon)
  generated.set('images/app-icon.png', appIcon)

  const prospectiveMediaTotal = inviteSize => inviteSize + ICON_FILES.reduce((sum, rel) => sum + generated.get(rel).length, 0)
  const truecolorMediaTotal = prospectiveMediaTotal(candidate.length)
  let invite = candidate
  let selection = '24-bit RGB'
  let noiseStats = null
  if (candidate.length > TRUECOLOR_LIMIT || truecolorMediaTotal > TRUECOLOR_MEDIA_LIMIT) {
    const quantized = quantizeInvite(smoothCandidate)
    invite = quantized.bytes
    noiseStats = quantized.stats
    selection = '256-color Floyd-Steinberg error diffusion with indexed blue-noise microdither'
  }
  const quantizedMediaTotal = prospectiveMediaTotal(invite.length)
  assert.ok(invite.length <= (selection === '24-bit RGB' ? TRUECOLOR_LIMIT : QUANTIZED_LIMIT), `selected invite exceeds its D1 limit: ${invite.length} B`)
  assert.ok(quantizedMediaTotal < PACKAGE_MEDIA_LIMIT, `packaged media exceeds 200 KB: ${quantizedMediaTotal} B`)
  generated.set('images/invite-card.png', invite)

  if (!checkOnly) {
    for (const [rel, bytes] of generated) fs.writeFileSync(path.join(root, rel), bytes)
  }
  const report = {
    mode: checkOnly ? 'check' : 'write',
    selection,
    truecolorBytes: candidate.length,
    truecolorMediaTotal,
    inviteBytes: invite.length,
    packagedMediaTotal: quantizedMediaTotal,
    quantizedBytes: selection === '24-bit RGB' ? null : invite.length,
    indexedBlueNoise: noiseStats,
    files: [...generated].map(([rel, bytes]) => ({ rel, bytes: bytes.length, sha256: require('node:crypto').createHash('sha256').update(bytes).digest('hex') }))
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  if (checkOnly) {
    for (const [rel, bytes] of generated) {
      assert.ok(fs.readFileSync(path.join(root, rel)).equals(bytes), `${rel} is not reproducible from the committed generator`)
    }
  }
  console.log(JSON.stringify(report, null, 2))
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
