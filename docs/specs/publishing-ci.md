# Publishing CI

Automated GHA workflow that publishes the npm package and updates GHA version tags whenever a version bump lands on `main`.

## Decisions Made

| Decision | Choice | Rationale |
|---|---|---|
| Release trigger | Manual version bump in `package.json` → push to `main` | Explicit, no extra tooling, deterministic |
| GHA tag strategy | Exact `vX.Y.Z` + floating `vX` major tag | Standard GitHub Marketplace convention |
| Self-update | Yes — auto-commit `readme-ci.yml` version update | Dogfoods the action on every release |

## Prerequisites (package.json fixes required before first publish)

These must be fixed before the workflow can succeed. See the pre-publish checklist:

1. **Add `files` whitelist** — package currently packs 50.5 MB (includes `evals/` datasets). Add to `package.json`:
   ```json
   "files": ["bin/", "lib/", "script.ts", "templates/", ".markdownlint.jsonc"]
   ```
2. **Move `tsx` to `dependencies`** — `bin/rereadme.js` spawns it at runtime; it's currently in `devDependencies`
3. **Move `typescript` to `devDependencies`** — not used at runtime (tsx uses esbuild internally)
4. **Fix `prepare` script** — `"prepare": "husky"` fails for users installing the package without a `.git` dir; change to `"prepare": "husky || true"`
5. ~~**Add `LICENSE` file**~~ — **Done** (commit `be8ed1d`)
6. **Add `provenance: true` to `publishConfig`** — `publishConfig` exists (`"access": "public"`) but is missing `provenance: true`. Update to:
   ```json
   "publishConfig": { "access": "public", "provenance": true }
   ```
   Setting `provenance: true` here (rather than a CLI flag) ensures it's always set and appears in `package.json` as documentation of intent.
7. **Confirm `engines` field** — already present (`"node": ">=22.0.0"`); no change needed
8. **Add `publint` to devDependencies** — static linter that validates `package.json` publish correctness (bin paths exist, `files` entries resolve, ESM/CJS consistency). Fast enough for pre-commit (<1s, file reads only). Add as `make lint-pkg` target and to the pre-commit hook alongside existing lint-staged checks.

## README Badges

Add to `README.md` header (after the title, before the description):

```markdown
[![npm](https://img.shields.io/npm/v/rereadme)](https://www.npmjs.com/package/rereadme)
[![CI](https://github.com/cjlludwig/rereadme/actions/workflows/ci.yml/badge.svg)](https://github.com/cjlludwig/rereadme/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
```

## Commented-Out Items to Resolve

`ci.yml` currently has a placeholder for the real API key:

```yaml
OPENAI_API_KEY: foo
# OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

The `foo` value is intentional for `--check` (dependency validation only, no API call). Leave it as-is — the publish workflow does not run the tool, only `npm ci`. No change needed.

## Secrets Required

| Secret name | Where to set | What it is |
|---|---|---|
| `NPM_TOKEN` | GitHub repo Settings → Secrets → Actions | npm automation token with publish permission (create via npmjs.com → profile → Access Tokens → Generate New Token → Automation; the `npm token create --type automation` CLI flag is outdated as of npm v10+) |

The existing `OPENAI_API_KEY` secret is already set and used by other workflows.

## New File: `.github/workflows/publish.yml`

```yaml
name: Publish to npm

on:
  push:
    branches:
      - main

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write   # push tags and self-update commit
      id-token: write   # required for npm provenance attestation

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0       # required to push tags
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"

      - run: npm ci

      - name: Lint package
        run: npx publint

      - name: Check if version changed
        id: version_check
        run: |
          LOCAL=$(node -p "require('./package.json').version")
          PUBLISHED=$(npm view rereadme version 2>/dev/null || echo "0.0.0")
          echo "local=$LOCAL" >> "$GITHUB_OUTPUT"
          echo "published=$PUBLISHED" >> "$GITHUB_OUTPUT"
          if [ "$LOCAL" = "$PUBLISHED" ]; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Enforce pack size < 500 kB
        if: steps.version_check.outputs.changed == 'true'
        run: |
          npm pack
          TARBALL=$(ls rereadme-*.tgz)
          SIZE=$(stat -c%s "$TARBALL")
          echo "Pack size: ${SIZE} bytes"
          rm "$TARBALL"
          [ "$SIZE" -lt 512000 ] || (echo "ERROR: ${SIZE} bytes exceeds 500 kB limit" && exit 1)

      - name: Publish dry run
        if: steps.version_check.outputs.changed == 'true'
        run: npm publish --dry-run
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Publish to npm
        if: steps.version_check.outputs.changed == 'true'
        run: npm publish --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Tag release
        if: steps.version_check.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.version_check.outputs.local }}
        run: |
          MAJOR=$(echo "$VERSION" | cut -d. -f1)
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -f "v${VERSION}"
          git tag -f "v${MAJOR}"
          git push origin "v${VERSION}"
          git push origin "v${MAJOR}" --force

      - name: Create GitHub Release
        if: steps.version_check.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.version_check.outputs.local }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh release create "v${VERSION}" \
            --title "v${VERSION}" \
            --generate-notes

      - name: Update readme-ci.yml to new version
        if: steps.version_check.outputs.changed == 'true'
        env:
          VERSION: ${{ steps.version_check.outputs.local }}
        run: |
          sed -i "s|cjlludwig/ReReadme@v[0-9]*\.[0-9]*\.[0-9]*|cjlludwig/ReReadme@v${VERSION}|g" \
            .github/workflows/readme-ci.yml
          git add .github/workflows/readme-ci.yml
          git diff --cached --quiet || git commit -m "chore: update GHA ref to v${VERSION} [skip ci]"
          git pull --rebase
          git push
```

## Modified File: `.github/workflows/ci.yml`

Add a pack smoke test job that runs on every push/PR. Installs the CLI from the packed tarball (not `npm link`) to test the exact artifact users receive:

```yaml
  smoke-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - run: npm ci

      - name: Pack and install from tarball
        run: |
          npm pack
          npm install -g ./rereadme-*.tgz

      - name: Smoke test CLI
        run: rereadme --help
        env:
          OPENAI_API_KEY: foo
```

This is intentionally separate from the existing `install-and-cli` job (which uses `npm link`) so both the source and the packed artifact are tested. Too slow (~20–30s) for the pre-commit hook.

## Workflow Logic

```text
push to main
  └─ npm ci
  └─ npx publint                    (always — gates on package validity)
  └─ compare package.json version vs npm registry
       ├─ same → skip (no release needed)
       └─ different →
            ├─ npm pack → assert size < 500 kB
            ├─ npm publish --dry-run (smoke test before real publish)
            ├─ npm publish --provenance
            ├─ git tag -f vX.Y.Z
            ├─ git tag -f vX (floating major)
            ├─ git push tags
            ├─ gh release create vX.Y.Z --generate-notes
            └─ sed readme-ci.yml → commit "chore: update GHA ref to vX.Y.Z [skip ci]" → pull --rebase → push
```

## Release Workflow (Developer Steps)

1. Make changes on a feature branch, open PR
2. Merge to `main` (existing CI runs: install, lint, typecheck, test)
3. Locally: `npm version patch|minor|major` (updates `package.json` and creates a local git tag — discard the local tag with `git tag -d vX.Y.Z` since CI will create it)
4. Push to `main` — publish workflow fires automatically
5. Verify: check npm registry + GitHub Releases tab for new tag

Alternatively, manually edit the `version` field in `package.json` and push.

## File Layout

| File | Change |
|---|---|
| `.github/workflows/publish.yml` | **New** — the publish workflow |
| `.github/workflows/ci.yml` | **Modified** — add `smoke-test` job |
| `.github/workflows/readme-ci.yml` | **Manual update needed before first release** — currently pins `v0.0.3`, bump to `v0.0.4`; auto-updated thereafter |
| `package.json` | **Modified** — `files`, add `provenance: true` to `publishConfig`, dependency moves, `prepare`, add `publint` to devDependencies, fix `homepage`/`bugs`/`repository` URLs (`connorludwig` → `cjlludwig`) |
| `Makefile` | **Modified** — add `lint-pkg` target (`npx publint`), add to `check` and `pre-commit` |
| `LICENSE` | **New** — MIT license text |
| `README.md` | **Modified** — add npm, CI, and license badges |
| `docs/development.md` | **Modified** — add release process section |

## Acceptance Criteria

### Deterministic

- [ ] `npx publint` exits 0 with no errors
- [ ] `npm pack --dry-run` shows ≤ 10 files, package size < 500 kB
- [ ] `ci.yml` smoke-test job passes: pack → install from tarball → `rereadme --help`
- [ ] `npm install -g rereadme` on a clean machine runs `rereadme --help` successfully
- [ ] After merging a version bump PR, `npm view rereadme version` returns the new version within ~2 minutes
- [ ] Git tags `vX.Y.Z` and `vX` exist on the release commit
- [ ] `readme-ci.yml` is updated to `cjlludwig/ReReadme@vX.Y.Z` with a `[skip ci]` commit
- [ ] A GitHub Release exists at `vX.Y.Z` with auto-generated notes listing merged PRs

### Manual verification

- [ ] A subsequent push to `main` without a version bump does not re-publish or re-tag
- [ ] The floating `vX` tag resolves to the latest release commit (check with `git show v1`)
