import { tool } from '@openai/agents';
import { z } from 'zod';

export type ReadmeSectionStatus = 'pending' | 'complete' | 'omitted' | 'blocked';

interface ReadmeSection {
  id: string;
  heading: string;
  level: number;
  instructions: string;
  required: boolean;
  status: ReadmeSectionStatus;
  content: string;
  note?: string;
}

export interface ReadmeWorkspaceValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  readme: string;
}

const SYNTHETIC_HEADING = 'Preamble / title and badges';

export interface ReadmeWorkspaceOptions {
  optionalHeadings?: string[];
}

function isOptional(instructions: string): boolean {
  return /\(Optional\)|\bOptional\b/i.test(instructions);
}

function sectionId(index: number, heading: string): string {
  return `${index}-${heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'}`;
}

function parseSections(template: string): ReadmeSection[] {
  const topLevelSectionPattern = /^##\s+.+$/gm;
  const matches = Array.from(template.matchAll(topLevelSectionPattern));
  const sections: ReadmeSection[] = [];
  const preambleEnd = matches[0]?.index ?? template.length;
  const preambleInstructions = template.slice(0, preambleEnd).trim();

  sections.push({
    id: 'preamble',
    heading: SYNTHETIC_HEADING,
    level: 0,
    instructions: preambleInstructions,
    required: true,
    status: 'pending',
    content: '',
  });

  matches.forEach((match, index) => {
    const start = match.index ?? 0;

    const next = matches[index + 1];
    const end = next?.index ?? template.length;
    const headingLine = match[0].trim();
    const body = template.slice(start + headingLine.length, end).trim();
    sections.push({
      id: sectionId(sections.length, headingLine),
      heading: headingLine,
      level: 2,
      instructions: body,
      required: !isOptional(body),
      status: 'pending',
      content: '',
    });
  });

  return sections;
}

function leakedTemplateInstruction(content: string): boolean {
  return content
    .split('\n')
    .some((line) => line.trim().startsWith('>') || line.includes('<!--') || line.includes('-->'));
}

function invalidPreamble(content: string): string | undefined {
  if (content.includes('```')) {
    return 'preamble contains a fenced code block';
  }
  return undefined;
}

function unlabeledFenceLines(content: string): number[] {
  const lines = content.split('\n');
  const unlabeledLines: number[] = [];
  let inFence = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('```')) return;

    if (inFence) {
      inFence = false;
      return;
    }

    inFence = true;
    if (trimmed === '```') {
      unlabeledLines.push(index + 1);
    }
  });

  return unlabeledLines;
}

function unexpectedTopLevelHeadings(section: ReadmeSection, content: string): string[] {
  const lines = content.split('\n');
  const topLevelHeadings = lines
    .map((line) => line.trim())
    .filter((line) => /^#{1,2}\s+.+$/.test(line));

  if (section.level === 0) {
    return topLevelHeadings.filter((heading) => heading.startsWith('## '));
  }

  return topLevelHeadings.filter((heading, index) => index > 0 || heading !== section.heading);
}

export class ReadmeWorkspace {
  private readonly sections: ReadmeSection[];
  private activeSectionId: string | undefined;

  constructor(template: string, options: ReadmeWorkspaceOptions = {}) {
    this.sections = parseSections(template);
    const optionalHeadings = new Set(options.optionalHeadings ?? []);
    for (const section of this.sections) {
      if (optionalHeadings.has(section.heading)) {
        section.required = false;
      }
    }
  }

  hasSection(heading: string): boolean {
    return this.sections.some((section) => section.heading === heading);
  }

  completeSectionByHeading(heading: string, content: string, note?: string): void {
    const section = this.sections.find((candidate) => candidate.heading === heading);
    if (!section) {
      throw new Error(`Template has no section heading: ${heading}`);
    }
    section.status = 'complete';
    section.content = content.trim();
    section.note = note;
  }

  omitSectionByHeading(heading: string, reason: string): void {
    const section = this.sections.find((candidate) => candidate.heading === heading);
    if (!section) {
      throw new Error(`Template has no section heading: ${heading}`);
    }
    section.status = 'omitted';
    section.content = '';
    section.note = reason;
  }

  getReadmeTodo(): string {
    return JSON.stringify({
      activeSectionId: this.activeSectionId ?? null,
      sections: this.sections.map((section) => ({
        id: section.id,
        heading: section.heading,
        required: section.required,
        status: section.status,
        note: section.note,
      })),
    }, null, 2);
  }

  getNextTodoSection(): string {
    const section = this.sections.find((candidate) => candidate.status === 'pending');
    if (!section) {
      this.activeSectionId = undefined;
      return 'No unfinished README sections remain. Call validateReadmeWorkspace.';
    }
    this.activeSectionId = section.id;
    return this.renderSection(section);
  }

  getCurrentTodoSection(): string {
    if (!this.activeSectionId) {
      return 'No active section. Call getNextTodoSection first.';
    }
    const section = this.sections.find((candidate) => candidate.id === this.activeSectionId);
    return section ? this.renderSection(section) : 'No active section. Call getNextTodoSection first.';
  }

  saveReadmeSection(status: ReadmeSectionStatus, content: string, reason = ''): string {
    if (!this.activeSectionId) {
      return 'Error: no active section. Call getNextTodoSection first.';
    }

    const section = this.sections.find((candidate) => candidate.id === this.activeSectionId);
    if (!section) {
      this.activeSectionId = undefined;
      return 'Error: active section no longer exists.';
    }

    const trimmedContent = content.trim();
    const trimmedReason = reason.trim();

    if (status === 'omitted' && section.required) {
      return `Error: ${section.heading} is required and cannot be omitted.`;
    }
    if ((status === 'omitted' || status === 'blocked') && trimmedReason.length === 0) {
      return `Error: ${status} sections require a reason.`;
    }
    if (status === 'complete' && trimmedContent.length === 0) {
      return 'Error: complete sections require content.';
    }
    if (section.level > 0 && status === 'complete' && !trimmedContent.startsWith(section.heading)) {
      return `Error: content must start with exact heading "${section.heading}".`;
    }
    if (status === 'complete') {
      const preambleError = section.level === 0 ? invalidPreamble(trimmedContent) : undefined;
      if (preambleError) {
        return `Error: ${preambleError}. Save only the title, badges, and top-of-file markdown.`;
      }
      const unlabeledFences = unlabeledFenceLines(trimmedContent);
      if (unlabeledFences.length > 0) {
        return `Error: fenced code blocks require a language label. Unlabeled fence line(s): ${unlabeledFences.join(', ')}.`;
      }
      const unexpected = unexpectedTopLevelHeadings(section, trimmedContent);
      if (unexpected.length > 0) {
        return `Error: ${section.heading} content includes extra top-level heading(s): ${unexpected.join(', ')}. Save only the active section.`;
      }
    }

    section.status = status;
    section.content = status === 'complete' ? trimmedContent : '';
    section.note = trimmedReason || undefined;
    this.activeSectionId = undefined;

    return `${section.heading} saved as ${status}.`;
  }

  validateReadmeWorkspace(): string {
    const validation = this.validate();
    return JSON.stringify(validation, null, 2);
  }

  assemble(): string {
    return this.sections
      .filter((section) => section.status === 'complete')
      .map((section) => section.content.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
  }

  validate(): ReadmeWorkspaceValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const readme = this.assemble();

    for (const section of this.sections) {
      if (section.required && section.status !== 'complete') {
        errors.push(`${section.heading} is required but is ${section.status}.`);
      }
      if (section.status === 'omitted' && !section.note) {
        errors.push(`${section.heading} was omitted without a reason.`);
      }
      if (section.status === 'blocked' && !section.note) {
        errors.push(`${section.heading} is blocked without a missing-information note.`);
      }
      if (section.status === 'complete' && leakedTemplateInstruction(section.content)) {
        errors.push(`${section.heading} contains leaked template guidance.`);
      }
      if (section.status === 'complete') {
        const preambleError = section.level === 0 ? invalidPreamble(section.content) : undefined;
        if (preambleError) {
          errors.push(`${section.heading} ${preambleError}.`);
        }
        const unlabeledFences = unlabeledFenceLines(section.content);
        if (unlabeledFences.length > 0) {
          errors.push(`${section.heading} contains unlabeled fenced code block(s) at line(s): ${unlabeledFences.join(', ')}.`);
        }
        const unexpected = unexpectedTopLevelHeadings(section, section.content);
        if (unexpected.length > 0) {
          errors.push(`${section.heading} contains extra top-level heading(s): ${unexpected.join(', ')}.`);
        }
      }
      if (section.level > 0 && section.status === 'complete') {
        const count = readme.split('\n').filter((line) => line.trim() === section.heading).length;
        if (count !== 1) {
          errors.push(`${section.heading} appears ${count} times in the assembled README.`);
        }
      }
    }

    const headings = this.sections
      .filter((section) => section.level > 0 && section.status === 'complete')
      .map((section) => section.heading);
    const duplicateHeadings = headings.filter((heading, index) => headings.indexOf(heading) !== index);
    for (const heading of new Set(duplicateHeadings)) {
      errors.push(`${heading} is duplicated in saved sections.`);
    }

    if (this.sections.some((section) => section.status === 'pending')) {
      warnings.push('Some optional sections are still pending.');
    }

    return { valid: errors.length === 0, errors, warnings, readme };
  }

  private renderSection(section: ReadmeSection): string {
    return JSON.stringify({
      id: section.id,
      heading: section.heading,
      required: section.required,
      status: section.status,
      instructions: section.instructions,
      saveRules: section.level === 0
        ? 'Save only the top-of-file README markdown for the title, badges, and any required pre-heading content.'
        : `Content must start with the exact heading: ${section.heading}`,
    }, null, 2);
  }
}

export function createReadmeWorkspaceTools(workspace: ReadmeWorkspace) {
  const getReadmeTodo = tool({
    name: 'getReadmeTodo',
    description: 'Show the README task list derived from the immutable template, including section order, status, and active section.',
    parameters: z.object({}),
    execute: async () => workspace.getReadmeTodo(),
  });

  const getNextTodoSection = tool({
    name: 'getNextTodoSection',
    description: 'Return the next unfinished README section in template order and mark it active.',
    parameters: z.object({}),
    execute: async () => workspace.getNextTodoSection(),
  });

  const getCurrentTodoSection = tool({
    name: 'getCurrentTodoSection',
    description: 'Return the active README section instructions again.',
    parameters: z.object({}),
    execute: async () => workspace.getCurrentTodoSection(),
  });

  const saveReadmeSection = tool({
    name: 'saveReadmeSection',
    description: 'Atomically save the active README section content and status.',
    parameters: z.object({
      status: z.enum(['complete', 'omitted', 'blocked']),
      content: z.string().default('').describe('Final markdown for this section when status is complete.'),
      reason: z.string().default('').describe('Required when status is omitted or blocked.'),
    }),
    execute: async (input) => workspace.saveReadmeSection(input.status, input.content, input.reason),
  });

  const validateReadmeWorkspace = tool({
    name: 'validateReadmeWorkspace',
    description: 'Validate the accumulated README draft and return deterministic assembled markdown.',
    parameters: z.object({}),
    execute: async () => workspace.validateReadmeWorkspace(),
  });

  return {
    getReadmeTodo,
    getNextTodoSection,
    getCurrentTodoSection,
    saveReadmeSection,
    validateReadmeWorkspace,
  };
}
