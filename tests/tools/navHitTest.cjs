// Chromium CSS hit-test replay only; WeChat runtime acceptance is separate.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { readSource } = require('../sourceFiles')
const { parseWxssRules } = require('../designTokens')
const { browsersPath, workspaceRequire } = require('./playwrightBrowsers.cjs')
const { runActionHitTest } = require('./actionHitTest.cjs')
const root = path.resolve(__dirname, '../..')
// Keep the 0.25px centering budget and allow Chromium's 1/64px text-range quantization.
const CENTER_TOLERANCE_PX = 0.25 + 1 / 64

// Chromium once failed a capture with "Unable to capture screenshot" after the click had already worked (2026-10-11).
// One retry keeps that transient failure from failing verify; a second failure still fails the run.
async function screenshotWithRetry(page, options, { attempts = 2, warn = console.warn } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.screenshot(options)
    } catch (error) {
      if (attempt >= attempts) throw error
      warn(`WARN screenshot attempt ${attempt} failed (${String(error.message).split('\n')[0]}); retrying`)
    }
  }
}

async function main() {
  // Playwright reads the browser path when it loads, so set it first; loading here keeps the helper testable without it.
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath(root)
  const { chromium } = workspaceRequire(root)('playwright')
  const out = path.join(root, '.scratch', 'coordinate-hit')
  const widths = [320, 375, 390, 430]
  const temp = path.join(root, '.scratch', 'tmp')
  fs.mkdirSync(out, { recursive: true })
  // Each run replaces the last; clear its files first so a failed run cannot leave older screenshots beside new evidence.
  const staleEvidence = [
    'evidence.json', 'action-evidence.json',
    ...widths.map(width => `nav-${width}.png`),
    ...widths.flatMap(width => ['period', 'memory'].map(kind => `back-${kind}-${width}.png`))
  ]
  for (const name of staleEvidence) fs.rmSync(path.join(out, name), { force: true })
  fs.mkdirSync(temp, { recursive: true })
  process.env.TEMP = temp
  process.env.TMP = temp
  process.env.TMPDIR = temp
  const browser = await chromium.launch({ headless: true })
  const evidence = []
  try {
    const wxml = readSource(path.join(root, 'pages/index/index.wxml'), 'utf8')
    const navStart = wxml.indexOf('<view class="nav-bar header-gradient')
    const navEnd = wxml.indexOf('<view wx:if="{{noRoom}}"', navStart)
    assert.ok(navStart >= 0 && navEnd > navStart, 'navbar fixture must include the complete shared template')
    const nav = wxml.slice(navStart, navEnd)
    assert.match(nav, /class="nav-tool"[^>]*bindtap="openLegendSheet"/)
    assert.match(nav, /class="nav-tool-surface">图例<\/view>/)
    assert.match(nav, /class="nav-title">\{\{title\}\}<\/view>/)
    const html = nav.replace(/<(\/?)view\b/g, '<$1div').replace(/<(\/?)text\b/g, '<$1span')
      .replaceAll("{{variant === 'immersive' ? ' nav-bar-immersive' : ''}}", '')
      .replaceAll('{{title}}', '美少女的日历')
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 932 } })
      const sources = ['app.wxss', 'pages/index/index.wxss'].map(file => readSource(path.join(root, file), 'utf8'))
      const selectors = new Set([
        'page', '.nav-bar', '.nav-title', '.nav-tool', '.nav-tool-surface',
        '.sync-pill', '.sync-pill.sync-open', '.sync-dot', '.sync-text',
        '.header-gradient', '.header-gradient::before', '.header-gradient::after'
      ])
      const css = sources.flatMap(parseWxssRules).filter(rule => rule.selectors.some(selector => selectors.has(selector))).map(rule => {
        const names = rule.selectors.filter(selector => selectors.has(selector)).map(selector => selector === 'page' ? 'body' : selector)
        const decls = Object.entries(rule.decls).map(([key, value]) => `${key}:${value.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, number) => Number(number) * width / 750 + 'px')}`)
        return `${names.join(',')}{${decls.join(';')}}`
      }).join('\n')
      const leftSlot = (30 + 96) * width / 750 + 2
      const compensation = 96 - leftSlot
      const titleLeft = Math.max(0, compensation)
      const titleRight = Math.max(0, -compensation)
      const bodyStyle = `margin:0;--safe-top:44px;--nav-bar-height:88px;--capsule-right:96px;--nav-title-padding-left:${titleLeft}px;--nav-title-padding-right:${titleRight}px`
      const fixture = `<style>${css}</style><body style="${bodyStyle}">${html}<div id="legend" hidden>Calendar legend</div></body>`
      await page.setContent(fixture)
      await page.evaluate(() => {
        document.querySelector('.sync-pill').remove()
        document.querySelector('.nav-back').remove()
        document.querySelector('.nav-placeholder').remove()
        document.querySelector('.nav-tool').addEventListener('click', () => { document.querySelector('#legend').hidden = false })
      })
      const readTitleGeometry = () => page.locator('.nav-title').evaluate(title => {
        const range = document.createRange()
        range.selectNodeContents(title)
        const textRect = range.getBoundingClientRect()
        const rect = title.getBoundingClientRect()
        const style = getComputedStyle(title)
        const paddingLeft = parseFloat(style.paddingLeft)
        const paddingRight = parseFloat(style.paddingRight)
        const toolRect = document.querySelector('.nav-tool').getBoundingClientRect()
        return {
          rangeCenter: textRect.left + textRect.width / 2,
          contentCenter: rect.left + paddingLeft + (rect.width - paddingLeft - paddingRight) / 2,
          title: { left: rect.left, width: rect.width },
          paddingLeft,
          paddingRight,
          tool: { left: toolRect.left, width: toolRect.width }
        }
      })
      const titleGeometry = await readTitleGeometry()
      const titleCenter = titleGeometry.rangeCenter
      assert.ok(Math.abs(titleCenter - width / 2) <= CENTER_TOLERANCE_PX, `${width}px: title center ${titleCenter} must equal viewport center ${width / 2}; geometry ${JSON.stringify(titleGeometry)}`)
      if (width === 390) {
        // Platform font metrics can widen the two-glyph label. The balanced outer slot must not grow with it.
        await page.addStyleTag({ content: '.nav-tool-surface{letter-spacing:0.05em}' })
        const stressedGeometry = await readTitleGeometry()
        assert.ok(Math.abs(stressedGeometry.rangeCenter - width / 2) <= CENTER_TOLERANCE_PX, `390px: intrinsic label width must not move the title; geometry ${JSON.stringify(stressedGeometry)}`)
      }
      const box = await page.locator('.nav-tool').boundingBox()
      const surfaceBox = await page.locator('.nav-tool-surface').boundingBox()
      const navbarBox = await page.locator('.nav-bar').boundingBox()
      const touchFloor = 88 * width / 750
      assert.ok(box && box.width + 0.02 >= touchFloor && box.height + 0.02 >= touchFloor, `${width}px: legend hit area ${JSON.stringify(box)} must stay at least ${touchFloor}px (88rpx, allowing Chromium's 1/64px rounding)`)
      assert.ok(surfaceBox && navbarBox, `${width}px: legend surface and navbar boxes must exist`)
      const contentTop = navbarBox.y + 44
      const contentBottom = navbarBox.y + navbarBox.height
      assert.ok(surfaceBox.y >= contentTop - 0.01 && surfaceBox.y + surfaceBox.height <= contentBottom + 0.01, `${width}px: legend surface must fit inside the navbar content row`)
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).className, point)
      await page.mouse.click(point.x, point.y)
      const visible = await page.locator('#legend').isVisible()
      assert.equal(visible, true, `${width}px: coordinate click must reach the legend (hit ${hit})`)
      evidence.push({ viewport: page.viewportSize(), titleCenter, box, surfaceBox, hit, legendVisible: visible, sync: null })
      await screenshotWithRetry(page, { path: path.join(out, `nav-${width}.png`) })
      // Reintroduce the actual failure without changing repository files.
      await page.evaluate(() => { document.querySelector('#legend').hidden = true })
      await page.addStyleTag({ content: '.header-gradient::after{pointer-events:auto;z-index:20}' })
      await page.mouse.click(point.x, point.y)
      assert.equal(await page.locator('#legend').isVisible(), false, `${width}px: negative control must detect the overlay`)
      console.log(`PASS ${width}x932 title center and unclipped legend; coordinate click and negative control`)

      if (width === 320) {
        await page.setContent(fixture)
        await page.evaluate(() => {
          document.querySelector('.nav-title').remove()
          document.querySelector('.nav-back').remove()
          document.querySelector('.nav-placeholder').remove()
          const pill = document.querySelector('.sync-pill')
          pill.className = 'sync-pill sync-open'
          pill.querySelector('.sync-text').textContent = '已保留上次的欢乐时光'
          document.querySelector('.nav-tool').addEventListener('click', () => { document.querySelector('#legend').hidden = false })
        })
        const sync = await page.locator('.sync-pill').evaluate(pill => {
          const text = pill.querySelector('.sync-text')
          const pillRect = pill.getBoundingClientRect()
          const toolRect = document.querySelector('.nav-tool').getBoundingClientRect()
          return {
            text: text.textContent,
            textClientWidth: text.clientWidth,
            textScrollWidth: text.scrollWidth,
            pillLeft: pillRect.left,
            pillRight: pillRect.right,
            toolRight: toolRect.right
          }
        })
        assert.ok(sync.textScrollWidth <= sync.textClientWidth + 1, `320px: longest sync copy must not be compressed or ellipsized (${sync.textScrollWidth} > ${sync.textClientWidth})`)
        assert.ok(sync.pillLeft >= sync.toolRight - 0.01 && sync.pillRight <= width - 96 + 0.01, '320px: sync pill must keep the original full title slot')
        await page.mouse.click(point.x, point.y)
        assert.equal(await page.locator('#legend').isVisible(), true, '320px: legend coordinate click must still reach its target with the sync pill mounted')
        evidence[evidence.length - 1].sync = { ...sync, legendVisible: true }
        console.log('PASS 320x932 longest sync copy keeps its full slot; legend coordinate click')
      }
      await page.close()
    }
    await runActionHitTest(browser, out, screenshotWithRetry)
  } finally {
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2))
    await browser.close()
    console.log(`Evidence: ${out}`)
  }
}
module.exports = { screenshotWithRetry }
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1 })
