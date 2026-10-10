// SessionStart hook: tell the agent whether main's latest CI run is red before any work starts.
// Prints one line of context and always exits 0, so a network failure never blocks a session.
import { execFileSync } from 'node:child_process'
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
process.stdout.write(lines.join(' ') + '\n')
