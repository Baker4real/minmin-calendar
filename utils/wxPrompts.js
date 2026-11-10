// Execute presentation specs; Room failure copy and recovery rules stay in roomAccessOutcome.
function present(presentation, options = {}) {
  const wxApi = Object.prototype.hasOwnProperty.call(options, 'wx') ? options.wx : wx
  const fallback = Object.prototype.hasOwnProperty.call(options, 'fallback') ? options.fallback : presentation.result
  if (presentation.mode === 'inline') {
    options.showInline(presentation)
    return Promise.resolve(fallback)
  }
  const toast = () => {
    if (wxApi && typeof wxApi.showToast === 'function') {
      wxApi.showToast({ title: presentation.content, icon: 'none' })
    }
    return fallback
  }
  if (presentation.mode === 'toast' || !wxApi || typeof wxApi.showModal !== 'function'
    || (presentation.mode === 'retry' && typeof options.retry !== 'function')) {
    return Promise.resolve(toast())
  }
  return new Promise(resolve => {
    const acknowledge = presentation.mode === 'acknowledge'
    modal({
      title: presentation.title,
      content: presentation.content,
      ...(acknowledge ? { showCancel: false, confirmText: '知道了' }
        : { confirmText: presentation.mode === 'retry' ? '重试' : '去绑定', cancelText: '取消' }),
      success: response => {
        if (response && response.confirm && !acknowledge) {
          resolve(runAction(presentation.action, { ...options, wx: wxApi, fallback }))
        } else {
          resolve(fallback)
        }
      },
      fail: () => resolve(toast())
    }, wxApi)
  })
}

function runAction(action, options = {}) {
  if (action === 'retry') return options.retry()
  if (action === 'bind') {
    if (typeof options.navigateToBind === 'function') options.navigateToBind()
    else {
      const wxApi = Object.prototype.hasOwnProperty.call(options, 'wx') ? options.wx : wx
      if (wxApi && typeof wxApi.navigateTo === 'function') wxApi.navigateTo({ url: '/pages/bind/bind' })
    }
  }
  return options.fallback
}

// Existing domain confirmations keep their copy and callbacks at their owner.
function modal(options, wxApi = wx) {
  const fail = typeof options.fail === 'function' ? options.fail : () => {
    if (wxApi && typeof wxApi.showToast === 'function') {
      wxApi.showToast({ title: options.content || options.title, icon: 'none' })
    }
    if (typeof options.success === 'function') options.success({ confirm: false, cancel: true })
  }
  if (!wxApi || typeof wxApi.showModal !== 'function') {
    return fail({ errMsg: 'showModal:fail unavailable' })
  }
  return wxApi.showModal({ ...options, fail })
}

module.exports = { present, runAction, modal }
