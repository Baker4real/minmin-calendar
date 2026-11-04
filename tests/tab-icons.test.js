const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const test = require('node:test')

// 钉住 issue #50 的 tab 图标契约：81×81 设计源、未选中基色 #7A7C8C（同 tabBar.color）、
// 选中基色 #E8909E（同 tabBar.selectedColor）、记录 tab 无医疗十字形态。
// issue #159：图标清单直接读 app.json 的 tabBar，记录 tab 的两态读作列表（不是铅笔，也不是十字）。

const ICON_SIZE = 81
const UNSELECTED = { r: 0x7a, g: 0x7c, b: 0x8c }
const SELECTED = { r: 0xe8, g: 0x90, b: 0x9e }

const TAB_BAR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).tabBar
const ICONS = TAB_BAR.list.flatMap(tab => [[tab.iconPath, UNSELECTED], [tab.selectedIconPath, SELECTED]])
const RECORD_TAB = TAB_BAR.list.find(tab => tab.pagePath === 'pages/period/period')

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

function loadIcon(file) {
  return decodePng(fs.readFileSync(path.join(__dirname, '..', file)))
}

// 列表形态：不透明像素按行分成互不相连的横带；每条横带的中线上是两段——左边一个项目点，右边一条横线
function listRows(icon) {
  const { width, height, data } = icon
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] >= 128
  const bands = []
  let band = null
  for (let y = 0; y < height; y++) {
    let filled = false
    for (let x = 0; x < width && !filled; x++) filled = opaque(x, y)
    if (filled && band) band.bottom = y
    else if (filled) band = { top: y, bottom: y }
    else if (band) {
      bands.push(band)
      band = null
    }
  }
  if (band) bands.push(band)
  return bands.map(({ top, bottom }) => {
    const mid = Math.round((top + bottom) / 2)
    const runs = []
    let start = -1
    for (let x = 0; x <= width; x++) {
      const on = x < width && opaque(x, mid)
      if (on && start < 0) start = x
      if (!on && start >= 0) {
        runs.push(x - start)
        start = -1
      }
    }
    return { top, height: bottom - top + 1, runs }
  })
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
  assert.equal(ICONS.length, 6)
  for (const [file] of ICONS) {
    assert.match(file, /^images\/[\w-]+\.png$/)
    const icon = loadIcon(file)
    assert.equal(icon.width, ICON_SIZE, `${file} width`)
    assert.equal(icon.height, ICON_SIZE, `${file} height`)
  }
})

test('tab icon solid pixels match the tabBar color pair', () => {
  for (const [file, color] of ICONS) {
    const { width, height, data } = loadIcon(file)
    let solidCount = 0
    for (let i = 0; i < width * height; i++) {
      if (data[i * 4 + 3] >= 250) {
        solidCount++
        const actual = [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]
        assert.deepEqual(
          actual,
          [color.r, color.g, color.b],
          `${file} solid pixel at ${i} must match base color`
        )
      }
    }
    assert.ok(solidCount > 0, `${file} must contain solid pixels`)
  }
})

test('record tab icon reads as a bulleted list, not a pencil or a medical cross', () => {
  for (const file of [RECORD_TAB.iconPath, RECORD_TAB.selectedIconPath]) {
    const icon = loadIcon(file)
    assert.ok(!isCrossShape(icon), `${file} must not read as a plus cross`)
    const rows = listRows(icon)
    assert.ok(rows.length >= 3, `${file} needs at least three list rows, found ${rows.length}`)
    for (const row of rows) {
      assert.equal(row.runs.length, 2, `${file} row at y=${row.top} must be a bullet and a line`)
      const [bullet, line] = row.runs
      assert.ok(bullet <= row.height + 1, `${file} row at y=${row.top}: the bullet is ${bullet}px wide, not a dot`)
      assert.ok(line >= 3 * row.height, `${file} row at y=${row.top}: the line is ${line}px, not a horizontal stroke`)
    }
  }
})
