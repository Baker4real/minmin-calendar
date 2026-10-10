const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const scratch = path.join(root, '.scratch')
fs.mkdirSync(path.join(scratch, 'tmp'), { recursive: true })
const cli = path.join(path.dirname(require.resolve('playwright/package.json')), 'cli.js')
const result = spawnSync(process.execPath, [cli, 'install', ...(process.platform === 'linux' ? ['--with-deps'] : []), 'chromium'], {
  cwd: root,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: path.join(scratch, 'browsers'), TMP: path.join(scratch, 'tmp'), TEMP: path.join(scratch, 'tmp') },
  stdio: 'inherit'
})
if (result.error) console.error(result.error.message)
process.exitCode = result.status === 0 && !result.error ? 0 : 1
