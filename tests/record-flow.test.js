const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { readSource } = require('./sourceFiles')
const { parseWxssRules } = require('./designTokens')

test('period and memory list templates keep the REC-03 visible row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')

  // 日期行走统一显示格式，作者作为次要后缀同行；结束日期不详不在日期行再写一遍，时长位仍占住这几个字
  assert.match(periodWxml, /class="item-date">\s*<text>\{\{item\.dateLabel\}\}<\/text>\s*<text wx:if="\{\{item\.authorLabel\}\}" class="item-author"> · \{\{item\.authorLabel\}\}<\/text>/)
  assert.doesNotMatch(periodWxml, /class="item-note">\{\{item\.authorLabel\}\}/)
  assert.doesNotMatch(periodWxml, /\{\{item\.startDate\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}"/)
  assert.doesNotMatch(periodWxml, /无备注/)
  // 已完成记录仍以「N天」呈现时长；进行中/结束日期不详由状态文案占住时长位
  assert.match(periodWxml, /wx:if="\{\{item\.status === 'known-end'\}\}" class="item-duration">\{\{item\.durationText\}\}/)
  assert.match(periodWxml, /class="item-duration ongoing">\{\{item\.durationText\}\}/)

  // 欢乐时光行在记录 tab；旧页不再渲染自己的列表
  assert.match(periodWxml, /class="memory-date">\s*<text>\{\{item\.dayLabel\}\}<\/text>/)
  assert.doesNotMatch(periodWxml, /class="memory-date">\{\{item\.date\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)
  assert.doesNotMatch(memoryWxml, /wx:for="\{\{memories\}\}"/)
  assert.doesNotMatch(memoryWxml, /我们的欢乐时光'/)

  // 经量标签带 flow 变体类（玫瑰角色只落在经量上），症状标签保持中性的基础类
  assert.match(periodWxml, /wx:if="\{\{item\.flowLabel\}\}" class="item-tag flow">\{\{item\.flowLabel\}\}/)
  assert.match(periodWxml, /wx:for="\{\{item\.symptomLabels\}\}"[\s\S]*?class="item-tag"[\s\S]*?>\{\{tag\}\}/)
})

test('record list pages show load-failed retry copy and reserve period stats while loading', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  assert.match(periodWxml, /loadFailed/)
  assert.match(periodWxml, /加载失败，点按重试/)
  // 旧欢乐时光页不再画自己的失败卡；记录 tab 的欢乐时光分段仍有重试
  assert.doesNotMatch(memoryWxml, /加载失败，点按重试/)
  assert.match(periodWxml, /欢乐时光加载失败/)
  // 首次加载失败不显示确信的 0：数字只在未失败或曾成功加载时呈现，否则落到 -- 占位
  assert.match(periodWxml, /wx:if="\{\{!loading && \(!loadFailed \|\| hasLoaded\)\}\}"[^>]*class="cycle-num">\{\{periodCount\}\}/)
  assert.match(periodWxml, /wx:elif="\{\{!loading\}\}"[^>]*class="cycle-num">--</)
  assert.match(periodWxml, /class="cycle-label">平均周期</)
  assert.match(periodWxml, /<block wx:if="\{\{!loading && avgCycle\}\}">\s*<text class="cycle-num">\{\{avgCycle\}\}<\/text>\s*<text class="cycle-unit">天<\/text>\s*<\/block>/)
  assert.match(periodWxml, /class="cycle-label">平均持续</)
  assert.match(periodWxml, /<block wx:if="\{\{!loading && avgDuration\}\}">\s*<text class="cycle-num">\{\{avgDuration\}\}<\/text>\s*<text class="cycle-unit">天<\/text>\s*<\/block>/)
  assert.equal((periodWxml.match(/class="cycle-num cycle-num-placeholder"/g) || []).length, 3,
    'all three number slots keep a loading placeholder')
  assert.doesNotMatch(periodWxml, /持续天数/)

  const periodWxss = readPageFile('pages/period/period.wxss')
  const valueRule = /\.cycle-value\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(valueRule, 'every loaded and loading number shares one fixed-height slot')
  assert.match(valueRule[0], /height:\s*52\.8rpx/)
  assert.match(valueRule[0], /align-items:\s*baseline/)
  const placeholderRule = /\.cycle-num-placeholder\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(placeholderRule, 'the loading number has its own placeholder geometry')
  assert.match(placeholderRule[0], /width:\s*88rpx/)
  assert.match(placeholderRule[0], /height:\s*44rpx/)
  assert.match(placeholderRule[0], /border-radius:\s*var\(--radius-sm\)/)
  assert.match(placeholderRule[0], /background:\s*rgba\(255,255,255,0\.08\)/)
  const unitRule = /\.cycle-unit\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(unitRule, 'the day unit is separate from the display number')
  assert.match(unitRule[0], /font-size:\s*24rpx/)
  assert.match(unitRule[0], /color:\s*var\(--text-secondary\)/)
})

test('period overview columns all stack the label above the number', () => {
  // 三列同一上下顺序：任一列颠倒，标签行和数字行就会错位
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodOverview = periodWxml.slice(periodWxml.indexOf('class="cycle-card glass-surface"'), periodWxml.indexOf('class="cycle-card memory-overview'))
  const items = periodOverview.match(/<view class="cycle-item">[\s\S]*?<\/view>/g)

  assert.equal(items.length, 3)
  for (const item of items) {
    const label = item.indexOf('class="cycle-label"')
    const num = item.indexOf('class="cycle-num"')
    assert.ok(label !== -1 && label < num, item)
  }
})

test('collapsed period months show their existing count without repeating it while expanded', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')
  assert.match(periodWxml, /<view class="month-header-text">\s*<text>\{\{group\.title\}\}<\/text>\s*<text wx:if="\{\{!group\.expanded\}\}" class="month-count" aria-hidden="true">· \{\{group\.count\}\} 条<\/text>/)
  const countRule = /\.month-count\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(countRule, 'the collapsed month count has a secondary text role')
  assert.match(countRule[0], /color:\s*var\(--text-secondary\)/)
  assert.match(countRule[0], /white-space:\s*nowrap/)
})

test('record tab preserves author and accessible row bindings, pull refresh, and the quiet compatibility template', () => {
  const wxml = readPageFile('pages/period/period.wxml')
  const legacy = readPageFile('pages/memory/memory.wxml')
  const config = JSON.parse(readPageFile('pages/period/period.json'))
  assert.equal(config.enablePullDownRefresh, true)
  assert.match(wxml, /wx:if="\{\{item\.authorLabel\}\}"/)
  const rowTag = /<view class="list-item"[^>]*bindtap="editMemory"[^>]*>/.exec(wxml)
  assert.ok(rowTag)
  assert.match(rowTag[0], /aria-label="\{\{item\.ariaLabel\}\}"/)
  const memoryList = wxml.slice(wxml.indexOf('class="memory-month-list"'))
  assert.equal((memoryList.match(/item\.ariaLabel/g) || []).length,
    (memoryList.match(/aria-label="\{\{item\.ariaLabel\}\}"/g) || []).length)
  const periodRow = wxml.slice(wxml.indexOf('class="list-item"'), wxml.indexOf('class="item-arrow"'))
  assert.match(periodRow, /class="item-date">\s*<text>\{\{item\.dateLabel\}\}<\/text>\s*<text wx:if="\{\{item\.authorLabel\}\}" class="item-author"> · \{\{item\.authorLabel\}\}<\/text>/)
  const authorRule = /\.item-author\s*\{[^}]*\}/.exec(readPageFile('pages/period/period.wxss'))
  assert.ok(authorRule, 'the inline author suffix has its own secondary text role')
  assert.match(authorRule[0], /color:\s*var\(--text-secondary\)/)
  assert.doesNotMatch(periodRow, /endDateDisplay/)
  assert.doesNotMatch(legacy, /wx:for="\{\{memories\}\}"|class="empty-state"|bindtap="(?:addMemory|editMemory|loadData)"/)
})

test('legacy memory route keeps only the navbar style its markup renders', () => {
  const raw = readRawPageFile('pages/memory/memory.wxml')
  const wxml = readPageFile('pages/memory/memory.wxml')
  const wxss = readPageFile('pages/memory/memory.wxss')
  assert.match(raw, /variant: 'placeholder', title: '欢乐时光'/)
  assert.match(wxml, /<view class="nav-bar header-gradient[^"]*" aria-hidden="\{\{pageObscured\}\}">/)
  assert.match(wxml, /<view wx:elif="\{\{title\}\}" class="nav-title">\{\{title\}\}<\/view>/)
  assert.deepEqual(parseWxssRules(wxss).flatMap(rule => rule.selectors), [])
})

test('period list failure retry is a recognizable operation, distinct from the quiet empty note', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 首次失败卡保留整卡重试行为与读屏名，但外层不按压缩放；内部重试复用主按钮的按压与柔光。
  assert.match(
    periodWxml,
    /wx:if="\{\{loadFailed && !hasLoaded && !loading\}\}" class="empty-state record-empty load-failed" bindtap="loadData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(periodWxml, /class="load-failed-text">经期记录加载失败</)
  assert.match(periodWxml, /class="btn-premium button-primary retry-btn" hover-start-time="20" hover-stay-time="70" hover-class="btn-premium-hover">重试</)

  // 真空态仍是安静说明：不带重试按钮，也不可点；失败期间不显示断言式空态句（!loadFailed）
  const emptyBlock = /wx:elif="\{\{periodCount === 0 && !loading && !loadFailed\}\}" class="empty-state record-empty">([\s\S]*?)<\/view>/.exec(periodWxml)
  assert.ok(emptyBlock, 'expected the genuine empty state block')
  assert.match(emptyBlock[1], /经期开始那天点「\{\{periodQuickLabel\}\}」；\{\{predictionThresholdText\}\}/)
  assert.doesNotMatch(emptyBlock[1], /点上面按钮新增/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 三类空态共用一份结构；record-empty、empty-guide、day-detail-empty 只保留各自渲染值。
  const sharedEmpty = readPageFile('pages/shared/empty-state.wxss')
  const sharedRules = parseWxssRules(sharedEmpty)
  const base = sharedRules.find(rule => rule.selectors.includes('.empty-state'))
  assert.ok(base, 'expected the shared empty-state structure')
  assert.deepEqual(base.decls, { display: 'block', 'border-width': '1px' })
  for (const [file, modifier] of [
    ['pages/period/period.wxss', '.record-empty'],
    ['pages/index/index.wxss', '.empty-guide'],
    ['pages/index/index.wxss', '.day-detail-empty']
  ]) {
    const rules = parseWxssRules(readPageFile(file))
    assert.ok(rules.some(rule => rule.selectors.includes(modifier)), `${modifier} keeps its values in ${file}`)
  }
  const recordEmpty = parseWxssRules(periodWxss).find(rule => rule.selectors.includes('.record-empty'))
  assert.ok(recordEmpty, 'both record segments share the quiet empty-card treatment')
  assert.equal(recordEmpty.decls['border-style'], 'dashed')
  assert.equal(recordEmpty.decls['border-color'], 'rgba(255,255,255,0.14)')
  assert.match(readRawPageFile('pages/period/period.wxss'), /@import '\.\.\/shared\/empty-state\.wxss';/)
  assert.match(readRawPageFile('pages/index/index.wxss'), /@import '\.\.\/shared\/empty-state\.wxss';/)
  assert.match(readPageFile('pages/index/index.wxml'), /class="empty-state empty-guide"/)
  assert.match(readRawPageFile('pages/shared/confirmation-sheet.wxml'), /class="empty-state day-detail-empty future-notice"/)

  // 重试保留 88rpx 触控目标；玫瑰底、单层 0.96 缩放和柔光均来自既有 .btn-premium，不在本页复制。
  const retryRule = /\.retry-btn\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryRule, 'expected the .retry-btn sizing rule')
  assert.match(retryRule[0], /min-height:\s*88rpx/)
  assert.doesNotMatch(retryRule[0], /background|transform|transition/)
  const retryPressRules = [...periodWxss.matchAll(/\.retry-btn[^{]*\{[^}]*\}/g)]
  for (const rule of retryPressRules) assert.doesNotMatch(rule[0], /scale\(/, 'retry has no page-local second scale')
  const loadFailedRules = [...periodWxss.matchAll(/\.load-failed[^{]*\{[^}]*\}/g)]
  for (const rule of loadFailedRules) assert.doesNotMatch(rule[0], /scale\(|transform/, 'the failure card itself never scales')
  const sharedButton = readPageFile('app.wxss')
  assert.match(sharedButton, /\.btn-premium::before\s*\{[^}]*box-shadow:/)
  assert.match(sharedButton, /\.btn-premium:active,\s*\.btn-premium\.btn-premium-hover\s*\{[^}]*transform:\s*scale\(0\.96\)/)
})

test('period list keeps last data on refresh failure and offers retry in the list area', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 已成功加载过再失败：重试行留在列表区域。未同步时本机已保存的记录列在失败卡下面（#194），
  // 由 record-tab 的 harness 用例按渲染数据和模板分支检查
  assert.match(periodWxml, /wx:for="\{\{group\.records\}\}"[^>]*bindtap="editPeriod"/)
  assert.match(
    periodWxml,
    /wx:if="\{\{loadFailed && hasLoaded && !loading\}\}" class="list-retry" bindtap="loadData" aria-role="button" aria-label="刷新失败，点按重试"/
  )
  assert.match(periodWxml, /class="list-retry-text">刷新失败，正在显示上次的内容</)

  // 重试行可点高度 ≥44px，整句与首页一样使用玫瑰可点色，不再嵌一个等高的重试块
  const retryRow = parseWxssRules(periodWxss).find(rule => rule.selectors.includes('.list-retry'))
  assert.ok(retryRow, 'expected the .list-retry rule')
  assert.match(retryRow.decls['min-height'], /88rpx/)
  assert.equal(retryRow.decls.color, 'var(--aurora-pink)')
})

test('record tab memory segment mirrors the standalone memory list state contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 整卡失败态只在从未成功加载时出现；已加载后的失败保留列表，改走列表区重试行
  assert.match(
    periodWxml,
    /wx:if="\{\{memoryLoadFailed && !memoryHasLoaded && !memoryLoading\}\}" class="empty-state record-empty load-failed" bindtap="loadMemoryData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(periodWxml, /class="load-failed-text">欢乐时光加载失败</)
  assert.match(periodWxml, /class="btn-premium button-primary retry-btn" hover-start-time="20" hover-stay-time="70" hover-class="btn-premium-hover">重试</)

  // 空列表说明保持安静：没有按钮、不可点；失败期间不显示断言式空态句
  const emptyBlock = /wx:elif="\{\{memoryCount === 0 && !memoryLoading && !memoryLoadFailed\}\}" class="empty-state record-empty">([\s\S]*?)<\/view>/.exec(periodWxml)
  assert.ok(emptyBlock, 'expected the memory segment empty state block')
  assert.match(emptyBlock[1], /想记的那天点「记欢乐时光」，写一句就留在日历上/)
  assert.doesNotMatch(emptyBlock[1], /点上面按钮新增/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 已加载后失败：列表保留，重试行留在列表区域；和经期段是同一条重试行，
  // 按下时说明文字在极光上同样读得清（issue #166）
  assert.match(
    periodWxml,
    /wx:if="\{\{memoryLoadFailed && memoryHasLoaded && !memoryLoading\}\}" class="list-retry" bindtap="loadMemoryData" aria-role="button" aria-label="刷新失败，点按重试" hover-start-time="20" hover-stay-time="70" hover-class="list-retry-hover"/
  )
  assert.equal((periodWxml.match(/class="list-retry-text">刷新失败，正在显示上次的内容</g) || []).length, 2,
    'both segments explain the refresh failure with the same retry row text')

  // 欢乐时光保留圆点、经期保留 pill 的形状差异，但两类列表都只有父容器单层脉冲。
  assert.match(periodWxml, /wx:if="\{\{memoryLoading\}\}" class="skeleton-card glass-surface"/)
  assert.match(periodWxml, /class="skeleton-dot"/)
  const pulseRules = [...periodWxss.matchAll(/([^{}@]+)\{[^{}]*animation:\s*skeletonPulse[^{}]*\}/g)]
  assert.equal(pulseRules.length, 1, 'record list skeletons have one pulse layer')
  assert.match(pulseRules[0][1], /\.record-skeleton/)
  for (const selector of ['skeleton-line', 'skeleton-pill', 'skeleton-dot']) {
    const rule = new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`).exec(periodWxss)
    assert.ok(rule, `expected the .${selector} shape`)
    assert.doesNotMatch(rule[0], /animation:/)
  }
  const rmBlock = periodWxss.slice(periodWxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(rmBlock, /\.record-skeleton/)
})

test('record tab memory segment renders month cards with the grouped row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  assert.match(periodWxml, /class="premium-card glass-surface month-card" wx:for="\{\{memoryGroups\}\}" wx:key="key"/)
  assert.match(
    periodWxml,
    /class="month-header \{\{group\.expanded \? 'month-header-expanded' : ''\}\}" bindtap="toggleMonth" data-key="\{\{group\.key\}\}" aria-role="button" aria-label="\{\{group\.ariaLabel\}\}" aria-expanded="\{\{group\.expanded\}\}"/
  )
  assert.match(periodWxml, /class="month-header-text">\{\{group\.title\}\}/)
  assert.match(periodWxml, /ui-icon ui-icon-down ui-icon-24 fold-caret \{\{group\.expanded \? 'fold-caret-expanded' : ''\}\}/)
  assert.doesNotMatch(periodWxml, /class="month-toggle"/)
  assert.match(
    periodWxml,
    /wx:if="\{\{!group\.expanded && group\.excerpt\}\}" class="month-excerpt" aria-hidden="true">\{\{group\.excerpt\}\}/
  )
  const excerptRule = /\.month-excerpt\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(excerptRule, 'expected the collapsed month excerpt rule')
  assert.match(excerptRule[0], /white-space:\s*nowrap/)
  assert.match(excerptRule[0], /overflow:\s*hidden/)
  assert.match(excerptRule[0], /text-overflow:\s*ellipsis/)

  assert.match(
    periodWxml,
    /class="fold-grid \{\{group\.expanded \? 'fold-grid-expanded' : ''\}\}" aria-hidden="\{\{!group\.expanded\}\}">\s*<view class="fold-inner">\s*<view class="list-item" wx:for="\{\{group\.records\}\}" wx:key="_id" bindtap="editMemory"/
  )
  assert.match(periodWxml, /class="memory-date">\s*<text>\{\{item\.dayLabel\}\}<\/text>/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)

  const headerRule = /\.month-header\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(headerRule, 'expected the .month-header rule')
  assert.match(headerRule[0], /transition:\s*background-color var\(--duration-press\) ease, transform var\(--duration-press\) var\(--ease-out\)/)
})

test('record groups use accessible grid folds, rotating vector carets, pressed month headers, and a 12rpx segment reveal', () => {
  const wxml = readPageFile('pages/period/period.wxml')
  const wxss = readPageFile('pages/period/period.wxss')

  const foldRules = parseWxssRules(wxss)
  const fold = foldRules.find(rule => rule.selectors.includes('.fold-grid'))
  const expanded = foldRules.find(rule => rule.selectors.includes('.fold-grid.fold-grid-expanded'))
  const inner = foldRules.find(rule => rule.selectors.includes('.fold-inner'))
  assert.ok(fold && expanded && inner, 'each collapsible region has the two-layer grid contract')
  assert.equal(fold.decls.display, 'grid')
  assert.equal(fold.decls['grid-template-rows'], '0fr')
  assert.equal(fold.decls.opacity, '0')
  assert.equal(fold.decls['pointer-events'], 'none')
  assert.match(fold.decls.transition, /grid-template-rows var\(--duration-state\) var\(--ease-out\)/)
  assert.match(fold.decls.transition, /opacity var\(--duration-state\) var\(--ease-out\)/)
  assert.equal(expanded.decls['grid-template-rows'], '1fr')
  assert.equal(expanded.decls.opacity, '1')
  assert.equal(expanded.decls['pointer-events'], 'auto')
  assert.equal(inner.decls.overflow, 'hidden')
  assert.equal(inner.decls['min-height'], '0')

  for (const variable of ['yearGroup', 'group']) {
    assert.match(wxml, new RegExp(`class="fold-grid \\{\\{${variable}\\.expanded \\? 'fold-grid-expanded' : ''\\}\\}" aria-hidden="\\{\\{!${variable}\\.expanded\\}\\}"`))
  }
  assert.doesNotMatch(wxml, /<block wx:if="\{\{group\.expanded\}\}">/)
  assert.doesNotMatch(wxml, /class="(?:year-toggle|month-toggle)"/)
  assert.ok((wxml.match(/ui-icon ui-icon-down ui-icon-24 fold-caret/g) || []).length >= 3, 'year and both month headers use the #266 vector caret')
  const caret = foldRules.find(rule => rule.selectors.includes('.fold-caret'))
  const caretExpanded = foldRules.find(rule => rule.selectors.includes('.fold-caret.fold-caret-expanded'))
  assert.match(caret.decls.transform, /rotate\(0deg\)/)
  assert.match(caret.decls.transition, /transform var\(--duration-state\) var\(--ease-out\)/)
  assert.match(caretExpanded.decls.transform, /rotate\(180deg\)/)

  const month = foldRules.find(rule => rule.selectors.includes('.month-header'))
  const pressed = foldRules.find(rule => rule.selectors.includes('.month-header:active') && rule.selectors.includes('.month-header.month-header-hover'))
  assert.match(month.decls.transition, /transform var\(--duration-press\) var\(--ease-out\)/)
  assert.match(month.decls.transition, /background-color var\(--duration-press\) ease/)
  assert.match(pressed.decls.transform, /scale\(0\.98\)/)
  assert.match(pressed.decls.transition, /transform var\(--duration-press-in\) var\(--ease-out\)/)

  assert.match(wxml, /class="segment-panel segment-panel-\{\{segmentMotion\}\}"/)
  const segment = foldRules.find(rule => rule.selectors.some(selector => selector.includes('.segment-panel-a')) && rule.decls.animation)
  assert.ok(segment, 'the active segment replays its micro transition')
  assert.match(segment.decls.animation, /segmentPanelIn var\(--duration-enter\) var\(--ease-out\) both/)
  assert.match(wxss, /@keyframes segmentPanelIn\s*\{[\s\S]*?from\s*\{\s*opacity:\s*0;\s*transform:\s*translateX\(12rpx\)/)
  assert.match(wxss, /\.record-content-reveal\s*\{[^}]*animation:\s*fadeIn var\(--duration-enter\) var\(--ease-out\) both/)
  assert.match(wxss, /\.record-skeleton\s*\{[^}]*animation:\s*skeletonPulse 2\.4s ease-in-out infinite/)
  const reduced = wxss.slice(wxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  for (const selector of ['.fold-grid', '.fold-caret', '.segment-panel-a', '.record-content-reveal', '.record-skeleton']) {
    assert.ok(reduced.includes(selector), `${selector} has a reduced-motion override`)
  }
})

test('memory editor uses a clickable journal date letter and a 280rpx placeholder writing well', () => {
  const raw = readRawPageFile('pages/memory/edit/edit.wxml')
  const wxml = readPageFile('pages/memory/edit/edit.wxml')
  const wxss = readPageFile('pages/memory/edit/edit.wxss')
  assert.match(raw, /journal: true/)
  assert.match(raw, /displayValue: dateJournalLabel/)
  assert.doesNotMatch(raw, /<text class="form-label">(?:日期|内容)<\/text>/)
  const letter = /<view [^>]*class="form-picker form-control[^"]*memory-date-letter[^"]*"[^>]*bindtap="\{\{tapHandler\}\}"[^>]*>/.exec(wxml)
  assert.ok(letter, 'the whole journal letter opens the existing date panel')
  assert.match(letter[0], /aria-role="button"/)
  assert.match(letter[0], /aria-disabled="\{\{saving\}\}"/)
  assert.match(wxml, /class="memory-heart" aria-hidden="true">♥<\/text>/)
  assert.match(wxml, /class="memory-date-value">\{\{value \? displayValue : placeholder\}\}<\/text>/)
  assert.match(wxml, /class="memory-date-action">改日期<\/text>/)
  assert.match(wxml, /placeholder="记下今天想留住的小事…"/)
  const diary = /\.memory-note-input\s*\{([^}]*)\}/.exec(wxss)
  assert.ok(diary, 'the writing well keeps its own minimum height')
  assert.match(diary[1], /min-height:\s*280rpx/)
})

test('record edit pages isolate delete loading, constrain period dates, and cap notes', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  assert.match(periodEditWxml, /删除中\.\.\./)
  assert.match(memoryEditWxml, /删除中\.\.\./)
  assert.match(periodEditWxml, /wx:if="\{\{!saving && !deleting && !submitted\}\}"/)
  assert.match(memoryEditWxml, /wx:if="\{\{!saving && !deleting && !submitted\}\}"/)
  assert.match(periodEditWxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\./)
  assert.match(memoryEditWxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\./)
  assert.match(periodEditWxml, /wx:else class="btn-premium disabled button-primary"[^>]*>保存</)
  assert.match(memoryEditWxml, /wx:else class="btn-premium disabled button-primary"[^>]*>保存</)
  const periodRawWxml = readRawPageFile('pages/period/edit/edit.wxml')
  assert.doesNotMatch(periodEditWxml, /<picker mode="date"/)
  assert.match(periodRawWxml, /startDate: startDate, maxDate: maxDate, saving: saving, tapHandler: 'openEndDatePicker'/)
  assert.match(periodRawWxml, /maxDate: maxDate, saving: saving, tapHandler: 'openStartDatePicker'/)
  // 结束日期选择器只在已知结束状态出现；开始日期选择器上限为今天
  assert.match(periodEditWxml, /<view class="form-item" wx:if="\{\{status === 'known-end'\}\}"[^>]*>/)
  assert.match(periodEditWxml, /bindtap="\{\{tapHandler\}\}"/)
  assert.match(readRawPageFile('pages/period/edit/edit.wxml'), /tapHandler: 'selectStatus'[\s\S]*ariaLabel: '经期状态 ' \+ item\.label/)
  assert.match(periodEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /maxlength="500"/)
})

test('record edit templates use action titles, paired authors, and the required form structure', () => {
  const periodWxml = readPageFile('pages/period/edit/edit.wxml')
  const periodRawWxml = readRawPageFile('pages/period/edit/edit.wxml')
  const memoryWxml = readPageFile('pages/memory/edit/edit.wxml')
  for (const file of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    assert.match(readRawPageFile(file), /variant: 'back', title: pageTitle/)
  }
  for (const wxml of [periodWxml, memoryWxml]) {
    assert.match(wxml, /<view wx:elif="\{\{title\}\}" class="nav-title">\{\{title\}\}<\/view>/)
    assert.doesNotMatch(wxml, /新增经期|新增欢乐时光/)
    assert.match(wxml, /<view wx:if="\{\{authorLabel\}\}" class="record-author">\{\{authorLabel\}\}<\/view>/)
  }

  const cards = [...periodWxml.matchAll(/<view class="premium-card glass-surface(?: optional-card)?">/g)]
  assert.equal(cards.length, 2, 'period required and optional fields live in two cards')
  const required = periodWxml.slice(cards[0].index, cards[1].index)
  const optional = periodWxml.slice(cards[1].index, periodWxml.indexOf('<view class="btns">'))
  for (const label of ['开始日期', '结束日期']) assert.match(periodRawWxml, new RegExp(`label: '${label}'`))
  assert.match(required, />经期状态</)
  assert.doesNotMatch(required, />经量<|>症状<|>备注</)
  assert.match(optional, /class="form-section-title">选填<\/view>/)
  for (const label of ['经量', '症状', '备注']) assert.match(optional, new RegExp(`>${label}<`))
  assert.match(periodRawWxml, /checked: selectedSymptoms\[item\.value\]/)
  assert.doesNotMatch(optional, /item\.selected/)

  const statusOptions = required.indexOf('aria-checked="{{checked}}"')
  const statusHint = required.indexOf('{{statusHint}}')
  const endDate = required.indexOf('id="field-endDate"')
  assert.ok(statusOptions !== -1 && statusOptions < statusHint && statusHint < endDate, 'the current status consequence follows its options')
  assert.match(required, /class="form-hint status-hint" aria-role="status">\{\{statusHint\}\}/)
  assert.match(periodRawWxml, /ariaLabel: '经期状态 ' \+ item\.label \+ '，' \+ item\.hint/)
  assert.match(periodRawWxml, /placeholder: '选择结束日期'[\s\S]*ariaLabel: endDate \? '结束日期，' \+ endDateLabel \+ '，点按修改' : '结束日期，还没选，点按选择'/)

  assert.doesNotMatch(memoryWxml, /<text class="form-label">(?:日期|内容)<\/text>/)
  assert.match(memoryWxml, /<textarea[^>]*aria-label="内容"/)
  assert.doesNotMatch(memoryWxml, /<text class="form-label">备注<\/text>|aria-label="备注"/)
})

test('record edit templates keep fields and delete locked while saving', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  // 保存进行中：日期字段带 disabled 类与 aria-disabled，备注输入保留原生 disabled，均与 saving 同条件。
  for (const [wxml, dateFields] of [[periodEditWxml, 2], [memoryEditWxml, 1]]) {
    const lockedDates = wxml.match(/class="form-picker[^"]*"[^>]*aria-disabled="\{\{saving\}\}"/g) || []
    assert.equal(lockedDates.length, dateFields, 'every date field is disabled while saving')
    assert.equal((wxml.match(/<textarea[^>]*disabled="\{\{saving\}\}"/g) || []).length, 1, 'the note input is disabled while saving')
  }
  for (const wxml of [periodEditWxml, memoryEditWxml]) {
    assert.match(wxml, /wx:if="\{\{isEdit && !deleting && !saving && !submitted\}\}"[^>]*bindtap="delete"/)
  }

  // 状态、经量与症状芯片都从共享结构继承保存中的禁用类与 aria-disabled。
  const sharedChip = readRawPageFile('pages/shared/form-controls.wxml')
  assert.match(sharedChip, /<template name="sharedChoiceChip">[\s\S]*saving \? ' disabled'[\s\S]*aria-disabled="\{\{saving\}\}"/)
  const chipInvocations = readRawPageFile('pages/period/edit/edit.wxml')
    .match(/<template is="sharedChoiceChip"[^>]*saving: saving/g) || []
  assert.equal(chipInvocations.length, 3, 'all three chip groups pass the saving state')
})

test('record edit notes are multi-line textareas with the unchanged 500-char cap', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  for (const wxml of [periodEditWxml, memoryEditWxml]) {
    assert.match(wxml, /<textarea[^>]*maxlength="500"[^>]*auto-height/)
    assert.doesNotMatch(wxml, /<input[^>]*aria-label="备注"/)
  }
})

test('edit textareas expose keyboard completion, saving opacity, and a roomy memory diary', () => {
  for (const relativePath of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const wxml = readPageFile(relativePath)
    const textarea = /<textarea[^>]*>/.exec(wxml)?.[0]
    assert.ok(textarea, `${relativePath} has a note textarea`)
    assert.match(textarea, /show-confirm-bar="\{\{true\}\}"/)
    assert.match(textarea, /disabled="\{\{saving\}\}"/)
    assert.match(textarea, /aria-disabled="\{\{saving\}\}"/)
    assert.match(textarea, /saving \? ' disabled' : ''/)

    const wxss = readPageFile(relativePath.replace(/\.wxml$/, '.wxss'))
    const disabled = /\.form-input\.disabled\s*\{([^}]*)\}/.exec(wxss)
    assert.ok(disabled, 'the shared textarea disabled state is visible')
    assert.match(disabled[1], /opacity:\s*0\.5/)
    assert.match(disabled[1], /pointer-events:\s*none/)
  }

  const memoryWxss = readPageFile('pages/memory/edit/edit.wxss')
  const diary = /\.memory-note-input\s*\{([^}]*)\}/.exec(memoryWxss)
  assert.ok(diary, 'memory gives the diary textarea its own minimum height')
  assert.match(diary[1], /min-height:\s*280rpx/)
})

// 日期错误常驻在所属字段的 picker 下方，同时并进带当前显示值的 picker 读屏名；
// 读屏能听出是开始日、结束日还是欢乐时光日期出错；字段容器带页面滚动锚点
test('edit forms read each displayed date and keep its own error inside that picker screen-reader name', () => {
  const cases = [
    ['pages/period/edit/edit.wxml', 'startDate', "'开始日期，' + startDateLabel + '，点按修改'"],
    ['pages/period/edit/edit.wxml', 'endDate', "endDate ? '结束日期，' + endDateLabel + '，点按修改' : '结束日期，还没选，点按选择'"],
    ['pages/memory/edit/edit.wxml', 'date', "'日期，' + dateLabel + '，点按修改'"]
  ]
  for (const [file, field, nameExpression] of cases) {
    const wxml = readPageFile(file)
    const raw = readRawPageFile(file)
    assert.ok(raw.includes(`ariaLabel: ${nameExpression}`), `${file} ${field} keeps its date announcement`)
    assert.ok(raw.includes(`error: fieldErrors.${field}`), `${file} ${field} passes its own error`)
    const opening = new RegExp(`<view class="form-item"[^>]*\\sid="field-${field}"[^>]*>`).exec(wxml)
    assert.ok(opening, `${file} marks the ${field} form item as #field-${field}`)
    const nextItem = wxml.indexOf('class="form-item', opening.index + opening[0].length)
    const item = wxml.slice(opening.index, nextItem === -1 ? undefined : nextItem)
    assert.ok(
      item.includes('aria-label="{{ariaLabel}}{{error ? \'，\' + error : \'\'}}"'),
      `${file} ${field} picker appends its error after the field name`
    )
    const errorLine = '<text wx:if="{{error}}" class="field-error" aria-role="alert">{{error}}</text>'
    const fieldControlEnd = item.indexOf('</view>')
    assert.ok(fieldControlEnd !== -1 && item.indexOf(errorLine) > fieldControlEnd, `${file} ${field} error line follows its field control`)
  }

  // 两个编辑页共用 app.wxss 里的一条 .field-error，页面不各写一份
  const rule = /\.field-error\s*\{([^}]*)\}/.exec(readPageFile('app.wxss'))
  assert.ok(rule, 'app.wxss defines the shared .field-error')
  assert.match(rule[1], /display:\s*block/)
  assert.match(rule[1], /color:\s*var\(--color-danger\)/)
  assert.match(rule[1], /font-size:\s*var\(--font-size-caption\)/)
  for (const file of ['pages/period/edit/edit.wxss', 'pages/memory/edit/edit.wxss']) {
    assert.doesNotMatch(readPageFile(file), /\.field-error\b/, `${file} reuses the shared .field-error`)
  }
})

test('period edit fields run start, status, end date, flow, symptoms, then note', () => {
  const wxml = readRawPageFile('pages/period/edit/edit.wxml')
  const labels = [...wxml.matchAll(/<text class="form-label">([^<]+)<\/text>|label: '([^']+)'/g)]
    .map(match => match[1] || match[2])
  assert.deepEqual(labels, ['开始日期', '经期状态', '结束日期', '经量', '症状', '备注'])
})

test('period edit binds status and length hints beside their fields', () => {
  const wxml = readPageFile('pages/period/edit/edit.wxml')
  assert.match(wxml, /经期状态[\s\S]*class="form-hint status-hint" aria-role="status">\{\{statusHint\}\}/)
  const endLabel = wxml.indexOf('id="field-endDate"')
  const dayText = wxml.indexOf('{{periodDayCountText}}')
  const lengthHint = wxml.indexOf('{{periodLengthHint}}')
  const noteLabel = wxml.indexOf('备注')
  assert.ok(endLabel !== -1 && endLabel < dayText && dayText < lengthHint && lengthHint < noteLabel)
})

test('both edit pages keep the delete area in the scroll flow apart from the fixed save bar', () => {
  for (const [wxmlPath, wxssPath] of [
    ['pages/period/edit/edit.wxml', 'pages/period/edit/edit.wxss'],
    ['pages/memory/edit/edit.wxml', 'pages/memory/edit/edit.wxss']
  ]) {
    const raw = readRawPageFile(wxmlPath)
    assert.ok(raw.indexOf('<template is="sharedRecordDelete"') < raw.indexOf('<template is="sharedRecordActions"'))
    assert.match(raw, /<template is="sharedRecordActions"[^>]*actionsClass: 'record-actions-fixed'/)
    const wxml = readPageFile(wxmlPath)
    assert.match(wxml, /<view wx:if="\{\{isEdit\}\}" class="delete-zone">[\s\S]*bindtap="delete"[\s\S]*删除此记录<\/view>/)

    const wxss = readPageFile(wxssPath)
    const zone = /\.delete-zone\s*\{([^}]*)\}/.exec(wxss)
    assert.ok(zone, `${wxssPath} should define .delete-zone`)
    assert.match(zone[1], /margin-top:\s*var\(--space-xxl\)/)
    assert.match(zone[1], /padding-top:\s*var\(--space-md\)/)
    assert.match(zone[1], /border-top:\s*1px solid var\(--glass-border\)/)
  }
})

test('edit templates keep save and delete disabled after submission until return', () => {
  for (const relativePath of ['pages/period/edit/edit.wxml', 'pages/memory/edit/edit.wxml']) {
    const wxml = readPageFile(relativePath)
    assert.match(wxml, /wx:if="\{\{!saving && !deleting && !submitted\}\}"[^>]*bindtap="save"[^>]*>保存</)
    assert.match(wxml, /wx:elif="\{\{saving\}\}"[^>]*>保存中\.\.\.</)
    assert.match(wxml, /wx:else class="btn-premium disabled button-primary"[^>]*aria-disabled="true"[^>]*>保存</)
    assert.doesNotMatch(wxml, /submitted[^>]*>保存中/)
    assert.match(wxml, /wx:if="\{\{isEdit && !deleting && !saving && !submitted\}\}"[^>]*bindtap="delete"[^>]*>删除此记录</)
    assert.match(wxml, /wx:elif="\{\{isEdit && deleting\}\}"[^>]*>删除中\.\.\.</)
    assert.match(wxml, /wx:elif="\{\{isEdit\}\}"[^>]*aria-disabled="true"[^>]*>删除此记录</)
  }
})

test('record lists clamp period notes to one line and give memory notes two warm-white body lines above single-line metadata', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="item-note">\{\{item\.note\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)
  assert.match(periodWxml, /class="memory-author"> · \{\{item\.authorLabel\}\}<\/text>/)
  assert.doesNotMatch(memoryWxml, /wx:for/)

  const periodNote = /\.item-note\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(periodNote, 'the period note keeps its compact preview')
  assert.match(periodNote[0], /white-space:\s*nowrap/)
  assert.match(periodNote[0], /overflow:\s*hidden/)
  assert.match(periodNote[0], /text-overflow:\s*ellipsis/)

  const memoryNote = /\.memory-note\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(memoryNote, 'the memory note is the primary journal text')
  assert.match(memoryNote[0], /font-size:\s*var\(--font-size-body\)/)
  assert.match(memoryNote[0], /color:\s*rgba\(255,255,255,0\.92\)/)
  assert.match(memoryNote[0], /display:\s*-webkit-box/)
  assert.match(memoryNote[0], /-webkit-line-clamp:\s*2/)
  assert.match(memoryNote[0], /-webkit-box-orient:\s*vertical/)
  assert.match(memoryNote[0], /white-space:\s*normal/)
  assert.match(memoryNote[0], /overflow:\s*hidden/)
  assert.match(memoryNote[0], /text-overflow:\s*ellipsis/)

  const memoryDate = /\.memory-date\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(memoryDate, 'date and author share secondary metadata')
  assert.match(memoryDate[0], /font-size:\s*var\(--font-size-caption\)/)
  assert.match(memoryDate[0], /color:\s*var\(--text-secondary\)/)
  assert.match(memoryDate[0], /white-space:\s*nowrap/)
  const row = /<view class="list-item"[^>]*bindtap="editMemory"[\s\S]*?<view class="ui-icon ui-icon-right/.exec(periodWxml)
  assert.ok(row, 'the memory journal row exists')
  assert.ok(row[0].indexOf('class="memory-note"') < row[0].indexOf('class="memory-date"'), 'journal text leads its date metadata')
  assert.match(row[0], /class="memory-date">\s*<text>\{\{item\.dayLabel\}\}<\/text>\s*<text wx:if="\{\{item\.authorLabel\}\}" class="memory-author"> · \{\{item\.authorLabel\}\}<\/text>/)

  assert.match(periodWxss, /\.item-left\s*\{[^}]*min-width:\s*0[^}]*\}/)
  assert.match(periodWxss, /\.memory-left\s*\{[^}]*min-width:\s*0[^}]*\}/)
  assert.match(periodWxss, /\.memory-info\s*\{[^}]*min-width:\s*0[^}]*\}/)
})

test('both edit pages reuse the shared confirmation sheet, back guard and reduced-motion probe', () => {
  for (const kind of ['period', 'memory']) {
    const wxml = readPageFile(`pages/${kind}/edit/edit.wxml`)
    const wxss = readPageFile(`pages/${kind}/edit/edit.wxss`)
    assert.match(wxml, /class="reduced-motion-probe" aria-hidden="true"/)
    assert.match(wxml, /class="day-sheet-mask sheet-\{\{confirmationPhase\}\}" bindtap="onConfirmationMask"/)
    assert.match(wxml, /class="sheet-close" bindtap="onConfirmationClose"/)
    assert.match(wxml, /class="btn-danger confirmation-action button-danger"[^>]*hover-class="btn-danger-hover"/)
    assert.match(wxml, /bindbeforeleave="onSheetSystemBack"/)
    assert.match(wxss, /\.confirmation-panel\s*\{/, `${kind} must import the shared confirmation styles`)
  }
})

function readPageFile(relativePath) {
  return readSource(path.join(__dirname, '..', relativePath), 'utf8')
}

function readRawPageFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}
