// Quick-action and shared-back coordinate coverage; WeChat runtime acceptance remains separate.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { readSource } = require('../sourceFiles')
const { parseWxssRules } = require('../designTokens')

const SELECTORS = new Set([
  'page', '.quick-actions', '.quick-btn', '.quick-btn::before', '.quick-btn:active',
  '.quick-btn.quick-btn-hover', '.quick-btn.btn-ghost', '.quick-btn.btn-ghost:active',
  '.quick-btn.btn-ghost.btn-ghost-hover', '.quick-ghost-surface', '.quick-icon', '.quick-text',
  '.quick-btn.btn-ghost .quick-text', '.button-primary', '.button-outline',
  '.nav-bar', '.nav-title', '.nav-back', '.nav-back-surface', '.nav-back-icon',
  '.ui-icon', '.ui-icon-left', '.ui-icon-36', '.ui-icon-circle.ui-icon-left',
  '.nav-back:active', '.nav-back.nav-back-hover', '.nav-back:active .nav-back-surface',
  '.nav-back.nav-back-hover .nav-back-surface', '.header-gradient',
  '.header-gradient::before', '.header-gradient::after'
])

function htmlFragment(source) {
  return source.replace(/<(\/?)view\b/g, '<$1div').replace(/<(\/?)text\b/g, '<$1span')
    .replaceAll("{{variant === 'immersive' ? ' nav-bar-immersive' : ''}}", '')
    .replaceAll("nav-title{{showPairMark ? ' nav-title-paired' : ''}}", 'nav-title')
}

function editNavbarFragment(root, pagePath, title) {
  const wxml = readSource(path.join(root, pagePath), 'utf8')
  const navStart = wxml.indexOf('<view class="nav-bar header-gradient')
  const navEnd = wxml.indexOf('<view class="content"', navStart)
  assert.ok(navStart >= 0 && navEnd > navStart, `${pagePath} must use the actual shared navbar`)
  const fragment = htmlFragment(wxml.slice(navStart, navEnd)).replaceAll('{{title}}', title)
  assert.match(fragment, /class="nav-back"[^>]*bindtap="goBack"/)
  assert.ok(fragment.includes(`<span class="nav-title-text">${title}</span>`), `${pagePath} keeps its centered title`)
  return fragment
}

function actionFixtures(root) {
  const wxml = readSource(path.join(root, 'pages/index/index.wxml'), 'utf8')
  const quickStart = wxml.indexOf('<view class="quick-actions">')
  const quickEnd = wxml.indexOf('<view\n      wx:if="{{hasRecords}}"', quickStart)
  assert.ok(quickStart >= 0 && quickEnd > quickStart, 'quick-action fixture must use the actual homepage controls')
  const quick = htmlFragment(wxml.slice(quickStart, quickEnd))
  assert.match(quick, /quick-btn button-primary/)
  assert.match(quick, /quick-btn btn-ghost/)

  const backs = [
    { key: 'period', title: '补记经期', fragment: editNavbarFragment(root, 'pages/period/edit/edit.wxml', '补记经期') },
    { key: 'memory', title: '补记欢乐时光', fragment: editNavbarFragment(root, 'pages/memory/edit/edit.wxml', '补记欢乐时光') }
  ]
  return { quick, backs }
}

function actionCss(root, width) {
  const sources = [
    'app.wxss', 'pages/index/index.wxss', 'pages/shared/nav-bar.wxss'
  ].map(file => readSource(path.join(root, file), 'utf8'))
  return sources.flatMap(parseWxssRules).filter(rule => rule.selectors.some(selector => SELECTORS.has(selector))).map(rule => {
    const names = rule.selectors.filter(selector => SELECTORS.has(selector)).map(selector => selector === 'page' ? 'body' : selector)
    const decls = Object.entries(rule.decls).map(([key, value]) => `${key}:${value.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, number) => Number(number) * width / 750 + 'px')}`)
    return `${names.join(',')}{${decls.join(';')}}`
  }).join('\n')
}

async function clickAndExpect(page, locator, result, edge, surface = null) {
  const box = await (edge && surface ? surface : locator).boundingBox()
  assert.ok(box && box.width > 0 && box.height > 0, 'coordinate target must have a visible box')
  const x = box.x + (edge ? box.width - 1 : box.width / 2)
  const y = box.y + box.height / 2
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)
    return element ? element.closest('.quick-btn,.nav-back')?.className || element.className : null
  }, { x, y })
  await page.mouse.move(x, y)
  if (edge) await page.mouse.click(x, y)
  else {
    await page.mouse.down()
    await page.waitForTimeout(200)
    await page.mouse.up()
  }
  assert.equal(await page.locator(result).evaluate(element => element.hidden), false, `${edge ? 'edge' : 'center'} coordinate click did not reach ${result}; ${JSON.stringify({ hit, box })}`)
  return { hit, point: { x, y }, edge }
}

async function runActionHitTest(browser, out, screenshot = (page, options) => page.screenshot(options)) {
  const root = path.resolve(__dirname, '../..')
  const fixtures = actionFixtures(root)
  const evidence = []
  fs.mkdirSync(out, { recursive: true })
  try {
    for (const width of [320, 375, 390, 430]) {
      const css = actionCss(root, width)
      const record = { viewport: { width, height: 932 }, quick: [], back: [] }

      const quickPage = await browser.newPage({ viewport: { width, height: 932 } })
      await quickPage.setContent(`<body class="page" style="margin:0">${fixtures.quick}<div id="period-result" hidden></div><div id="memory-result" hidden></div><style>${css}</style></body>`)
      await quickPage.evaluate(() => {
        document.querySelector('.quick-btn.button-primary').addEventListener('click', () => { document.querySelector('#period-result').hidden = false })
        document.querySelector('.quick-btn.btn-ghost').addEventListener('click', () => { document.querySelector('#memory-result').hidden = false })
      })
      for (const [selector, result, key] of [
        ['.quick-btn.button-primary', '#period-result', 'period'],
        ['.quick-btn.btn-ghost', '#memory-result', 'memory']
      ]) {
        for (const edge of [false, true]) {
          const locator = quickPage.locator(selector)
          record.quick.push({ action: key, ...(await clickAndExpect(quickPage, locator, result, edge)) })
        }
      }
      await quickPage.evaluate(() => {
        document.querySelector('#period-result').hidden = true
        document.querySelector('#memory-result').hidden = true
      })
      await quickPage.addStyleTag({ content: '.quick-actions{pointer-events:none}' })
      await quickPage.mouse.click(record.quick[0].point.x, record.quick[0].point.y)
      assert.equal(await quickPage.locator('#period-result').evaluate(element => element.hidden), true, 'quick-action interception negative control must fail to activate')
      record.quickNegativeControl = true
      await quickPage.close()

      console.log(`PASS ${width}x932 quick-action center/edge coordinate clicks; interception negative controls`)
      for (const fixture of fixtures.backs) {
        const backPage = await browser.newPage({ viewport: { width, height: 932 } })
        const contentHeight = width === 320 ? 40 : 44
        const leftSlot = (30 + 88) * width / 750
        const compensation = 96 - leftSlot
        const bodyStyle = `margin:0;--safe-top:44px;--nav-bar-height:${44 + contentHeight}px;--capsule-right:96px;--nav-title-padding-left:${Math.max(0, compensation)}px;--nav-title-padding-right:${Math.max(0, -compensation)}px`
        await backPage.setContent(`<body class="page" style="${bodyStyle}">${fixture.fragment}<div id="back-result" hidden></div><style>${css}</style></body>`)
        await backPage.evaluate(() => {
          for (const selector of ['.nav-tool', '.nav-placeholder', '.sync-pill', '.nav-pair-mark']) document.querySelector(selector)?.remove()
          document.querySelector('.nav-back').addEventListener('click', () => { document.querySelector('#back-result').hidden = false })
        })
        const back = backPage.locator('.nav-back')
        const backBox = await back.boundingBox()
        const surfaceBox = await backPage.locator('.nav-back-surface').boundingBox()
        const navbarBox = await backPage.locator('.nav-bar').boundingBox()
        assert.ok(backBox && surfaceBox && navbarBox, `${fixture.key}: back hit slot, surface and navbar boxes must exist`)
        const touchFloor = 88 * width / 750
        const expectedSurface = 64 * width / 750
        assert.ok(backBox.width + 0.02 >= touchFloor && backBox.height + 0.02 >= touchFloor, `${fixture.key}: back hit slot must stay at least 88rpx at ${width}px`)
        assert.ok(Math.abs(surfaceBox.width - expectedSurface) <= 0.04 && Math.abs(surfaceBox.height - expectedSurface) <= 0.04, `${fixture.key}: visual surface must be 64rpx at ${width}px; ${JSON.stringify(surfaceBox)}`)
        const contentTop = navbarBox.y + 44
        const contentBottom = contentTop + contentHeight
        assert.ok(surfaceBox.y >= contentTop - 0.01 && surfaceBox.y + surfaceBox.height <= contentBottom + 0.01, `${fixture.key}: surface escapes the navbar content row at ${width}px`)
        const title = await backPage.locator('.nav-title').evaluate(element => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const textRect = range.getBoundingClientRect()
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          const paddingLeft = parseFloat(style.paddingLeft)
          const paddingRight = parseFloat(style.paddingRight)
          return {
            center: rect.left + paddingLeft + (rect.width - paddingLeft - paddingRight) / 2,
            textCenter: textRect.left + textRect.width / 2,
            left: textRect.left,
            right: textRect.right
          }
        })
        const tolerance = 0.25 + 1 / 64
        assert.ok(Math.abs(title.center - width / 2) <= tolerance, `${fixture.key}: title content box must stay centered at ${width}px; ${JSON.stringify(title)}`)
        assert.ok(Math.abs(title.textCenter - title.center) <= 0.3, `${fixture.key}: title glyphs exceed the subpixel centering budget at ${width}px; ${JSON.stringify(title)}`)
        assert.ok(title.left >= backBox.x + backBox.width - 0.02, `${fixture.key}: back hit slot overlaps the title at ${width}px`)
        assert.ok(title.right <= width - 96 + tolerance, `${fixture.key}: title enters the capsule slot at ${width}px`)
        const backRecord = { page: fixture.key, title: fixture.title, titleCenter: title.center, box: backBox, surfaceBox, clicks: [] }
        for (const edge of [false, true]) {
          await backPage.evaluate(() => { document.querySelector('#back-result').hidden = true })
          backRecord.clicks.push(await clickAndExpect(backPage, back, '#back-result', edge, backPage.locator('.nav-back-surface')))
        }
        await screenshot(backPage, { path: path.join(out, `back-${fixture.key}-${width}.png`) })
        await backPage.evaluate(() => { document.querySelector('#back-result').hidden = true })
        await backPage.evaluate(() => {
          const overlay = document.createElement('div')
          overlay.id = 'action-negative-overlay'
          overlay.style.cssText = 'position:absolute;inset:0;z-index:999;background:transparent'
          document.body.append(overlay)
        })
        await backPage.mouse.click(backRecord.clicks[0].point.x, backRecord.clicks[0].point.y)
        assert.equal(await backPage.locator('#back-result').evaluate(element => element.hidden), true, `${fixture.key}: back interception negative control must fail to activate`)
        backRecord.negativeControl = true
        record.back.push(backRecord)
        await backPage.close()
        console.log(`PASS ${width}x932 ${fixture.key} edit back geometry, centered title and center/edge coordinate clicks; interception negative control`)
      }

      evidence.push(record)
    }
  } finally {
    fs.writeFileSync(path.join(out, 'action-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}

module.exports = { runActionHitTest, actionFixtures }
