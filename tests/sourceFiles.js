// WXML/WXSS 静态检查的统一读取入口：WXSS 展开 @import，WXML 展开 include 与 import/template。
// readSource 让同时读取其他文件类型的检查复用同一入口；非 WXML/WXSS 仍按原样读取。
// 注意：readSource 会把 <template is="..."/> 文本原地展开，适合查样式、类名与属性语义；
// 涉及微信编译器虚拟节点限制的顶层结构约束（如 <page-meta>、<navigation-bar> 必须直挂页面根首位、
// 不得写在 <template> 内）必须用 readRaw 检查原始页 WXML，不能只查展开后的文本。
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')

function maskComments(source, extension) {
  const pattern = extension === '.wxss' ? /\/\*[\s\S]*?\*\//g : /<!--[\s\S]*?-->/g
  return source.replace(pattern, comment => comment.replace(/[^\n]/g, ' '))
}

function transform(source, extension, pattern, replacement) {
  const masked = maskComments(source, extension)
  let cursor = 0
  let output = ''
  for (const match of masked.matchAll(pattern)) {
    output += source.slice(cursor, match.index)
    output += replacement(match)
    cursor = match.index + match[0].length
  }
  return output + source.slice(cursor)
}

function attribute(rawAttributes, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i')
  const match = pattern.exec(rawAttributes)
  return match ? (match[1] ?? match[2]) : null
}

function resolveReference(sourceFile, reference, root) {
  if (reference.startsWith('/')) return path.resolve(root, `.${reference}`)
  return path.resolve(path.dirname(sourceFile), reference)
}

function assertNoCycle(stack, file) {
  if (stack.includes(file)) {
    throw new Error(`Shared source cycle: ${[...stack, file].join(' -> ')}`)
  }
}

function expandWxss(file, root, stack) {
  const normalized = path.normalize(file)
  assertNoCycle(stack, normalized)
  const source = fs.readFileSync(normalized, 'utf8')
  const nextStack = [...stack, normalized]
  return transform(source, '.wxss', /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)')\s*\)?\s*;/gi, match => {
    const reference = match[1] ?? match[2]
    const imported = resolveReference(normalized, reference, root)
    return expandWxss(imported, root, nextStack)
  })
}

function templateDefinitions(file, root, stack = []) {
  const normalized = path.normalize(file)
  assertNoCycle(stack, normalized)
  const source = fs.readFileSync(normalized, 'utf8')
  const nextStack = [...stack, normalized]
  const definitions = new Map()

  transform(source, '.wxml', /<import\b([^>]*)\/\s*>/gi, match => {
    const reference = attribute(match[1], 'src')
    if (!reference) throw new Error(`WXML import is missing src in ${normalized}`)
    const imported = resolveReference(normalized, reference, root)
    for (const [name, definition] of templateDefinitions(imported, root, nextStack)) {
      definitions.set(name, definition)
    }
    return match[0]
  })

  transform(source, '.wxml', /<template\b(?=[^>]*\bname\s*=)([^>]*)>([\s\S]*?)<\/template\s*>/gi, match => {
    const name = attribute(match[1], 'name')
    if (name) definitions.set(name, { name, body: match[2], file: normalized })
    return match[0]
  })
  return definitions
}

function literalTemplateVariables(data) {
  const variables = {}
  for (const match of (data || '').matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*(['"])([^'"]*)\2/g)) {
    variables[match[1]] = match[3]
  }
  return variables
}

function splitTemplateFields(source) {
  const parts = []
  let start = 0
  let quote = ''
  let escaped = false
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"') quote = char
    else if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(source.slice(start, index))
      start = index + 1
    }
  }
  parts.push(source.slice(start))
  return parts
}

function templateFieldSeparator(source) {
  let quote = ''
  let escaped = false
  let depth = 0
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === "'" || char === '"') quote = char
    else if (char === '{' || char === '[' || char === '(') depth += 1
    else if (char === '}' || char === ']' || char === ')') depth -= 1
    else if (char === ':' && depth === 0) return index
  }
  return -1
}

function templateFields(data) {
  const fields = {}
  const source = (data || '').trim().replace(/^\{\{/, '').replace(/\}\}$/, '').trim()
  for (const part of splitTemplateFields(source)) {
    const separator = templateFieldSeparator(part)
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (/^[A-Za-z_$][\w$]*$/.test(key)) fields[key] = part.slice(separator + 1).trim()
  }
  return fields
}

function nestedTemplateFields(expression) {
  const source = (expression || '').trim().replace(/^\{/, '').replace(/\}$/, '')
  return templateFields(source)
}

function substituteTemplateScope(source, fields) {
  return source.replace(/\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g, (match, key) => {
    if (key === 'bodyTemplate' || !Object.hasOwn(fields, key)) return match
    const expression = fields[key]
    const quoted = /^(?:'([^']*)'|"([^"]*)")$/.exec(expression)
    if (quoted) return quoted[1] ?? quoted[2]
    return `{{${expression}}}`
  })
}

function expandWxmlFragment(source, currentFile, definitions, root, stack, templateStack, expandIncludes, templateVariables = {}, inheritedFields = {}) {
  let expanded = transform(source, '.wxml', /<include\b([^>]*)\/\s*>/gi, match => {
    if (!expandIncludes) return match[0]
    const reference = attribute(match[1], 'src')
    if (!reference) throw new Error(`WXML include is missing src in ${currentFile}`)
    const included = resolveReference(currentFile, reference, root)
    return expandWxml(included, root, stack, expandIncludes)
  })

  expanded = transform(expanded, '.wxml', /<template\b([^>]*)\/\s*>/gi, match => {
    const requestedName = attribute(match[1], 'is')
    if (!requestedName) return match[0]
    const data = attribute(match[1], 'data')
    const variables = {
      ...templateVariables,
      ...literalTemplateVariables(data)
    }
    const dynamicName = /^\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}$/.exec(requestedName)
    const name = dynamicName ? variables[dynamicName[1]] : requestedName
    const definition = definitions.get(name)
    if (!definition) throw new Error(`Unknown WXML template "${requestedName}" in ${currentFile}`)
    const identity = `${definition.file}#${name}`
    assertNoCycle(templateStack, identity)
    const ownFields = templateFields(data)
    const scopeFields = ownFields.bodyTemplate
      ? ownFields
      : /\.\.\.\s*body\b/.test(data || '') && inheritedFields.body
        ? nestedTemplateFields(inheritedFields.body)
        : {}
    const body = Object.keys(scopeFields).length
      ? substituteTemplateScope(definition.body, scopeFields)
      : definition.body
    return expandWxmlFragment(
      body,
      definition.file,
      definitions,
      root,
      stack,
      [...templateStack, identity],
      expandIncludes,
      variables,
      scopeFields
    )
  })
  return expanded
}

function expandWxml(file, root, stack, expandIncludes) {
  const normalized = path.normalize(file)
  assertNoCycle(stack, normalized)
  const source = fs.readFileSync(normalized, 'utf8')
  const nextStack = [...stack, normalized]
  const definitions = templateDefinitions(normalized, root)

  const importedDeclarations = []
  let expanded = transform(source, '.wxml', /<import\b([^>]*)\/\s*>/gi, match => {
    const reference = attribute(match[1], 'src')
    if (!reference) throw new Error(`WXML import is missing src in ${normalized}`)
    const imported = resolveReference(normalized, reference, root)
    const importedSource = fs.readFileSync(imported, 'utf8')
    const declarations = importedSource.match(/<wxs\b[^>]*>[\s\S]*?<\/wxs>/gi) || []
    importedDeclarations.push(...declarations.map(declaration => {
      const src = /\bsrc=["']([^"']+)["']/.exec(declaration)
      if (!src) return declaration
      const moduleFile = resolveReference(imported, src[1], root)
      const relative = path.relative(path.dirname(normalized), moduleFile).replace(/\\/g, '/')
      return declaration.replace(src[1], relative)
    }))
    return ''
  })
  expanded = transform(expanded, '.wxml', /<template\b(?=[^>]*\bname\s*=)([^>]*)>[\s\S]*?<\/template\s*>/gi, match => {
    return attribute(match[1], 'name') ? '' : match[0]
  })
  const fragment = expandWxmlFragment(expanded, normalized, definitions, root, nextStack, [], expandIncludes)
  return [fragment, ...importedDeclarations].filter(Boolean).join('\n')
}

function readExpandedSource(file, { root = repoRoot, expandIncludes = true } = {}) {
  const extension = path.extname(file).toLowerCase()
  if (extension !== '.wxml' && extension !== '.wxss') {
    throw new Error(`Expanded source reading supports only WXML and WXSS: ${file}`)
  }
  const absolute = path.isAbsolute(file) ? file : path.resolve(root, file)
  const resolvedRoot = path.resolve(root)
  return extension === '.wxss'
    ? expandWxss(absolute, resolvedRoot, [])
    : expandWxml(absolute, resolvedRoot, [], expandIncludes)
}

function readSource(file, options) {
  const extension = path.extname(file).toLowerCase()
  if (extension === '.wxml' || extension === '.wxss') return readExpandedSource(file)
  return fs.readFileSync(file, options)
}

function readRaw(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8')
}

module.exports = { readExpandedSource, readRaw, readSource }
