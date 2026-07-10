const fs = require('node:fs')
const path = require('node:path')

const cloudfunctionsRoot = path.join(__dirname, '..')
const canonicalPath = path.join(__dirname, 'roomMembershipLifecycle.js')
const targets = ['createRoom', 'joinRoom', 'getMyRoom', 'leaveRoom']
  .map(name => path.join(cloudfunctionsRoot, name, 'roomMembershipLifecycle.js'))

const mode = process.argv[2]

if (mode !== '--write' && mode !== '--check') {
  console.error('Usage: node syncRoomMembershipLifecycle.js --write|--check')
  process.exitCode = 2
} else {
  const canonical = fs.readFileSync(canonicalPath, 'utf8')
  const mismatches = []

  targets.forEach(target => {
    if (mode === '--write') {
      fs.writeFileSync(target, canonical, 'utf8')
      return
    }

    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== canonical) {
      mismatches.push(target)
    }
  })

  if (mismatches.length) {
    mismatches.forEach(target => console.error('Out of sync: ' + target))
    process.exitCode = 1
  }
}
