# Plan: Bundle markdownlint-cli as a Package Dependency

## Context

`markdownlint-cli` is currently required as a manually-installed global tool (via `npm install -g markdownlint-cli` or Homebrew). It is used both at **runtime** (script.ts formats generated README files) and during **development/CI** (Makefile quality gate). This creates a setup burden for contributors and users. The goal is to declare it as a package dependency so it is automatically available after `npm install`/`npm link` — no global install needed.

## Files to Modify

| File | Change |
|---|---|
| `package.json` | Add `markdownlint-cli` to `dependencies` |
| `script.ts` | Update `checkDependencies()` message; keep invocations as-is |
| `Makefile` | Use `npx markdownlint` (consistent with `npx eslint`, `npx tsc`) |
| `.github/workflows/ci.yml` | Remove `npm install -g markdownlint-cli` step |
| `README.md` | Remove optional install mention + troubleshooting note |
| `CLAUDE.md` | Remove markdownlint-cli from system dependencies section |

---

## Implementation Steps

### 1. `package.json` — Add to `dependencies`

Add `markdownlint-cli` under `dependencies` (not `devDependencies`, because `script.ts` uses it at runtime and it must be available after `npm install -g rereadme`).

```json
"dependencies": {
  "@openai/agents": "0.4.10",
  "markdownlint-cli": "^0.45.0",   // <-- add; pin to latest stable
  "typescript": "5.9.3",
  "zod": "4.3.6",
  "zx": "8.8.5"
}
```

The `lint-staged` config (`"*.md": "markdownlint --fix"`) does not need to change — lint-staged adds `node_modules/.bin` to PATH automatically.

### 2. `script.ts` — Update dependency check message

The `checkDependencies()` at lines 27–39 warns to install globally. Since markdownlint-cli is now bundled, change the failure message to note it's a package dependency that should be resolved via `npm install`:

```typescript
// Before:
echo(chalk.red('❌ markdownlint-cli not found. Install with: npm install -g markdownlint-cli OR brew install markdownlint-cli'))

// After:
echo(chalk.red('❌ markdownlint-cli not found. Run: npm install'))
```

Apply the same change to both occurrences (lines 33 and 37).

The `markdownlint --fix` invocations in `formatReadme()` (line 89) and AGENTS.md formatting (line 168) **do not change** — when installed globally via `npm install -g rereadme`, npm links all dependency binaries into the global bin directory, making `markdownlint` available in PATH.

### 3. `Makefile` — Use `npx` for markdownlint

Replace bare `markdownlint` calls with `npx markdownlint` (consistent with how the Makefile already calls `npx eslint` and `npx tsc`):

```makefile
lint-md:
	@echo "==> markdownlint"
	npx markdownlint '**/*.md' --ignore node_modules --ignore evals/datasets --ignore evals/results --ignore templates

# In fix target:
	@echo "==> markdownlint --fix"
	npx markdownlint --fix '**/*.md' --ignore node_modules --ignore evals/datasets --ignore evals/results --ignore templates || true
```

### 4. `.github/workflows/ci.yml` — Remove global install step

Delete the line:
```yaml
- run: npm install -g markdownlint-cli
```

After `npm ci`, `markdownlint` is available at `node_modules/.bin/markdownlint` and accessible via `npx`. After `npm link`, it is linked globally.

### 5. `README.md` — Remove manual install references

- Line 23: Remove `- Optional: markdownlint-cli for formatting and linting of the generated README`
- Lines 35–36: Remove the troubleshooting entry `For markdownlint issues, try the npm version: npm install -g markdownlint-cli`
- Line 175: Keep the `[Markdownlint CLI]` reference link (still useful for users)

### 6. `CLAUDE.md` — Update system dependencies

In the System Dependencies section (line 79), remove `markdownlint-cli (npm global or Homebrew)` from the bullet list. markdownlint-cli is now a package dependency resolved by `npm install`.

---

## Verification

After implementation:

```bash
# 1. Install deps fresh to pick up the new dependency
npm install

# 2. Confirm markdownlint is now local
./node_modules/.bin/markdownlint --version   # should print version

# 3. Run quality gate (markdownlint now invoked via npx)
make check

# 4. Simulate global install scenario
npm link
rereadme --check   # should show ✅ markdownlint-cli found (no global install needed)

# 5. Verify CI workflow passes (run lint-md step locally)
make lint-md
```
