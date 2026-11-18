const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { findOffPaletteHexesInInlineStyles, findOffTokenRadii } = require('./designTokens')
const { readExpandedSource } = require('./sourceFiles')
const { wxmlOpeningTags } = require('./wxmlTemplate')

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minmin-expanded-source-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return {
    root,
    write(relative, source) {
      const file = path.join(root, relative)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, source, 'utf8')
      return file
    }
  }
}

test('WXSS guardrails judge a rule that exists only in an imported shared stylesheet', (t) => {
  const files = fixture(t)
  files.write('shared/geometry.wxss', '.shared-card { border-radius: 13rpx; }\n')
  const page = files.write('page.wxss', '@import "./shared/geometry.wxss";\n.local { color: #FFFFFF; }\n')

  const violations = findOffTokenRadii(readExpandedSource(page, { root: files.root }), new Set(['radius-md']))
  assert.deepEqual(violations.map(violation => violation.component), ['13rpx'])
})

test('WXML guardrails see a node that exists only in an included shared fragment', (t) => {
  const files = fixture(t)
  files.write('shared/note.wxml', '<view class="shared-note" style="color: #123456">共享说明</view>\n')
  const page = files.write('page.wxml', '<view><include src="/shared/note.wxml" /></view>\n')

  const expanded = readExpandedSource(page, { root: files.root })
  assert.ok(wxmlOpeningTags(expanded).some(node => node.classes.includes('shared-note')))
  assert.deepEqual(findOffPaletteHexesInInlineStyles(expanded).map(violation => violation.normalized), ['#123456'])
})

test('WXML guardrails see nodes substituted from an imported template definition', (t) => {
  const files = fixture(t)
  files.write('shared/actions.wxml', '<template name="sharedActions"><button class="shared-action" style="color: #654321">确认</button></template>\n')
  const page = files.write('page.wxml', '<import src="./shared/actions.wxml" />\n<view><template is="sharedActions" /></view>\n')

  const expanded = readExpandedSource(page, { root: files.root })
  assert.ok(wxmlOpeningTags(expanded).some(node => node.classes.includes('shared-action')))
  assert.deepEqual(findOffPaletteHexesInInlineStyles(expanded).map(violation => violation.normalized), ['#654321'])
})

test('WXML guardrails expand the body template selected by the shared shell data', (t) => {
  const files = fixture(t)
  files.write('shared/sheet.wxml', '<template name="sharedSheet"><view class="sheet-body"><template is="{{bodyTemplate}}" data="{{...body}}" /></view></template><template name="helpBody"><text class="help-copy">Help</text></template><template name="confirmationBody"><text class="confirmation-copy">Confirm</text></template>')
  const page = files.write('page.wxml', '<import src="./shared/sheet.wxml" />\n<template is="sharedSheet" data="{{bodyTemplate: \'helpBody\', body: {}}}" />')

  const expanded = readExpandedSource(page, { root: files.root })
  const nodes = wxmlOpeningTags(expanded)
  assert.ok(nodes.some(node => node.classes.includes('sheet-body')))
  assert.ok(nodes.some(node => node.classes.includes('help-copy')))
  assert.equal(nodes.some(node => node.classes.includes('confirmation-copy')), false)
})
