const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')

const FORM_PAGE_WXML = [
  'pages/period/edit/edit.wxml',
  'pages/memory/edit/edit.wxml',
  'pages/bind/bind.wxml'
]

test('form pages keep only the page-level entrance animation without card-level fade-in stacking', () => {
  for (const relativePath of FORM_PAGE_WXML) {
    const wxml = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    assert.match(
      wxml,
      /class="page[\s"]/,
      `${relativePath} keeps the page-level pageEnter entrance layer`
    )
    assert.equal(
      /\bfade-in\b/.test(wxml),
      false,
      `${relativePath} must not stack card-level fade-in on top of pageEnter`
    )
  }
})

test('form page wxss layers define no extra entrance fade animation', () => {
  const formPageWxss = [
    'pages/period/edit/edit.wxss',
    'pages/memory/edit/edit.wxss'
  ]

  for (const relativePath of formPageWxss) {
    const wxss = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
    assert.equal(
      /animation\s*:/.test(wxss),
      false,
      `${relativePath} must not define a second entrance animation layer`
    )
  }
})
