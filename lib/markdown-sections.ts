import type { Heading, Root, RootContent } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

interface SectionRange {
  start: number;
  end: number;
}

function headingText(node: Heading): string {
  return node.children
    .map((child) => 'value' in child && typeof child.value === 'string' ? child.value : '')
    .join('')
    .trim();
}

function isTargetHeading(node: RootContent, title: string): node is Heading {
  return node.type === 'heading' && node.depth === 2 && headingText(node).toLowerCase() === title.toLowerCase();
}

function offsetOf(node: RootContent, boundary: 'start' | 'end'): number | undefined {
  return node.position?.[boundary].offset;
}

function parseMarkdown(markdown: string): Root {
  return unified().use(remarkParse).parse(markdown);
}

function findSectionRange(markdown: string, title: string): SectionRange | undefined {
  const tree = parseMarkdown(markdown);
  const children = tree.children;
  const startIndex = children.findIndex((child) => isTargetHeading(child, title));
  if (startIndex === -1) return undefined;

  const start = offsetOf(children[startIndex], 'start');
  if (start === undefined) return undefined;

  const nextPeer = children.slice(startIndex + 1).find((child) => (
    child.type === 'heading' && child.depth <= 2
  ));
  const end = nextPeer ? offsetOf(nextPeer, 'start') : markdown.length;
  if (end === undefined) return undefined;

  return { start, end };
}

function findInsertionOffset(markdown: string, beforeTitles: string[]): number {
  const tree = parseMarkdown(markdown);
  for (const title of beforeTitles) {
    const target = tree.children.find((child) => isTargetHeading(child, title));
    const offset = target ? offsetOf(target, 'start') : undefined;
    if (offset !== undefined) return offset;
  }
  return markdown.length;
}

function trimTrailingBlankLines(value: string): string {
  return value.replace(/\n+$/u, '');
}

function trimLeadingBlankLines(value: string): string {
  return value.replace(/^\n+/u, '');
}

export function removeMarkdownSection(markdown: string, title: string): string {
  const range = findSectionRange(markdown, title);
  if (!range) return markdown;

  const before = trimTrailingBlankLines(markdown.slice(0, range.start));
  const after = trimLeadingBlankLines(markdown.slice(range.end));

  if (!before) return after;
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}

export function insertMarkdownSectionBefore(
  markdown: string,
  sectionMarkdown: string,
  beforeTitles: string[],
): string {
  const section = sectionMarkdown.trim();
  if (!section) return markdown;

  const insertionOffset = findInsertionOffset(markdown, beforeTitles);
  const before = trimTrailingBlankLines(markdown.slice(0, insertionOffset));
  const after = trimLeadingBlankLines(markdown.slice(insertionOffset));

  if (!before) return after ? `${section}\n\n${after}` : `${section}\n`;
  if (!after) return `${before}\n\n${section}\n`;
  return `${before}\n\n${section}\n\n${after}`;
}

export function composeReadmeWithArchitecture(readme: string, architectureSection: string): string {
  const withoutArchitecture = removeMarkdownSection(readme, 'Architecture');
  return insertMarkdownSectionBefore(
    withoutArchitecture,
    normalizeArchitectureSection(architectureSection),
    ['References', 'Help', 'License'],
  );
}

function normalizeArchitectureSection(sectionMarkdown: string): string {
  if (!sectionMarkdown.trim()) return sectionMarkdown;

  return sectionMarkdown.replace(/```mermaid\n([\s\S]*?)```/u, (_match: string, diagram: string) => {
    const normalizedDiagram = diagram.includes('classDef ')
      ? diagram.trimEnd()
      : `${diagram.trimEnd()}\n\n${defaultMermaidClassDefs()}`;
    return `\`\`\`mermaid\n${normalizedDiagram}\n\`\`\``;
  });
}

function defaultMermaidClassDefs(): string {
  return [
    '  classDef caller fill:#dbeafe,stroke:#2563eb,color:#172554,stroke-width:1.5px',
    '  classDef app fill:#ede9fe,stroke:#7c3aed,color:#2e1065,stroke-width:2px',
    '  classDef external fill:#fef3c7,stroke:#d97706,color:#451a03,stroke-width:1.5px',
    '  classDef storage fill:#dcfce7,stroke:#16a34a,color:#052e16,stroke-width:1.5px',
    '  classDef observability fill:#fae8ff,stroke:#c026d3,color:#4a044e,stroke-width:1.5px',
  ].join('\n');
}
