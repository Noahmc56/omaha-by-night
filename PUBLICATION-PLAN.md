# GitHub Pages preparation — not published

**Current status:** The site is live at https://noahmc56.github.io/omaha-by-night/. For routine updates use **Publish Wiki.bat**, which performs the pre-upload checks below automatically and dispatches Pages after a successful push. The initial-setup instructions below are retained for reference; repository creation and authentication have already been completed.

The prepared workflow is `.github/workflows/pages.yml`. It runs only by manual dispatch and only when the repository variable `PUBLISH_APPROVED` is `true`. No repository has been created, connected, or uploaded. Existing upstream maintenance/deployment workflows were moved to the Git-ignored local archive rather than retained as active workflows for this wiki.

## What a future public repository would contain

- Official Quartz source, its documentation/license, and the reviewed configuration and dependency lockfile.
- The project's import, validation, preview, and deployment tooling and these setup documents.
- A generated Omaha by Night homepage.
- The reviewed contents of `content/Player Wiki`, including complete Markdown source/frontmatter and any approved attachments.
- `player-content.manifest.json`, containing relative public filenames and hashes so CI can reject a changed or unexpected content snapshot.

No content from elsewhere in the Obsidian vault is permitted. Local vault-path settings, local reports/logs/staging, Obsidian settings, dependencies, and generated output are excluded. The website artifact contains the generated site, while the repository also exposes the approved source files. Hiding text with a draft flag is not repository privacy.

## Pre-upload review

1. Import current Player Wiki and build/test locally.
2. Run `node scripts/review-publication.mjs`. This requires all campaign files to match Player Wiki exactly and classifies every proposed file against the original official Quartz baseline or the explicit project-file allowlist. It also checks linked files, local vault paths, and common GitHub/private-key credential patterns. This is provenance validation and a limited credential scan, not a semantic guarantee about content deliberately placed in Player Wiki.
3. Build an isolated review Git index using the exact generated path list; run `node scripts/review-publication.mjs --staged` with that index selected. This verifies actual Git blob bytes without interfering with the working index or live preview. Review the complete file list/diff in addition to automated checks.
4. Tell the owner exactly which campaign files and project files would become public. Obtain upload approval. If any file has changed since the hash review, repeat it before the upload.
5. Only then create/connect the chosen GitHub repository and commit/push the approved snapshot. No credentials or account information should be written in committed files.

## Information still needed

- The owner's GitHub account/username (and sign-in if necessary).
- Repository name; suggested name: `omaha-by-night`.
- Approval of the final public file list. The owner has deferred the known sharp advisory until Quartz officially supports a patched version; no out-of-range upgrade is authorized.

## Pages configuration after approval

Use a public repository for GitHub Free Pages hosting. Select GitHub Actions under Settings → Pages. Set `PUBLISH_APPROVED=true` only when publication has been authorized, then manually run the workflow. It checks dependencies and the content manifest, obtains the real Pages URL through configure-pages, adjusts baseUrl only in the CI checkout, builds the committed snapshot, and uploads only `public` as the Pages artifact. It does not read the local vault or run the importer. Local configuration remains on localhost.

Do not automatically publish every local Obsidian edit. Re-import, review, update the manifest, and upload only approved snapshots.

Sources: [Quartz hosting](https://quartz.jzhao.xyz/hosting), [GitHub custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
