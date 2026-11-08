// 对微信小程序执行有覆盖声明的 Impeccable 静态检测。
// 用法：node tests/impeccableDetect.mjs --target pages --launcher <impeccable(.cmd)> [--out <dir>]
// 退出码与检测器一致：0 无命中，2 有候选；1 表示覆盖或调用失败。

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { generateImpeccableShims } from './impeccableShims.mjs'

const repoRoot = path.resolve(import.meta.dirname, '..')
const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function collectWxml(target) {
  const absolute = path.resolve(repoRoot, target)
  if (!existsSync(absolute)) fail(`Target does not exist: ${target}`)
  const stat = statSync(absolute)
  if (stat.isFile()) return absolute.endsWith('.wxml') ? [absolute] : []
  const files = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(absolute, entry.name)
    if (entry.isDirectory()) files.push(...collectWxml(child))
    else if (entry.isFile() && child.endsWith('.wxml')) files.push(child)
  }
  return files
}

function defaultOutDir() {
  const managedRoot = process.env.MINMIN_IMPECCABLE_TEMP ||
    (existsSync('D:/agents/tmp') ? 'D:/agents/tmp' : '')
  const stamp = `${Date.now()}-${process.pid}`
  return managedRoot
    ? path.join(managedRoot, 'minmin-calendar-impeccable', `run-${stamp}`)
    : path.join(repoRoot, '.scratch', 'impeccable-shims', `run-${stamp}`)
}

function invokeDetector(launcher, scanTarget) {
  const detectorArgs = ['detect', '--json', scanTarget]
  if (launcher.endsWith('.mjs')) {
    return spawnSync(process.execPath, [launcher, ...detectorArgs], { encoding: 'utf8' })
  }
  if (process.platform === 'win32' && launcher.endsWith('.cmd')) {
    return spawnSync(launcher, detectorArgs, { encoding: 'utf8', shell: true })
  }
  return spawnSync(launcher, detectorArgs, { encoding: 'utf8' })
}

const target = args.target || 'pages'
const launcher = args.launcher || process.env.IMPECCABLE_LAUNCHER
if (!launcher) fail('Pass --launcher or set IMPECCABLE_LAUNCHER')
const sourceWxml = collectWxml(target)
if (sourceWxml.length === 0) fail(`No WXML markup found under target: ${target}`)

const outDir = args.out ? path.resolve(repoRoot, args.out) : defaultOutDir()
const viewport = Number(args.viewport || 390)
const generated = generateImpeccableShims({ outDir, viewport })
const result = invokeDetector(path.resolve(repoRoot, launcher), generated.outDir)
if (result.error) fail(`Detector could not start: ${result.error.message}`)
if (result.status !== 0 && result.status !== 2) {
  fail(`Detector exited ${result.status}: ${(result.stderr || result.stdout || '').trim()}`)
}

let findings
try {
  findings = JSON.parse((result.stdout || '').trim())
  if (!Array.isArray(findings)) throw new Error('expected an array')
} catch (error) {
  fail(`Detector returned invalid JSON: ${error.message}`)
}

mkdirSync(generated.outDir, { recursive: true })
const findingsFile = path.join(generated.outDir, 'findings.json')
writeFileSync(findingsFile, JSON.stringify(findings, null, 2) + '\n')
const byRule = {}
const bySeverity = {}
for (const finding of findings) {
  const rule = finding.antipattern || finding.name || 'unknown'
  const severity = finding.severity || 'unknown'
  byRule[rule] = (byRule[rule] || 0) + 1
  bySeverity[severity] = (bySeverity[severity] || 0) + 1
}
console.log(JSON.stringify({
  coverage: {
    scanKind: 'wxml-shim',
    target,
    sourceWxml: sourceWxml.length,
    generatedHtml: generated.files.length,
    extensions: ['.wxml', '.wxss'],
    viewport: generated.viewport,
    outDir: generated.outDir
  },
  findings: { count: findings.length, byRule, bySeverity, file: findingsFile }
}))
process.exit(result.status)
