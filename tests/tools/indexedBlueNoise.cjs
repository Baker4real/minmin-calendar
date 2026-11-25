const assert = require('node:assert/strict')
const zlib = require('node:zlib')

const SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex')
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
  return crc >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type, 'ascii')
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length, 0)
  name.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8)
  return result
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function decodeIndexedPng(png) {
  assert.ok(png.subarray(0, 8).equals(SIGNATURE))
  let position = 8
  let ihdr
  let palette
  const idat = []
  while (position < png.length) {
    const length = png.readUInt32BE(position)
    const type = png.toString('ascii', position + 4, position + 8)
    const data = png.subarray(position + 8, position + 8 + length)
    if (type === 'IHDR') ihdr = Buffer.from(data)
    if (type === 'PLTE') palette = Buffer.from(data)
    if (type === 'IDAT') idat.push(data)
    position += length + 12
    if (type === 'IEND') break
  }
  assert.ok(ihdr && palette && idat.length, 'indexed PNG needs IHDR, PLTE, and IDAT')
  assert.equal(ihdr[8], 8, 'only 8-bit indexed PNG is supported')
  assert.equal(ihdr[9], 3, 'only indexed PNG is supported')
  assert.equal(ihdr[12], 0, 'interlaced PNG is not supported')
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)]
    const input = y * (width + 1) + 1
    const output = y * width
    for (let x = 0; x < width; x++) {
      const value = raw[input + x]
      const left = x ? pixels[output + x - 1] : 0
      const up = y ? pixels[output - width + x] : 0
      const upLeft = x && y ? pixels[output - width + x - 1] : 0
      let reconstructed
      if (filter === 0) reconstructed = value
      else if (filter === 1) reconstructed = value + left
      else if (filter === 2) reconstructed = value + up
      else if (filter === 3) reconstructed = value + Math.floor((left + up) / 2)
      else if (filter === 4) reconstructed = value + paeth(left, up, upLeft)
      else throw new Error(`unsupported PNG filter ${filter}`)
      pixels[output + x] = reconstructed & 0xff
    }
  }
  return { width, height, ihdr, palette, pixels }
}

function filterRows(width, height, pixels) {
  const rows = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    const source = y * width
    const candidates = Array.from({ length: 5 }, () => Buffer.alloc(width))
    for (let x = 0; x < width; x++) {
      const value = pixels[source + x]
      const left = x ? pixels[source + x - 1] : 0
      const up = y ? pixels[source - width + x] : 0
      const upLeft = x && y ? pixels[source - width + x - 1] : 0
      candidates[0][x] = value
      candidates[1][x] = (value - left) & 0xff
      candidates[2][x] = (value - up) & 0xff
      candidates[3][x] = (value - Math.floor((left + up) / 2)) & 0xff
      candidates[4][x] = (value - paeth(left, up, upLeft)) & 0xff
    }
    let selected = 0
    let best = Infinity
    for (let filter = 0; filter < 5; filter++) {
      let score = 0
      for (const value of candidates[filter]) score += value < 128 ? value : 256 - value
      if (score < best) {
        best = score
        selected = filter
      }
    }
    const output = y * (width + 1)
    rows[output] = selected
    candidates[selected].copy(rows, output + 1)
  }
  return rows
}

function encodeIndexedPng(image) {
  const rows = filterRows(image.width, image.height, image.pixels)
  const compressed = [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FILTERED, zlib.constants.Z_RLE]
    .map(strategy => zlib.deflateSync(rows, { level: 9, strategy }))
    .sort((a, b) => a.length - b.length)[0]
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', image.ihdr),
    chunk('PLTE', image.palette),
    chunk('IDAT', compressed),
    chunk('IEND')
  ])
}

function random01(x, y, seed) {
  let value = Math.imul(x + seed, 0x1f123bb5) ^ Math.imul(y - seed, 0x5f356495)
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d)
  value = Math.imul(value ^ (value >>> 12), 0x297a2d39)
  return ((value ^ (value >>> 15)) >>> 0) / 0xffffffff
}

function highPass(x, y, seed) {
  return 1.6 * random01(x, y, seed) - 0.4 * (
    random01(x - 1, y, seed) + random01(x + 1, y, seed) +
    random01(x, y - 1, seed) + random01(x, y + 1, seed)
  )
}

function paletteColors(palette) {
  return Array.from({ length: palette.length / 3 }, (_, index) => [
    palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]
  ])
}

function nearbyIndices(colors) {
  return colors.map((source, index) => {
    const result = [index, index]
    const sourceMean = (source[0] + source[1] + source[2]) / 3
    for (let directionIndex = 0; directionIndex < 2; directionIndex++) {
      const direction = directionIndex === 0 ? -1 : 1
      const target = source.map(value => value + direction * 2.55)
      let best = Infinity
      for (let candidate = 0; candidate < colors.length; candidate++) {
        if (candidate === index) continue
        const color = colors[candidate]
        const mean = (color[0] + color[1] + color[2]) / 3
        const delta = (mean - sourceMean) * direction
        if (delta < 0.35 || delta > 4 || Math.max(...color.map((value, channel) => Math.abs(value - source[channel]))) > 8) continue
        const distance = color.reduce((sum, value, channel) => sum + (value - target[channel]) ** 2, 0)
        if (distance < best) {
          best = distance
          result[directionIndex] = candidate
        }
      }
    }
    return result
  })
}

// Floyd-Steinberg supplies the base quantization. Sparse high-pass palette shifts add about
// one-percent peak luminance dither without randomizing the palette or the crisp lettering.
function addIndexedBlueNoise(png, seed = 2651000) {
  const image = decodeIndexedPng(png)
  const colors = paletteColors(image.palette)
  const nearby = nearbyIndices(colors)
  let changedPixels = 0
  let absoluteDelta = 0
  let maximumDelta = 0
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const inHeart = x >= 300 && x <= 700 && y >= 180 && y <= 475
      const inLettering = x >= 270 && x <= 730 && y >= 545 && y <= 715
      if (inHeart || inLettering) continue
      const noise = highPass(x, y, seed)
      if (Math.abs(noise) < 1.1) continue
      const offset = y * image.width + x
      const before = image.pixels[offset]
      const after = nearby[before][noise < 0 ? 0 : 1]
      if (before === after) continue
      const delta = Math.abs(colors[after].reduce((sum, value, channel) => sum + value - colors[before][channel], 0) / 3)
      image.pixels[offset] = after
      changedPixels++
      absoluteDelta += delta
      maximumDelta = Math.max(maximumDelta, delta)
    }
  }
  return {
    bytes: encodeIndexedPng(image),
    stats: {
      changedPixels,
      changedFraction: changedPixels / (image.width * image.height),
      meanAbsoluteDelta: changedPixels ? absoluteDelta / changedPixels : 0,
      maximumDelta
    }
  }
}

module.exports = { addIndexedBlueNoise, highPass }
