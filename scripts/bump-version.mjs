#!/usr/bin/env node
/**
 * Bump project version across VERSION, package.json, package-lock.json, and CHANGELOG.md
 * Usage:
 *   node scripts/bump-version.mjs              # auto (conventional commits → patch/minor/major)
 *   node scripts/bump-version.mjs patch|minor|major
 *   node scripts/bump-version.mjs --set 0.0.1
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readVersion() {
  return readFileSync(resolve(root, 'VERSION'), 'utf8').trim()
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) throw new Error(`Invalid version: ${v}`)
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) }
}

function format({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`
}

function bump(ver, kind) {
  const s = parseSemver(ver)
  if (kind === 'major') return format({ major: s.major + 1, minor: 0, patch: 0 })
  if (kind === 'minor') return format({ major: s.major, minor: s.minor + 1, patch: 0 })
  return format({ major: s.major, minor: s.minor, patch: s.patch + 1 })
}

function detectBumpKind() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || true', {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
    const log = execSync(`git log ${range} --pretty=%s`, { cwd: root, encoding: 'utf8' })
    const lines = log.split('\n').filter(Boolean)
    if (lines.some((l) => /BREAKING CHANGE/i.test(l) || /^feat!:/.test(l) || /^[a-z]+!:/.test(l))) {
      return 'major'
    }
    if (lines.some((l) => /^feat(\(.+\))?:/.test(l))) return 'minor'
    return 'patch'
  } catch {
    return 'patch'
  }
}

function collectChangelogNotes() {
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null || true', {
      cwd: root,
      encoding: 'utf8',
    }).trim()
    const range = lastTag ? `${lastTag}..HEAD` : ''
    const cmd = range
      ? `git log ${range} --pretty=format:"- %s (%h)"`
      : 'git log -20 --pretty=format:"- %s (%h)"'
    const log = execSync(cmd, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return log || '- Maintenance release'
  } catch {
    return '- Maintenance release'
  }
}

function setPackageVersion(filePath, version) {
  const pkg = JSON.parse(readFileSync(filePath, 'utf8'))
  pkg.version = version
  writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`)
}

/** Keep package-lock.json root / packages[""] version in sync with package.json */
function setLockfileVersion(lockPath, version) {
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    lock.version = version
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = version
    }
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  } catch {
    // lockfile may not exist yet
  }
}

function updateChangelog(version, notes) {
  const path = resolve(root, 'CHANGELOG.md')
  let existing = ''
  try {
    existing = readFileSync(path, 'utf8')
  } catch {
    existing = '# Changelog\n\n本專案所有重要變更會記錄在此檔。\n'
  }
  if (existing.includes(`## [v${version}]`)) return

  const date = new Date().toISOString().slice(0, 10)
  const block = `## [v${version}] - ${date}\n\n${notes}\n\n`
  const header = '# Changelog\n'
  if (existing.startsWith('# Changelog')) {
    writeFileSync(path, existing.replace(/^# Changelog\n+/, `${header}\n${block}`))
  } else {
    writeFileSync(path, `${header}\n${block}${existing}`)
  }
}

const args = process.argv.slice(2)
const current = readVersion()
let next

if (args[0] === '--set' && args[1]) {
  next = args[1].replace(/^v/, '')
  parseSemver(next)
} else {
  const kind = ['major', 'minor', 'patch'].includes(args[0]) ? args[0] : detectBumpKind()
  next = bump(current, kind)
}

writeFileSync(resolve(root, 'VERSION'), `${next}\n`)
setPackageVersion(resolve(root, 'package.json'), next)
setPackageVersion(resolve(root, 'server/package.json'), next)
setLockfileVersion(resolve(root, 'package-lock.json'), next)
setLockfileVersion(resolve(root, 'server/package-lock.json'), next)
updateChangelog(next, collectChangelogNotes())

console.log(`version ${current} → ${next}`)
console.log(`tag=v${next}`)
console.log('updated: VERSION, package.json, package-lock.json, server/package.json, server/package-lock.json, CHANGELOG.md')
