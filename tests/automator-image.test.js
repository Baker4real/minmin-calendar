const assert = require('node:assert/strict')
const test = require('node:test')
const { createRequire } = require('node:module')
const { Jimp } = require('jimp-modern')
const fromAutomator = createRequire(require.resolve('miniprogram-automator/package.json'))
const imageReader = fromAutomator('jimp')
const { decodeQrCode } = fromAutomator('./out/util.js')
const QRCode = fromAutomator('qrcode-terminal/vendor/QRCode')
const levels = fromAutomator('qrcode-terminal/vendor/QRCode/QRErrorCorrectLevel')

// This is the pinned third-party SDK's QR contract, not a mini-program page seam.
const expected = 'minmin-automator-image-compatibility'
function qrImage() {
  const qr = new QRCode(-1, levels.M)
  qr.addData(expected)
  qr.make()
  const scale = 8
  const quiet = 4
  const width = (qr.getModuleCount() + quiet * 2) * scale
  const image = new Jimp({ width, height: width, color: 0xffffffff })
  for (let row = 0; row < qr.getModuleCount(); row++) {
    for (let col = 0; col < qr.getModuleCount(); col++) {
      if (!qr.isDark(row, col)) continue
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) image.setPixelColor(0x000000ff, (col + quiet) * scale + x, (row + quiet) * scale + y)
      }
    }
  }
  return image
}

for (const mime of ['image/png', 'image/jpeg', 'image/bmp', 'image/tiff', 'image/gif']) {
  test(`the pinned WeChat automator decodes its QR input from ${mime}`, async () => {
    const bytes = await qrImage().getBuffer(mime)
    assert.equal(await decodeQrCode(bytes.toString('base64')), expected)
  })
}

test('the automator image reader rejects malformed image input', async () => {
  await assert.rejects(imageReader.read(Buffer.from('not an image')))
})
