// WXML/WXSS 静态检查的统一读取入口：WXSS 展开 @import，WXML 展开 include 与 import/template。
// readSource 让同时读取其他文件类型的检查复用同一入口；非 WXML/WXSS 仍按原样读取。
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

function expandWxmlFragment(source, currentFile, definitions, root, stack, templateStack, expandIncludes) {
  let expanded = transform(source, '.wxml', /<include\b([^>]*)\/\s*>/gi, match => {
    if (!expandIncludes) return match[0]
    const reference = attribute(match[1], 'src')
    if (!reference) throw new Error(`WXML include is missing src in ${currentFile}`)
    const included = resolveReference(currentFile, reference, root)
    return expandWxml(included, root, stack, expandIncludes)
  })

  expanded = transform(expanded, '.wxml', /<template\b([^>]*)\/\s*>/gi, match => {
    const name = attribute(match[1], 'is')
    if (!name) return match[0]
    const definition = definitions.get(name)
    if (!definition) throw new Error(`Unknown WXML template "${name}" in ${currentFile}`)
    const identity = `${definition.file}#${name}`
    assertNoCycle(templateStack, identity)
    return expandWxmlFragment(
      definition.body,
      definition.file,
      definitions,
      root,
      stack,
      [...templateStack, identity],
      expandIncludes
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

  let expanded = transform(source, '.wxml', /<import\b([^>]*)\/\s*>/gi, () => '')
  expanded = transform(expanded, '.wxml', /<template\b(?=[^>]*\bname\s*=)([^>]*)>[\s\S]*?<\/template\s*>/gi, match => {
    return attribute(match[1], 'name') ? '' : match[0]
  })
  return expandWxmlFragment(expanded, normalized, definitions, root, nextStack, [], expandIncludes)
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

module.exports = { readExpandedSource, readSource }
