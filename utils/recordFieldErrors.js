/**
 * 编辑页字段错误（issue #156）：经期、欢乐时光两个编辑页共用的显示与清除规则。
 * 页面用 data.fieldErrors（字段 → 一句人话）在各字段下渲染红字（app.wxss 的 .field-error），
 * 字段容器的 id 是 field-<字段>。
 */
const safeArea = require('./safeArea')

// 保存校验失败：错误常驻在各字段下，并把表单里第一个出错的字段（fieldOrder 自上而下）
// 即时滚到固定顶栏下方，无滚动动画。输入与草稿都不动。
function showFieldErrors(page, fieldErrors, fieldOrder) {
  const errors = fieldErrors || {}
  page.setData({ fieldErrors: errors })
  scrollToFirstFieldError(errors, fieldOrder, page.data.navBarHeight)
}

// Sessions render the errors themselves; scrolling needs no Page or form mutation.
function scrollToFirstFieldError(fieldErrors, fieldOrder, navBarHeight = safeArea.getNavBarHeight()) {
  const first = fieldOrder.find(field => fieldErrors && fieldErrors[field])
  if (first) {
    wx.pageScrollTo({ selector: `#field-${first}`, offsetTop: -navBarHeight, duration: 0 })
  }
}

// 清除规则：只重算已显示的字段错误——改对的消失，仍不对的换成当前原因；保存前不新增别的字段错误。
function refreshFieldErrors(page, collectFieldErrors) {
  if (Object.keys(page.data.fieldErrors || {}).length === 0) return
  page.setData({ fieldErrors: retainShownFieldErrors(page.data.fieldErrors, collectFieldErrors(page.data)) })
}

function retainShownFieldErrors(fieldErrors, currentErrors) {
  const current = currentErrors || {}
  const next = {}
  Object.keys(fieldErrors || {}).forEach(field => {
    if (current[field]) next[field] = current[field]
  })
  return next
}

module.exports = {
  showFieldErrors,
  refreshFieldErrors,
  scrollToFirstFieldError,
  retainShownFieldErrors
}
