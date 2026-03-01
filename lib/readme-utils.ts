import type { ReadmeSuggestion } from './agents.js';

export function stripFences(s: string): string {
  let cleaned = s.trim();
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.slice('```markdown'.length);
  } else if (cleaned.startsWith('```md')) {
    cleaned = cleaned.slice('```md'.length);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
}

export function applyPatches(original: string, suggestions: ReadmeSuggestion): string {
  let result = original
  for (const change of suggestions.changes) {
    if (result.includes(change.currentExcerpt)) {
      const replacement = change.suggestedReplacement;
      result = result.replace(change.currentExcerpt, () => replacement)
    }
  }
  return result
}

export function renderSuggestions(s: ReadmeSuggestion, fullReadme?: string): string {
  const notifLevel = s.signalLevel === "high" ? '> [!CAUTION]' : s.signalLevel === "medium" ? '> [!WARNING]' : '> [!TIP]'
  const lines: string[] = []
  lines.push(notifLevel)
  lines.push(`> ${s.significanceReason}`)
  lines.push('')
  lines.push('## README Update Suggestions')
  for (const change of s.changes) {
    lines.push('')
    lines.push(`**Section:** ${change.sectionHeading.replaceAll('#', '').trim()}`)
    lines.push(`**Why:** ${change.reason}`)
    lines.push('')
    lines.push('```diff')
    for (const line of change.currentExcerpt.split('\n')) lines.push(`- ${line}`)
    for (const line of change.suggestedReplacement.split('\n')) lines.push(`+ ${line}`)
    lines.push('```')
  }
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push(`*${s.summary}*`)
  if (fullReadme) {
    lines.push('')
    lines.push('<details>')
    lines.push('<summary>Full README (copy-paste ready)</summary>')
    lines.push('')
    lines.push('``````markdown')
    lines.push(fullReadme.trim())
    lines.push('``````')
    lines.push('')
    lines.push('</details>')
  }
  return lines.join('\n')
}
