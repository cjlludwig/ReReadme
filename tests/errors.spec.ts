import { expect, describe, it } from '@jest/globals'
import { enrichApiError } from '../lib/errors.js'

describe("enrichApiError", () => {
    it("appends a rate-limit hint for a TPM 429 message", () => {
        const msg = '429 Rate limit reached for gpt-5-nano in organization org-xxx on tokens per min (TPM): Limit 200000, Used 174287, Requested 31138.'
        const out = enrichApiError(new Error(msg))
        expect(out).toContain(msg)
        expect(out).toMatch(/Rate limit exhausted after retries/)
        expect(out).toMatch(/--model/)
    })

    it("appends the rate-limit hint for an RPM message too", () => {
        const out = enrichApiError(new Error('Rate limit reached: requests per min (RPM) exceeded'))
        expect(out).toMatch(/Rate limit exhausted after retries/)
    })

    it("appends a regional-hostname fix for the enterprise 401", () => {
        const out = enrichApiError(new Error('Unauthorized. Please make your API request to us.api.openai.com instead.'))
        expect(out).toMatch(/export OPENAI_BASE_URL=https:\/\/us\.api\.openai\.com\/v1/)
    })

    it("passes unrelated errors through unchanged (no false positives)", () => {
        const out = enrichApiError(new Error('ENOENT: no such file or directory'))
        expect(out).toBe('ENOENT: no such file or directory')
    })

    it("handles non-Error values", () => {
        expect(enrichApiError('plain string failure')).toBe('plain string failure')
    })
})
