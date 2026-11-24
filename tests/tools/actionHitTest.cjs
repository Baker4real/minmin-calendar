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
  '.nav-bar', '.nav-back', '.nav-back-surface', '.nav-back-surface::before', '.nav-back-icon',
  '.nav-back:active', '.nav-back.nav-back-hover', '.nav-back:active .nav-back-surface',
  '.nav-back.nav-back-hover .nav-back-surface', '.nav-back:active .nav-back-surface::before',
  '.nav-back.nav-back-hover .nav-back-surface::before', '.header-gradient',
  '.header-gradient::before', '.header-gradient::after'
])

function htmlFragment(source) {
  return source.replace(/<(\/?)view\b/g, '<$1div').replace(/<(\/?)text\b/g, '<$1span')
}

function actionFixtures(root) {
  const wxml = readSource(path.join(root, 'pages/index/index.wxml'), 'utf8')
  const quickStart = wxml.indexOf('<view class="quick-actions">')
  const quickEnd = wxml.indexOf('<view\n      wx:if="{{hasRecords}}"', quickStart)
  assert.ok(quickStart >= 0 && quickEnd > quickStart, 'quick-action fixture must use the actual homepage controls')
  const quick = htmlFragment(wxml.slice(quickStart, quickEnd))
  assert.match(quick, /quick-btn button-primary/)
  assert.match(quick, /quick-btn btn-ghost/)

  const navStart = wxml.indexOf('<view class="nav-bar header-gradient"')
  const navEnd = wxml.indexOf('<view wx:if="{{noRoom}}"', navStart)
  assert.ok(navStart >= 0 && navEnd > navStart, 'back fixture must use the actual shared navbar')
  const back = htmlFragment(wxml.slice(navStart, navEnd))
  assert.match(back, /class="nav-back"[^>]*bindtap="goBack"/)
  return { quick, back }
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

async function runActionHitTest(browser, out) {
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

      const backPage = await browser.newPage({ viewport: { width, height: 932 } })
      await backPage.setContent(`<body class="page" style="margin:0">${fixtures.back}<div id="back-result" hidden></div><style>${css}</style></body>`)
      await backPage.evaluate(() => {
        for (const selector of ['.nav-tool', '.nav-placeholder', '.nav-title', '.sync-pill']) document.querySelector(selector)?.remove()
        document.querySelector('.nav-back').addEventListener('click', () => { document.querySelector('#back-result').hidden = false })
      })
      const back = backPage.locator('.nav-back')
      for (const edge of [false, true]) {
        await backPage.evaluate(() => { document.querySelector('#back-result').hidden = true })
        record.back.push(await clickAndExpect(backPage, back, '#back-result', edge, backPage.locator('.nav-back-surface')))
      }
      await backPage.evaluate(() => { document.querySelector('#back-result').hidden = true })
      await backPage.evaluate(() => {
        const overlay = document.createElement('div')
        overlay.id = 'action-negative-overlay'
        overlay.style.cssText = 'position:absolute;inset:0;z-index:999;background:transparent'
        document.body.append(overlay)
      })
      await backPage.mouse.click(record.back[0].point.x, record.back[0].point.y)
      assert.equal(await backPage.locator('#back-result').evaluate(element => element.hidden), true, 'back interception negative control must fail to activate')
      record.backNegativeControl = true
      await backPage.close()

      evidence.push(record)
      console.log(`PASS ${width}x932 quick actions and back center/edge coordinate clicks; interception negative controls`)
    }
  } finally {
    fs.writeFileSync(path.join(out, 'action-evidence.json'), JSON.stringify(evidence, null, 2))
  }
}

module.exports = { runActionHitTest, actionFixtures }
