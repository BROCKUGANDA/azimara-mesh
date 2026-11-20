#!/usr/bin/env node
// Lightweight, dependency-free secret scan for CI. It inspects tracked text
// files only (git ls-files), so generated bundles and node_modules are ignored.
// This is a backstop, not a replacement for a dedicated scanner.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PATTERNS = [
  { name: 'OpenAI-style key', re: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'AWS access key', re: /AKIA[0-9A-Z]{16}/g },
  { name: 'Private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'GitHub token', re: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'Cloudflare token', re: /(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*=\s*['"]?[A-Za-z0-9_-]{30,}/g },
  { name: 'Slack token', re: /xox[baprs]-[A-Za-z0-9-]{20,}/g },
  { name: 'Bare session secret assignment', re: /SESSION_SECRET\s*=\s*['"][^'"]{16,}['"]/g },
]

let files = []
try {
  files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
} catch (err) {
  console.error('secret-scan: unable to enumerate tracked files', err.message)
  process.exit(2)
}

const BINARY = /\.(png|jpe?g|gif|ico|woff2?|pdf|db|lock)$/i
// Test fixtures deliberately contain credential-shaped strings to verify the
// redaction code. They are synthetic and are not deployment configuration.
const FIXTURE = /^tests\//i
const findings = []
for (const file of files) {
  if (BINARY.test(file) || file.endsWith('.svg') || FIXTURE.test(file)) continue
  let text
  try { text = readFileSync(file, 'utf8') } catch { continue }
  for (const { name, re } of PATTERNS) {
    re.lastIndex = 0
    const match = text.match(re)
    if (match) findings.push(`${file}: ${name} (${match.length} occurrence${match.length > 1 ? 's' : ''})`)
  }
}

if (findings.length) {
  console.error('secret-scan: potential secrets found:\n' + findings.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log(`secret-scan: clean (${files.length} tracked files checked)`)
