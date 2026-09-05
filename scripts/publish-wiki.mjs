import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repo = 'Noahmc56/omaha-by-night'
const remote = `https://github.com/${repo}.git`
const site = 'https://noahmc56.github.io/omaha-by-night/'

// All upload-capable operations are after every local gate, including the final audit.
export async function publishSequence(step, dryRun = false) {
  for (const name of ['preflight', 'sync', 'review', 'stage', 'audit', 'snapshot', 'dependencies', 'build', 'recheck']) await step(name)
  if (dryRun) return
  for (const name of ['commit', 'push', 'record', 'deploy']) await step(name)
}

export async function prepareGitHub(run, gh, dryRun) {
  if (dryRun) return
  try { await run(gh, ['auth', 'status', '--hostname', 'github.com']) }
  catch {
    console.log('\nGitHub sign-in is needed once. Copy the code shown below, press Enter to open your browser, sign in, and authorize GitHub CLI. Return to this window when finished. No project files are uploaded during login.')
    await run(gh, ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web', '--scopes', 'workflow'], true)
    await run(gh, ['auth', 'status', '--hostname', 'github.com'])
  }
  // gh writes a credential helper that references this portable executable.
  await run(gh, ['auth', 'setup-git', '--hostname', 'github.com'])
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported.')
  process.chdir(root)
  const local = path.join(root, '.local-wiki')
  const localStat = await fs.lstat(local)
  if (localStat.isSymbolicLink() || path.resolve(await fs.realpath(local)).toLowerCase() !== local.toLowerCase()) throw new Error('Local tools directory must not be linked.')
  const lockPath = path.join(local, 'publish.lock')
  const lock = await fs.open(lockPath, 'wx').catch(() => { throw new Error('Another publisher is running. If a previous run crashed, remove .local-wiki/publish.lock only after its window is closed.') })
  let scratch
  let pushed = false
  const gh = path.resolve(process.env.OMAHA_GH_EXE || path.join(local, 'tools/github-cli/bin/gh.exe'))
  const index = path.join(local, 'publish.index')
  const env = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, GIT_INDEX_FILE: index, GIT_LITERAL_PATHSPECS: '1' }
  delete env.GIT_WORK_TREE
  delete env.GIT_DIR
  const run = (exe, args, cwd = root, capture = false, input, interactive = false) => new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, env, windowsHide: true, stdio: interactive ? 'inherit' : [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', 'pipe'] })
    const out = []; const err = []
    if (capture) child.stdout.on('data', data => out.push(data))
    child.stderr?.on('data', data => { err.push(data); process.stderr.write(data) })
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(Buffer.concat(out).toString().trim()) : reject(new Error(`${path.basename(exe)} failed (${code}). ${Buffer.concat(err).toString().trim()}`)))
    if (input !== undefined) child.stdin.end(input)
  })
  const git = (args, capture = false, input) => run('git', args, root, capture, input)
  const node = (script, args = [], cwd = root) => run(process.execPath, [script, ...args], cwd)
  let head, tree, commit
  try {
    await publishSequence(async step => {
      console.log(`\n[${step}]`)
      if (step === 'preflight') {
        if (await git(['symbolic-ref', '--short', 'HEAD'], true) !== 'v5') throw new Error('Publish from the v5 branch only.')
        if (await git(['remote', 'get-url', 'origin'], true) !== remote || await git(['remote', 'get-url', '--push', 'origin'], true) !== remote) throw new Error('Unexpected upload destination; refusing to publish.')
        const normalEnv = { ...env }; delete normalEnv.GIT_INDEX_FILE
        // Do not overwrite a user's manually staged work.
        const { execFileSync } = await import('node:child_process')
        if (execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, env: normalEnv }).length) throw new Error('There are manually staged changes. Commit or unstage them before using this publisher.')
        await prepareGitHub((exe, args, interactive = false) => run(exe, args, root, false, undefined, interactive), gh, dryRun)
        if (!dryRun) await git(['fetch', '--no-tags', 'origin', 'v5'])
        else console.log('Check-only mode: skipping GitHub login and remote fetch. Remote freshness is checked when publishing.')
        head = await git(['rev-parse', 'HEAD'], true)
        if (!dryRun && head !== await git(['rev-parse', 'refs/remotes/origin/v5'], true)) throw new Error('Local and remote history differ. No automatic merge or upload will be attempted.')
        await git(['read-tree', head])
      }
      if (step === 'sync') await node('scripts/player-wiki.mjs', ['sync'])
      if (step === 'review') await node('scripts/review-publication.mjs')
      if (step === 'stage') {
        await git(['read-tree', head])
        await git(['add', '--all', '--pathspec-from-file=.local-wiki/commit-paths.txt', '--pathspec-file-nul'])
      }
      if (step === 'audit' || step === 'recheck') {
        await node('scripts/review-publication.mjs', ['--staged'])
        if (step === 'recheck' && tree !== await git(['write-tree'], true)) throw new Error('Snapshot changed during build.')
        if (step === 'recheck' && head !== await git(['rev-parse', 'HEAD'], true)) throw new Error('Branch changed during build.')
      }
      if (step === 'snapshot') {
        tree = await git(['write-tree'], true)
        scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'omaha-publish-'))
        await git(['checkout-index', '--all', `--prefix=${scratch.replace(/\\/g, '/')}/`])
        // Only build dependencies are linked, never vault/content directories.
        await fs.symlink(path.join(root, 'node_modules'), path.join(scratch, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
        await node('scripts/check-published-content.mjs', [], scratch)
        const { default: YAML } = await import('yaml')
        const configPath = path.join(scratch, 'quartz.config.yaml')
        const config = YAML.parse(await fs.readFile(configPath, 'utf8'))
        config.configuration.baseUrl = 'noahmc56.github.io/omaha-by-night'
        await fs.writeFile(configPath, YAML.stringify(config))
      }
      if (step === 'dependencies') await node('scripts/check-dependencies.mjs', [], scratch)
      if (step === 'build') {
        await node('quartz/bootstrap-cli.mjs', ['build'], scratch)
        await node('scripts/check-published-content.mjs', [], scratch)
      }
      if (step === 'commit') {
        if (tree === await git(['rev-parse', `${head}^{tree}`], true)) commit = head
        else commit = await git(['commit-tree', tree, '-p', head], true, 'Publish reviewed Omaha by Night player wiki\n')
      }
      if (step === 'push') {
        console.log(`Uploading only the audited snapshot to ${remote}`)
        await git(['-c', 'push.followTags=false', 'push', 'origin', `${commit}:refs/heads/v5`])
        pushed = true
      }
      if (step === 'record') {
        await git(['update-ref', 'refs/heads/v5', commit, head])
        const normalEnv = { ...env }; delete normalEnv.GIT_INDEX_FILE
        const { execFileSync } = await import('node:child_process')
        execFileSync('git', ['read-tree', commit], { cwd: root, env: normalEnv })
        await fs.writeFile(path.join(local, 'last-publication.json'), JSON.stringify({ commit, site, at: new Date().toISOString() }, null, 2))
      }
      if (step === 'deploy') {
        const output = await run(gh, ['workflow', 'run', 'pages.yml', '--repo', repo, '--ref', 'v5'], root, true)
        console.log(output)
        const match = output.match(/actions\/runs\/(\d+)/)
        if (!match) throw new Error('Workflow requested but its run ID was not returned. Check GitHub Actions before retrying.')
        await run(gh, ['run', 'watch', match[1], '--repo', repo, '--exit-status', '--interval', '10'])
        const response = await fetch(site, { signal: AbortSignal.timeout(30000) })
        if (!response.ok || !(await response.text()).includes('Omaha by Night')) throw new Error('Deployment completed but the public homepage check failed.')
      }
    }, dryRun)
    console.log(dryRun ? '\nCHECK PASSED. No commit, push, or deployment was performed.' : `\nPUBLISHED SUCCESSFULLY: ${site}`)
  } catch (error) {
    console.error(pushed ? '\nThe audited snapshot was uploaded, but a later step failed. Re-running can retry deployment.' : '\nSTOPPED. This run did not upload anything.')
    throw error
  } finally {
    if (scratch) {
      // Validate the exact temporary directory and unlink dependencies before recursive removal.
      if (path.dirname(scratch) !== os.tmpdir() || !path.basename(scratch).startsWith('omaha-publish-')) throw new Error('Unexpected cleanup path')
      await fs.unlink(path.join(scratch, 'node_modules')).catch(error => { if (error.code !== 'ENOENT') throw error })
      await fs.rm(scratch, { recursive: true, force: true })
    }
    await lock.close()
    await fs.unlink(lockPath)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1 })
