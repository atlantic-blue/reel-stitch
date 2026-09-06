/**
 * Fails when a documentation file holds a markdown table or a blockquote. Both make text hard to
 * reuse, so this repository writes one line per item in a plain list instead.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { findProseFaults, listMarkdownFiles } from './markdown.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const files = listMarkdownFiles(root)

if (files.length === 0) {
  console.error('check-prose: found no markdown file to read, so this check proved nothing')
  process.exit(1)
}

let faultCount = 0
for (const file of files) {
  for (const fault of findProseFaults(
    readFileSync(new URL(file, new URL('..', import.meta.url)), 'utf8'),
  )) {
    console.error(`${file}:${fault.line}: ${fault.kind}: ${fault.text}`)
    faultCount += 1
  }
}

if (faultCount > 0) {
  console.error(`check-prose: ${faultCount} fault(s) in ${files.length} file(s)`)
  console.error('check-prose: write one line per item in a plain list instead')
  process.exit(1)
}

console.log(`check-prose: read ${files.length} file(s), no table and no blockquote`)
