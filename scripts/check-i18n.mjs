import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SCAN_DIRS = ['app', 'components']
const EXTENSIONS = new Set(['.tsx', '.jsx'])
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git'])
const ALLOWED_LITERALS = new Set([
  'BEARION',
  'hello@bearion.com',
  'categories-schema.sql',
  'WhatsApp',
])

// Admin pages the shop owner operates directly are written in plain Indonesian
// on purpose — a language toggle there only makes courier settings harder to read.
const SINGLE_LANGUAGE_FILES = new Set([
  'app/admin/dashboard/shipping/page.tsx',
  'app/admin/dashboard/contact/page.tsx',
  'components/HeroImageManager.tsx',
])

const toRepoPath = (filePath) => path.relative(ROOT, filePath).replace(/\\/g, '/')

const offenders = []

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return

  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath)
      continue
    }

    const ext = path.extname(entry.name)
    if (!EXTENSIONS.has(ext)) continue
    if (SINGLE_LANGUAGE_FILES.has(toRepoPath(fullPath))) continue

    scanFile(fullPath)
  }
}

function shouldSkipLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return true
  if (trimmed.startsWith('//')) return true
  if (trimmed.includes('tr(') || trimmed.includes('t(')) return true
  return false
}

function pushOffender(filePath, lineNumber, reason, text) {
  if (ALLOWED_LITERALS.has(text.trim())) return

  offenders.push({
    filePath: toRepoPath(filePath),
    lineNumber,
    reason,
    text: text.trim(),
  })
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split(/\r?\n/)

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    if (shouldSkipLine(line)) return

    // JSX text content on a single line, e.g. <span>Add to Cart</span>
    const jsxTextRegex = /<[^/!][^>]*>\s*([^<{][^<]*)\s*<\/[^>]+>/g
    let jsxMatch
    while ((jsxMatch = jsxTextRegex.exec(line)) !== null) {
      const text = jsxMatch[1].trim()
      if (!text) continue
      if (/[{}]/.test(text)) continue
      if (!/[A-Za-z]/.test(text)) continue
      if (/^[A-Za-z0-9_]+$/.test(text) && text.length <= 3) continue
      pushOffender(filePath, lineNumber, 'JSX text literal', text)
    }

    // Common static attributes used for visible/accessibility text.
    const attrRegex = /(placeholder|title|aria-label|alt)=["']([^"']*[A-Za-z][^"']*)["']/g
    let attrMatch
    while ((attrMatch = attrRegex.exec(line)) !== null) {
      const text = attrMatch[2].trim()
      if (!text) continue
      pushOffender(filePath, lineNumber, `Static ${attrMatch[1]} literal`, text)
    }
  })
}

for (const scanDir of SCAN_DIRS) {
  walk(path.join(ROOT, scanDir))
}

if (offenders.length === 0) {
  console.log('i18n check passed: no hardcoded UI literals detected in JSX lines checked.')
  process.exit(0)
}

console.error(`i18n check failed: found ${offenders.length} potential hardcoded UI literals.`)
for (const offender of offenders.slice(0, 200)) {
  console.error(`- ${offender.filePath}:${offender.lineNumber} [${offender.reason}] ${offender.text}`)
}

if (offenders.length > 200) {
  console.error(`...and ${offenders.length - 200} more`)
}

console.error('\nFix by wrapping UI strings with tr(english, indonesian) or t(key).')
process.exit(1)
