import { expect, describe, it, beforeEach } from '@jest/globals'

// Helper: invoke a tool from the agents SDK
// Tools use .invoke(context, jsonString) -> string
async function invokeTool(tool: { invoke: (ctx: null, params: string) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
    return tool.invoke(null, JSON.stringify(params))
}

// Test the filesystem tools directly (no mocking needed)
describe("Filesystem Tools", () => {
    let tools: typeof import('./lib/tools.js')

    beforeEach(async () => {
        tools = await import('./lib/tools.js')
    })

    describe("list_directory", () => {
        it("should list files in current directory", async () => {
            const result = await invokeTool(tools.listDirectory, { path: '.' })
            expect(result).toContain('package.json')
            expect(result).toContain('script.ts')
            expect(result).toContain('lib/')
        })

        it("should not include .git or node_modules but should include other dotfiles", async () => {
            const result = await invokeTool(tools.listDirectory, { path: '.' })
            expect(result).not.toContain('node_modules')
            expect(result).not.toContain('.git/')
            expect(result).toContain('.gitignore')
        })

        it("should list subdirectory contents", async () => {
            const result = await invokeTool(tools.listDirectory, { path: 'lib' })
            expect(result).toContain('tools.ts')
            expect(result).toContain('agents.ts')
            expect(result).toContain('runner.ts')
        })
    })

    describe("read_file", () => {
        it("should read file contents", async () => {
            const result = await invokeTool(tools.readFile, { path: 'package.json' })
            expect(result).toContain('"name": "rereadme"')
        })

        it("should truncate at maxLines", async () => {
            const result = await invokeTool(tools.readFile, { path: 'package.json', maxLines: 3 })
            expect(result).toContain('Use offset=')
        })

        it("should reject path traversal", async () => {
            const result = await invokeTool(tools.readFile, { path: '../../../etc/passwd' })
            expect(result).toContain('Path traversal not allowed')
        })
    })

    describe("search_code", () => {
        it("should find patterns in files", async () => {
            const result = await invokeTool(tools.searchCode, { pattern: 'runAgentWorkflow' })
            expect(result).toContain('runner.ts')
        })

        it("should filter by glob pattern", async () => {
            const result = await invokeTool(tools.searchCode, { pattern: 'import', glob: '*.ts' })
            expect(result).toContain('.ts')
        })

        it("should return message when no matches found", async () => {
            // Use glob to search only in a dir that won't match
            const result = await invokeTool(tools.searchCode, { pattern: 'impossible_xyz', glob: '*.yaml' })
            expect(result).toBe('No matches found.')
        })
    })

    describe("get_structure", () => {
        it("should extract exports and imports from TypeScript files", async () => {
            const result = await invokeTool(tools.getStructure, { path: 'lib/tools.ts' })
            expect(result).toContain('import')
            expect(result).toContain('export')
        })

        it("should reject path traversal", async () => {
            const result = await invokeTool(tools.getStructure, { path: '../../etc/passwd' })
            expect(result).toContain('Path traversal not allowed')
        })
    })

    describe("path safety", () => {
        it("should block absolute paths outside repo", async () => {
            const result = await invokeTool(tools.readFile, { path: '/etc/passwd' })
            expect(result).toContain('Path traversal not allowed')
        })

        it("should block .. traversal", async () => {
            const result = await invokeTool(tools.listDirectory, { path: '../../..' })
            expect(result).toContain('Path traversal not allowed')
        })
    })
})

// Test git diff tools
describe("Git Diff Tools", () => {
    let tools: typeof import('./lib/tools.js')

    beforeEach(async () => {
        tools = await import('./lib/tools.js')
    })

    describe("git_diff_stat", () => {
        it("should return 'No changes.' for identical refs", async () => {
            const result = await invokeTool(tools.gitDiffStat, { fromRef: 'HEAD', toRef: 'HEAD' })
            expect(result).toBe('No changes.')
        })

        it("should return string output for valid refs", async () => {
            const result = await invokeTool(tools.gitDiffStat, { fromRef: 'HEAD~3', toRef: 'HEAD' })
            expect(typeof result).toBe('string')
        })
    })

    describe("git_log", () => {
        it("should return string output for HEAD~3...HEAD", async () => {
            const result = await invokeTool(tools.gitLog, { fromRef: 'HEAD~3', toRef: 'HEAD' })
            expect(typeof result).toBe('string')
            expect(result.length).toBeGreaterThan(0)
        })
    })

    describe("git_diff", () => {
        it("should return 'No diff found.' for identical refs", async () => {
            const result = await invokeTool(tools.gitDiff, { fromRef: 'HEAD', toRef: 'HEAD' })
            expect(result).toBe('No diff found.')
        })

        it("should return error string (not throw) for invalid refs", async () => {
            const result = await invokeTool(tools.gitDiff, { fromRef: 'nonexistent-ref-xyz', toRef: 'HEAD' })
            expect(typeof result).toBe('string')
            expect(result).toMatch(/Error:|No diff found\./)
        })
    })

    describe("diffTools export", () => {
        it("should export diffTools array", async () => {
            expect(tools.diffTools).toBeDefined()
            expect(Array.isArray(tools.diffTools)).toBe(true)
            expect(tools.diffTools.length).toBe(4)
        })
    })
})

// Test the agent runner module structure
describe("Agent Runner", () => {
    it("should export runAgentWorkflow function", async () => {
        const runner = await import('./lib/runner.js')
        expect(runner.runAgentWorkflow).toBeDefined()
        expect(typeof runner.runAgentWorkflow).toBe('function')
    })

    it("should export runDiffWorkflow function", async () => {
        const runner = await import('./lib/runner.js')
        expect(runner.runDiffWorkflow).toBeDefined()
        expect(typeof runner.runDiffWorkflow).toBe('function')
    })
})

// Test the agents module structure
describe("Agent Definitions", () => {
    it("should export createAgents function", async () => {
        const agents = await import('./lib/agents.js')
        expect(agents.createAgents).toBeDefined()
        expect(typeof agents.createAgents).toBe('function')
    })

    it("should export createDiffAgents function", async () => {
        const agents = await import('./lib/agents.js')
        expect(agents.createDiffAgents).toBeDefined()
        expect(typeof agents.createDiffAgents).toBe('function')
    })

    it("should createDiffAgents return diffAnalyzer and readmePatcher", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createDiffAgents('gpt-5-nano')
        expect(result.diffAnalyzer).toBeDefined()
        expect(result.readmePatcher).toBeDefined()
    })

    it("should diffAnalyzer have outputType defined", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createDiffAgents('gpt-5-nano')
        expect(result.diffAnalyzer.outputType).toBeDefined()
    })

    it("should create all three agents", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-5-nano', '# Template')
        expect(result.researcher).toBeDefined()
        expect(result.templateEnforcer).toBeDefined()
        expect(result.detailFetcher).toBeDefined()
    })

    it("should set correct model on agents", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-4o', '# Template')
        expect(result.researcher.model).toBe('gpt-4o')
        expect(result.templateEnforcer.model).toBe('gpt-4o')
        expect(result.detailFetcher.model).toBe('gpt-4o')
    })

    it("should include template in templateEnforcer instructions", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-5-nano', '# My Custom Template')
        expect(result.templateEnforcer.instructions).toContain('# My Custom Template')
    })

    it("should wire DetailFetcher as a handoff on TemplateEnforcer", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-5-nano', '# Template')
        const handoffNames = result.templateEnforcer.handoffs.map(
            (h: { name?: string; agent?: { name: string } }) => h.name ?? h.agent?.name
        )
        expect(handoffNames).toContain('DetailFetcher')
    })
})
