import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareRuntimeProbe, removeRuntimeProbe } from './captureEvidence.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const PRIVATE_CONFIG = 'project.private.config.json'

function privateConfigPath(projectPath) {
  return path.join(projectPath, PRIVATE_CONFIG)
}

function restorePrivateConfig(projectPath, restore) {
  const file = privateConfigPath(projectPath)
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const current = config.setting?.ignoreDevUnusedFiles
  if (current === true) return
  if (current !== false || !restore || restore.ignoreDevUnusedFiles !== true) {
    throw new Error('Private config changed; refusing to restore unused-file filtering')
  }
  config.setting.ignoreDevUnusedFiles = true
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
}

export function runtimeProbeCommand(action, proofFile = path.join(root, '.scratch/runtime-probe.json'), projectPath = root) {
  const projectRoot = path.resolve(projectPath)
  const proofPath = path.resolve(proofFile)
  if (action === 'prepare') {
    mkdirSync(path.dirname(proofPath), { recursive: true })
    const probe = prepareRuntimeProbe(projectRoot)
    let privateConfigRestore = null
    try {
      const configFile = privateConfigPath(projectRoot)
      if (existsSync(configFile)) {
        const config = JSON.parse(readFileSync(configFile, 'utf8'))
        if (config.setting?.ignoreDevUnusedFiles === true) {
          privateConfigRestore = { ignoreDevUnusedFiles: true }
          config.setting.ignoreDevUnusedFiles = false
          writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n')
        }
      }
      writeFileSync(proofPath, JSON.stringify({ ...probe, privateConfigRestore }, null, 2), { flag: 'wx' })
    } catch (error) {
      try { if (privateConfigRestore) restorePrivateConfig(projectRoot, privateConfigRestore) }
      finally { removeRuntimeProbe(projectRoot, probe) }
      throw error
    }
    return {
      status: 'compile-required',
      proofFile: proofPath,
      privateConfigRestore,
      next: '在当前微信项目编译后，用 --runtime-proof 指向本文件截图；结束后运行 clean。'
    }
  }
  if (action !== 'clean') throw new Error('Use prepare or clean [proofFile]')
  const saved = JSON.parse(readFileSync(proofPath, 'utf8'))
  const privateConfigRestored = Boolean(saved.privateConfigRestore)
  if (privateConfigRestored) restorePrivateConfig(projectRoot, saved.privateConfigRestore)
  const probe = { modulePath: saved.modulePath, nonce: saved.nonce, sourceFingerprint: saved.sourceFingerprint }
  removeRuntimeProbe(projectRoot, probe)
  unlinkSync(proofPath)
  return { status: 'cleaned', privateConfigRestored }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runtimeProbeCommand(process.argv[2], process.argv[3]))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
