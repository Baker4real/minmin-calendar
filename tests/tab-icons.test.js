const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const test = require('node:test')

// 钉住 issue #50 的 tab 图标契约：81×81 设计源、未选中基色 #7A7C8C（同 tabBar.color）、
// 选中基色 #E8909E（同 tabBar.selectedColor）、记录 tab 无医疗十字形态。

const ICON_SIZE = 81
const UNSELECTED = { r: 0x7a, g: 0x7c, b: 0x8c }
const SELECTED = { r: 0xe8, g: 0x90, b: 0x9e }

const ICONS = [
  ['calendar', UNSELECTED],
  ['calendar_active', SELECTED],
  ['add', UNSELECTED],
  ['add_active', SELECTED],
  ['settings', UNSELECTED],
  ['settings_active', SELECTED],
]

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

// 最小 PNG 解码：仅支持本仓库图标的 8-bit RGBA/RGB、filter 0-4
function decodePng(buf) {
  assert.equal(buf.readUInt32BE(0), 0x89504e47, 'not a PNG')
  let pos = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9]
      assert.equal(data[8], 8, 'only 8-bit PNG supported')
      assert.ok(colorType === 6 || colorType === 2, 'only RGBA/RGB PNG supported')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') break
    pos += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const rowIn = y * (stride + 1) + 1
    const rowOut = y * stride
    for (let x = 0; x < stride; x++) {
      const v = raw[rowIn + x]
      const a = x >= bpp ? px[rowOut + x - bpp] : 0
      const b = y > 0 ? px[rowOut + x - stride] : 0
      const c = x >= bpp && y > 0 ? px[rowOut + x - stride - bpp] : 0
      let r
      if (f === 0) r = v
      else if (f === 1) r = v + a
      else if (f === 2) r = v + b
      else if (f === 3) r = v + ((a + b) >> 1)
      else r = v + paeth(a, b, c)
      px[rowOut + x] = r & 0xff
    }
  }
  if (bpp === 3) {
    const rgba = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = px[i * 3]
      rgba[i * 4 + 1] = px[i * 3 + 1]
      rgba[i * 4 + 2] = px[i * 3 + 2]
      rgba[i * 4 + 3] = 255
    }
    return { width, height, data: rgba }
  }
  return { width, height, data: px }
}

function loadIcon(name) {
  return decodePng(fs.readFileSync(path.join(__dirname, '..', 'images', `${name}.png`)))
}

function isCrossShape(icon) {
  const { width, height, data } = icon
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const colCover = new Array(width).fill(0)
  const rowCover = new Array(height).fill(0)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        colCover[x]++
        rowCover[y]++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  let maxCol = 0
  let maxRow = 0
  for (let x = minX; x <= maxX; x++) maxCol = Math.max(maxCol, colCover[x] / h)
  for (let y = minY; y <= maxY; y++) maxRow = Math.max(maxRow, rowCover[y] / w)
  return maxCol >= 0.65 && maxRow >= 0.65
}

test('six tab icons are 81x81 PNG design sources', () => {
  for (const [name] of ICONS) {
    const icon = loadIcon(name)
    assert.equal(icon.width, ICON_SIZE, `images/${name}.png width`)
    assert.equal(icon.height, ICON_SIZE, `images/${name}.png height`)
  }
})

test('tab icon solid pixels match the tabBar color pair', () => {
  for (const [name, color] of ICONS) {
    const { width, height, data } = loadIcon(name)
    let solidCount = 0
    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] >= 250) {
        solidCount++
        const actual = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
        assert.deepEqual(
          actual,
          [color.r, color.g, color.b],
          `images/${name}.png solid pixel at ${i} must match base color`
        )
      }
    }
    assert.ok(solidCount > 0, `images/${name}.png must contain solid pixels`)
  }
})

test('record tab icon is not a medical cross', () => {
  for (const name of ['add', 'add_active']) {
    assert.ok(!isCrossShape(loadIcon(name)), `images/${name}.png must not read as a plus cross`)
  }
})
