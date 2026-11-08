// 页面不可见（切走 tab、被编辑页盖住、小程序进后台）时，页面根节点带 page-hidden，
// app.wxss 的暂停规则让常驻装饰停在当前帧；再次显示时去掉标记，动画从这一帧继续（issue #163）。
// 页面用 Page(withPageVisibility({...})) 注册，根节点 class 绑定 {{pageHidden ? 'page-hidden' : ''}}；
// data 里不用写 pageHidden，没有标记就是显示中。
// 显示时第一件事是去掉标记，不等页面自己的加载；隐藏时页面自己的 onHide 收尾完最后才挂标记
// （首页先收掉记录成功反馈再挂 page-hidden，见 pages/index/index.js 的 onHide）。
// 只在状态真的变化时 setData，首次显示和重复回调不多渲染一次。

function markPageHidden(page) {
  if (page.data.pageHidden) return
  page.setData({ pageHidden: true })
}

function markPageShown(page) {
  if (!page.data.pageHidden) return
  page.setData({ pageHidden: false })
}

// 只换 onShow 和 onHide，别的属性按原样的描述符搬过去：data 可以是 getter（设置页每次进入重读首帧，issue #114）
function withPageVisibility(options) {
  const page = Object.defineProperties({}, Object.getOwnPropertyDescriptors(options))
  const { onShow, onHide } = options
  page.onShow = function onShowWithVisibility(...args) {
    markPageShown(this)
    return onShow ? onShow.apply(this, args) : undefined
  }
  page.onHide = function onHideWithVisibility(...args) {
    const result = onHide ? onHide.apply(this, args) : undefined
    markPageHidden(this)
    return result
  }
  return page
}

module.exports = {
  withPageVisibility
}
