/**
 * 编辑页字段错误（issue #156）：经期、欢乐时光两个编辑页共用的显示与清除规则。
 * 页面用 data.fieldErrors（字段 → 一句人话）在各字段下渲染红字（app.wxss 的 .field-error），
 * 字段容器的 id 是 field-<字段>。
 */
const safeArea = require('./safeArea')

// Sessions render the errors themselves; scrolling needs no Page or form mutation.
function scrollToFirstFieldError(fieldErrors, fieldOrder, navBarHeight = safeArea.getNavBarHeight()) {
  const first = fieldOrder.find(field => fieldErrors && fieldErrors[field])
  if (first) {
    wx.pageScrollTo({ selector: `#field-${first}`, offsetTop: -navBarHeight, duration: 0 })
  }
}

// 只重算已显示的字段错误；保存前不新增别的字段错误。
function retainShownFieldErrors(fieldErrors, currentErrors) {
  const current = currentErrors || {}
  const next = {}
  Object.keys(fieldErrors || {}).forEach(field => {
    if (current[field]) next[field] = current[field]
  })
  return next
}

module.exports = {
  scrollToFirstFieldError,
  retainShownFieldErrors
}
