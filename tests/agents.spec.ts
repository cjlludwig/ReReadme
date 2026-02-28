import { expect, describe, it } from '@jest/globals'
import { createAgents, createDiffAgents, ReadmeSuggestionSchema } from '../lib/agents.js'

describe("createDiffAgents", () => {
    it("should export createDiffAgents function", () => {
        expect(createDiffAgents).toBeDefined()
        expect(typeof createDiffAgents).toBe('function')
    })

    it("should return diffAnalyzer and readmePatcher", () => {
        const result = createDiffAgents('gpt-5-nano')
        expect(result.diffAnalyzer).toBeDefined()
        expect(result.readmePatcher).toBeDefined()
    })

    it("should diffAnalyzer have outputType defined", () => {
        const result = createDiffAgents('gpt-5-nano')
        expect(result.diffAnalyzer.outputType).toBeDefined()
    })

    it("should readmePatcher have outputType defined", () => {
        const result = createDiffAgents('gpt-5-nano')
        expect(result.readmePatcher.outputType).toBeDefined()
    })
})

describe("createAgents", () => {
    it("should export createAgents function", () => {
        expect(createAgents).toBeDefined()
        expect(typeof createAgents).toBe('function')
    })

    it("should create all three agents", () => {
        const result = createAgents('gpt-5-nano', '# Template')
        expect(result.researcher).toBeDefined()
        expect(result.templateEnforcer).toBeDefined()
        expect(result.detailFetcher).toBeDefined()
    })

    it("should set correct model on agents", () => {
        const result = createAgents('gpt-4o', '# Template')
        expect(result.researcher.model).toBe('gpt-4o')
        expect(result.templateEnforcer.model).toBe('gpt-4o')
        expect(result.detailFetcher.model).toBe('gpt-4o')
    })

    it("should include template in templateEnforcer instructions", () => {
        const result = createAgents('gpt-5-nano', '# My Custom Template')
        expect(result.templateEnforcer.instructions).toContain('# My Custom Template')
    })

    it("should wire DetailFetcher as a handoff on TemplateEnforcer", () => {
        const result = createAgents('gpt-5-nano', '# Template')
        const handoffNames = result.templateEnforcer.handoffs.map(
            (h: { name?: string; agent?: { name: string } }) => h.name ?? h.agent?.name
        )
        expect(handoffNames).toContain('DetailFetcher')
    })
})

describe("ReadmeSuggestionSchema", () => {
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

    it("should export ReadmeSuggestionSchema from agents", () => {
        expect(ReadmeSuggestionSchema).toBeDefined()
    })

    it("should validate a valid fixture", () => {
        const result = ReadmeSuggestionSchema.safeParse(validFixture)
        expect(result.success).toBe(true)
    })

    it("should reject fixture missing required fields", () => {
        const result = ReadmeSuggestionSchema.safeParse({ signalLevel: 'high' })
        expect(result.success).toBe(false)
    })
})

describe("agent tool wiring", () => {
    it("TemplateEnforcer has no tools (uses handoffs only)", () => {
        const { templateEnforcer } = createAgents('gpt-5-nano', '# Template')
        expect(templateEnforcer.tools).toHaveLength(0)
    })

    it("AgentsDocWriter has no tools (uses handoffs only)", () => {
        const { agentsDocWriter } = createAgents('gpt-5-nano', '# Template', '# AgentsTemplate')
        expect(agentsDocWriter).toBeDefined()
        expect(agentsDocWriter!.tools).toHaveLength(0)
    })
})
