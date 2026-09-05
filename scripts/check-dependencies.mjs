import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export function evaluateAudit(report, sharpVersion) {
  if (!report || report.error || report.auditReportVersion !== 2 || !report.vulnerabilities || !report.metadata?.vulnerabilities) throw new Error('Dependency audit failed or returned an unsupported response')
  const blocked = []
  const exceptions = []
  for (const [name, entry] of Object.entries(report.vulnerabilities)) {
    if (!['high', 'critical'].includes(entry.severity)) continue
    const knownSharp = name === 'sharp' && sharpVersion === '0.34.5' && entry.severity === 'high' && entry.via.length > 0 && entry.via.every(advisory => typeof advisory === 'object' && advisory.url === 'https://github.com/advisories/GHSA-f88m-g3jw-g9cj' && advisory.range === '<0.35.0')
    if (knownSharp) exceptions.push(name)
    else blocked.push(name)
  }
  return { blocked, exceptions }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let output
    const options = { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    try {
      output = process.platform === 'win32'
        ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd audit --json --fetch-retries=0 --fetch-timeout=20000'], options)
        : execFileSync('npm', ['audit', '--json', '--fetch-retries=0', '--fetch-timeout=20000'], options)
    } catch (error) {
      if (!error.stdout) throw error
      output = error.stdout
    }
    const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'))
    const result = evaluateAudit(JSON.parse(output), lock.packages['node_modules/sharp']?.version)
    if (result.exceptions.length) console.warn('Known advisory retained by owner decision: sharp 0.34.5 / GHSA-f88m-g3jw-g9cj. See DEPENDENCY-REVIEW.md; revisit when Quartz officially supports a patched release.')
    if (result.blocked.length) throw new Error(`Unaccepted high/critical advisories: ${result.blocked.join(', ')}`)
    console.log('Dependency check passed with only documented exceptions, if any.')
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
