# Plan: GitHub Issue Templates (Bug + Feature Request)

## Context

The repo has a PR template (`.github/PULL_REQUEST_TEMPLATE.md`) but no issue templates. The user wants bug and feature request templates that:
1. Follow the project's template philosophy: HTML comments as instructional hints (invisible in rendered output), blockquotes as content guidance
2. Provide enough structured detail that an AI agent (like Claude) could plausibly generate a PR from a well-filled issue

## Files to Create

- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`

No existing files to modify. The `.github/ISSUE_TEMPLATE/` directory does not yet exist.

## Template Philosophy (from docs/templates.md + PR template style)

- **`<!-- -->`** blocks: hard rules and example hints — invisible in rendered output, guide the user on what to write
- **`> `** blockquote lines: content placeholders with concrete examples (user sees these and replaces them)
- Literal structure (headings, checkboxes) is preserved verbatim
- Mark optional sections explicitly so users don't write filler
- Keep sections shallow (≤6 sections, ≤3 heading levels)
- Lead with a rules comment block

## Bug Report Template Design

Sections needed for AI-actionable bugs:

1. **Description** — what happened vs. what was expected (required)
2. **Steps to Reproduce** — numbered steps (required)
3. **Environment** — Node version, OS, CLI flags, model used (required)
4. **Error Output** — logs/stack trace in a fenced code block (required)
5. **Relevant Files** — paths in the repo most likely related (optional)

YAML frontmatter: `name`, `about`, `title` prefix, `labels: bug`

## Feature Request Template Design

Sections needed for AI-actionable features:

1. **Problem** — what pain point this solves, not the solution (required)
2. **Proposed Solution** — concrete behavioral description (required)
3. **Example Usage** — CLI invocation or API call showing the intended UX (required)
4. **Acceptance Criteria** — checklist of testable conditions (required)
5. **Files Likely Affected** — optional hint to the agent about where to look
6. **Alternatives Considered** — optional, avoids the agent re-exploring dead ends

YAML frontmatter: `name`, `about`, `title` prefix, `labels: enhancement`

## Key Design Decisions

- Use `<!-- HINT: example text here -->` style comments (matching the PR template's `<!-- HINT -->` block) to show concrete examples inside optional or open-ended fields
- Use `> ` blockquotes only for sections that need free-form narrative (Description, Problem, Proposed Solution) to signal "replace this with your content"
- Required sections get a comment explaining *why* the detail matters for an agent generating a PR
- Environment section uses a pre-filled checklist format for Node/OS facts so it's quick to fill
- Error output uses a fenced ```text block placeholder so the user knows exactly where to paste

## Verification

After creating:
1. `make lint-md` — ensure markdownlint passes on new files
2. Visit GitHub → Issues → New Issue to confirm both templates appear in the template picker
3. Open each template and confirm HTML comments are hidden, blockquotes are visible, structure looks correct
