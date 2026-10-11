// Chromium CSS hit-test replay only; WeChat runtime acceptance is separate.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parseWxssRules } = require('../designTokens')
const root = path.resolve(__dirname, '../..')
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.scratch', 'browsers')
const { chromium } = require('playwright')

async function main() {
  const out = path.join(root, '.scratch', 'coordinate-hit')
  const widths = [320, 375, 430]
  const temp = path.join(root, '.scratch', 'tmp')
  fs.mkdirSync(out, { recursive: true })
  // Each run replaces the last; clear its files first so a failed run cannot leave older screenshots beside new evidence.
  for (const name of ['evidence.json', ...widths.map(width => `nav-${width}.png`)]) fs.rmSync(path.join(out, name), { force: true })
  fs.mkdirSync(temp, { recursive: true })
  process.env.TEMP = temp
  process.env.TMP = temp
  process.env.TMPDIR = temp
  const browser = await chromium.launch({ headless: true })
  const evidence = []
  try {
    const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
    const nav = wxml.match(/<view class="nav-bar header-gradient">([\s\S]*?)<\/view>\s*<\/view>/)
    assert.ok(nav, 'navbar fixture must be extracted from the current WXML')
    assert.match(nav[0], /class="nav-tool"[^>]*bindtap="openMonthMenu"/)
    for (const width of widths) {
      const page = await browser.newPage({ viewport: { width, height: 932 } })
      const sources = ['app.wxss', 'pages/index/index.wxss'].map(file => fs.readFileSync(path.join(root, file), 'utf8'))
      const selectors = new Set(['page', '.nav-bar', '.nav-title', '.nav-tool', '.header-gradient', '.header-gradient::before', '.header-gradient::after'])
      const css = sources.flatMap(parseWxssRules).filter(rule => rule.selectors.some(selector => selectors.has(selector))).map(rule => {
        const names = rule.selectors.filter(selector => selectors.has(selector)).map(selector => selector === 'page' ? 'body' : selector)
        const decls = Object.entries(rule.decls).map(([key, value]) => `${key}:${value.replace(/(-?\d+(?:\.\d+)?)rpx/g, (_, number) => Number(number) * width / 750 + 'px')}`)
        return `${names.join(',')}{${decls.join(';')}}`
      }).join('\n')
      const html = nav[0].replace(/<(\/?)view\b/g, '<$1div')
      await page.setContent(`<style>${css}</style><body style="margin:0;--safe-top:44px;--nav-bar-height:88px;--capsule-right:96px">${html}<div id="menu" hidden>Tools menu</div></body>`)
      await page.evaluate(() => document.querySelector('.nav-tool').addEventListener('click', () => { document.querySelector('#menu').hidden = false }))
      const box = await page.locator('.nav-tool').boundingBox()
      assert.ok(box && box.width > 0 && box.height > 0, 'tools button must have a hit box')
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y).className, point)
      await page.mouse.click(point.x, point.y)
      const visible = await page.locator('#menu').isVisible()
      evidence.push({ viewport: page.viewportSize(), box, hit, menuVisible: visible })
      await page.screenshot({ path: path.join(out, `nav-${width}.png`) })
      assert.equal(visible, true, `${width}px: coordinate click must reach tools (hit ${hit})`)
      // Reintroduce the actual failure without changing repository files.
      await page.evaluate(() => { document.querySelector('#menu').hidden = true })
      await page.addStyleTag({ content: '.header-gradient::after{pointer-events:auto}' })
      await page.mouse.click(point.x, point.y)
      assert.equal(await page.locator('#menu').isVisible(), false, `${width}px: negative control must detect the overlay`)
      console.log(`PASS ${width}x932 coordinate click; overlay negative control detected`)
      await page.close()
    }
  } finally {
    fs.writeFileSync(path.join(out, 'evidence.json'), JSON.stringify(evidence, null, 2))
    await browser.close()
    console.log(`Evidence: ${out}`)
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
