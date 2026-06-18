import { expect, describe, it, jest, afterEach } from '@jest/globals'
import { Agent, Runner, Usage, type Model, type ModelResponse, type RetryPolicyContext } from '@openai/agents'
import { ArchitectureDiagramOutputSchema, createAgents } from '../lib/agents.js'
import { applyPatches, renderSuggestions, stripFences } from '../lib/readme-utils.js'
import { buildRetryPolicy, runAgentWorkflow, runDiffWorkflow } from '../lib/runner.js'
import * as log from '../lib/logger.js'

/** Reads the boolean retry verdict out of a RetryDecision (boolean | { retry }). */
function didRetry(decision: boolean | { retry: boolean }): boolean {
    return typeof decision === 'boolean' ? decision : decision.retry
}

/** Builds a synthetic RetryPolicyContext for unit-testing the policy in isolation. */
function ctx(overrides: Partial<RetryPolicyContext> & { normalized: RetryPolicyContext['normalized'] }): RetryPolicyContext {
    return {
        error: new Error('boom'),
        attempt: 1,
        maxRetries: 5,
        stream: false,
        ...overrides,
    }
}

/** A 429-style error shaped like the openai SDK's APIError (carries a numeric `status`). */
function rateLimitError(): Error {
    return Object.assign(new Error('429 Rate limit reached on tokens per min (TPM)'), { status: 429 })
}

/** A fake Model whose non-streaming getResponse is a controllable Jest mock. */
function fakeModel(getResponse: Model['getResponse']): Model {
    return {
        getResponse,
        getStreamedResponse() {
            throw new Error('streaming not used in these tests')
        },
    }
}

/** A minimal, schema-free assistant text response the runner accepts as final output. */
function textResponse(text: string): ModelResponse {
    return {
        usage: new Usage(),
        output: [
            { type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] },
        ],
    }
}

describe("stripFences", () => {
    it("strips ```markdown fence from start and end", () => {
        const input = '```markdown\n# Hello\n\nContent\n```'
        expect(stripFences(input)).toBe('# Hello\n\nContent')
    })

    it("strips ```md fence from start and end", () => {
        const input = '```md\n# Hello\n```'
        expect(stripFences(input)).toBe('# Hello')
    })

    it("strips plain ``` fence from start and end", () => {
        const input = '```\n# Hello\n```'
        expect(stripFences(input)).toBe('# Hello')
    })

    it("returns string unchanged (trimmed) when no fences", () => {
        const input = '  # Hello\n\nContent  '
        expect(stripFences(input)).toBe('# Hello\n\nContent')
    })

    it("trims leading and trailing whitespace", () => {
        const input = '  \n```markdown\n# Hello\n```\n  '
        expect(stripFences(input)).toBe('# Hello')
    })
})

describe("Agent Runner exports", () => {
    it("should export runAgentWorkflow function", () => {
        expect(runAgentWorkflow).toBeDefined()
        expect(typeof runAgentWorkflow).toBe('function')
    })

    it("should export runDiffWorkflow function", () => {
        expect(runDiffWorkflow).toBeDefined()
        expect(typeof runDiffWorkflow).toBe('function')
    })

    it("creates an architecture diagram agent for README generation", () => {
        const agents = createAgents('gpt-5-nano', '# Template')
        expect(agents.architectureDiagramAgent).toBeDefined()
        expect(agents.readmeWriter).toBeDefined()
    })

    it("validates architecture diagram output shape", () => {
        const parsed = ArchitectureDiagramOutputSchema.parse({
            includeDiagram: true,
            sectionMarkdown: '## Architecture\n\n```mermaid\nflowchart LR\n  User -->|HTTP| App\n```',
            rationale: 'The repository has an externally visible request flow.',
            sourceFacts: ['package.json defines a CLI entrypoint'],
        })
        expect(parsed.includeDiagram).toBe(true)
    })
})

describe("applyPatches", () => {
    it("should apply a single patch", () => {
        const original = '# Hello\n\nrereadme --ci\n\nEnd.'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [{ sectionHeading: '## Usage', currentExcerpt: 'rereadme --ci', suggestedReplacement: 'rereadme --ci --timeout 30', reason: 'x' }],
            summary: 'test',
        }
        const result = applyPatches(original, suggestions)
        expect(result).toBe('# Hello\n\nrereadme --ci --timeout 30\n\nEnd.')
    })

    it("should skip patches where excerpt is not found", () => {
        const original = '# Hello\n\nsome content\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [{ sectionHeading: '## Usage', currentExcerpt: 'nonexistent text', suggestedReplacement: 'replacement', reason: 'x' }],
            summary: 'test',
        }
        const result = applyPatches(original, suggestions)
        expect(result).toBe(original)
    })

    it("should apply multiple patches sequentially", () => {
        const original = '# Hello\n\nfoo\n\nbar\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [
                { sectionHeading: '## A', currentExcerpt: 'foo', suggestedReplacement: 'FOO', reason: 'x' },
                { sectionHeading: '## B', currentExcerpt: 'bar', suggestedReplacement: 'BAR', reason: 'y' },
            ],
            summary: 'test',
        }
        const result = applyPatches(original, suggestions)
        expect(result).toBe('# Hello\n\nFOO\n\nBAR\n')
    })

    it("should return original unchanged when changes is empty", () => {
        const original = '# Hello\n\nsome content\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [],
            summary: 'test',
        }
        const result = applyPatches(original, suggestions)
        expect(result).toBe(original)
    })

    it("replacement with $' does not duplicate trailing content", () => {
        const original = '# Title\n\nold text\n\ntrailing content\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [{ sectionHeading: '## A', currentExcerpt: 'old text', suggestedReplacement: "new $' text", reason: 'x' }],
            summary: 'test',
        }
        const result = applyPatches(original, suggestions)
        // $' should be literal, not expand to trailing content
        expect(result).toBe("# Title\n\nnew $' text\n\ntrailing content\n")
    })

    it("replacement with $& does not repeat matched excerpt", () => {
        const original = '# Title\n\nold text\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [{ sectionHeading: '## A', currentExcerpt: 'old text', suggestedReplacement: 'new $& stuff', reason: 'x' }],
            summary: 'test',
        }
        const result = applyPatches(original, suggestions)
        // $& should be literal, not expand to 'old text'
        expect(result).toBe('# Title\n\nnew $& stuff\n')
    })
})

describe("renderSuggestions", () => {
    const validFixture = {
        signalLevel: 'high' as const,
        significanceReason: 'New --timeout flag added',
        changes: [
            {
                sectionHeading: '## Usage',
                currentExcerpt: 'rereadme --ci',
                suggestedReplacement: 'rereadme --ci --timeout 30',
                reason: 'script.ts:42 added --timeout flag',
            },
        ],
        summary: 'The --timeout flag was added to the CLI.',
    }

    it("should export renderSuggestions from runner", () => {
        expect(renderSuggestions).toBeDefined()
        expect(typeof renderSuggestions).toBe('function')
    })

    it("should include heading", () => {
        const output = renderSuggestions(validFixture)
        expect(output).toContain('## README Update Suggestions')
    })

    it("should include section heading", () => {
        const output = renderSuggestions(validFixture)
        expect(output).toContain('**Section:** Usage')
    })

    it("should include diff block with - and + prefixed lines", () => {
        const output = renderSuggestions(validFixture)
        expect(output).toContain('```diff')
        expect(output).toContain('- rereadme --ci')
        expect(output).toContain('+ rereadme --ci --timeout 30')
    })

    it("should include reason text", () => {
        const output = renderSuggestions(validFixture)
        expect(output).toContain('script.ts:42 added --timeout flag')
    })

    it("should include signal level (high → CAUTION)", () => {
        const output = renderSuggestions(validFixture)
        expect(output).toContain('[!CAUTION]')
    })

    it("should use WARNING for medium signal level", () => {
        const output = renderSuggestions({ ...validFixture, signalLevel: 'medium' })
        expect(output).toContain('[!WARNING]')
    })

    it("should use TIP for low signal level", () => {
        const output = renderSuggestions({ ...validFixture, signalLevel: 'low' })
        expect(output).toContain('[!TIP]')
    })

    it("should include details block when fullReadme is provided", () => {
        const output = renderSuggestions(validFixture, '# My README\n\nContent here.\n')
        expect(output).toContain('<details>')
        expect(output).toContain('<summary>Full README (copy-paste ready)</summary>')
        expect(output).toContain('```markdown')
        expect(output).toContain('# My README')
        expect(output).toContain('Content here.')
        expect(output).toContain('</details>')
    })

    it("should not include details block when fullReadme is omitted", () => {
        const output = renderSuggestions(validFixture)
        expect(output).not.toContain('<details>')
    })
})

// Tier 1 — the retry policy's classification decision, tested in isolation.
describe("buildRetryPolicy", () => {
    const policy = buildRetryPolicy()

    afterEach(() => {
        log.setVerbose(false)
        jest.restoreAllMocks()
    })

    it("retries a 429 (the reported failure)", async () => {
        const decision = await policy(ctx({ normalized: { statusCode: 429, isNetworkError: false, isAbort: false } }))
        expect(didRetry(decision)).toBe(true)
    })

    it("honors an explicit retry-after hint as the delay (not the backoff cap)", async () => {
        const decision = await policy(ctx({ normalized: { statusCode: 429, retryAfterMs: 1627, isNetworkError: false, isAbort: false } }))
        expect(didRetry(decision)).toBe(true)
        expect(typeof decision === 'object' ? decision.delayMs : undefined).toBe(1627)
    })

    it("retries transient 5xx / 408 / 409", async () => {
        for (const statusCode of [408, 409, 500, 502, 503, 504]) {
            const decision = await policy(ctx({ normalized: { statusCode, isNetworkError: false, isAbort: false } }))
            expect(didRetry(decision)).toBe(true)
        }
    })

    it("retries transport/network errors with no status code", async () => {
        const decision = await policy(ctx({ normalized: { isNetworkError: true, isAbort: false } }))
        expect(didRetry(decision)).toBe(true)
    })

    it("does NOT retry non-transient errors (e.g. 401, 400)", async () => {
        for (const statusCode of [400, 401, 403, 404]) {
            const decision = await policy(ctx({ normalized: { statusCode, isNetworkError: false, isAbort: false } }))
            expect(didRetry(decision)).toBe(false)
        }
    })

    it("logs a retry line when verbose, stays silent when not", async () => {
        const writeSpy = jest.spyOn(process.stdout, 'write').mockReturnValue(true)
        const retryCtx = ctx({ attempt: 2, normalized: { statusCode: 429, isNetworkError: false, isAbort: false } })

        log.setVerbose(false)
        await policy(retryCtx)
        expect(writeSpy.mock.calls.some(([c]) => String(c).includes('Retrying model request'))).toBe(false)

        log.setVerbose(true)
        await policy(retryCtx)
        expect(writeSpy.mock.calls.some(([c]) => String(c).includes('Retrying model request after 429'))).toBe(true)
    })
})

// Tier 2 — the runner actually invokes the policy, retries, and gives up.
// A dedicated test runner uses the REAL buildRetryPolicy() with tiny backoff so
// wall-clock time stays negligible while still exercising the retry loop.
describe("runner retry integration", () => {
    const testRunner = new Runner({
        modelSettings: {
            retry: {
                maxRetries: 2,
                backoff: { initialDelayMs: 1, maxDelayMs: 5, multiplier: 2, jitter: false },
                policy: buildRetryPolicy(),
            },
        },
    })

    it("retries a transient 429 and then resolves", async () => {
        const getResponse = jest.fn<Model['getResponse']>()
            .mockRejectedValueOnce(rateLimitError())
            .mockResolvedValueOnce(textResponse('hello from the model'))
        const agent = new Agent({ name: 'FakeAgent', model: fakeModel(getResponse), instructions: 'reply' })

        const result = await testRunner.run(agent, 'hi')

        expect(getResponse).toHaveBeenCalledTimes(2)
        expect(result.finalOutput).toContain('hello from the model')
    })

    it("gives up after maxRetries and surfaces the original 429", async () => {
        const getResponse = jest.fn<Model['getResponse']>().mockRejectedValue(rateLimitError())
        const agent = new Agent({ name: 'FakeAgent', model: fakeModel(getResponse), instructions: 'reply' })

        await expect(testRunner.run(agent, 'hi')).rejects.toThrow(/429|rate limit/i)
        // initial attempt + maxRetries(2) = 3 calls
        expect(getResponse).toHaveBeenCalledTimes(3)
    })
})
