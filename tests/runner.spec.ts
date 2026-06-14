import { expect, describe, it } from '@jest/globals'
import { ArchitectureDiagramOutputSchema, createAgents } from '../lib/agents.js'
import { ReadmeWorkspace, createReadmeWorkspaceTools } from '../lib/readme-workspace.js'
import { applyPatches, renderSuggestions, stripFences } from '../lib/readme-utils.js'
import { runAgentWorkflow, runDiffWorkflow } from '../lib/runner.js'
import { invokeTool } from './helpers.js'

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

describe("ReadmeWorkspace", () => {
    const template = [
        '# {Project Title}',
        '',
        '<!-- BADGES (Optional) -->',
        '',
        '## Description',
        '',
        '> Describe the project.',
        '',
        '## Usage',
        '',
        '> Show usage.',
        '',
        '## References',
        '',
        '> (Optional) Links.',
    ].join('\n')

    it("returns todo sections in template order", async () => {
        const workspace = new ReadmeWorkspace(template)
        const tools = createReadmeWorkspaceTools(workspace)

        expect(workspace.hasSection('## Description')).toBe(true)
        expect(workspace.hasSection('## Missing')).toBe(false)
        const first = await invokeTool(tools.getNextTodoSection, {})
        expect(first).toContain('Preamble / title and badges')

        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# demo',
            reason: '',
        })

        const second = await invokeTool(tools.getNextTodoSection, {})
        expect(second).toContain('## Description')
    })

    it("keeps nested template headings inside their top-level section", async () => {
        const nestedTemplate = [
            '# Demo',
            '',
            '## Getting Started',
            '',
            '### Dependencies',
            '',
            '> Runtime prerequisites.',
            '',
            '### Installation',
            '',
            '> Install steps.',
            '',
            '## Usage',
            '',
            '> Run the tool.',
        ].join('\n')
        const workspace = new ReadmeWorkspace(nestedTemplate)
        const tools = createReadmeWorkspaceTools(workspace)

        await invokeTool(tools.getNextTodoSection, {})
        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# Demo',
            reason: '',
        })

        const gettingStarted = await invokeTool(tools.getNextTodoSection, {})
        expect(gettingStarted).toContain('## Getting Started')
        expect(gettingStarted).toContain('### Dependencies')
        expect(gettingStarted).toContain('### Installation')

        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: [
                '## Getting Started',
                '',
                '### Dependencies',
                '',
                '- `Node.js >= 22`',
                '',
                '### Installation',
                '',
                '```shell',
                'npm install',
                '```',
            ].join('\n'),
            reason: '',
        })

        const usage = await invokeTool(tools.getNextTodoSection, {})
        expect(usage).toContain('## Usage')
        expect(usage).not.toContain('### Dependencies')
    })

    it("rejects omitted required sections", async () => {
        const workspace = new ReadmeWorkspace(template)
        const tools = createReadmeWorkspaceTools(workspace)

        await invokeTool(tools.getNextTodoSection, {})
        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# demo',
            reason: '',
        })
        await invokeTool(tools.getNextTodoSection, {})

        const result = await invokeTool(tools.saveReadmeSection, {
            status: 'omitted',
            content: '',
            reason: 'No description found.',
        })
        expect(result).toContain('required and cannot be omitted')
    })

    it("assembles only saved sections and catches leaked template guidance", () => {
        const workspace = new ReadmeWorkspace(template)
        workspace.completeSectionByHeading('## Description', '## Description\n\n> Describe the project.')
        workspace.completeSectionByHeading('## Usage', '## Usage\n\n```shell\nrereadme --help\n```')
        workspace.omitSectionByHeading('## References', 'No official references were found.')
        workspace.saveReadmeSection('complete', '# demo')

        const validation = workspace.validate()
        expect(validation.valid).toBe(false)
        expect(validation.errors.join('\n')).toContain('leaked template guidance')
        expect(validation.readme).toContain('## Usage')
        expect(validation.readme).not.toContain('## References')
    })

    it("supports optional heading overrides and a fully valid assembled README", async () => {
        const workspace = new ReadmeWorkspace(template, { optionalHeadings: ['## References'] })
        const tools = createReadmeWorkspaceTools(workspace)

        expect(await invokeTool(tools.getCurrentTodoSection, {})).toContain('No active section')
        expect(await invokeTool(tools.getReadmeTodo, {})).toContain('"required": false')

        await invokeTool(tools.getNextTodoSection, {})
        expect(await invokeTool(tools.getCurrentTodoSection, {})).toContain('Preamble / title and badges')
        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# demo',
            reason: '',
        })

        await invokeTool(tools.getNextTodoSection, {})
        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '## Description\n\nA demo project.',
            reason: '',
        })

        await invokeTool(tools.getNextTodoSection, {})
        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '## Usage\n\n```shell\nrereadme --help\n```',
            reason: '',
        })

        await invokeTool(tools.getNextTodoSection, {})
        await invokeTool(tools.saveReadmeSection, {
            status: 'omitted',
            content: '',
            reason: 'No official references were found.',
        })

        expect(await invokeTool(tools.getNextTodoSection, {})).toContain('No unfinished')
        const result = JSON.parse(await invokeTool(tools.validateReadmeWorkspace, {})) as { valid: boolean; readme: string }
        expect(result.valid).toBe(true)
        expect(result.readme).toContain('# demo\n\n## Description')
    })

    it("reports invalid save operations for the active section", async () => {
        const workspace = new ReadmeWorkspace(template)
        const tools = createReadmeWorkspaceTools(workspace)

        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# demo',
            reason: '',
        })).toContain('no active section')

        await invokeTool(tools.getNextTodoSection, {})
        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '',
            reason: '',
        })).toContain('complete sections require content')
        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# demo\n\n```oops```',
            reason: '',
        })).toContain('preamble contains a fenced code block')

        await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '# demo',
            reason: '',
        })
        await invokeTool(tools.getNextTodoSection, {})
        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: 'Wrong heading\n\nA demo project.',
            reason: '',
        })).toContain('content must start with exact heading')
        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '## Description\n\n```\nrereadme\n```',
            reason: '',
        })).toContain('fenced code blocks require a language label')
        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'complete',
            content: '## Description\n\nA demo project.\n\n## Usage\n\nDo not save this here.',
            reason: '',
        })).toContain('extra top-level heading')
        expect(await invokeTool(tools.saveReadmeSection, {
            status: 'blocked',
            content: '',
            reason: '',
        })).toContain('blocked sections require a reason')
    })

    it("surfaces helper errors and validation edge cases", () => {
        const duplicateTemplate = [
            '# Demo',
            '',
            '## Same',
            '',
            '> First.',
            '',
            '## Same',
            '',
            '> Second.',
        ].join('\n')
        const workspace = new ReadmeWorkspace(duplicateTemplate)

        expect(() => workspace.completeSectionByHeading('## Missing', '## Missing\n\nNope.')).toThrow('Template has no section')
        expect(() => workspace.omitSectionByHeading('## Missing', 'No section.')).toThrow('Template has no section')

        workspace.completeSectionByHeading('## Same', '## Same\n\nFirst.\n\n## Same\n\nDuplicate.')
        ;(workspace as unknown as {
            sections: Array<{ heading: string; level?: number; status: string; content: string; note?: string }>
        }).sections[0] = {
            heading: 'Preamble / title and badges',
            level: 0,
            status: 'complete',
            content: '# Demo\n\n```bad```',
        }
        ;(workspace as unknown as {
            sections: Array<{ heading: string; level?: number; status: string; content: string; note?: string }>
        }).sections[2] = {
            heading: '## Same',
            level: 2,
            status: 'complete',
            content: '## Same\n\nSecond.\n\n```\nno language\n```\n\n## Extra\n\nWrong section.',
        }
        ;(workspace as unknown as {
            sections: Array<{ heading: string; level?: number; status: string; content: string; note?: string }>
        }).sections.push(
            { heading: '## Omitted', status: 'omitted', content: '' },
            { heading: '## Blocked', status: 'blocked', content: '' },
            { heading: '## Pending Optional', status: 'pending', content: '' },
        )
        const validation = workspace.validate()
        expect(validation.errors.join('\n')).toContain('appears 3 times')
        expect(validation.errors.join('\n')).toContain('omitted without a reason')
        expect(validation.errors.join('\n')).toContain('blocked without a missing-information note')
        expect(validation.errors.join('\n')).toContain('duplicated in saved sections')
        expect(validation.errors.join('\n')).toContain('extra top-level heading')
        expect(validation.errors.join('\n')).toContain('preamble contains a fenced code block')
        expect(validation.errors.join('\n')).toContain('unlabeled fenced code block')
        expect(validation.warnings).toContain('Some optional sections are still pending.')
    })

    it("handles stale active section state defensively", () => {
        const workspace = new ReadmeWorkspace(template)
        ;(workspace as unknown as { activeSectionId: string }).activeSectionId = 'missing'

        expect(workspace.getCurrentTodoSection()).toContain('No active section')
        expect(workspace.saveReadmeSection('complete', '# demo')).toContain('active section no longer exists')
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
