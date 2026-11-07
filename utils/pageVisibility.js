// 页面不可见（切走 tab、被编辑页盖住、小程序进后台）时，页面根节点带 page-hidden，
// app.wxss 的暂停规则让常驻装饰停在当前帧；再次显示时去掉标记，动画从这一帧继续（issue #163）。
// 页面数据里要有 pageHidden: false；根节点 class 绑定 {{pageHidden ? 'page-hidden' : ''}}。
// 只在状态真的变化时 setData，首次显示和重复回调不多渲染一次。

function markPageHidden(page) {
  if (page.data.pageHidden) return
  page.setData({ pageHidden: true })
}

function markPageShown(page) {
  if (!page.data.pageHidden) return
  page.setData({ pageHidden: false })
}

module.exports = {
  markPageHidden,
  markPageShown
}
