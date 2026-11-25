const assert = require('node:assert/strict')
const test = require('node:test')

const noise = require('./tools/indexedBlueNoise.cjs')

test('asset noise exposes only the consumed dither and shared high-pass implementation', () => {
  assert.deepEqual(Object.keys(noise).sort(), ['addIndexedBlueNoise', 'highPass'])
  assert.equal(noise.highPass(2, 3, 2651000), noise.highPass(2, 3, 2651000))
  assert.notEqual(noise.highPass(2, 3, 2651000), noise.highPass(3, 3, 2651000))
})
