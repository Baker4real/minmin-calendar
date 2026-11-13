import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareRuntimeProbe, removeRuntimeProbe } from './captureEvidence.mjs'

const root = path.resolve(import.meta.dirname, '../..')
export function runtimeProbeCommand(action, proofFile = path.join(root, '.scratch/runtime-probe.json')) {
  const proofPath = path.resolve(proofFile)
  if (action === 'prepare') {
    mkdirSync(path.dirname(proofPath), { recursive: true })
    const probe = prepareRuntimeProbe(root)
    try { writeFileSync(proofPath, JSON.stringify(probe, null, 2), { flag: 'wx' }) }
    catch (error) { removeRuntimeProbe(root, probe); throw error }
    return { status: 'compile-required', proofFile: proofPath, next: '在当前微信项目编译后，用 --runtime-proof 指向本文件截图；结束后运行 clean。' }
  }
  if (action !== 'clean') throw new Error('Use prepare or clean [proofFile]')
  const probe = JSON.parse(readFileSync(proofPath, 'utf8'))
  removeRuntimeProbe(root, probe)
  unlinkSync(proofPath)
  return { status: 'cleaned' }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(runtimeProbeCommand(process.argv[2], process.argv[3]))) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
