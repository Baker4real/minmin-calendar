const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const cloudfunctionsRoot = path.join(repoRoot, 'cloudfunctions')
const exactVersionPattern = /^\d+\.\d+\.\d+$/
const pinnedWxServerSdkVersion = '3.0.4'

test('cloud functions pin wx-server-sdk and commit matching lockfiles', () => {
  const functions = listCloudFunctions()
  assert.notEqual(functions.length, 0)

  const pinnedVersions = new Set()

  functions.forEach(functionName => {
    const functionDir = path.join(cloudfunctionsRoot, functionName)
    const packageJsonPath = path.join(functionDir, 'package.json')
    const packageLockPath = path.join(functionDir, 'package-lock.json')
    const packageJson = readJson(packageJsonPath)
    const sdkVersion = packageJson.dependencies && packageJson.dependencies['wx-server-sdk']

    assert.match(
      sdkVersion,
      exactVersionPattern,
      `${functionName} must pin wx-server-sdk to an exact version`
    )
    assert.equal(
      fs.existsSync(packageLockPath),
      true,
      `${functionName} must commit package-lock.json`
    )

    const packageLock = readJson(packageLockPath)
    const rootPackage = packageLock.packages && packageLock.packages['']
    const lockedSdkPackage = packageLock.packages && packageLock.packages['node_modules/wx-server-sdk']

    assert.equal(
      rootPackage && rootPackage.dependencies && rootPackage.dependencies['wx-server-sdk'],
      sdkVersion,
      `${functionName} package-lock root dependency must match package.json`
    )
    assert.equal(
      lockedSdkPackage && lockedSdkPackage.version,
      sdkVersion,
      `${functionName} package-lock must resolve wx-server-sdk to the pinned version`
    )

    pinnedVersions.add(sdkVersion)
  })

  assert.deepEqual([...pinnedVersions], [pinnedWxServerSdkVersion])
})

test('room membership lifecycle deployment artifacts match the canonical source', () => {
  const canonical = fs.readFileSync(
    path.join(cloudfunctionsRoot, '_shared', 'roomMembershipLifecycle.js'),
    'utf8'
  )
  const functionNames = ['createRoom', 'joinRoom', 'getMyRoom', 'leaveRoom']

  functionNames.forEach(functionName => {
    const artifact = fs.readFileSync(
      path.join(cloudfunctionsRoot, functionName, 'roomMembershipLifecycle.js'),
      'utf8'
    )
    assert.equal(artifact, canonical)
  })
})

test('room membership lifecycle adapters use only their local artifact and operation', () => {
  const adapters = {
    createRoom: 'create',
    joinRoom: 'join',
    getMyRoom: 'getActive',
    leaveRoom: 'leave'
  }

  Object.entries(adapters).forEach(([functionName, operation]) => {
    const source = fs.readFileSync(path.join(cloudfunctionsRoot, functionName, 'index.js'), 'utf8')

    assert.match(
      source,
      /require\(['"]\.\/roomMembershipLifecycle['"]\)/,
      `${functionName} must require its local room membership lifecycle artifact`
    )
    assert.doesNotMatch(
      source,
      /require\(['"][^'"]*_shared[^'"]*['"]\)/,
      `${functionName} must not require the canonical source at runtime`
    )
    assert.match(
      source,
      new RegExp(`lifecycle\\.${operation}\\(`),
      `${functionName} must call lifecycle.${operation}`
    )
  })
})

function listCloudFunctions() {
  return fs.readdirSync(cloudfunctionsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(functionName => fs.existsSync(path.join(cloudfunctionsRoot, functionName, 'package.json')))
    .sort()
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
