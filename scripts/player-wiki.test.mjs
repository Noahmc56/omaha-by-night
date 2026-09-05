import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncContent, inventory } from './player-wiki.mjs'

test('only Player Wiki crosses the boundary; additions, moves, removals, and attachments are mirrored', async () => {
  const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local-wiki')
  await fs.mkdir(base, { recursive: true })
  const fixture = await fs.mkdtemp(path.join(base, 'test-'))
  try {
    const project = path.join(fixture, 'project')
    const source = path.join(fixture, 'vault', 'Player Wiki')
    const privateDir = path.join(fixture, 'vault', 'Storyteller')
    await fs.mkdir(project, { recursive: true })
    await fs.mkdir(source, { recursive: true })
    await fs.mkdir(privateDir)
    await fs.writeFile(path.join(privateDir, 'secret.md'), 'PRIVATE_SENTINEL_MUST_NOT_COPY')
    await fs.writeFile(path.join(source, 'Note.md'), '---\ntags: [chronicle]\n---\n[[Other]] ![[image.png]]')
    const attachment = Buffer.from([0, 1, 2, 128, 255])
    await fs.writeFile(path.join(source, 'image.png'), attachment)
    await fs.writeFile(path.join(source, '.hidden'), 'LOCAL_ONLY')
    assert.equal(await syncContent(project, source), true)
    const first = await inventory(path.join(project, 'content'))
    assert.deepEqual([...first.keys()].sort(), ['Player Wiki/Note.md', 'Player Wiki/image.png', 'index.md'])
    assert.deepEqual(first.get('Player Wiki/image.png').data, attachment)
    assert.equal(await syncContent(project, source), false)
    await fs.mkdir(path.join(source, 'Locations'))
    await fs.rename(path.join(source, 'Note.md'), path.join(source, 'Locations', 'Renamed.md'))
    await fs.writeFile(path.join(source, 'Locations', 'Renamed.md'), '# Updated\n[[New]]')
    await fs.unlink(path.join(source, 'image.png'))
    await syncContent(project, source)
    const second = await inventory(path.join(project, 'content'))
    assert.deepEqual([...second.keys()].sort(), ['Player Wiki/Locations/Renamed.md', 'index.md'])
    assert.equal(second.get('Player Wiki/Locations/Renamed.md').data.toString(), '# Updated\n[[New]]')
    await fs.symlink(privateDir, path.join(source, 'External'), 'junction')
    await assert.rejects(syncContent(project, source), /Linked path refused/)
    await fs.unlink(path.join(source, 'External'))
    await fs.link(path.join(privateDir, 'secret.md'), path.join(source, 'hardlink.md'))
    await assert.rejects(syncContent(project, source), /Hard-linked file refused/)
    await fs.unlink(path.join(source, 'hardlink.md'))
    await fs.mkdir(path.join(source, 'Storyteller'))
    await assert.rejects(syncContent(project, source), /Private folder name refused/)
    await fs.rmdir(path.join(source, 'Storyteller'))
    await assert.rejects(syncContent(project, path.dirname(source)), /separate Player Wiki/)
    await fs.rename(source, `${source}-missing`)
    await assert.rejects(syncContent(project, source), /ENOENT/)
    assert.deepEqual([...await inventory(path.join(project, 'content'))].map(([name]) => name).sort(), [...second.keys()].sort())
  } finally {
    assert.equal(path.dirname(fixture), base)
    await fs.rm(fixture, { recursive: true, force: true })
  }
})
