import { expect, describe, it, beforeEach, afterEach } from '@jest/globals'
import { tmpdir } from 'os'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { validateTemplate } from './lib/validate.js'

// Helper: invoke a tool from the agents SDK
// Tools use .invoke(context, jsonString) -> string
async function invokeTool(tool: { invoke: (ctx: null, params: string) => Promise<string> }, params: Record<string, unknown>): Promise<string> {
    return tool.invoke(null, JSON.stringify(params))
}

describe("validateTemplate", () => {
    let tmpDir: string

    beforeEach(async () => {
        tmpDir = join(tmpdir(), `rereadme-test-${Date.now()}`)
        await mkdir(tmpDir, { recursive: true })
    })

    afterEach(async () => {
        await rm(tmpDir, { recursive: true, force: true })
    })

    it("should return content for a valid template", async () => {
        const file = join(tmpDir, 'valid.md')
        const content = '# My Template\n\nSome content here.\n'
        await writeFile(file, content, 'utf-8')
        const result = await validateTemplate(file, 'README template')
        expect(result).toBe(content)
    })

    it("should error when file does not exist", async () => {
        const file = join(tmpDir, 'nonexistent.md')
        await expect(validateTemplate(file, 'README template')).rejects.toThrow(
            `README template: File not found or unreadable: ${file}`
        )
    })

    it("should error when file is empty", async () => {
        const file = join(tmpDir, 'empty.md')
        await writeFile(file, '', 'utf-8')
        await expect(validateTemplate(file, 'README template')).rejects.toThrow(
            `README template: Template file is empty: ${file}`
        )
    })

    it("should error when file is whitespace only", async () => {
        const file = join(tmpDir, 'whitespace.md')
        await writeFile(file, '   \n\t\n  ', 'utf-8')
        await expect(validateTemplate(file, 'README template')).rejects.toThrow(
            `README template: Template file is empty: ${file}`
        )
    })

    it("should error when file exceeds 50KB", async () => {
        const file = join(tmpDir, 'large.md')
        // Write just over 50KB: need a heading to avoid the no-heading error,
        // so prefix with a heading then pad to exceed the limit
        const heading = '# Big Template\n'
        const padding = 'x'.repeat(50 * 1024 - heading.length + 1)
        await writeFile(file, heading + padding, 'utf-8')
        await expect(validateTemplate(file, 'README template')).rejects.toThrow(
            `README template: Template file exceeds 50KB limit: ${file}`
        )
    })

    it("should error when file has no markdown headings", async () => {
        const file = join(tmpDir, 'noheadings.md')
        await writeFile(file, 'Just some plain text without any headings.\n', 'utf-8')
        await expect(validateTemplate(file, 'README template')).rejects.toThrow(
            `README template: Template does not appear to be valid markdown (no headings found): ${file}`
        )
    })

    it("should include the label in all error messages", async () => {
        const file = join(tmpDir, 'nonexistent.md')
        await expect(validateTemplate(file, 'Agents template')).rejects.toThrow('Agents template:')
    })

    it("should accept headings at any level (h1 through h6)", async () => {
        for (const level of [1, 2, 3, 4, 5, 6]) {
            const file = join(tmpDir, `h${level}.md`)
            await writeFile(file, `${'#'.repeat(level)} Heading Level ${level}\n\nContent.\n`, 'utf-8')
            await expect(validateTemplate(file, 'README template')).resolves.toBeDefined()
        }
    })
})

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
