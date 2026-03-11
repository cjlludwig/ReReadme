# Workflows

In an AI-assisted workflow, every agent session without context pays to rediscover it — reading files, inferring structure, guessing conventions. A well-maintained README amortizes that cost: pay once to persist context, not repeatedly to rediscover it. These workflows show how rereadme fits into local development and CI pipelines to keep that context current.

## Generate a README from Scratch

No README? Run rereadme to generate one — the tool explores your repo structure and distills it into a polished doc.

```shell
# Before
ls README.md
# ❌ ls: README.md: No such file or directory
```

```shell
# After
rereadme --verbose
ls README.md
# ✨ README.md
```

## Refresh an Outdated README

Placeholder or stub READMEs are common — run rereadme to replace boilerplate with accurate, repo-specific content.

```shell
# Before
cat README.md
# # My Repo
#
#  TODO
```

```shell
# After
rereadme
cat README.md
# # My Repo
#
#  A service aimed at...
#
# ## Usage...
```

## Enforce a Consistent Format Across Repos

Repos accumulate inconsistent structures over time — use `--template` with a shared company template to normalize them in one pass.

```shell
# Before: each repo has its own ad-hoc structure
cat README.md   # → ## Setup
cat README2.md  # → ## Usage
cat README3.md  # → ## Description
```

```shell
# After: run rereadme in each repo with a shared template
rereadme --template COMPANY_README_TEMPLATE.md
cat README.md
# # My Repo
#
# ## Description
# ...
# ## Setup
# ...
# ## Usage
# ...
```

## Catch Documentation Drift in CI

Add the published GitHub Action to your PR pipeline — on every pull request, it reads the diff, detects whether changes warrant a README update, and posts suggestions as a PR comment without modifying the README.

```yaml
# .github/workflows/readme-ci.yml
name: README CI Suggestions
on:
  pull_request:
    branches: [main]
jobs:
  readme-suggestions:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: cjlludwig/ReReadme@v0
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
# ⚠️ README-suggestions.md written on drift
# ✍️ PR comment posted automatically
```

## Auto-Apply Doc Updates in CI

Add `--apply` to go further: patches are written directly to `README.md` so docs stay in sync without manual review.

```shell
git --no-pager diff
# diff --git a/blogs/2-22-26-rereadme.md b/blogs/2-22-26-rereadme.md
# -title: "ReReadme: Doc made simple"
# +title: "ReReadme: Doc-as-ci"
# ... (remaining diff omitted)

rereadme --ci --apply

# ♻️ README.md
```
