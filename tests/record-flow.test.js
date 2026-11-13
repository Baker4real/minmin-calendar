const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

test('period and memory list templates keep the REC-03 visible row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')

  // 日期行走统一显示格式；结束日期不详不在日期行再写一遍，时长位仍占住这几个字
  assert.match(periodWxml, /class="item-date">\{\{item\.dateLabel\}\}/)
  assert.doesNotMatch(periodWxml, /\{\{item\.startDate\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}"/)
  assert.doesNotMatch(periodWxml, /无备注/)
  // 已完成记录仍以「N天」呈现时长；进行中/结束日期不详由状态文案占住时长位
  assert.match(periodWxml, /wx:if="\{\{item\.status === 'known-end'\}\}" class="item-duration">\{\{item\.durationText\}\}/)
  assert.match(periodWxml, /class="item-duration ongoing">\{\{item\.durationText\}\}/)

  // 欢乐时光行在记录 tab；旧页不再渲染自己的列表
  assert.match(periodWxml, /class="memory-date">\{\{item\.dayLabel\}\}/)
  assert.doesNotMatch(periodWxml, /class="memory-date">\{\{item\.date\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)
  assert.doesNotMatch(memoryWxml, /wx:for="\{\{memories\}\}"/)
  assert.doesNotMatch(memoryWxml, /我们的欢乐时光'/)

  // 经量标签带 flow 变体类（玫瑰角色只落在经量上），症状标签保持中性的基础类
  assert.match(periodWxml, /wx:if="\{\{item\.flowLabel\}\}" class="item-tag flow">\{\{item\.flowLabel\}\}/)
  assert.match(periodWxml, /wx:for="\{\{item\.symptomLabels\}\}"[\s\S]*?class="item-tag"[\s\S]*?>\{\{tag\}\}/)
})

test('record list pages show load-failed retry copy and hide period stats while loading', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  assert.match(periodWxml, /loadFailed/)
  assert.match(periodWxml, /加载失败，点按重试/)
  // 旧欢乐时光页不再画自己的失败卡；记录 tab 的欢乐时光分段仍有重试
  assert.doesNotMatch(memoryWxml, /加载失败，点按重试/)
  assert.match(periodWxml, /欢乐时光加载失败/)
  // 首次加载失败不显示确信的 0：数字只在未失败或曾成功加载时呈现，否则落到 -- 占位
  assert.match(periodWxml, /wx:if="\{\{!loading && \(!loadFailed \|\| hasLoaded\)\}\}"[^>]*class="cycle-num">\{\{periods\.length\}\}/)
  assert.match(periodWxml, /wx:elif="\{\{!loading\}\}"[^>]*class="cycle-num">--</)
  assert.match(periodWxml, /class="cycle-label">平均周期</)
  assert.match(periodWxml, /wx:if="\{\{!loading && avgCycle\}\}" class="cycle-num">\{\{avgCycle\}\} 天</)
  assert.match(periodWxml, /class="cycle-label">平均持续</)
  assert.match(periodWxml, /wx:if="\{\{!loading && avgDuration\}\}" class="cycle-num">\{\{avgDuration\}\} 天</)
  assert.doesNotMatch(periodWxml, /持续天数/)
})

test('period overview columns all stack the label above the number', () => {
  // 三列同一上下顺序：任一列颠倒，标签行和数字行就会错位
  const periodWxml = readPageFile('pages/period/period.wxml')
  const items = periodWxml.match(/<view class="cycle-item">[\s\S]*?<\/view>/g)

  assert.equal(items.length, 3)
  for (const item of items) {
    const label = item.indexOf('class="cycle-label"')
    const num = item.indexOf('class="cycle-num"')
    assert.ok(label !== -1 && label < num, item)
  }
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
  assert.match(periodRow, /class="item-date">\{\{item\.dateLabel\}\}/)
  assert.doesNotMatch(periodRow, /endDateDisplay/)
  assert.doesNotMatch(legacy, /wx:for="\{\{memories\}\}"|class="empty-state"|bindtap="(?:addMemory|editMemory|loadData)"/)
})

test('period list failure retry is a recognizable operation, distinct from the quiet empty note', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 首次失败卡：说明句 + 玫瑰重试按钮；整卡可点并保留读屏名称
  assert.match(
    periodWxml,
    /wx:if="\{\{loadFailed && !hasLoaded && !loading\}\}" class="empty-state load-failed" bindtap="loadData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(periodWxml, /class="load-failed-text">经期记录加载失败</)
  assert.match(periodWxml, /class="retry-btn"(?: hover-class="retry-btn-hover")?>重试</)

  // 真空态仍是安静说明：不带重试按钮，也不可点；失败期间不显示断言式空态句（!loadFailed）
  const emptyBlock = /wx:elif="\{\{periods\.length === 0 && !loading && !loadFailed\}\}" class="empty-state">([\s\S]*?)<\/view>/.exec(periodWxml)
  assert.ok(emptyBlock, 'expected the genuine empty state block')
  assert.match(emptyBlock[1], /经期开始那天点「＋ 新增经期记录」，记两次以上就能预测下次/)
  assert.doesNotMatch(emptyBlock[1], /点上面按钮新增/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 重试按钮是玫瑰底海军字的小操作，触控目标 88rpx（750rpx 设计宽 = 44px@375px，非日历可点控件统一 88rpx 档）
  const retryRule = /\.retry-btn\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryRule, 'expected the .retry-btn rule')
  assert.match(retryRule[0], /background:\s*var\(--aurora-pink\)/)
  assert.match(retryRule[0], /color:\s*#0A0E27/)
  assert.match(retryRule[0], /min-height:\s*88rpx/)
})

test('period list keeps last data on refresh failure and offers retry in the list area', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 已成功加载过再失败：列表分支不再被失败态顶掉，重试行留在列表区域；
  // 列表不挂在失败卡的分支上，未同步时本机已保存的记录照常列出（#194）
  assert.match(periodWxml, /wx:if="\{\{periods\.length > 0 && !loading\}\}" class="period-year-list"/)
  assert.match(periodWxml, /wx:for="\{\{group\.records\}\}"[^>]*bindtap="editPeriod"/)
  assert.match(
    periodWxml,
    /wx:if="\{\{loadFailed && hasLoaded && !loading\}\}" class="list-retry" bindtap="loadData" aria-role="button" aria-label="刷新失败，点按重试"/
  )
  assert.match(periodWxml, /class="list-retry-text">刷新失败，正在显示上次的内容</)
  assert.match(periodWxml, /class="retry-btn"(?: hover-class="retry-btn-hover")?>重试</)

  // 重试行可点高度 ≥44px，说明句保持次级文字色（可读但不抢操作）
  const retryRow = /\.list-retry\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryRow, 'expected the .list-retry rule')
  assert.match(retryRow[0], /min-height:\s*88rpx/)
  const retryText = /\.list-retry-text\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(retryText, 'expected the .list-retry-text rule')
  assert.match(retryText[0], /color:\s*var\(--text-secondary\)/)
})

test('record tab memory segment mirrors the standalone memory list state contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 整卡失败态只在从未成功加载时出现；已加载后的失败保留列表，改走列表区重试行
  assert.match(
    periodWxml,
    /wx:if="\{\{memoryLoadFailed && !memoryHasLoaded && !memoryLoading\}\}" class="empty-state load-failed" bindtap="loadMemoryData" aria-role="button" aria-label="加载失败，点按重试"/
  )
  assert.match(periodWxml, /class="load-failed-text">欢乐时光加载失败</)
  assert.match(periodWxml, /class="retry-btn"(?: hover-class="retry-btn-hover")?>重试</)

  // 空列表说明保持安静：没有按钮、不可点；失败期间不显示断言式空态句
  const emptyBlock = /wx:elif="\{\{memories\.length === 0 && !memoryLoading && !memoryLoadFailed\}\}" class="empty-state">([\s\S]*?)<\/view>/.exec(periodWxml)
  assert.ok(emptyBlock, 'expected the memory segment empty state block')
  assert.match(emptyBlock[1], /想记的那天点「＋ 记欢乐时光」，写一句就留在日历上/)
  assert.doesNotMatch(emptyBlock[1], /点上面按钮新增/)
  assert.doesNotMatch(emptyBlock[1], /retry-btn|bindtap/)

  // 已加载后失败：列表保留，重试行留在列表区域；和经期段是同一条重试行，
  // 按下时说明文字在极光上同样读得清（issue #166）
  assert.match(
    periodWxml,
    /wx:if="\{\{memoryLoadFailed && memoryHasLoaded && !memoryLoading\}\}" class="list-retry" bindtap="loadMemoryData" aria-role="button" aria-label="刷新失败，点按重试" hover-class="list-retry-hover"/
  )
  assert.equal((periodWxml.match(/class="list-retry-text">刷新失败，正在显示上次的内容</g) || []).length, 2,
    'both segments explain the refresh failure with the same retry row text')

  // 欢乐时光骨架是圆点变体（经期侧是 pill，形态差异刻意保留），复用已注册的 skeletonPulse
  assert.match(periodWxml, /wx:if="\{\{memoryLoading\}\}" class="skeleton-card"/)
  assert.match(periodWxml, /class="skeleton-dot"/)
  const dotRule = /\.skeleton-dot\s*\{[^}]*skeletonPulse[^}]*\}/.exec(periodWxss)
  assert.ok(dotRule, 'expected the base .skeleton-dot rule')
  assert.match(dotRule[0], /animation:\s*skeletonPulse 2\.4s ease-in-out infinite/)
  // RM 下骨架圆点静止（与经期侧 skeleton-line/skeleton-pill 同块登记）
  const rmBlock = periodWxss.slice(periodWxss.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(rmBlock, /\.skeleton-dot/)
})

test('record tab memory segment renders month cards with the grouped row contract', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')

  // 月份卡：复用 app 级玻璃卡 premium-card，列表分支遍历分组数组；四态条件仍挂在扁平 memories 上
  assert.match(
    periodWxml,
    /wx:if="\{\{memories\.length > 0 && !memoryLoading\}\}" class="memory-month-list"/
  )
  assert.match(periodWxml, /class="premium-card month-card" wx:for="\{\{memoryGroups\}\}" wx:key="key"/)

  // 卡头（issue #109）：点按切换展开/收起，按 button 朗读，aria-expanded 与展开状态同条件绑定；
  // 右侧是文字「展开/收起」（不用 ›/⌄ 字形），随状态由分组数据绑定
  assert.match(
    periodWxml,
    /class="month-header" bindtap="toggleMonth" data-key="\{\{group\.key\}\}" aria-role="button" aria-label="\{\{group\.ariaLabel\}\}" aria-expanded="\{\{group\.expanded\}\}"/
  )
  assert.match(periodWxml, /class="month-header-text">\{\{group\.title\}\}/)
  assert.match(periodWxml, /class="month-toggle">\{\{group\.toggleLabel\}\}/)
  // 收起的卡头显示该月第一条备注的单行摘要；展开时不重复渲染。溢出截断，读屏名走 ariaLabel
  assert.match(
    periodWxml,
    /wx:if="\{\{!group\.expanded && group\.excerpt\}\}" class="month-excerpt" aria-hidden="true">\{\{group\.excerpt\}\}/
  )
  const excerptRule = /\.month-excerpt\s*\{[^}]*\}/.exec(periodWxss)
  assert.ok(excerptRule, 'expected the collapsed month excerpt rule')
  assert.match(excerptRule[0], /white-space:\s*nowrap/)
  assert.match(excerptRule[0], /overflow:\s*hidden/)
  assert.match(excerptRule[0], /text-overflow:\s*ellipsis/)

  // 行：收起时组内行不渲染（wx:if，不是 css 隐藏，读屏不会念出来）；
  // 定位用记录 id；可见日期走显示格式，读屏名由月份分组按记录拼好（issue #157），
  // ISO 日期仍留在行数据里供编辑跳转
  assert.match(
    periodWxml,
    /wx:if="\{\{group\.expanded\}\}" wx:for="\{\{group\.records\}\}" wx:key="_id" bindtap="editMemory" data-id="\{\{item\._id\}\}" aria-role="button" aria-label="\{\{item\.ariaLabel\}\}"/
  )
  assert.match(periodWxml, /class="memory-date">\{\{item\.dayLabel\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)

  // 展开/收起即时切换、无动画：卡头与切换文字的基类规则不引入 transition/animation
  for (const selector of ['month-header', 'month-toggle']) {
    const rule = new RegExp(`\\.${selector}\\s*\\{[^}]*\\}`).exec(periodWxss)
    assert.ok(rule, `expected the .${selector} rule`)
    assert.doesNotMatch(rule[0], /transition|animation/)
  }
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
  assert.match(periodEditWxml, /wx:else class="btn-premium disabled"[^>]*>保存</)
  assert.match(memoryEditWxml, /wx:else class="btn-premium disabled"[^>]*>保存</)
  assert.match(periodEditWxml, /end="\{\{maxDate\}\}"/)
  assert.match(periodEditWxml, /start="\{\{startDate\}\}"/)
  // 结束日期选择器只在已知结束状态出现；开始日期选择器上限为今天
  assert.match(periodEditWxml, /<view class="form-item" wx:if="\{\{status === 'known-end'\}\}"[^>]*>/)
  assert.match(periodEditWxml, /bindtap="selectStatus"/)
  assert.match(periodEditWxml, /aria-label="经期状态/)
  assert.match(periodEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /maxlength="500"/)
  assert.match(memoryEditWxml, /wx:if="\{\{isEdit\}\}"[\s\S]*编辑欢乐时光/)
  assert.match(memoryEditWxml, /wx:else[\s\S]*新增欢乐时光/)
})

test('record edit templates keep fields and delete locked while saving', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  // 保存进行中：日期选择器与备注输入带原生 disabled，与 saving 同条件
  const periodLocked = periodEditWxml.match(/\sdisabled="\{\{saving\}\}"/g) || []
  const memoryLocked = memoryEditWxml.match(/\sdisabled="\{\{saving\}\}"/g) || []
  assert.equal(periodLocked.length, 3, 'period date pickers and note input must be disabled while saving')
  assert.equal(memoryLocked.length, 2, 'memory date picker and note input must be disabled while saving')
  for (const wxml of [periodEditWxml, memoryEditWxml]) {
    assert.match(wxml, /wx:if="\{\{isEdit && !deleting && !saving && !submitted\}\}"[^>]*bindtap="delete"/)
  }

  // 经量与症状芯片在保存中暴露禁用类与 aria-disabled；行为由平台测试覆盖
  const chipBlocks = periodEditWxml.match(/class="(flow-chip|symptom-chip)[^"]*"[^>]*aria-disabled="\{\{saving\}\}"/g) || []
  assert.equal(chipBlocks.length >= 2, true, 'flow and symptom chips must expose saving-disabled state')
})

test('record edit notes are multi-line textareas with the unchanged 500-char cap', () => {
  const periodEditWxml = readPageFile('pages/period/edit/edit.wxml')
  const memoryEditWxml = readPageFile('pages/memory/edit/edit.wxml')

  for (const wxml of [periodEditWxml, memoryEditWxml]) {
    assert.match(wxml, /<textarea[^>]*maxlength="500"[^>]*auto-height/)
    assert.doesNotMatch(wxml, /<input[^>]*aria-label="备注"/)
  }
})

// issue #156：日期错误常驻在所属字段的 picker 下方，同时并进该 picker 的读屏名，
// 读屏能听出是开始日、结束日还是欢乐时光日期出错；字段容器带页面滚动锚点
test('edit forms keep each date error under its own picker and inside that picker screen-reader name', () => {
  const cases = [
    ['pages/period/edit/edit.wxml', 'startDate', '选择开始日期'],
    ['pages/period/edit/edit.wxml', 'endDate', '选择结束日期'],
    ['pages/memory/edit/edit.wxml', 'date', '选择日期']
  ]
  for (const [file, field, name] of cases) {
    const wxml = readPageFile(file)
    const opening = new RegExp(`<view class="form-item"[^>]*\\sid="field-${field}"[^>]*>`).exec(wxml)
    assert.ok(opening, `${file} marks the ${field} form item as #field-${field}`)
    const nextItem = wxml.indexOf('class="form-item', opening.index + opening[0].length)
    const item = wxml.slice(opening.index, nextItem === -1 ? undefined : nextItem)
    assert.ok(
      item.includes(`aria-label="${name}{{fieldErrors.${field} ? '，' + fieldErrors.${field} : ''}}"`),
      `${file} ${field} picker reads its error after the field name`
    )
    const errorLine = `<text wx:if="{{fieldErrors.${field}}}" class="field-error" aria-role="alert">{{fieldErrors.${field}}}</text>`
    const pickerEnd = item.indexOf('</picker>')
    assert.ok(pickerEnd !== -1 && item.indexOf(errorLine) > pickerEnd, `${file} ${field} error line follows its picker`)
  }

  // 两个编辑页共用 app.wxss 里的一条 .field-error，页面不各写一份
  const rule = /\.field-error\s*\{([^}]*)\}/.exec(readPageFile('app.wxss'))
  assert.ok(rule, 'app.wxss defines the shared .field-error')
  assert.match(rule[1], /display:\s*block/)
  assert.match(rule[1], /color:\s*#F97373/)
  assert.match(rule[1], /font-size:\s*var\(--font-size-caption\)/)
  for (const file of ['pages/period/edit/edit.wxss', 'pages/memory/edit/edit.wxss']) {
    assert.doesNotMatch(readPageFile(file), /\.field-error\b/, `${file} reuses the shared .field-error`)
  }
})

test('period edit fields run start, status, end date, flow, symptoms, then note', () => {
  const wxml = readPageFile('pages/period/edit/edit.wxml')
  const labels = [...wxml.matchAll(/<text class="form-label">([^<]+)<\/text>/g)].map(match => match[1])
  assert.deepEqual(labels, ['开始日期', '经期状态', '结束日期', '经量', '症状', '备注'])
})

test('period edit binds status and length hints beside their fields', () => {
  const wxml = readPageFile('pages/period/edit/edit.wxml')
  assert.match(wxml, /经期状态[\s\S]*class="form-hint">\{\{statusHint\}\}/)
  const endLabel = wxml.indexOf('结束日期')
  const dayText = wxml.indexOf('{{periodDayCountText}}')
  const lengthHint = wxml.indexOf('{{periodLengthHint}}')
  const noteLabel = wxml.indexOf('备注')
  assert.ok(endLabel !== -1 && endLabel < dayText && dayText < lengthHint && lengthHint < noteLabel)
})

test('both edit pages keep the delete area apart from save', () => {
  for (const [wxmlPath, wxssPath] of [
    ['pages/period/edit/edit.wxml', 'pages/period/edit/edit.wxss'],
    ['pages/memory/edit/edit.wxml', 'pages/memory/edit/edit.wxss']
  ]) {
    const wxml = readPageFile(wxmlPath)
    const wxss = readPageFile(wxssPath)
    assert.match(
      wxml,
      /<view class="btns">[\s\S]*<\/view>\s*<view wx:if="\{\{isEdit\}\}" class="delete-zone">[\s\S]*bindtap="delete"[\s\S]*删除此记录<\/view>/
    )
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
    assert.match(wxml, /wx:else class="btn-premium disabled"[^>]*aria-disabled="true"[^>]*>保存</)
    assert.doesNotMatch(wxml, /submitted[^>]*>保存中/)
    assert.match(wxml, /wx:if="\{\{isEdit && !deleting && !saving && !submitted\}\}"[^>]*bindtap="delete"[^>]*>删除此记录</)
    assert.match(wxml, /wx:elif="\{\{isEdit && deleting\}\}"[^>]*>删除中\.\.\.</)
    assert.match(wxml, /wx:elif="\{\{isEdit\}\}"[^>]*aria-disabled="true"[^>]*>删除此记录</)
  }
})

test('record lists preview long notes as one clamped line without displacing later records', () => {
  const periodWxml = readPageFile('pages/period/period.wxml')
  const memoryWxml = readPageFile('pages/memory/memory.wxml')
  const periodWxss = readPageFile('pages/period/period.wxss')
  const memoryWxss = readPageFile('pages/memory/memory.wxss')

  // 列表绑定真实备注（本人写下的文字原样显示），显示与否由 wx:if 决定。
  // 欢乐时光列表在记录 tab；旧页不再渲染备注行
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="item-note">\{\{item\.note\}\}/)
  assert.match(periodWxml, /wx:if="\{\{item\.note\}\}" class="memory-note">\{\{item\.note\}\}/)
  assert.doesNotMatch(memoryWxml, /wx:for/)

  // 长备注只显示短预览：单行截断 + 省略号，换行折叠成一行，不把后面的记录挤出屏幕
  const clamps = [
    [periodWxss, '.item-note'],
    [memoryWxss, '.memory-note']
  ]
  for (const [wxss, selector] of clamps) {
    const rule = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`).exec(wxss)
    assert.ok(rule, `${selector} rule exists`)
    assert.match(rule[0], /white-space:\s*nowrap/)
    assert.match(rule[0], /overflow:\s*hidden/)
    assert.match(rule[0], /text-overflow:\s*ellipsis/)
  }

  // 截断生效的前提：备注所在的弹性列允许收缩到内容宽度以下
  assert.match(periodWxss, /\.item-left\s*\{[^}]*min-width:\s*0[^}]*\}/)
  assert.match(memoryWxss, /\.memory-left\s*\{[^}]*min-width:\s*0[^}]*\}/)
  assert.match(memoryWxss, /\.memory-info\s*\{[^}]*min-width:\s*0[^}]*\}/)
})

function readPageFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
}
