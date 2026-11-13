// WXML 模板求值：{{ }} 里是 JS 表达式，按页面数据直接算，测试看到的就是渲染出来的属性值和类名。
// 两个标签读取器都读单双引号属性，写法换一种引号不会漏网；注释先去掉。

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
    const attrs = readAttributes(match[2])
    tags.push({ tag: match[1], attrs, classes: (attrs.class || '').split(/\s+/).filter(Boolean) })
  }
  return tags
}

// 开始标签里带值的属性原文，单双引号等价；不带值的属性（如 wx:else）不读
function readAttributes(rawAttrs) {
  const attrs = {}
  for (const attr of rawAttrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1]] = attr[2] ?? attr[3]
  return attrs
}

// 模板片段的元素树：元素按嵌套挂在父元素下（parent / children），自闭合标签没有子元素；attrs 是属性原文。
// 交互语义护栏要看到每一个点按处理器、读屏属性和弹层结构；
// classes 是先去掉 {{ }} 再切开的静态类名，类名后面紧跟绑定（如 form-picker{{…}}）也照样认得出
function wxmlElementTree(fragment) {
  const source = fragment.replace(/<!--[\s\S]*?-->/g, '')
  const roots = []
  const open = []
  for (const match of source.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g)) {
    const [, closing, tag, rawAttrs, selfClosing] = match
    if (closing) {
      while (open.length && open[open.length - 1].tag !== tag) open.pop()
      open.pop()
      continue
    }
    const attrs = readAttributes(rawAttrs)
    const parent = open[open.length - 1] || null
    const classes = (attrs.class || '').replace(/\{\{[\s\S]*?\}\}/g, ' ').split(/\s+/).filter(Boolean)
    const node = { tag, attrs, classes, parent, children: [] }
    if (parent) parent.children.push(node)
    else roots.push(node)
    if (!selfClosing) open.push(node)
  }
  return roots
}

// class 原文里 {{cond ? 'name' : ''}} 形式的条件类，返回条件原文；单双引号等价接受，没有这个条件类时返回 null
function conditionalClassCondition(classAttr, className) {
  const pattern = new RegExp(`\\{\\{([\\s\\S]*?)\\s*\\?\\s*(['"])${className}\\2\\s*:\\s*(['"])\\3\\s*\\}\\}`)
  const match = pattern.exec(classAttr)
  return match ? match[1].trim() : null
}

module.exports = {
  conditionalClassCondition,
  evaluateWxmlExpression,
  renderWxmlAttribute,
  renderWxmlClasses,
  wxmlElementTree,
  wxmlOpeningTags
}
