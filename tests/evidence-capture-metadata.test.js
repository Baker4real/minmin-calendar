const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

// #168 的替身证据绑在采集时的运行源码上（epic #161 评审 P5）。docs/evidence/issue-168/capture-metadata.json
// 记着采集那次运行的完整 HEAD、app.*（根目录）／pages/**／utils/** 每个文件从磁盘读到的 SHA-256、由它们折出的指纹，
// 以及每张入库图从哪一帧来、怎么裁的和它自己的 SHA-256。指纹 = 把「<sha256>  <路径>\n」按路径（码元序）排好的
// sha256sum 清单再取一次 SHA-256；all 覆盖三组。这里复核：指纹确实由清单折出；采集时运行路径干净、自动化验收全过；
// 目录里的图与元数据一一对应、字节没换；清单与采集提交里的文件逐字节一致（本地有那个提交时）；验证日志引用的值没抄错。

const repoRoot = path.join(__dirname, '..')
const EVIDENCE_DIR = 'docs/evidence/issue-168'
const metadata = JSON.parse(fs.readFileSync(path.join(repoRoot, EVIDENCE_DIR, 'capture-metadata.json'), 'utf8'))
const sha256 = data => createHash('sha256').update(data).digest('hex')
const fold = entries => sha256(entries.map(entry => `${entry.sha256}  ${entry.file}\n`).join(''))
const GROUPS = {
  'app.*': file => !file.includes('/'),
  'pages/**': file => file.startsWith('pages/'),
  'utils/**': file => file.startsWith('utils/'),
  all: () => true
}

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024, ...options })
}

function commitAvailable(sha) {
  try {
    git(['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// 运行文件在那个提交里的原始字节（git cat-file --batch 不做换行转换）
function blobsAt(commit, files) {
  const out = git(['cat-file', '--batch'], { input: files.map(file => `${commit}:${file}`).join('\n') + '\n' })
  const blobs = new Map()
  let at = 0
  for (const file of files) {
    const eol = out.indexOf(0x0a, at)
    const [, type, size] = out.subarray(at, eol).toString('utf8').split(' ')
    assert.equal(type, 'blob', `${file} is not a file at ${commit}`)
    const start = eol + 1
    blobs.set(file, out.subarray(start, start + Number(size)))
    at = start + Number(size) + 1
  }
  return blobs
}

function runtimeFilesAt(commit) {
  const names = args => git(args, { encoding: 'utf8' }).split('\0').filter(Boolean)
  const root = names(['ls-tree', '-z', '--name-only', commit]).filter(name => /^app\./.test(name))
  return [...root, ...names(['ls-tree', '-r', '-z', '--name-only', commit, '--', 'pages', 'utils'])].sort()
}

test('the recorded fingerprints fold from the recorded per-file SHA-256 manifest', () => {
  const files = metadata.files.map(entry => entry.file)
  assert.deepEqual(files, [...files].sort(), 'the manifest is sorted by path')
  assert.equal(new Set(files).size, files.length, 'no file is listed twice')
  for (const file of files) assert.ok(/^app\.[^/]+$/.test(file) || /^(pages|utils)\//.test(file), `${file} is not a runtime path`)
  for (const entry of metadata.files) assert.match(entry.sha256, /^[0-9a-f]{64}$/, entry.file)
  for (const [group, member] of Object.entries(GROUPS)) {
    assert.equal(metadata.fingerprints[group], fold(metadata.files.filter(entry => member(entry.file))), `${group} fingerprint`)
  }
})

test('the capture run was bound to one clean source and every automated item passed', () => {
  assert.match(metadata.head, /^[0-9a-f]{40}$/)
  assert.deepEqual(metadata.runtimeSourceClean, { start: true, end: true }, 'runtime paths on disk equalled HEAD at the start and the end')
  assert.equal(metadata.unchangedDuringRun, true, 'no runtime file changed during the run')
  const open = metadata.items.filter(item => item.status !== 'PASS' && !item.title.startsWith('[GUI]'))
  assert.deepEqual(open, [], 'every item the automator can check passed')
})

test('every issue-168 image has one capture record with the same bytes and its viewport in the name', () => {
  const tracked = git(['ls-files', '-z', '--', EVIDENCE_DIR], { encoding: 'utf8' })
    .split('\0')
    .filter(file => file.endsWith('.png'))
    .map(file => path.posix.basename(file))
    .sort()
  assert.deepEqual(metadata.images.map(image => image.file), tracked, 'one record per committed image, sorted by name')
  for (const image of metadata.images) {
    const bytes = fs.readFileSync(path.join(repoRoot, EVIDENCE_DIR, image.file))
    assert.equal(sha256(bytes), image.sha256, `${image.file} is not the curated image`)
    assert.deepEqual(image.viewport, { width: metadata.viewport.width, height: metadata.viewport.height }, `${image.file} viewport`)
    assert.ok(image.file.endsWith(`-${image.viewport.width}x${image.viewport.height}.png`), `${image.file} names its viewport`)
  }
})

test('the manifest is the runtime source at the capture commit, file for file and byte for byte', t => {
  if (!commitAvailable(metadata.head)) {
    t.skip(`capture commit ${metadata.head} is not in this clone (a shallow checkout)`)
    return
  }
  const files = runtimeFilesAt(metadata.head)
  assert.deepEqual(metadata.files.map(entry => entry.file), files, 'the manifest lists exactly the runtime files of the capture commit')
  const blobs = blobsAt(metadata.head, files)
  for (const entry of metadata.files) assert.equal(sha256(blobs.get(entry.file)), entry.sha256, `${entry.file} differs from the capture commit`)
})

test('the verification log quotes the capture commit and the combined fingerprint', () => {
  const log = fs.readFileSync(path.join(repoRoot, 'docs/verification-log.md'), 'utf8')
  assert.ok(log.includes(metadata.fingerprints.all), 'docs/verification-log.md quotes fingerprints.all')
  assert.ok(log.includes(metadata.head.slice(0, 7)), 'docs/verification-log.md names the capture commit')
})
