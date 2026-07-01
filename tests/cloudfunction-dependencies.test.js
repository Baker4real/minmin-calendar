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
