#!/usr/bin/env node
/**
 * Sube el patch de versión, commitea package.json y (opcional) pushea a main.
 * GitHub Actions detecta el cambio en package.json y publica el Release solo.
 *
 * Uso:
 *   npm run release          # solo bump + commit local
 *   npm run release:push     # bump + commit + push main → dispara CI
 *   npm run release -- minor # bump minor en vez de patch
 */
const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))

const args = process.argv.slice(2)
const push = args.includes('--push')
const bumpType = args.includes('minor') ? 'minor' : 'patch'

const parts = pkg.version.split('.').map((n) => parseInt(n, 10))
if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
  console.error(`Versión inválida: ${pkg.version}`)
  process.exit(1)
}

let [major, minor, patch] = parts
if (bumpType === 'minor') {
  minor += 1
  patch = 0
} else {
  patch += 1
}

const next = `${major}.${minor}.${patch}`
pkg.version = next
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' })

run('git add package.json')
try {
  run(`git commit -m "chore: release v${next}"`)
} catch {
  console.error('No se pudo commitear. ¿Hay cambios pendientes o nada que commitear?')
  process.exit(1)
}

console.log(`\n✓ Versión local: v${next}`)

if (push) {
  run('git push origin main')
  console.log('\n→ GitHub Actions compilará y publicará el Release automáticamente.')
  console.log('  Sigue el progreso en: Actions → Release Windows')
} else {
  console.log('\nSiguiente paso: npm run release:push')
}
