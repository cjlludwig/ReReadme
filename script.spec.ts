import { expect, describe, it, beforeEach, afterEach } from '@jest/globals'
import { tmpdir } from 'os'
import { writeFile, rm, mkdtemp } from 'fs/promises'
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
        tmpDir = await mkdtemp(join(tmpdir(), 'rereadme-test-'))
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

    it("should readmePatcher have outputType defined", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.createDiffAgents('gpt-5-nano')
        expect(result.readmePatcher.outputType).toBeDefined()
    })
})

describe("applyPatches", () => {
    it("should apply a single patch", async () => {
        const runner = await import('./lib/runner.js')
        const original = '# Hello\n\nrereadme --ci\n\nEnd.'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [{ sectionHeading: '## Usage', currentExcerpt: 'rereadme --ci', suggestedReplacement: 'rereadme --ci --timeout 30', reason: 'x' }],
            summary: 'test',
        }
        const result = runner.applyPatches(original, suggestions)
        expect(result).toBe('# Hello\n\nrereadme --ci --timeout 30\n\nEnd.')
    })

    it("should skip patches where excerpt is not found", async () => {
        const runner = await import('./lib/runner.js')
        const original = '# Hello\n\nsome content\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [{ sectionHeading: '## Usage', currentExcerpt: 'nonexistent text', suggestedReplacement: 'replacement', reason: 'x' }],
            summary: 'test',
        }
        const result = runner.applyPatches(original, suggestions)
        expect(result).toBe(original)
    })

    it("should apply multiple patches sequentially", async () => {
        const runner = await import('./lib/runner.js')
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
        const result = runner.applyPatches(original, suggestions)
        expect(result).toBe('# Hello\n\nFOO\n\nBAR\n')
    })

    it("should return original unchanged when changes is empty", async () => {
        const runner = await import('./lib/runner.js')
        const original = '# Hello\n\nsome content\n'
        const suggestions = {
            signalLevel: 'low' as const,
            significanceReason: 'test',
            changes: [],
            summary: 'test',
        }
        const result = runner.applyPatches(original, suggestions)
        expect(result).toBe(original)
    })
})

describe("ReadmeSuggestionSchema and renderSuggestions", () => {
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

    it("should export ReadmeSuggestionSchema from agents", async () => {
        const agents = await import('./lib/agents.js')
        expect(agents.ReadmeSuggestionSchema).toBeDefined()
    })

    it("should validate a valid fixture", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.ReadmeSuggestionSchema.safeParse(validFixture)
        expect(result.success).toBe(true)
    })

    it("should reject fixture missing required fields", async () => {
        const agents = await import('./lib/agents.js')
        const result = agents.ReadmeSuggestionSchema.safeParse({ signalLevel: 'high' })
        expect(result.success).toBe(false)
    })

    it("should export renderSuggestions from runner", async () => {
        const runner = await import('./lib/runner.js')
        expect(runner.renderSuggestions).toBeDefined()
        expect(typeof runner.renderSuggestions).toBe('function')
    })

    it("should renderSuggestions include heading", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture)
        expect(output).toContain('## README Update Suggestions')
    })

    it("should renderSuggestions include section heading", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture)
        expect(output).toContain('**Section:** Usage')
    })

    it("should renderSuggestions include diff block with - and + prefixed lines", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture)
        expect(output).toContain('```diff')
        expect(output).toContain('- rereadme --ci')
        expect(output).toContain('+ rereadme --ci --timeout 30')
    })

    it("should renderSuggestions include reason text", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture)
        expect(output).toContain('script.ts:42 added --timeout flag')
    })

    it("should renderSuggestions include signal level", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture)
        expect(output).toContain('[!CAUTION]')
    })

    it("should renderSuggestions include details block when fullReadme is provided", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture, '# My README\n\nContent here.\n')
        expect(output).toContain('<details>')
        expect(output).toContain('<summary>Full README (copy-paste ready)</summary>')
        expect(output).toContain('```markdown')
        expect(output).toContain('# My README')
        expect(output).toContain('Content here.')
        expect(output).toContain('</details>')
    })

    it("should renderSuggestions not include details block when fullReadme is omitted", async () => {
        const runner = await import('./lib/runner.js')
        const output = runner.renderSuggestions(validFixture)
        expect(output).not.toContain('<details>')
    })
})
