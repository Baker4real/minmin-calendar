/**
 * 编辑页字段错误（issue #156）：经期、欢乐时光两个编辑页共用的显示与清除规则。
 * 页面用 data.fieldErrors（字段 → 一句人话）在各字段下渲染红字（app.wxss 的 .field-error），
 * 字段容器的 id 是 field-<字段>。
 */

// 保存校验失败：错误常驻在各字段下，并把表单里第一个出错的字段（fieldOrder 自上而下）
// 即时滚到固定顶栏下方，无滚动动画。输入与草稿都不动。
function showFieldErrors(page, fieldErrors, fieldOrder) {
  const errors = fieldErrors || {}
  page.setData({ fieldErrors: errors })
  const first = fieldOrder.find(field => errors[field])
  if (first) {
    wx.pageScrollTo({ selector: `#field-${first}`, offsetTop: -page.data.navBarHeight, duration: 0 })
  }
}

// 清除规则：只重算已显示的字段错误——改对的消失，仍不对的换成当前原因；保存前不新增别的字段错误。
function refreshFieldErrors(page, collectFieldErrors) {
  const shown = Object.keys(page.data.fieldErrors || {})
  if (shown.length === 0) return
  const current = collectFieldErrors(page.data) || {}
  const next = {}
  shown.forEach(field => {
    if (current[field]) next[field] = current[field]
  })
  page.setData({ fieldErrors: next })
}

module.exports = {
  showFieldErrors,
  refreshFieldErrors
}
