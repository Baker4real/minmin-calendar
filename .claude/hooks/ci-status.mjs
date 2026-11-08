// SessionStart hook: tell the agent whether main's latest CI run is red before any work starts,
// and whether uncommitted work has been sitting in this work tree for over a day.
// Prints one line of context and always exits 0, so a network failure never blocks a session.
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function run(cmd, args, timeout = 8000) {
  return execFileSync(cmd, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  }).trim()
}

function repoSlug() {
  const url = run('git', ['remote', 'get-url', 'origin'])
  const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/)
  return match ? match[1] : null
}

// The local proxy drops TLS handshakes now and then, so one retry covers most EOFs.
function latestMainRun(slug) {
  let lastError = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const out = run('gh', ['run', 'list', '--repo', slug, '--branch', 'main', '--limit', '1',
        '--json', 'conclusion,status,headSha,displayTitle,createdAt'])
      return { latest: JSON.parse(out)[0] || null }
    } catch (error) {
      lastError = String(error.stderr || error.message || '').split('\n')[0].trim()
    }
  }
  return { error: lastError || 'gh run list failed' }
}

function unpushedCount() {
  try {
    return Number(run('git', ['rev-list', '--count', 'origin/main..main']))
  } catch {
    return 0
  }
}

// Uncommitted files untouched for over a day. Other sessions take them for someone else's work in flight and
// route around them while main moves on, so they get harder to land the longer they sit.
function staleUncommitted(now = Date.now()) {
  let status
  try {
    // Not run(): its trim() would eat the leading space of the first ' M path' entry.
    status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: repoRoot, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    })
  } catch {
    return []
  }
  const entries = status.split('\0')
  const stale = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.length < 4) continue
    if (entry[0] === 'R' || entry[0] === 'C') i++ // the original path of a rename or copy follows
    const file = entry.slice(3)
    let mtime
    try {
      mtime = statSync(path.join(repoRoot, file)).mtimeMs
    } catch {
      continue // deleted in the work tree
    }
    if (now - mtime > 24 * 60 * 60 * 1000) stale.push({ file, mtime })
  }
  return stale.sort((a, b) => a.mtime - b.mtime)
}

function localDay(ms) {
  const date = new Date(ms)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const lines = []
try {
  const slug = repoSlug()
  if (!slug) throw new Error('origin 不是 GitHub 远端')
  const { latest, error } = latestMainRun(slug)
  if (error) {
    lines.push(`CI 状态未知：gh 查询失败（${error}）。需要时手动运行 gh run list --branch main --limit 1。`)
  } else if (!latest) {
    lines.push('CI：main 还没有运行记录。')
  } else {
    const sha = String(latest.headSha || '').slice(0, 7)
    const day = String(latest.createdAt || '').slice(0, 10)
    if (latest.status !== 'completed') {
      lines.push(`CI：main 最近一次运行 ${latest.status}（${sha}，${day}）。`)
    } else if (latest.conclusion !== 'success') {
      lines.push(`CI 红：main 最近一次运行 ${latest.conclusion}（${sha} ${latest.displayTitle}，${day}）。先修红或确认已有修复票，再做别的；本地复现用 npm test。`)
    } else {
      lines.push(`CI 绿：main 最近一次运行 success（${sha}，${day}）。`)
    }
  }
} catch (error) {
  lines.push(`CI 状态未知：${error.message}`)
}
const unpushed = unpushedCount()
if (unpushed > 0) lines.push(`本地 main 领先 origin/main ${unpushed} 个提交，尚未推送。`)
const stale = staleUncommitted()
if (stale.length > 0) {
  const sample = stale.slice(0, 3).map(item => item.file).join('、') + (stale.length > 3 ? ' 等' : '')
  lines.push(`工作树有 ${stale.length} 个未提交文件一天多没动，最早改于 ${localDay(stale[0].mtime)}（${sample}）：先查清是谁的工作，再提交或交给维护者。`)
}
process.stdout.write(lines.join(' ') + '\n')
