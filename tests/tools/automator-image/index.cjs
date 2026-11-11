const { Jimp } = require('jimp-modern')

// miniprogram-automator consumes only Jimp.read(buffer).bitmap for QR decoding.
module.exports = { read: (...args) => Jimp.read(...args) }
