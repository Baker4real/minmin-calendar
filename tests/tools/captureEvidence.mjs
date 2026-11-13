import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'

export const CAPTURE_TOOL_VERSION = 2
export const RUNTIME_PROBE_PATH = 'utils/__captureProbe.js'
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
      else if (entry.isFile() && relative !== RUNTIME_PROBE_PATH && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(relative)
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

// A disposable compile challenge, never assigned by evaluate into the live runtime.
// Requiring the compiled module must echo this nonce; disk identity alone is insufficient.
function probeText(probe) {
  if (probe?.modulePath !== RUNTIME_PROBE_PATH || !/^[a-f0-9-]{36}$/.test(probe?.nonce || '') ||
      !/^[a-f0-9]{64}$/.test(probe?.sourceFingerprint || '')) throw new Error('Invalid runtime probe')
  return `module.exports = ${JSON.stringify(probe)}`
}
export function prepareRuntimeProbe(projectPath) {
  const probe = { modulePath: RUNTIME_PROBE_PATH, nonce: randomUUID(), sourceFingerprint: fingerprintRuntimeSources(projectPath).fingerprint }
  writeFileSync(path.resolve(projectPath, RUNTIME_PROBE_PATH), probeText(probe), { flag: 'wx' })
  return probe
}
export function removeRuntimeProbe(projectPath, probe) {
  const target = path.resolve(projectPath, RUNTIME_PROBE_PATH)
  if (readFileSync(target, 'utf8') !== probeText(probe)) throw new Error('Probe changed; refusing cleanup')
  unlinkSync(target)
}
export function confirmRuntimeProbe(projectPath, probe, loaded) {
  probeText(probe)
  if (fingerprintRuntimeSources(projectPath).fingerprint !== probe.sourceFingerprint) throw new Error('Runtime probe source changed; prepare and compile again')
  if (loaded?.modulePath !== probe.modulePath || loaded?.nonce !== probe.nonce || loaded?.sourceFingerprint !== probe.sourceFingerprint) throw new Error('The loaded build does not match this compile challenge')
  return { status: 'confirmed', method: 'compiled-module-challenge', ...probe }
}

export function buildCaptureEvidence({
  projectPath,
  file,
  route,
  viewport,
  state,
  density = null,
  runtime = null,
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
    source: fingerprintRuntimeSources(projectPath),
    runtime: runtime || { status: 'unconfirmed' }
  }
}

export function classifyCaptureEvidence(evidence, currentFingerprint) {
  const fingerprint = evidence && evidence.source && evidence.source.fingerprint
  if (!fingerprint) return 'historical-unbound'
  if (fingerprint !== currentFingerprint) return 'stale'
  const runtime = evidence.runtime
  return runtime?.status === 'confirmed' && runtime.method === 'compiled-module-challenge' &&
    runtime.sourceFingerprint === fingerprint && runtime.modulePath === RUNTIME_PROBE_PATH && /^[a-f0-9-]{36}$/.test(runtime.nonce || '')
    ? 'current' : 'runtime-unconfirmed'
}
