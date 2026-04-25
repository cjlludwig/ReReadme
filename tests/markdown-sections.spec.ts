import { describe, expect, it } from '@jest/globals'
import {
    composeReadmeWithArchitecture,
    insertMarkdownSectionBefore,
    removeMarkdownSection,
} from '../lib/markdown-sections.js'

describe('markdown section utilities', () => {
    const architecture = [
        '## Architecture',
        '',
        '```mermaid',
        'flowchart LR',
        '  Client -->|HTTP| App',
        '```',
    ].join('\n')
    const normalizedArchitecture = [
        '## Architecture',
        '',
        '```mermaid',
        'flowchart LR',
        '  Client -->|HTTP| App',
        '',
        '  classDef caller fill:#dbeafe,stroke:#2563eb,color:#172554,stroke-width:1.5px',
        '  classDef app fill:#ede9fe,stroke:#7c3aed,color:#2e1065,stroke-width:2px',
        '  classDef external fill:#fef3c7,stroke:#d97706,color:#451a03,stroke-width:1.5px',
        '  classDef storage fill:#dcfce7,stroke:#16a34a,color:#052e16,stroke-width:1.5px',
        '  classDef observability fill:#fae8ff,stroke:#c026d3,color:#4a044e,stroke-width:1.5px',
        '```',
    ].join('\n')

    it('removes an existing Architecture section up to the next depth-2 heading', () => {
        const input = [
            '# App',
            '',
            '## Usage',
            '',
            'Run it.',
            '',
            '## Architecture',
            '',
            'Old diagram.',
            '',
            '### Detail',
            '',
            'Nested detail is part of architecture.',
            '',
            '## References',
            '',
            '- Ref',
            '',
        ].join('\n')

        expect(removeMarkdownSection(input, 'Architecture')).toBe([
            '# App',
            '',
            '## Usage',
            '',
            'Run it.',
            '',
            '## References',
            '',
            '- Ref',
            '',
        ].join('\n'))
    })

    it('returns Markdown unchanged when the section is absent', () => {
        const input = '# App\n\n## Usage\n\nRun it.\n'
        expect(removeMarkdownSection(input, 'Architecture')).toBe(input)
    })

    it('removes Architecture when it is the first or only section', () => {
        expect(removeMarkdownSection('## Architecture\n\nOld.\n\n## References\n\n- Ref\n', 'Architecture'))
            .toBe('## References\n\n- Ref\n')
        expect(removeMarkdownSection('## Architecture\n\nOld.\n', 'Architecture')).toBe('')
        expect(removeMarkdownSection('# App\n\n## Architecture\n\nOld.\n', 'Architecture')).toBe('# App\n')
    })

    it('inserts before References when present', () => {
        const input = [
            '# App',
            '',
            '## Usage',
            '',
            'Run it.',
            '',
            '## References',
            '',
            '- Ref',
            '',
        ].join('\n')

        expect(insertMarkdownSectionBefore(input, architecture, ['References', 'Help', 'License'])).toBe([
            '# App',
            '',
            '## Usage',
            '',
            'Run it.',
            '',
            architecture,
            '',
            '## References',
            '',
            '- Ref',
            '',
        ].join('\n'))
    })

    it('falls back before Help, then License, then EOF', () => {
        expect(insertMarkdownSectionBefore('# App\n\n## Help\n\nInfo\n', architecture, ['References', 'Help', 'License']))
            .toBe(`# App\n\n${architecture}\n\n## Help\n\nInfo\n`)
        expect(insertMarkdownSectionBefore('# App\n\n## License\n\nMIT\n', architecture, ['References', 'Help', 'License']))
            .toBe(`# App\n\n${architecture}\n\n## License\n\nMIT\n`)
        expect(insertMarkdownSectionBefore('# App\n\n## Usage\n\nRun it.\n', architecture, ['References', 'Help', 'License']))
            .toBe(`# App\n\n## Usage\n\nRun it.\n\n${architecture}\n`)
    })

    it('inserts at the beginning when the first heading is the target', () => {
        expect(insertMarkdownSectionBefore('## References\n\n- Ref\n', architecture, ['References']))
            .toBe(`${architecture}\n\n## References\n\n- Ref\n`)
        expect(insertMarkdownSectionBefore('', architecture, ['References'])).toBe(`${architecture}\n`)
    })

    it('leaves Markdown unchanged when inserted section is empty', () => {
        const input = '# App\n\n## References\n\n- Ref\n'
        expect(insertMarkdownSectionBefore(input, '', ['References'])).toBe(input)
    })

    it('composes a single Architecture section containing fenced Mermaid', () => {
        const input = [
            '# App',
            '',
            '## Architecture',
            '',
            'Old diagram.',
            '',
            '## References',
            '',
            '- Ref',
            '',
        ].join('\n')

        const result = composeReadmeWithArchitecture(input, architecture)
        expect(result.match(/^## Architecture$/gum)).toHaveLength(1)
        expect(result).toContain(normalizedArchitecture)
        expect(result).not.toContain('Old diagram.')
    })

    it('adds default Mermaid layer styles when the agent omits classDef blocks', () => {
        const input = '# App\n\n## References\n\n- Ref\n'
        const result = composeReadmeWithArchitecture(input, architecture)
        expect(result).toContain('classDef caller fill:#dbeafe')
        expect(result).toContain('classDef app fill:#ede9fe')
        expect(result).toContain('classDef external fill:#fef3c7')
        expect(result).toContain('classDef storage fill:#dcfce7')
        expect(result).toContain('classDef observability fill:#fae8ff')
    })

    it('does not duplicate existing Mermaid classDef blocks', () => {
        const styledArchitecture = [
            '## Architecture',
            '',
            '```mermaid',
            'flowchart LR',
            '  Client -->|HTTP| App',
            '  classDef caller fill:#dbeafe',
            '```',
        ].join('\n')
        const result = composeReadmeWithArchitecture('# App\n', styledArchitecture)
        expect(result.match(/classDef caller/gum)).toHaveLength(1)
    })

    it('preserves surrounding text byte-for-byte outside the edited section', () => {
        const prefix = '# App\n\n## Usage\n\n- keep **this** formatting\n'
        const suffix = '## References\n\n- [Docs](https://example.com)\n'
        const input = `${prefix}\n## Architecture\n\nOld.\n\n${suffix}`

        const result = composeReadmeWithArchitecture(input, architecture)
        expect(result.startsWith(`${prefix}\n${normalizedArchitecture}\n\n`)).toBe(true)
        expect(result.endsWith(suffix)).toBe(true)
    })

    it('removes Architecture without inserting when section markdown is empty', () => {
        const input = '# App\n\n## Architecture\n\nOld.\n\n## References\n\n- Ref\n'
        expect(composeReadmeWithArchitecture(input, '')).toBe('# App\n\n## References\n\n- Ref\n')
    })
})
