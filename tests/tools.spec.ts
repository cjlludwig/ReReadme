import { expect, describe, it, beforeEach, afterEach } from '@jest/globals'
import * as nodeFs from 'node:fs'
import * as tools from '../lib/tools.js'
import { invokeTool } from './helpers.js'

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

    it("maxLines is capped at 2000", async () => {
        // Passing a value above 2000 should be rejected by the schema
        const result = await invokeTool(tools.readFile, { path: 'package.json', maxLines: 99999 })
        // SDK returns validation error string (not actual file content beyond cap)
        expect(result).toMatch(/too_big|maximum|invalid/i)
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

    it("should return error message for invalid regex", async () => {
        const result = await invokeTool(tools.searchCode, { pattern: '[invalid(' })
        expect(result).toBe('Invalid regex pattern.')
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

    it("should return fallback message for file with no exports or imports", async () => {
        const result = await invokeTool(tools.getStructure, { path: '.gitignore' })
        expect(result).toBe('No exports, imports, or signatures found.')
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

describe("git_diff_stat", () => {
    it("should return 'No changes.' for identical refs", async () => {
        const result = await invokeTool(tools.gitDiffStat, { fromRef: 'HEAD', toRef: 'HEAD' })
        expect(result).toBe('No changes.')
    })

    it("should return string output for valid refs", async () => {
        const result = await invokeTool(tools.gitDiffStat, { fromRef: 'HEAD~3', toRef: 'HEAD' })
        expect(typeof result).toBe('string')
    })

    it("should return error string for invalid ref", async () => {
        const result = await invokeTool(tools.gitDiffStat, { fromRef: 'nonexistent-ref-xyz', toRef: 'HEAD' })
        expect(result).toMatch(/^Error:/)
    })
})

describe("git_log", () => {
    it("should return string output for HEAD~3...HEAD", async () => {
        const result = await invokeTool(tools.gitLog, { fromRef: 'HEAD~3', toRef: 'HEAD' })
        expect(typeof result).toBe('string')
        expect(result.length).toBeGreaterThan(0)
    })

    it("should return error string for invalid ref", async () => {
        const result = await invokeTool(tools.gitLog, { fromRef: 'nonexistent-ref-xyz', toRef: 'HEAD' })
        expect(result).toMatch(/^Error:/)
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

describe("security: shell injection prevention", () => {
    it("search_code: glob with shell breakout characters returns no matches, not RCE", async () => {
        const injectionFile = '/tmp/rereadme-injection-test'
        const result = await invokeTool(tools.searchCode, {
            pattern: 'import',
            glob: '*.ts"; touch ' + injectionFile + '; echo "',
        })
        // Should not execute the injected command
        expect(nodeFs.existsSync(injectionFile)).toBe(false)
        // Result is either no matches or valid content — not a shell error
        expect(typeof result).toBe('string')
    })

    it("git_diff: fromRef with $() substitution does not execute", async () => {
        const injectionFile = '/tmp/rereadme-git-injection-test'
        const result = await invokeTool(tools.gitDiff, {
            fromRef: `$(touch ${injectionFile})`,
            toRef: 'HEAD',
        })
        expect(nodeFs.existsSync(injectionFile)).toBe(false)
        // Should return an error string, not throw
        expect(typeof result).toBe('string')
        expect(result).toMatch(/Error:|No diff found\./)
    })

    it("git_diff: pathFilter with $() substitution does not execute", async () => {
        const injectionFile = '/tmp/rereadme-pathfilter-injection-test'
        const result = await invokeTool(tools.gitDiff, {
            fromRef: 'HEAD',
            toRef: 'HEAD',
            pathFilter: `$(touch ${injectionFile})`,
        })
        expect(nodeFs.existsSync(injectionFile)).toBe(false)
        expect(typeof result).toBe('string')
    })
})

describe("security: gitignore awareness", () => {
    // Use a filename matching the existing *backup-* gitignore pattern
    const gitignored = 'test-secret.backup-gitignore-test'

    beforeEach(() => {
        nodeFs.writeFileSync(gitignored, 'SECRET_KEY=abc123\n')
    })

    afterEach(() => {
        if (nodeFs.existsSync(gitignored)) nodeFs.unlinkSync(gitignored)
    })

    it("get_structure rejects gitignored files", async () => {
        const result = await invokeTool(tools.getStructure, { path: gitignored })
        expect(result).toContain('gitignored')
    })

    it("list_directory excludes gitignored files", async () => {
        const result = await invokeTool(tools.listDirectory, { path: '.' })
        expect(result).not.toContain(gitignored)
    })

    it("read_file rejects gitignored files", async () => {
        const result = await invokeTool(tools.readFile, { path: gitignored })
        expect(result).toContain('gitignored')
    })

    it("search_code does not return matches from gitignored files", async () => {
        const result = await invokeTool(tools.searchCode, { pattern: 'SECRET_KEY' })
        expect(result).not.toContain(gitignored)
    })
})
