# Plan: OPENAI_BASE_URL Support + Regional Hostname Error Handling

## Context

Enterprise-managed OpenAI API keys are bound to specific regional endpoints
(e.g. `us.api.openai.com`). When a user with such a key runs rereadme on a new
machine, the Agents SDK silently creates an OpenAI client pointed at the default
`api.openai.com`, which returns a 401 with the message:

> "attempted to access resource with incorrect regional hostname. Please make
> your request to us.api.openai.com"

Currently the app has no mechanism to:
1. Accept a custom base URL for the OpenAI client
2. Detect this error class and tell the user what to do

Both gaps are addressed here.

---

## Changes

### 1. Initialize OpenAI client with optional `OPENAI_BASE_URL`  
**File:** `script.ts`

Add an `initOpenAIClient()` helper after the imports, before `checkDependencies`. It creates an `OpenAI` client with `baseURL` conditionally set from `OPENAI_BASE_URL`, then calls `setDefaultOpenAIClient`. This must run before any workflow that uses the Agents SDK (the SDK resolves the default client lazily on first `run()` call, but setting it early avoids any timing ambiguity).

```typescript
import { setDefaultOpenAIClient } from '@openai/agents';
import { OpenAI } from 'openai';

/**
 * Initializes the OpenAI client with optional regional endpoint support.
 * Enterprise-managed API keys may be scoped to a specific regional hostname
 * (e.g. us.api.openai.com). Set OPENAI_BASE_URL to override the default endpoint.
 */
function initOpenAIClient(): void {
  const baseURL = process.env.OPENAI_BASE_URL;
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    ...(baseURL && { baseURL }),
  });
  setDefaultOpenAIClient(client);
}
```

Call it in `main()` before the `--check`/CI/apply/workflow branches — after the `--help` early return since the client is not needed for help output:

```typescript
async function main(): Promise<void> {
  if (args.help || args.h) { showHelp(); return; }

  initOpenAIClient(); // <-- add here

  if (args.check) { ... }
  // ... rest unchanged
}
```

### 2. Enrich error messages for known OpenAI failure modes  
**File:** `script.ts`

Add a `enrichApiError()` helper. It checks the error message for the regional
hostname pattern, extracts the suggested hostname from the error body itself,
and appends an actionable `Fix:` hint in the same style as `checkDependencies`
(`pc.dim` indent).

```typescript
/**
 * Enriches known OpenAI API error messages with actionable fix hints.
 * Currently handles regional hostname 401s from enterprise-managed API keys.
 */
function enrichApiError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Regional hostname error: key is locked to a specific endpoint.
  // The error message itself contains the correct hostname to use.
  const regionalMatch = msg.match(/please make your[^.]*request to ([\w.]+)/i);
  if (regionalMatch) {
    const suggestedURL = `https://${regionalMatch[1]}/v1`;
    return `${msg}\n${pc.dim(`  Fix: export OPENAI_BASE_URL=${suggestedURL}`)}`;
  }

  return msg;
}
```

Replace the error extraction in all three catch sites with `enrichApiError(error)`:

| Location | Current code | Replace with |
|---|---|---|
| `runWorkflow` outer catch (~line 377) | `error instanceof Error ? error.message : String(error)` | `enrichApiError(error)` |
| `runCiWorkflow` outer catch (~line 160) | same pattern | `enrichApiError(error)` |
| `main().catch` (~line 467) | `error instanceof Error ? error.message : String(error)` | `enrichApiError(error)` |

### 3. Document `OPENAI_BASE_URL` in help text  
**File:** `script.ts` — `showHelp()`, Environment Variables section (~line 408)

```
${pc.yellow('Environment Variables:')}
  OPENAI_API_KEY   Required - Your OpenAI API key
  OPENAI_BASE_URL  Optional - Custom API endpoint (e.g. for enterprise regional keys)
```

---

## Critical Files

- `script.ts` — all three changes land here
  - New import: `setDefaultOpenAIClient` from `@openai/agents`, `OpenAI` from `openai`
  - New functions: `initOpenAIClient()`, `enrichApiError()`
  - Modified: `main()`, three catch blocks, `showHelp()`

---

## Verification

1. **Happy path (default)**: Run `npm run dev` with a standard `OPENAI_API_KEY` and no `OPENAI_BASE_URL` set — behavior should be identical to before.
2. **Regional endpoint**: Set `OPENAI_BASE_URL=https://us.api.openai.com/v1` and run — verify the client uses the custom base URL (can confirm via `--verbose` or by temporarily pointing at an invalid URL and confirming the request fails with the right host in the error).
3. **Error hint**: Simulate the regional error by temporarily setting a valid key scoped to a regional endpoint without `OPENAI_BASE_URL`. Verify the output includes the `Fix: export OPENAI_BASE_URL=...` hint with the correct URL extracted from the error message.
4. **Help text**: Run `npm run dev -- --help` and confirm `OPENAI_BASE_URL` appears in the Environment Variables section.
5. **Tests**: Run `npm test` — no test changes expected since the new code paths are runtime-only.
