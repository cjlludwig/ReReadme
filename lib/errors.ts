import pc from 'picocolors';

/**
 * Enriches known OpenAI API error messages with actionable fix hints.
 *
 * Handles two cases:
 * - Regional hostname 401s from enterprise-managed API keys (the error message
 *   itself carries the correct hostname).
 * - Rate-limit (429) errors that survived the runner's retry policy — a terminal
 *   rate limit means the org TPM/RPM cap was genuinely exhausted, so point the
 *   user at the levers that actually move it.
 *
 * @param error - The thrown error (or any value) to enrich.
 * @returns The original message, optionally annotated with a dim fix hint.
 */
export function enrichApiError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Regional hostname error: key is locked to a specific endpoint.
  const regionalMatch = msg.match(/please make your[^.]*request to ([\w.]+)/i);
  if (regionalMatch) {
    const suggestedURL = `https://${regionalMatch[1]}/v1`;
    return `${msg}\n${pc.dim(`  Fix: export OPENAI_BASE_URL=${suggestedURL}`)}`;
  }

  // Terminal rate limit: retries with backoff were exhausted against the org cap.
  if (/rate limit|tokens per min|\bTPM\b|requests per min|\bRPM\b/i.test(msg)) {
    return `${msg}\n${pc.dim('  Rate limit exhausted after retries — the org TPM/RPM cap was hit. Try a higher-tier model via --model, reduce concurrent CI jobs, or request a rate-limit increase.')}`;
  }

  return msg;
}
