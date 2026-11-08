// WXML 模板求值：{{ }} 里是 JS 表达式，按页面数据直接算，测试看到的就是渲染出来的属性值和类名。
// 只看双引号属性；注释先去掉。

function evaluateWxmlExpression(expr, scope) {
  const keys = Object.keys(scope).filter((key) => /^[A-Za-z_$][\w$]*$/.test(key))
  return new Function(...keys, `return (${expr})`)(...keys.map((key) => scope[key]))
}

// 属性模板里的每段 {{ }} 按页面数据求值后拼回整句，即读屏实际拿到的属性值
function renderWxmlAttribute(template, data) {
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const value = evaluateWxmlExpression(expr, data)
    return value === undefined || value === null ? '' : String(value)
  })
}

// class 模板按页面数据渲染出的类名
function renderWxmlClasses(template, data) {
  return renderWxmlAttribute(template, data).split(/\s+/).filter(Boolean)
}

// 模板片段里的开始标签与其双引号属性原文；classes 是 class 原文按空白切开的片段，第一个就是静态的首个类名
function wxmlOpeningTags(fragment) {
  const source = fragment.replace(/<!--[\s\S]*?-->/g, '')
  const tags = []
  for (const match of source.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*\/?>/g)) {
    const attrs = {}
    for (const attr of match[2].matchAll(/([^\s=]+)\s*=\s*"([^"]*)"/g)) attrs[attr[1]] = attr[2]
    tags.push({ tag: match[1], attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean) })
  }
  return tags
}

module.exports = {
  evaluateWxmlExpression,
  renderWxmlAttribute,
  renderWxmlClasses,
  wxmlOpeningTags
}
