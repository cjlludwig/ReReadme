# Plan: Create `create-pr` Skill

## Context

The user wants a skill that guides Claude through creating a GitHub PR from the current branch against `main` using the GH CLI — specifically, reading the repo's PR template and filling it in from git history. The project already has a PR template at `.github/PULL_REQUEST_TEMPLATE.md` with sections for Summary, Type of change, Changes made, Testing, and Checklist. No such skill exists yet in `~/.claude/skills/`.

## Skill Design

**Name:** `create-pr`
**Location:** `/Users/connorludwig/.claude/skills/create-pr/`
**Resources:** Single `SKILL.md` only — no scripts, references, or assets needed. The workflow is entirely GH CLI + git commands, which Claude can run directly.

### SKILL.md Frontmatter

```yaml
---
name: create-pr
description: >
  Create a GitHub pull request from the current branch against main using the GH CLI.
  Reads the repo's PR template (.github/PULL_REQUEST_TEMPLATE.md) to structure the PR body.
  Use when the user asks to create, open, submit, or draft a PR or pull request.
---
```

### SKILL.md Body — Workflow

The body instructs Claude to:

1. **Gather context** (parallel):
   - `git status` — detect uncommitted changes
   - `git log main...HEAD --oneline` — commits on this branch
   - `git diff main...HEAD --stat` — summary of files changed
   - Read `.github/PULL_REQUEST_TEMPLATE.md` — the template is the authoritative source of truth for PR structure

2. **Read the PR template as a fill-in guide** — use the template sections literally; infer content for each from git context. General inference hints:
   - Free-text prompts/placeholders → derive from commit messages and diff
   - Checkboxes → check all that apply based on what changed
   - HTML comment hints (e.g., `<!-- LLM HINT: ... -->`) → treat as filling instructions, remove before submitting
   - Strip all HTML comments, placeholder text, and the top-level NOTE alert before using as the PR body

3. **Draft PR content**:
   - **Title**: ≤70 chars, imperative, derived from branch purpose/commits
   - **Body**: the filled-in template (no HTML comments, no placeholder text)

4. **Confirm before creating** — unless the user explicitly asked to proceed autonomously, show the drafted title + body and ask for confirmation

5. **Create PR** with HEREDOC body pattern:

   ```bash
   gh pr create --title "..." --body "$(cat <<'EOF'
   [filled body]
   EOF
   )"
   ```

   - If branch has no remote tracking: push first with `git push -u origin HEAD`
   - Return the PR URL when done

## Implementation Steps

1. Run `python3 /Users/connorludwig/.agents/skills/skill-creator/scripts/init_skill.py create-pr --path /Users/connorludwig/.claude/skills/` to scaffold the skill directory
2. Edit `SKILL.md` with the frontmatter and workflow above
3. Delete the scaffolded example `scripts/`, `references/`, and `assets/` directories (not needed)
4. Run `python3 /Users/connorludwig/.agents/skills/skill-creator/scripts/package_skill.py /Users/connorludwig/.claude/skills/create-pr/` to validate and package

## Critical Files

- **Create:** `/Users/connorludwig/.claude/skills/create-pr/SKILL.md`
- **Reference (read-only):** `/Users/connorludwig/Developer/rereadme/.github/PULL_REQUEST_TEMPLATE.md` — the template sections to encode in skill instructions
- **Scripts:** `/Users/connorludwig/.agents/skills/skill-creator/scripts/init_skill.py`, `package_skill.py`

## Verification

After creating:

1. Confirm the skill directory exists at `~/.claude/skills/create-pr/SKILL.md`
2. Check the `package_skill.py` validation output — should pass with no errors
3. Test by invoking `/create-pr` in a Claude Code session on the `improvements` branch — it should read the PR template, gather git context, draft a PR body, confirm with the user, and run `gh pr create`
