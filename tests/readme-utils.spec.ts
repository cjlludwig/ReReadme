import { expect, describe, it } from '@jest/globals'
import { renderSuggestions } from '../lib/readme-utils.js'

// The extraction regex used by runApplyWorkflow to pull the full README
// out of the <details> block that renderSuggestions() writes.
const EXTRACT_REGEX = /``````markdown\n([\s\S]*?)\n``````/

const validFixture = {
    signalLevel: 'high' as const,
    significanceReason: 'New --apply flag added',
    changes: [
        {
            sectionHeading: '## Usage',
            currentExcerpt: 'rereadme --ci',
            suggestedReplacement: 'rereadme --ci --apply',
            reason: 'script.ts added --apply flag',
        },
    ],
    summary: 'The --apply flag was added to the CLI.',
}

describe("runApplyWorkflow: extraction regex", () => {
    it("extracts full README from renderSuggestions output", () => {
        const fullReadme = '# My Project\n\nThis is the full updated README.\n'
        const suggestions = renderSuggestions(validFixture, fullReadme)
        const match = suggestions.match(EXTRACT_REGEX)
        expect(match).not.toBeNull()
        expect(match![1]).toBe(fullReadme.trim())
    })

    it("extracts multi-section README content correctly", () => {
        const fullReadme = '# Project\n\n## Install\n\n```bash\nnpm install\n```\n\n## Usage\n\nrereadme --ci --apply\n'
        const suggestions = renderSuggestions(validFixture, fullReadme)
        const match = suggestions.match(EXTRACT_REGEX)
        expect(match).not.toBeNull()
        expect(match![1]).toBe(fullReadme.trim())
    })

    it("returns null when no details block is present", () => {
        const suggestions = renderSuggestions(validFixture) // no fullReadme
        const match = suggestions.match(EXTRACT_REGEX)
        expect(match).toBeNull()
    })

    it("extracted content does not include the backtick fences", () => {
        const fullReadme = '# Title\n\nContent.\n'
        const suggestions = renderSuggestions(validFixture, fullReadme)
        const match = suggestions.match(EXTRACT_REGEX)
        expect(match![1]).not.toContain('``````')
    })
})
