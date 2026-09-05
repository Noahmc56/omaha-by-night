import fs from 'node:fs/promises'
import { inventory } from './player-wiki.mjs'
const approved = JSON.parse(await fs.readFile('player-content.manifest.json', 'utf8'))
const content = await inventory('content')
if (content.size !== Object.keys(approved.files).length) throw new Error('Content file set changed since review')
for (const [name, file] of content) {
  if (name !== 'index.md' && !name.startsWith('Player Wiki/')) throw new Error(`Outside Player Wiki: ${name}`)
  if (approved.files[name] !== file.hash) throw new Error(`Not in the reviewed snapshot: ${name}`)
}
console.log(`Reviewed content manifest verified: ${content.size} files.`)
