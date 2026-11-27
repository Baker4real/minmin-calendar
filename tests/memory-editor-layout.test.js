const assert = require('node:assert/strict')
const test = require('node:test')
const { memoryNoteMinHeightPx } = require('../utils/memoryEditorLayout')

test('memory writing well fills tall available space after fixed chrome', () => {
  assert.equal(memoryNoteMinHeightPx({ windowWidth: 375, windowHeight: 844, navBarHeight: 88, safeBottom: 0 }), 567)
  assert.equal(memoryNoteMinHeightPx({ windowWidth: 390, windowHeight: 844, navBarHeight: 88, safeBottom: 34 }), 525.44)
})

test('memory writing well keeps its 280rpx floor on short or invalid viewports', () => {
  assert.equal(memoryNoteMinHeightPx({ windowWidth: 320, windowHeight: 320, navBarHeight: 80, safeBottom: 0 }), 119.47)
  assert.equal(memoryNoteMinHeightPx({ windowWidth: 375, windowHeight: 0, navBarHeight: 88, safeBottom: 0 }), 140)
})
