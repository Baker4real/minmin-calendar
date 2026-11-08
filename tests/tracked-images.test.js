const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const test = require('node:test')

// 仓库和 issue 都是公开的，开发者工具截图默认带着真实房间的记录。
// images/ 以外每张入库的图都登记在这里，写明图里是什么、为什么没有真实记录。
// 证据规则见 docs/agents/issue-tracker.md「Close and evidence fallbacks」。

const repoRoot = path.join(__dirname, '..')
// 小程序自己的图标，随包上传。
const APP_IMAGE_ROOT = 'images/'
const IMAGE_FILE = /\.(?:png|jpe?g|gif|webp|svg|bmp|heic)$/i
const ALLOWED_IMAGES = {
  'docs/evidence/issue-122/press-danger-row.png': '设置页按住解除绑定的那一行，没有记录数据',
  // #149–#152：430×932 模拟器里换上替身房间（房间码 ABC123、替身经期与欢乐时光）后的裁剪图，不是真实房间。
  'docs/evidence/issue-149/welcome-bar-shown-430x932.png': '替身房间配对后首次进首页：欢迎条在状态行下、周头上；「经期第 3 天」来自替身记录',
  'docs/evidence/issue-149/welcome-bar-gone-on-return-430x932.png': '离开首页再回来，欢迎条已移除；状态行来自替身记录',
  'docs/evidence/issue-149/bind-created-share-primary-430x932.png': '刚创建房间：「发给 TA」是主按钮、「进入应用」是次按钮；房间码 ABC123 是替身码',
  'docs/evidence/issue-149/bind-bound-enter-primary-430x932.png': '已绑定房间且跳首页失败：「进入应用」是主按钮；房间码 ABC123 是替身码',
  'docs/evidence/issue-150/export-confirm-430x932.png': '导出确认弹窗的文案，没有记录数据',
  'docs/evidence/issue-150/export-copied-toast-430x932.png': '选「复制 JSON」后的「已复制到剪贴板」提示（模拟复制），背后是设置页，没有记录数据',
  'docs/evidence/issue-151/periods-failed-retry-row-430x932.png': '只有经期同步失败时的行内重试，没有记录数据',
  'docs/evidence/issue-151/periods-failed-nav-pill-430x932.png': '同步胶囊占据顶栏标题位，月份与状态行完整；替身房间，状态行没有记录数据',
  'docs/evidence/issue-151/periods-unsynced-prediction-sheet-430x932.png': '经期从未同步时预测说明只说暂不预测，没有记录数据',
  'docs/evidence/issue-152/future-plain-sheet-430x932.png': '未来普通日弹层：说明还没到这一天、不给记录动作，没有记录数据',
  'docs/evidence/issue-152/future-predicted-sheet-430x932.png': '未来「预」日弹层：先说预测再说明未到；预测日来自替身记录',
  'docs/evidence/issue-152/future-holiday-sheet-430x932.png': '未来节日（元旦）弹层，没有记录数据',
  'docs/evidence/issue-152/today-sheet-430x932.png': '今天的弹层：记经期、记欢乐时光两个动作，没有记录数据',
  'docs/evidence/issue-152/past-sheet-430x932.png': '过去日期弹层：补记经期、补记欢乐时光两个动作，没有记录数据',
  'docs/evidence/issue-152/empty-state-430x932.png': '零记录替身房间的首页引导，没有记录数据',
  // #153–#158：同样是 430×932 替身房间里的裁剪图；日期上的经期、♥、「预」和备注都来自替身记录。
  'docs/evidence/issue-153/merged-info-row-430x932.png': '清爽密度合并信息行：节日 + ♥、「班」+ ♥、♥ +「预」各在日期下同一行；标记来自替身记录',
  'docs/evidence/issue-153/scroll-fallback-430x932.png': '放不下的月份改为页面滚动：月份导航与状态行吸顶，记录入口可达；标记来自替身记录',
  'docs/evidence/issue-153/band-shapes-smallest-rows-430x932.png': '最小行高下的经期色带形状（单日、跨周收口、连续段）；色带来自替身记录',
  'docs/evidence/issue-154/help-close-button-430x932.png': '设置页使用说明弹层右上角的关闭 ×，没有记录数据',
  'docs/evidence/issue-154/help-closed-tabbar-back-430x932.png': '关闭使用说明后底部 tabBar 恢复，没有记录数据',
  'docs/evidence/issue-155/day-actions-panel-430x932.png': '过去一天的当日操作弹层（补记经期、补记欢乐时光），没有记录数据',
  'docs/evidence/issue-155/prediction-panel-430x932.png': '预测说明弹层；预测日期与周期来自替身记录',
  'docs/evidence/issue-155/help-panel-430x932.png': '设置页使用说明弹层的正文，没有记录数据',
  'docs/evidence/issue-157/day-detail-paired-430x932.png': '替身房间同一天的三条经期与两条欢乐时光，带作者和备注摘要；全部是替身记录，备注以「替身」开头',
  'docs/evidence/issue-157/records-memory-month-430x932.png': '记录页欢乐时光月份卡里同一天的两条；替身记录',
  'docs/evidence/issue-158/prediction-sheet-430x932.png': '预测说明首句「前后 N 天是可能开始的窗口」与「不是医疗建议」；预测来自替身记录',
  'docs/evidence/issue-158/records-cycle-overview-430x932.png': '记录页经期分段的周期概览卡；数字来自替身记录',
  // #156、#158 补跑与 #159：仍是 430×932 替身房间；表单里的日期是脚本按当天推算填的，备注以「替身」开头。
  'docs/evidence/issue-156/period-end-missing-430x932.png': '经期编辑页选「已结束」不填结束日期时，错误常驻在结束日期下；没有记录数据',
  'docs/evidence/issue-156/both-future-430x932.png': '开始日和结束日都晚于今天时两个字段下各有错误；日期是脚本填的未来日子，没有记录数据',
  'docs/evidence/issue-156/fix-start-430x932.png': '把开始日改对后只剩结束日期的错误；日期是脚本填的，没有记录数据',
  'docs/evidence/issue-156/memory-future-430x932.png': '欢乐时光编辑页日期晚于今天时，错误常驻在日期下；日期是脚本填的，没有记录数据',
  'docs/evidence/issue-156/draft-restored-430x932.png': '校验失败后离开再进来，草稿恢复（经量、症状与 500 字替身备注都在）；没有记录数据',
  'docs/evidence/issue-158/edit-hints-known-end-430x932.png': '经期编辑页「共 N 天」与时长确认提示；日期是脚本填的，「通常的 5 天」来自替身记录',
  'docs/evidence/issue-158/edit-hints-unknown-end-430x932.png': '经期编辑页选「结束日期不详」时的后果说明，没有记录数据',
  'docs/evidence/issue-158/home-unbound-430x932.png': '首页未绑定画面：说明文字与「去绑定」按钮之间有间距，没有记录数据',
  'docs/evidence/issue-158/home-load-failed-430x932.png': '首页日历加载失败画面：说明文字与「重试」按钮之间有间距，没有记录数据',
  'docs/evidence/issue-159/tabbar-home-430x932.png': '在首页时的底部 tabBar：记录 tab 是未选中的列表图标，没有记录数据',
  'docs/evidence/issue-159/tabbar-records-430x932.png': '在记录页时的底部 tabBar：记录 tab 是选中的列表图标，没有记录数据',
  'docs/evidence/issue-159/home-compact-430x932.png': '清爽密度首页整屏：「记经期」用色带样本；状态行与「预」来自替身记录',
  'docs/evidence/issue-159/home-full-430x932.png': '完整密度首页整屏（带农历）：「记经期」用色带样本；状态行与「预」来自替身记录',
  'docs/evidence/issue-159/plate-ongoing-430x932.png': '进行中时「经期第 N 天 · 记结束」只在空格处换行；天数来自替身记录',
  'docs/evidence/issue-159/day-actions-period-430x932.png': '当日操作弹层里「补记经期」用同一个色带样本，没有记录数据',
  'docs/evidence/issue-159/legend-period-row-430x932.png': '图例里的经期色带样本，没有记录数据',
  'docs/evidence/issue-159/bound-2001-430x932.png': '2001年1月：上一月箭头禁用，没有记录数据',
  'docs/evidence/issue-159/bound-2035-430x932.png': '2035年12月：下一月箭头禁用，没有记录数据',
  // #162：把 worktree 当独立项目打开的模拟器窗口，回读视口 390×844（没切机型）。图里是换上替身房间后今天所在的那一行
  // 或图例；经期、♥、「预」都来自按当天推算的替身记录。
  'docs/evidence/issue-162/today-capsule-full-390x844.png': '完整密度今天那一行：日期外的浅玫瑰小胶囊，农历在胶囊外；♥ 来自替身记录',
  'docs/evidence/issue-162/today-capsule-compact-390x844.png': '清爽密度今天那一行：日期外的浅玫瑰小胶囊；♥ 来自替身记录',
  'docs/evidence/issue-162/today-capsule-heart-predict-full-390x844.png': '完整密度今天带 ♥ 和「预」：标记在胶囊下面；都来自替身记录',
  'docs/evidence/issue-162/today-capsule-heart-predict-compact-390x844.png': '清爽密度今天带 ♥ 和「预」：标记在胶囊下面；都来自替身记录',
  'docs/evidence/issue-162/today-period-run-open-full-390x844.png': '完整密度进行中经期连到今天：今天只描色带上下沿，开口端不描；经期是替身记录',
  'docs/evidence/issue-162/today-period-run-open-compact-390x844.png': '清爽密度进行中经期连到今天：今天只描色带上下沿，开口端不描；经期是替身记录',
  'docs/evidence/issue-162/today-period-single-full-390x844.png': '完整密度今天是一天的经期：单日色带描四边，没有第二枚胶囊；经期是替身记录',
  'docs/evidence/issue-162/today-period-single-compact-390x844.png': '清爽密度今天是一天的经期：单日色带描四边，没有第二枚胶囊；经期是替身记录',
  'docs/evidence/issue-162/legend-today-period-390x844.png': '日历图例：今天和经期样本是铺网格玻璃底的 72rpx 日历格，没有记录数据',
  // #163：同样是 worktree 项目窗口，视口 390×844（没切机型）。整屏图里的经期、♥、提醒和列表都来自按当天推算的替身记录，
  // 房间是替身房间；弹层整屏图的底下是被遮罩模糊的同一份替身首页或设置页。
  'docs/evidence/issue-163/aurora-home-390x844.png': '首页整屏：静止基底上的三个极光色团，同步失败重试行在玻璃回退底上；经期与状态行来自替身记录',
  'docs/evidence/issue-163/aurora-home-skeleton-390x844.png': '首页首次加载的日历骨架屏：骨架格画在极光层之上；替身云端故意慢答，没有记录数据',
  'docs/evidence/issue-163/aurora-home-no-room-390x844.png': '首页未绑定房间态：玫瑰心与说明文字在极光层之上；替身里没有房间，没有记录数据',
  'docs/evidence/issue-163/aurora-records-scrolled-end-390x844.png': '记录页滚到底：极光层仍铺满视口，底部没有色带分层；列表是替身经期记录',
  'docs/evidence/issue-163/aurora-period-edit-390x844.png': '新增经期编辑页整屏的极光背景，表单是新建空白记录，没有记录数据',
  'docs/evidence/issue-163/aurora-memory-edit-390x844.png': '新增欢乐时光编辑页整屏的极光背景，表单是新建空白记录，没有记录数据',
  'docs/evidence/issue-163/sheet-day-390x844.png': '首页当日操作弹层：88% 海军加 8px 模糊的遮罩、海军实底面板；底下是替身首页',
  'docs/evidence/issue-163/sheet-month-picker-390x844.png': '首页选择月份弹层：同一遮罩与面板材质；底下是替身首页，没有记录数据',
  'docs/evidence/issue-163/sheet-tools-menu-390x844.png': '首页工具菜单弹层：同一遮罩与面板材质；底下是替身首页，菜单项没有记录数据',
  'docs/evidence/issue-163/sheet-legend-390x844.png': '首页日历图例弹层：同一遮罩与面板材质；图例是固定样本，没有记录数据',
  'docs/evidence/issue-163/sheet-settings-help-390x844.png': '设置页使用说明弹层：遮罩同首页（88% 海军 + 8px 模糊）；底下设置页的房间是替身房间',
  'docs/evidence/issue-163/row-refresh-retry-390x844.png': '首页「欢乐时光同步失败，点按重试」行：玫瑰字在玻璃回退底上；失败由替身云端造出',
  'docs/evidence/issue-163/row-reminder-390x844.png': '首页「这几天可能开始」提醒行：左侧色条与「记录」按钮在玻璃回退底上；预测来自替身记录',
  'docs/evidence/issue-163/row-segment-control-390x844.png': '记录页「经期 / 欢乐时光」分段控件：平铺浅白层叠在玻璃回退底上，没有记录数据',
  'docs/evidence/issue-163/row-bind-error-retry-390x844.png': '绑定页房间校验失败的警示红错误条与重试按钮，失败由替身云端造出，没有房间码',
  // #164：同样是 worktree 项目窗口，视口 390×844（没切机型），替身房间。记录页里的日期、天数和长备注来自按当天推算的替身记录。
  'docs/evidence/issue-164/month-pill-two-digit-390x844.png': '月份导航「2026年11月」：月份胶囊最小宽 320rpx，没有记录数据',
  'docs/evidence/issue-164/month-pill-one-digit-390x844.png': '月份导航「2026年9月」：胶囊与两位数月份同宽、同位置，没有记录数据',
  'docs/evidence/issue-164/records-period-rhythm-390x844.png': '记录页经期段：分段控件、周期概览、新增按钮、列表之间都是 20rpx；数字、日期与长备注来自替身记录',
  'docs/evidence/issue-164/records-memory-rhythm-390x844.png': '记录页欢乐时光段：第一块离分段控件同样 20rpx；月份卡与长备注来自替身记录',
  'docs/evidence/issue-164/settings-first-group-390x844.png': '设置页第一组离顶栏 24rpx；房间码是替身房间的假码，没有记录数据',
  'docs/evidence/issue-164/settings-danger-zone-390x844.png': '设置页「解除绑定」离「关于」组 48rpx，没有记录数据',
  'docs/evidence/issue-164/period-edit-save-gap-390x844.png': '新增经期页：保存按钮离表单卡 20rpx，没有记录数据',
  'docs/evidence/issue-164/memory-edit-error-long-note-390x844.png': '欢乐时光编辑页：脚本填的未来日期报错常驻在日期下，长备注是替身文字，都在卡片内，没有记录数据',
  // #166：worktree 项目窗口，视口 390×844（没切机型），替身房间；刷新失败由替身云端造出。动画时序看 computedStyle 读回，图只证明终态。
  'docs/evidence/issue-166/sheet-tools-menu-open-390x844.png': '首页工具菜单弹层停在打开态：标题行和内容块都已到位，内容块晚标题一拍进场；菜单项没有记录数据',
  'docs/evidence/issue-166/sheet-settings-help-open-390x844.png': '设置页使用说明弹层停在打开态：标题与关闭在上，说明文字在内容块里；固定文案，没有记录数据',
  'docs/evidence/issue-166/records-period-list-retry-390x844.png': '记录页经期段刷新失败重试行（静止）：玻璃回退底加 0.1 白描边，说明文字读得清；没有记录数据',
  'docs/evidence/issue-166/records-period-list-retry-pressed-390x844.png': '同一行按住时：描边提亮到 0.14、平涂层加深、缩到 0.97；没有记录数据',
  'docs/evidence/issue-166/records-memory-list-retry-390x844.png': '记录页欢乐时光段刷新失败：和经期段是同一条重试行；没有记录数据',
  // #165：worktree 项目窗口，视口 390×844（没切机型），替身房间；经期、「预」和状态行来自按当天推算的替身记录。
  // 翻月滑入与光晕的时序看 page data / computedStyle 读回，图只证明落定后的终态：格子回到原位、没有残留的位移、淡出或光晕。
  'docs/evidence/issue-165/month-flip-next-settled-compact-390x844.png': '清爽密度翻到下一月落定后的整屏：格子与周头对齐，没有残留位移或淡出；「预」来自替身记录',
  'docs/evidence/issue-165/month-flip-prev-settled-full-390x844.png': '完整密度翻到上一月落定后的整屏：农历与节日在格子里，几何不变；经期来自替身记录',
  'docs/evidence/issue-165/back-to-today-settled-compact-390x844.png': '回到今天之后：今天的月份即时换上；今天在进行中的经期色带上（没有胶囊），光晕落回后色带与日期恢复原样；经期与 ♥ 来自替身记录',
  'docs/evidence/issue-165/prediction-close-settled-compact-390x844.png': '关掉预测说明之后：当月的「预」在光晕落回后恢复原样、位置不变；预测来自替身记录',
  // #167：worktree 项目窗口，视口 390×844（没切机型），替身房间；保存走替身云端，经期与 ♥ 来自按当天推算的替身记录。
  // 首页反馈的按住、等待、淡入/放大和绑定页的显现靠 page data / computedStyle 采样读回，图只证明落定后的终态。
  'docs/evidence/issue-167/memory-saved-heart-settled-390x844.png': '新增欢乐时光保存成功、回到首页后的日历（落定）：♥ 在保存的那天（今天，叠在进行中经期的色带上），另一个 ♥ 是更早的替身记录；都来自替身记录',
  'docs/evidence/issue-167/period-ended-band-settled-390x844.png': '记结束补上结束日、回到首页后的日历（落定）：这段经期三格色带连续到今天，没有残留的透明或位移；经期与 ♥ 来自替身记录',
  'docs/evidence/issue-167/bind-first-reveal-390x844.png': '未绑定首屏显现后（落定）：♥ 下的大标题、说明和创建/加入卡同一刻显现后的样子；替身未绑定状态，没有记录数据',
  'docs/evidence/issue-167/bind-room-created-390x844.png': '刚建好房间（落定）：已绑定卡、「把房间码发给 TA」、「发给 TA」主按钮与「进入应用」幽灵次按钮；房间码 ABC123 是替身码，没有记录数据',
  // #167 失败路径（epic #161 评审 P6）：同样的窗口与视口；替身云端对 dataOp:add 注入网络失败，回查确认没写入。
  'docs/evidence/issue-167/memory-add-failed-modal-390x844.png': '新增欢乐时光被网络失败挡下、回查确认没写入后，编辑页上的系统弹窗「保存失败／没有保存成功，请重试／知道了」，裁到弹窗那一条；没有记录数据',
  'docs/evidence/issue-167/memory-add-failed-home-390x844.png': '同一次失败点「知道了」、返回首页后的日历（清爽密度，落定）：今天没有新 ♥，没有格子点亮；更早的 ♥ 与「预」来自替身记录',
  'docs/evidence/issue-167/period-add-failed-home-390x844.png': '记经期新增被网络失败挡下、返回首页后的日历（清爽密度，落定）：今天没有色带，没有格子点亮；♥ 与「预」来自替身记录',
  // #168：epic #161 整体验收。worktree 项目窗口，视口 390×844（没切机型），替身房间与按当天推算的替身记录；
  // 运行源码与提交一致，同目录 capture-metadata.json 记着采集的 HEAD、app.*、pages/**、utils/** 的 SHA-256 与每张图的来历。图都是落定后的终态。
  'docs/evidence/issue-168/home-plain-today-full-390x844.png': '首页整屏（完整密度）：今天戴胶囊、不在经期；♥ 与「预」来自替身记录',
  'docs/evidence/issue-168/home-plain-today-compact-calendar-390x844.png': '清爽密度的首页日历（月份导航到日历格）：今天戴胶囊；♥ 与「预」来自替身记录',
  'docs/evidence/issue-168/home-period-today-full-calendar-390x844.png': '完整密度、今天在进行中的经期里：今天落在玫瑰色带上，不再加胶囊；色带与 ♥ 来自替身记录',
  'docs/evidence/issue-168/home-period-today-compact-calendar-390x844.png': '清爽密度、今天在进行中的经期里：今天落在色带上，不加胶囊；色带与 ♥ 来自替身记录',
  'docs/evidence/issue-168/month-flip-prev-settled-full-390x844.png': '完整密度翻到上一月落定后的整屏：「回到今天」行出现，格子已到位；节日与调休是公开日历，经期与 ♥ 来自替身记录',
  'docs/evidence/issue-168/sheet-legend-open-390x844.png': '日历图例弹层停在打开态：六项样本与说明；固定文案，没有记录数据',
  'docs/evidence/issue-168/sheet-month-picker-open-390x844.png': '选择月份弹层停在打开态：当前月是选中的玫瑰格；没有记录数据',
  'docs/evidence/issue-168/sheet-day-open-390x844.png': '点今天打开的当日弹层：今天的日期与农历，「记经期」「记欢乐时光」两项；没有记录数据',
  'docs/evidence/issue-168/sheet-tools-menu-open-390x844.png': '工具菜单弹层停在打开态：图例、预测说明、本月小结三项；没有记录数据',
  'docs/evidence/issue-168/sheet-prediction-open-390x844.png': '预测说明弹层停在打开态：预计开始日、窗口、平均周期与持续天数都由替身记录推算',
  'docs/evidence/issue-168/sheet-recap-open-390x844.png': '本月小结弹层停在打开态：经期、欢乐时光条数、下次预测与欢乐时光摘要都来自替身记录',
  'docs/evidence/issue-168/memory-saved-heart-settled-full-390x844.png': '新增欢乐时光保存成功、回到首页后的日历（完整密度，落定）：今天多了 ♥，另一个 ♥ 是更早的替身记录',
  'docs/evidence/issue-168/period-ended-band-settled-full-390x844.png': '给进行中的经期记结束、回到首页后的日历（完整密度，落定）：三格色带连续到今天；经期与 ♥ 来自替身记录',
  'docs/evidence/issue-168/bind-first-reveal-390x844.png': '未绑定首屏显现后（落定）：♥、大标题、说明和创建/加入卡；替身未绑定状态，没有记录数据',
  'docs/evidence/issue-168/bind-room-created-390x844.png': '刚建好房间（落定）：已绑定卡、「发给 TA」主按钮与「进入应用」幽灵次按钮；房间码 ABC123 是替身码，没有记录数据',
  'docs/evidence/issue-168/records-period-390x844.png': '记录 tab 经期段：周期概览卡与三条经期，日期、作者、标签和备注都来自替身记录',
  'docs/evidence/issue-168/records-memory-390x844.png': '记录 tab 欢乐时光段：按月份分组的两条欢乐时光，备注来自替身记录',
  'docs/evidence/issue-168/settings-390x844.png': '设置页整屏：房间码 ABC123 是替身码，「TA 已加入」是替身房间状态；没有记录数据',
  'docs/evidence/issue-168/settings-help-open-390x844.png': '设置页使用说明弹层停在打开态：固定文案，没有记录数据',
  'docs/evidence/issue-168/period-edit-ongoing-390x844.png': '经期编辑页打开进行中的替身经期：选中的状态、经量和症状芯片带静态玫瑰光；日期与备注来自替身记录',
  'docs/evidence/issue-168/memory-edit-existing-390x844.png': '欢乐时光编辑页打开一条替身记录：日期与备注「替身：一起散步」来自替身记录',
}

// 读 index 而不是工作区：提交钩子里跑时，读到的正是这次要提交的文件。
function trackedImages() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(file => IMAGE_FILE.test(file))
}

test('every tracked image outside images/ is allowlisted with what it shows', () => {
  const unlisted = trackedImages().filter(file => !file.startsWith(APP_IMAGE_ROOT) && !Object.hasOwn(ALLOWED_IMAGES, file))
  assert.deepEqual(unlisted, [], 'add each new image to ALLOWED_IMAGES with a note saying it holds no real records')
})

test('every allowlisted image is still tracked and has a note', () => {
  const tracked = new Set(trackedImages())
  for (const [file, note] of Object.entries(ALLOWED_IMAGES)) {
    assert.ok(tracked.has(file), `${file} is allowlisted but no longer tracked`)
    assert.ok(note.trim(), `${file} needs a note`)
  }
})
