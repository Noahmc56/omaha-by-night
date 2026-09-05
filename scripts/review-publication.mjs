import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { inventory, expectedContent } from './player-wiki.mjs'

// Official Quartz source provenance established at initial clone.
const baseline = '075afd3f712da0088a07f5284a7b3aba37dd61b6'
const root = process.cwd()
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
const paths = data => data.toString().split('\0').filter(Boolean)
const sha = data => createHash('sha256').update(data).digest('hex')
const staged = process.argv.includes('--staged')
const source = JSON.parse(await fs.readFile('wiki.local.json', 'utf8')).source
const expected = expectedContent(await inventory(source))
const actual = await inventory('content')
if (expected.size !== actual.size || [...actual].some(([name, file]) => file.hash !== expected.get(name)?.hash)) throw new Error('Content is not the current Player Wiki snapshot')
const manifest = { files: Object.fromEntries([...expected].map(([name, file]) => [name, file.hash])) }
if (!staged) await fs.writeFile('player-content.manifest.json', JSON.stringify(manifest, null, 2) + '\n')

const additions = new Set(['LOCAL-SETUP.md', 'PUBLICATION-PLAN.md', 'DEPENDENCY-REVIEW.md', 'Preview Wiki.cmd', 'quartz.config.yaml', 'player-content.manifest.json', '.github/workflows/pages.yml', 'scripts/player-wiki.mjs', 'scripts/player-wiki.test.mjs', 'scripts/wiki-integration.mjs', 'scripts/review-publication.mjs', 'scripts/check-published-content.mjs', 'scripts/pages-url.mjs'])
additions.add('scripts/check-dependencies.mjs')
for (const name of ['scripts/publish-wiki.mjs', 'scripts/publish-wiki.test.mjs', 'Publish Wiki.bat', 'Check Publishing.bat']) additions.add(name)
const modifications = new Set(['.gitignore', '.gitattributes', 'package.json', 'package-lock.json'])
const originals = new Set(paths(git(['ls-tree', '-r', '--name-only', '-z', baseline])))
const changed = paths(git(['diff', ...(staged ? ['--cached'] : []), '--name-only', '-z', baseline]))
for (const name of changed) {
  if (!modifications.has(name) && !additions.has(name) && !name.startsWith('content/') && !name.startsWith('.github/workflows/')) throw new Error(`Unreviewed upstream modification: ${name}`)
}
const names = [...new Set(paths(git(staged ? ['ls-files', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'])))].sort()
const files = []
for (const name of names) {
  let bytes
  if (staged) {
    const mode = git(['ls-files', '-s', '--', name]).toString().split(' ')[0]
    if (!['100644', '100755'].includes(mode)) throw new Error(`Non-regular staged file: ${name}`)
    bytes = git(['show', `:${name}`])
  } else {
    const full = path.resolve(name)
    let st
    try { st = await fs.lstat(full) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (!st.isFile() || st.isSymbolicLink() || !path.resolve(await fs.realpath(full)).toLowerCase().startsWith(root.toLowerCase() + path.sep)) throw new Error(`Non-regular candidate: ${name}`)
    bytes = await fs.readFile(full)
  }
  if (name.split('/').some(part => ['storyteller', '.obsidian', '.local-wiki', 'node_modules', 'public'].includes(part.toLowerCase())) || name === 'wiki.local.json') throw new Error(`Private/local candidate: ${name}`)
  let category
  if (name.startsWith('content/')) {
    if (sha(bytes) !== expected.get(name.slice(8))?.hash) throw new Error(`Campaign content not from Player Wiki: ${name}`)
    category = name === 'content/index.md' ? 'generated homepage' : 'Player Wiki copy'
  } else if (originals.has(name)) category = 'Quartz source/configuration'
  else if (additions.has(name)) category = 'reviewed project tooling/configuration/documentation'
  else throw new Error(`Unexpected additional file: ${name}`)
  const text = bytes.toString('utf8')
  const privateRoot = source.replace(/\\/g, '/').replace(/\/Player Wiki\/?$/, '')
  if (text.replace(/\\/g, '/').toLowerCase().includes(privateRoot.toLowerCase())) throw new Error(`Local vault path exposed in ${name}`)
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bgithub_pat_[A-Za-z0-9_]{40,}|\bghp_[A-Za-z0-9]{36}\b/.test(text)) throw new Error(`Possible credential in ${name}`)
  files.push({ path: name, category, bytes: bytes.length, sha256: sha(bytes) })
}
if (staged) {
  const stagedManifest = JSON.parse(git(['show', ':player-content.manifest.json']).toString())
  if (JSON.stringify(stagedManifest) !== JSON.stringify(manifest)) throw new Error('Staged manifest is outdated')
}
await fs.mkdir('.local-wiki', { recursive: true })
const report = { checkedAt: new Date().toISOString(), scope: staged ? 'actual Git index' : 'proposed commit working tree', officialQuartzBaseline: baseline, files }
await fs.writeFile(`.local-wiki/privacy-${staged ? 'staged' : 'proposed'}.json`, JSON.stringify(report, null, 2))
if (!staged) await fs.writeFile('.local-wiki/commit-paths.txt', [...new Set([...files.map(file => file.path), ...paths(git(['diff', '--name-only', '--diff-filter=D', '-z']))])].join('\0') + '\0')
console.log(`PASS: ${files.length} ${report.scope} files classified; ${files.filter(file => file.category === 'Player Wiki copy').length} Player Wiki files match the source exactly. No outside-vault content, linked files, local vault path, or detected credentials in this snapshot.`)
console.log('Validity is limited to these hashes. Re-run immediately before uploading; this is not permission to upload.')
