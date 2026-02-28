import { expect, describe, it, beforeEach, afterEach } from '@jest/globals'
import { tmpdir } from 'os'
import { writeFile, rm, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { validateTemplate } from '../lib/validate.js'

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
