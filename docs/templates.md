# Templates

A template is the contract between you and the agent. It defines what sections exist, what each section must contain, and what the final output looks like. Clear guidance produces accurate READMEs; vague or over-structured templates produce filler. The built-in templates are designed around this principle — see [Using Markdown Templates with AI](https://cjlludwig.github.io/blog/using-markdown-templates-with-ai) for the full design rationale.

## How rereadme Uses Templates

Each template uses two mechanisms to communicate with the agent:

**HTML comment blocks** (`<!-- -->`) contain hard rules for the agent — required headings, output format constraints, what to omit. These are LLM instructions and do not appear in the final output.

**Blockquote lines** (`>`) contain section-specific content guidance — what facts to extract and how to format them. The agent replaces each blockquote with discovered content and removes it from the final output.

Everything else — headings, code block labels, example shapes, badge placeholders — is literal structure the agent preserves verbatim. The agent fills the gaps; it does not invent the skeleton.

## Built-in Templates

Two templates ship with rereadme:

- `templates/README_TEMPLATE.md` — standard README covering Description, Getting Started, Usage, Architecture, References, Help, and License
- `templates/AGENTS_TEMPLATE.md` — concise AGENTS.md covering Project, Commands, Structure, Architecture, Constraints, and Testing (target: < 100 lines)

Both follow the conventions below and are the best reference for writing your own.

## Custom Templates

Pass `--template FILE` to use your own README template, or `--agents-template FILE` for a custom AGENTS.md (requires `--agents`):

```shell
rereadme --template COMPANY_README_TEMPLATE.md
rereadme --agents --agents-template COMPANY_AGENTS_TEMPLATE.md
```

Requirements for a valid custom template:

- Valid markdown with at least one heading (`#`)
- Use `>` blockquote lines as content placeholders — the agent targets these for replacement
- Maximum size: 50KB

## Template Conventions

These conventions are drawn from the built-in templates and the design guidance in the blog post:

**Lead with a rules comment.** Place a `<!-- TEMPLATE RULES -->` block at the top listing what headings are required, what the agent must and must not do, and the expected output format. This sets hard constraints before the agent reads anything else.

**Comments for LLM rules, blockquotes for content guidance.** Use `<!-- -->` for instructions the agent should follow but that shouldn't appear in output. Use `>` blockquotes for section-level guidance the agent replaces with real content.

**Mark optional sections explicitly.** Add `(Optional)` to any section the agent should omit when no relevant data was found. Without this, agents generate filler text to satisfy structure.

**Keep sections shallow.** Aim for five or six sections maximum and no more than three levels of heading depth. Excessive structure creates busywork — sections that don't apply get filler written purely to satisfy the template.

## References

- [Using Markdown Templates with AI](https://cjlludwig.github.io/blog/using-markdown-templates-with-ai)
- [rereadme README](../README.md)
