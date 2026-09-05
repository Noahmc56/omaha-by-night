# Dependency security review

Review date: 2026-09-04. No force upgrades used.

## Compatible repairs applied

- `brace-expansion` 5.0.8 → 5.0.9 and 1.1.16 → 1.1.18. These address resource-exhaustion advisories. The relevant paths are Quartz's glob matching and the local preview's static server dependency. [Advisory](https://github.com/advisories/GHSA-rgw5-rvv9-x895).
- `esbuild` 0.27.7 → 0.27.2: npm's non-force repair selects an earlier unaffected patch in Quartz's existing 0.27 range. This is not an upgrade to the incompatible 0.28 range. The advisory affects esbuild's Windows development server; this project's preview uses serve-handler, not esbuild's development server. The repaired compiler has passed the actual Quartz build. [Advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).

## Accepted temporary exception: sharp (owner decision, 2026-09-04)

`sharp` 0.34.5 is affected by a high-severity advisory in its bundled libvips image processing library. Processing malicious/untrusted images can affect the build machine. The static GitHub Pages site does not execute sharp for visitors. The dependency is used by Quartz's favicon/social-image plugins. [Advisory and mitigation](https://github.com/advisories/GHSA-f88m-g3jw-g9cj).

The owner chose to retain `sharp` 0.34.5 and its existing `^0.34.5` constraint. Do not force an upgrade or move outside that range. Revisit this advisory when an official Quartz update declares support for a patched sharp version, then review the release notes and run local image/build tests before updating. Plugin peer ranges alone do not count as official Quartz support.

The 0.35 release raises the minimum Node version to 20.9 (this project uses 24), changes source-build installation, removes deprecated APIs, changes AVIF tuning, and limits input channels to five by default. The active Quartz image-plugin code does not reference the removed APIs checked during review. These facts support testing the targeted change but are not a guarantee of compatibility. [Release notes](https://github.com/lovell/sharp/releases/tag/v0.35.0).

Publication may proceed under this documented decision. The Pages security check allows only this exact known advisory for sharp 0.34.5; it still fails on other high/critical findings or an unsuccessful audit request. The warning remains visible in build logs. Avoid processing untrusted images while the exception applies. Do not run `npm audit fix --force`.

Raw advisory output and the non-force repair plan are retained locally under `.local-wiki` and excluded from Git. Repeat npm audit near deployment because advisories change.
