/**
 * Markdown parsing for the documentation checks. Both checks read the same file list and skip
 * fenced code, so a sample of a table or a quoted line inside a fence is allowed to stay.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type ProseFaultKind = 'markdown table' | 'blockquote'

export interface ProseFault {
  readonly kind: ProseFaultKind
  readonly line: number
  readonly text: string
}

export interface MermaidBlock {
  readonly line: number
  readonly code: string
}

const SKIPPED_DIRECTORIES = new Set(['.git', 'node_modules'])

/** Every markdown file under `root`, sorted, with the paths relative to `root`. */
export function listMarkdownFiles(root: string): string[] {
  const found: string[] = []
  walk(root, '', found)
  return found.sort()
}

function walk(root: string, relative: string, found: string[]): void {
  for (const entry of readdirSync(join(root, relative))) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue
    const next = relative === '' ? entry : `${relative}/${entry}`
    if (statSync(join(root, next)).isDirectory()) walk(root, next, found)
    else if (next.endsWith('.md')) found.push(next)
  }
}

/** The fence marker opening or closing a code block, or null on any other line. */
function fenceOf(line: string): string | null {
  const match = /^\s*(`{3,}|~{3,})/.exec(line)
  return match === null ? null : (match[1] ?? null)
}

function isBlockquote(line: string): boolean {
  return /^\s{0,3}>/.test(line)
}

/**
 * A table needs its delimiter row, so that row is the whole test. A line of pipes without one
 * renders as prose, and prose is allowed to hold a pipe.
 */
function isTableDelimiter(line: string): boolean {
  if (!line.includes('|')) return false
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|')
  if (cells.length < 2) return false
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
}

export function findProseFaults(source: string): ProseFault[] {
  const faults: ProseFault[] = []
  let openFence: string | null = null
  source.split('\n').forEach((line, index) => {
    const fence = fenceOf(line)
    if (openFence !== null) {
      if (fence !== null && fence[0] === openFence[0] && fence.length >= openFence.length) {
        openFence = null
      }
      return
    }
    if (fence !== null) {
      openFence = fence
      return
    }
    const kind: ProseFaultKind | null = isTableDelimiter(line)
      ? 'markdown table'
      : isBlockquote(line)
        ? 'blockquote'
        : null
    if (kind !== null) faults.push({ kind, line: index + 1, text: line.trim() })
  })
  return faults
}

/** Every fenced block tagged `mermaid`, with the line its fence opens on. */
export function findMermaidBlocks(source: string): MermaidBlock[] {
  const blocks: MermaidBlock[] = []
  let openFence: string | null = null
  let openedAt = 0
  let collected: string[] = []
  let collecting = false
  source.split('\n').forEach((line, index) => {
    const fence = fenceOf(line)
    if (openFence !== null) {
      if (fence !== null && fence[0] === openFence[0] && fence.length >= openFence.length) {
        if (collecting) blocks.push({ line: openedAt, code: collected.join('\n') })
        openFence = null
        collecting = false
        collected = []
        return
      }
      if (collecting) collected.push(line)
      return
    }
    if (fence === null) return
    openFence = fence
    openedAt = index + 1
    collecting = line.trim().slice(fence.length).trim().toLowerCase() === 'mermaid'
  })
  return blocks
}
