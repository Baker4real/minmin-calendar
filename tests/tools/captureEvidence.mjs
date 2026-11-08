import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

export const CAPTURE_TOOL_VERSION = 1
export const CAPTURE_SOURCE_SCOPE = 'app-pages-utils'

const SOURCE_EXTENSIONS = new Set(['.js', '.json', '.wxml', '.wxss', '.wxs'])

function runtimeSourceFiles(projectPath) {
  const files = ['app.js', 'app.json', 'app.wxss']
  function visit(relativeDir) {
    const absoluteDir = path.join(projectPath, relativeDir)
    if (!existsSync(absoluteDir)) return
    for (const entry of readdirSync(absoluteDir, { withFileTypes: true })) {
      const relative = path.posix.join(relativeDir, entry.name)
      if (entry.isDirectory()) visit(relative)
      else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(relative)
    }
  }
  visit('pages')
  visit('utils')
  return files.filter(relative => existsSync(path.join(projectPath, relative))).sort()
}

export function fingerprintRuntimeSources(projectPath) {
  const hash = createHash('sha256')
  for (const relative of runtimeSourceFiles(projectPath)) {
    hash.update(relative)
    hash.update('\0')
    hash.update(readFileSync(path.join(projectPath, relative)))
    hash.update('\0')
  }
  return { algorithm: 'sha256', scope: CAPTURE_SOURCE_SCOPE, fingerprint: hash.digest('hex') }
}

export function buildCaptureEvidence({
  projectPath,
  file,
  route,
  viewport,
  state,
  density = null,
  capturedAt = new Date().toISOString()
}) {
  return {
    file,
    route,
    viewport,
    state,
    density,
    capturedAt,
    captureToolVersion: CAPTURE_TOOL_VERSION,
    source: fingerprintRuntimeSources(projectPath)
  }
}

export function classifyCaptureEvidence(evidence, currentFingerprint) {
  const fingerprint = evidence && evidence.source && evidence.source.fingerprint
  if (!fingerprint) return 'historical-unbound'
  return fingerprint === currentFingerprint ? 'current' : 'stale'
}
