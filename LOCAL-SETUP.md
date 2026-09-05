# Omaha by Night Wiki — local player pipeline

Quartz 5.0.0 reads only the separate project's `content` snapshot. The importer reads only the configured **Player Wiki** subtree. It never scans or imports the sibling **Storyteller** folder and never writes into the Obsidian vault.

## Preview

Double-click **Preview Wiki.cmd** in this folder, then open http://127.0.0.1:8080.
Keep its window open while editing in Obsidian. It checks for changes every two seconds, rebuilds when needed, and reports when to refresh the browser. Ctrl+C stops it. If a preview is already running, use that one instead of starting another.

The server listens only on this computer's loopback address. It serves only `public`, with directory listings and symlink traversal disabled. A failed import/build makes the preview unavailable until a successful retry.

## Editing in Obsidian

Add, edit, rename, move, reorganize, or delete files anywhere under Player Wiki. The next import replaces the generated snapshot, removing obsolete files. Attachments must also be inside Player Wiki. Hidden files and Obsidian settings are excluded. Linked directories/files and hard links are refused, as is a nested folder named Storyteller.

Short wikilinks and links starting with `Player Wiki/` are supported. Backlinks, tags, frontmatter, Markdown, images, graph, explorer, and search are enabled. References to content outside Player Wiki cannot import that content. The text of such a reference may still be visible because it is itself part of a player note; keep player-note text suitable for readers. Advanced optional Excalidraw/theme plugins remain disabled.

The generated homepage links to the Player Wiki folder listing. A homepage written inside Player Wiki stays in that folder. Do not edit `content` directly: the importer replaces it with the approved source snapshot. `public` is generated output, not an online deployment.

## Local commands

With Node.js available, these commands work from the project folder:

- `npm run wiki:preview`: import, build, audit, serve locally, and watch.
- `npm run wiki:build`: import, build, and audit once.
- `npm run wiki:sync`: import only.
- `npm run wiki:audit`: compare content byte-for-byte against current Player Wiki, check Git candidate paths, and validate any staged content blobs.
- `npm run wiki:test`: disposable boundary tests; does not touch the real vault.
- `node scripts/wiki-integration.mjs`: disposable Quartz feature/information-boundary test.

`wiki.local.json` holds the source path. It and `.local-wiki` (staging, logs, manifest) are Git-ignored. No source path is committed. Imported files are real copies, not symlinks.

## Before the first upload

No personal GitHub repository or Pages deployment exists. Nothing has been uploaded. Only the official Quartz upstream remote exists, and implicit pushes are disabled.

Before creating or publishing the site, tell the owner exactly what will become public and obtain approval. Re-import and run the boundary audit; review the complete staged file list and staged diff, including attachments and metadata. Check that only Quartz code/configuration, project tooling/documentation, the generated homepage, and the approved Player Wiki snapshot would be committed. Do not commit local configuration, manifests, logs, dependency folders, build output, vault settings, or any Storyteller material. Do not run `quartz sync` without explicit upload approval.

The boundary audit verifies file provenance; it cannot recognize a secret accidentally written inside Player Wiki. A Quartz ignore rule or draft flag does not keep a file out of a public Git repository. Files deliberately placed in Player Wiki are eligible for publication, including their full source text and frontmatter.

When GitHub Pages is approved, build from this committed, reviewed snapshot. Do not configure a hosted workflow to access the original vault. Review/replace upstream's maintenance workflows rather than enabling them as this site's deployment pipeline. Review the previously reported dependency vulnerabilities before deployment.

## Verification

- Actual Player Wiki/Test.md imported byte-for-byte; no vault writes.
- Boundary tests cover additions, edits, moves, deletions, attachment bytes, unavailable sources, and refusal of junctions, symlinks, hard links, and nested Storyteller folders.
- Quartz integration test verifies wikilinks, paths with Player Wiki, backlinks/graph data, frontmatter titles and aliases, tags, callouts, and attachments. A fake private sibling note referenced by an embed is absent from generated output.
- The actual site builds successfully with a generated homepage and the imported note.
