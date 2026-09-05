import test from 'node:test'
import assert from 'node:assert/strict'
import { publishSequence, prepareGitHub } from './publish-wiki.mjs'

test('every failed local gate prevents committing, pushing and deploying', async () => {
  for (const failure of ['preflight', 'sync', 'review', 'stage', 'audit', 'snapshot', 'dependencies', 'build', 'recheck']) {
    const called = []
    await assert.rejects(publishSequence(async name => { called.push(name); if (name === failure) throw new Error(failure) }))
    assert.ok(!called.some(name => ['commit', 'push', 'deploy'].includes(name)), failure)
  }
})
test('dry run never uploads and successful run deploys only after recheck', async () => {
  const dry = []; await publishSequence(async name => dry.push(name), true)
  assert.equal(dry.at(-1), 'recheck')
  const live = []; await publishSequence(async name => live.push(name))
  assert.deepEqual(live.slice(-5), ['recheck', 'commit', 'push', 'record', 'deploy'])
})

test('check-only never invokes GitHub CLI even if it is missing', async () => {
  await prepareGitHub(() => { throw new Error('CLI must not run') }, 'missing-gh.exe', true)
})
test('portable CLI login inherits the console, rechecks authentication, then configures Git', async () => {
  const calls = []
  const portable = 'C:/project with spaces/.local-wiki/tools/github-cli/bin/gh.exe'
  await prepareGitHub(async (exe, args, interactive) => {
    assert.equal(exe, portable)
    calls.push({ args, interactive })
    if (calls.length === 1) throw new Error('Not signed in')
  }, portable, false)
  assert.deepEqual(calls.map(call => call.args[1]), ['status', 'login', 'status', 'setup-git'])
  assert.equal(calls[1].interactive, true)
})
test('existing authentication skips login and failed login aborts', async () => {
  const calls = []
  await prepareGitHub(async (_exe, args) => calls.push(args[1]), 'portable-gh.exe', false)
  assert.deepEqual(calls, ['status', 'setup-git'])
  await assert.rejects(prepareGitHub(async () => { throw new Error('Login cancelled') }, 'portable-gh.exe', false), /Login cancelled/)
})
