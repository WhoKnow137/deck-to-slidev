import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(fileURLToPath(import.meta.url))
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number)
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 12)) {
  console.error('Slidev 53 requires Node.js 22.12.0 or later.')
  process.exit(1)
}
const lock = JSON.parse(readFileSync(join(projectDir, 'package-lock.json'), 'utf8'))
const dependencies = Object.keys(lock.packages[''].devDependencies)
const installed = dependencies.every(name => {
  const file = join(projectDir, 'node_modules', name, 'package.json')
  return existsSync(file) && JSON.parse(readFileSync(file, 'utf8')).version === lock.packages[`node_modules/${name}`]?.version
})
if (installed && !process.argv.includes('--force')) {
  console.log('Slidev dependencies are already installed at the locked versions.')
  process.exit(0)
}
const runtimeDir = join(projectDir, '.slidev-runtime')
const cacheDir = join(runtimeDir, 'npm-cache')
mkdirSync(cacheDir, { recursive: true })

const env = {
  ...process.env,
  TEMP: runtimeDir,
  TMP: runtimeDir,
  TMPDIR: runtimeDir,
  npm_config_cache: cacheDir,
  npm_config_offline: 'false',
  NPM_CONFIG_OFFLINE: 'false',
}

console.log(`Installing this project's locked Slidev dependencies in ${projectDir}`)
console.log(`npm cache and temporary files: ${runtimeDir}`)
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], {
  cwd: projectDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
