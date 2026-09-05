import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import http from 'node:http'
import handler from 'serve-handler'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const digest = data => createHash('sha256').update(data).digest('hex')
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)) }

// No vault-wide discovery or link resolution: only this exact subtree is read.
export async function inventory(root) {
  root = path.resolve(root)
  const stat = await fs.lstat(root)
  if (!stat.isDirectory() || stat.isSymbolicLink() || path.resolve(await fs.realpath(root)).toLowerCase() !== root.toLowerCase()) throw new Error('Source/destination must be a real directory, with no linked ancestors.')
  const files = new Map()
  async function visit(dir, relative = '') {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const rel = relative ? `${relative}/${item.name}` : item.name
      const full = path.join(dir, item.name)
      const st = await fs.lstat(full)
      if (st.isSymbolicLink() || !inside(root, await fs.realpath(full))) throw new Error(`Linked path refused: ${rel}`)
      if (item.name.toLowerCase() === 'storyteller') throw new Error(`Private folder name refused: ${rel}`)
      // Obsidian settings, hidden files, and local metadata are never imported.
      if (item.name.startsWith('.')) continue
      if (st.isDirectory()) await visit(full, rel)
      else if (st.isFile()) {
        if (st.nlink > 1) throw new Error(`Hard-linked file refused: ${rel}`)
        const data = await fs.readFile(full)
        files.set(rel, { data, hash: digest(data) })
      } else throw new Error(`Non-regular file refused: ${rel}`)
    }
  }
  await visit(root)
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)))
}

export function expectedContent(sourceFiles) {
  const files = new Map([...sourceFiles].map(([name, value]) => [`Player Wiki/${name}`, value]))
  const data = Buffer.from('---\ntitle: Omaha by Night\n---\n\nWelcome to **Omaha by Night**, a Vampire: The Masquerade chronicle.\n\nBrowse the [player notes](<Player Wiki/>) using the explorer, search, tags, and graph.\n')
  files.set('index.md', { data, hash: digest(data) })
  return files
}

const signature = files => JSON.stringify([...files].map(([name, value]) => [name, value.hash]).sort())

export async function syncContent(root, source) {
  root = path.resolve(root)
  source = path.resolve(source)
  if (path.basename(source) !== 'Player Wiki' || inside(root, source) || inside(source, root)) throw new Error('Source must be the separate Player Wiki folder.')
  const expected = expectedContent(await inventory(source))
  const content = path.join(root, 'content')
  const local = path.join(root, '.local-wiki')
  await fs.mkdir(local, { recursive: true })
  // Verify every directory targeted by rename/removal is inside this project and unlinked.
  const localStat = await fs.lstat(local)
  if (!localStat.isDirectory() || localStat.isSymbolicLink() || path.resolve(await fs.realpath(local)).toLowerCase() !== local.toLowerCase()) throw new Error('Local staging directory must not be linked.')
  let current
  try { current = await inventory(content) } catch (error) { if (error.code !== 'ENOENT') throw error }
  if (current && signature(current) === signature(expected)) return false
  const stage = await fs.mkdtemp(path.join(local, 'stage-'))
  for (const [name, { data }] of expected) {
    const target = path.join(stage, name)
    if (!inside(stage, target)) throw new Error('Invalid output path')
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, data)
  }
  // Re-read before replacing the snapshot: concurrent vault edits abort this cycle.
  if (signature(expectedContent(await inventory(source))) !== signature(expected)) {
    await fs.rm(stage, { recursive: true })
    throw new Error('Player Wiki changed during import; retrying on the next cycle.')
  }
  const backup = `${stage}-previous`
  if (current) await fs.rename(content, backup)
  try { await fs.rename(stage, content) } catch (error) { if (current) await fs.rename(backup, content); throw error }
  if (current) await fs.rm(backup, { recursive: true })
  await fs.writeFile(path.join(local, 'manifest.json'), JSON.stringify({ importedAt: new Date().toISOString(), files: [...expected].map(([name, value]) => ({ name, sha256: value.hash })) }, null, 2))
  console.log(`Imported ${expected.size - 1} Player Wiki files; generated homepage added.`)
  return true
}

async function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: project, windowsHide: true, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', env: { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` } })
    const out = []; const err = []
    if (capture) { child.stdout.on('data', data => out.push(data)); child.stderr.on('data', data => err.push(data)) }
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${command} exited ${code}: ${Buffer.concat(err)}`)))
  })
}

async function audit(source) {
  const expected = expectedContent(await inventory(source))
  const actual = await inventory(path.join(project, 'content'))
  if (signature(expected) !== signature(actual)) throw new Error('Audit failed: content differs from the current Player Wiki snapshot.')
  const candidates = (await run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], true)).toString().split('\0').filter(Boolean)
  for (const name of candidates) {
    if (name.split('/').some(part => ['storyteller', '.obsidian', '.local-wiki'].includes(part.toLowerCase())) || name === 'wiki.local.json') throw new Error(`Forbidden Git candidate: ${name}`)
    if (name.startsWith('content/') && name !== 'content/.gitkeep' && !expected.has(name.slice(8))) throw new Error(`Unexpected content candidate: ${name}`)
  }
  // Already-staged campaign blobs must also match the authorized snapshot.
  const staged = (await run('git', ['ls-files', '-z', '--', 'content'], true)).toString().split('\0').filter(Boolean)
  for (const name of staged) {
    const blob = await run('git', ['show', `:${name}`], true)
    if (name === 'content/.gitkeep' && blob.length === 0) continue
    if (digest(blob) !== expected.get(name.slice(8))?.hash) throw new Error(`Staged content is stale or unauthorized: ${name}`)
  }
  console.log(`Boundary audit passed: ${actual.size - 1} source files match byte-for-byte; no forbidden Git candidate paths or stale staged content.`)
  console.log('This is a provenance check, not a review of secrets written inside Player Wiki. Review the full staged diff before any first upload.')
}

async function main() {
  const command = process.argv[2] ?? 'preview'
  if (!['sync', 'build', 'preview', 'audit'].includes(command)) throw new Error('Use sync, build, preview, or audit.')
  const { source } = JSON.parse(await fs.readFile(path.join(project, 'wiki.local.json'), 'utf8'))
  if (command === 'audit') return audit(source)
  await syncContent(project, source)
  if (command === 'sync') return
  const build = () => run(process.execPath, ['quartz/bootstrap-cli.mjs', 'build'])
  await build()
  await audit(source)
  if (command === 'build') return
  let ready = true
  const server = http.createServer((req, res) => {
    if (!ready) { res.writeHead(503, { 'Content-Type': 'text/plain' }); res.end('Preview updating or import failed. Retry shortly; check preview log.'); return }
    handler(req, res, { public: path.join(project, 'public'), directoryListing: false, symlinks: false, headers: [{ source: '**', headers: [{ key: 'Cache-Control', value: 'no-store' }] }] }).catch(() => { res.statusCode = 500; res.end('Preview error') })
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8080, '127.0.0.1', resolve) })
  console.log('Local preview: http://127.0.0.1:8080 — watches Player Wiki every 2 seconds. Refresh the browser after edits. Ctrl+C stops it.')
  let lastConfig = await fs.readFile(path.join(project, 'quartz.config.yaml'), 'utf8')
  for (;;) {
    await new Promise(resolve => setTimeout(resolve, 2000))
    try {
      const changed = await syncContent(project, source)
      const config = await fs.readFile(path.join(project, 'quartz.config.yaml'), 'utf8')
      if (changed || config !== lastConfig || !ready) {
        ready = false
        await build()
        await audit(source)
        lastConfig = config
        ready = true
        console.log('Preview updated. Refresh your browser.')
      }
    } catch (error) { ready = false; console.error(error.message) }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
