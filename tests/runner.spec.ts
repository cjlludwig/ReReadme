import { expect, describe, it } from '@jest/globals'
import { applyPatches, renderSuggestions, runAgentWorkflow, runDiffWorkflow } from '../lib/runner.js'

describe("Agent Runner exports", () => {
    it("should export runAgentWorkflow function", () => {
        expect(runAgentWorkflow).toBeDefined()
        expect(typeof runAgentWorkflow).toBe('function')
    })

    it("should export runDiffWorkflow function", () => {
        expect(runDiffWorkflow).toBeDefined()
        expect(typeof runDiffWorkflow).toBe('function')
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

    it("should include signal level", () => {
        const output = renderSuggestions(validFixture)
        expect(output).toContain('[!CAUTION]')
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
