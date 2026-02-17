import { jest, expect, describe, it, beforeEach } from '@jest/globals'

// Helper: invoke a tool from the agents SDK
// Tools use .invoke(context, jsonString) -> string
async function invokeTool(tool: any, params: Record<string, unknown>): Promise<string> {
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

// Test the agent runner module structure
describe("Agent Runner", () => {
    it("should export runAgentWorkflow function", async () => {
        const runner = await import('./lib/runner.js')
        expect(runner.runAgentWorkflow).toBeDefined()
        expect(typeof runner.runAgentWorkflow).toBe('function')
    })
})

// Test the agents module structure
describe("Agent Definitions", () => {
    it("should export createAgents function", async () => {
        const agents = await import('./lib/agents.js')
        expect(agents.createAgents).toBeDefined()
        expect(typeof agents.createAgents).toBe('function')
    })

    it("should create all three agents", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-5-nano', '# Template')
        expect(result.fileExplorer).toBeDefined()
        expect(result.contentAnalyzer).toBeDefined()
        expect(result.readmeWriter).toBeDefined()
    })

    it("should set correct model on agents", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-4o', '# Template')
        expect(result.fileExplorer.model).toBe('gpt-4o')
        expect(result.contentAnalyzer.model).toBe('gpt-4o')
        expect(result.readmeWriter.model).toBe('gpt-4o')
    })

    it("should include template in writer instructions", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createAgents('gpt-5-nano', '# My Custom Template')
        expect(result.readmeWriter.instructions).toContain('# My Custom Template')
    })
})
