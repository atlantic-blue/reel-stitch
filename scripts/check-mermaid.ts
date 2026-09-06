/**
 * Renders every mermaid block in the repository through the mermaid command line tool. A diagram
 * that does not parse never reaches a reader, because the site that displays it shows an error in
 * place of the picture.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { findMermaidBlocks, listMarkdownFiles } from './markdown.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const mmdc = join(root, 'node_modules', '.bin', 'mmdc')

const blocks = listMarkdownFiles(root).flatMap((file) =>
  findMermaidBlocks(readFileSync(join(root, file), 'utf8')).map((block) => ({ file, ...block })),
)

if (blocks.length === 0) {
  console.error('check-mermaid: found no mermaid block, so this check proved nothing')
  process.exit(1)
}

const work = mkdtempSync(join(tmpdir(), 'check-mermaid-'))
// The renderer runs as a browser. Continuous integration gives it no sandbox to drop into.
const puppeteerConfig = join(work, 'puppeteer.json')
writeFileSync(puppeteerConfig, JSON.stringify({ args: ['--no-sandbox'] }))

let failures = 0
blocks.forEach((block, index) => {
  const name = `${block.file.replace(/[^a-z0-9]+/gi, '-')}-${block.line}`
  const input = join(work, `${name}.mmd`)
  const output = join(work, `${name}.svg`)
  writeFileSync(input, `${block.code}\n`)
  const where = `${block.file}:${block.line}`
  try {
    execFileSync(
      mmdc,
      ['--input', input, '--output', output, '--puppeteerConfigFile', puppeteerConfig],
      {
        stdio: ['ignore', 'ignore', 'pipe'],
        encoding: 'utf8',
      },
    )
  } catch (error) {
    const detail =
      error instanceof Error && 'stderr' in error ? String(error.stderr) : String(error)
    console.error(`${where}: the mermaid command line tool refused block ${index + 1}`)
    console.error(detail.trim())
    failures += 1
    return
  }
  // An empty render exits zero just the same, so the drawing has to be there.
  const drawing = readFileSync(output, 'utf8')
  if (!drawing.includes('</svg>')) {
    console.error(`${where}: the render holds no finished drawing`)
    failures += 1
    return
  }
  console.log(`${where}: rendered, ${drawing.length} bytes`)
})

if (failures > 0) {
  console.error(`check-mermaid: ${failures} of ${blocks.length} block(s) failed`)
  process.exit(1)
}

console.log(`check-mermaid: rendered ${blocks.length} block(s)`)
