import { readFile } from 'fs/promises'

export async function validateTemplate(filePath: string, label: string): Promise<string> {
  let content: string
  try {
    content = await readFile(filePath, 'utf-8')
  } catch {
    throw new Error(`${label}: File not found or unreadable: ${filePath}`)
  }
  if (content.trim().length === 0) {
    throw new Error(`${label}: Template file is empty: ${filePath}`)
  }
  const MAX_BYTES = 50 * 1024
  if (Buffer.byteLength(content, 'utf-8') > MAX_BYTES) {
    throw new Error(`${label}: Template file exceeds 50KB limit: ${filePath}`)
  }
  if (!/^#{1,6}\s+\S/m.test(content)) {
    throw new Error(`${label}: Template does not appear to be valid markdown (no headings found): ${filePath}`)
  }
  return content
}
