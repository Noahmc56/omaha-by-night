import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { syncContent } from './player-wiki.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Quartz excludes hidden/Git-ignored input paths, so this temporary fixture root is visible.
const base = path.join(root, 'validation-fixtures')
await fs.mkdir(base, { recursive: true })
const fixture = await fs.mkdtemp(path.join(base, 'integration-'))
try {
  const source = path.join(fixture, 'vault', 'Player Wiki')
  const project = path.join(fixture, 'project')
  const output = path.join(fixture, 'public')
  await fs.mkdir(path.join(source, 'Characters'), { recursive: true })
  await fs.mkdir(path.join(source, 'Locations'))
  await fs.mkdir(path.join(source, 'Attachments'))
  await fs.mkdir(path.join(fixture, 'vault', 'Storyteller'))
  await fs.mkdir(project)
  await fs.writeFile(path.join(fixture, 'vault', 'Storyteller', 'Secret.md'), 'PRIVATE_SENTINEL_839719')
  await fs.writeFile(path.join(source, 'Characters', 'Alex.md'), '---\ntitle: Alex Example\ntags: [characters, clan/example]\naliases: [Alex Alias]\n---\n# Character\n[[Club]] and [[Player Wiki/Locations/Club|Club path link]].\n![[token.png]]\n\n> [!note] Public callout\n> Example only.\n\n![[Storyteller/Secret]]\n')
  await fs.writeFile(path.join(source, 'Locations', 'Club.md'), '---\ntitle: The Example Club\n---\n[[Alex]] visits. #locations\n')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')
  await fs.writeFile(path.join(source, 'Attachments', 'token.png'), png)
  await syncContent(project, source)
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['quartz/bootstrap-cli.mjs', 'build', '-d', path.join(project, 'content'), '-o', output], { cwd: root, windowsHide: true, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Fixture build failed: ${code}`)))
  })
  const indexText = await fs.readFile(path.join(output, 'static/contentIndex.json'), 'utf8')
  const index = JSON.parse(indexText)
  const alex = index['player-wiki/characters/alex']
  const club = index['player-wiki/locations/club']
  assert.equal(alex.title, 'Alex Example')
  assert.ok(alex.tags.includes('characters'))
  assert.ok(alex.tags.includes('clan/example'))
  assert.ok(club.tags.includes('locations'))
  assert.ok(alex.links.includes('player-wiki/locations/club'))
  assert.ok(club.links.includes('player-wiki/characters/alex'))
  assert.ok(!indexText.includes('PRIVATE_SENTINEL_839719'))
  const html = await fs.readFile(path.join(output, 'player-wiki/characters/alex.html'), 'utf8')
  assert.ok(html.includes('Public callout'))
  assert.ok(html.includes('backlinks'))
  assert.ok(html.includes('graph'))
  assert.ok(html.includes('token.png'))
  assert.deepEqual(await fs.readFile(path.join(output, 'player-wiki/attachments/token.png')), png)
  assert.ok(await fs.stat(path.join(output, 'tags/characters.html')))
  assert.ok(await fs.stat(path.join(output, 'alex-alias.html')))
  async function noSecrets(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) await noSecrets(file)
      else assert.ok(!(await fs.readFile(file)).includes(Buffer.from('PRIVATE_SENTINEL_839719')), `Private fixture leaked: ${file}`)
    }
  }
  await noSecrets(output)
  console.log('Integration passed: wikilinks, links with Player Wiki paths, backlink data, tags, frontmatter title/alias, callout, graph, and exact attachment bytes. An embed pointing outside Player Wiki did not import private content.')
} finally {
  assert.equal(path.dirname(fixture), base)
  await fs.rm(fixture, { recursive: true, force: true })
  await fs.rmdir(base)
}
