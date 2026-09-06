import { describe, test } from 'node:test'
import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import { findMermaidBlocks, findProseFaults, listMarkdownFiles } from './markdown.ts'

function kinds(source: string): string[] {
  return findProseFaults(source).map((fault) => fault.kind)
}

describe('the prose check', () => {
  test('accepts a plain list', () => {
    deepStrictEqual(findProseFaults('# a heading\n\n- one item\n- another item\n'), [])
  })

  test('rejects a markdown table', () => {
    const source = '# a heading\n\n| name | size |\n| --- | --- |\n| one | two |\n'
    deepStrictEqual(kinds(source), ['markdown table'])
    strictEqual(findProseFaults(source)[0]?.line, 4)
  })

  test('rejects an aligned delimiter row', () => {
    deepStrictEqual(kinds('| a | b | c |\n|:--|:-:|--:|\n'), ['markdown table'])
  })

  test('rejects a blockquote', () => {
    deepStrictEqual(kinds('a sentence.\n\n> a quoted sentence.\n'), ['blockquote'])
  })

  test('rejects a callout, which is a blockquote', () => {
    deepStrictEqual(kinds('> [!NOTE]\n> read this.\n'), ['blockquote', 'blockquote'])
  })

  test('reports every fault in a file', () => {
    deepStrictEqual(kinds('| a | b |\n| - | - |\n\n> quoted\n'), ['markdown table', 'blockquote'])
  })

  test('allows a pipe in prose, because a table needs its delimiter row', () => {
    deepStrictEqual(findProseFaults('Run one | another to join them.\n'), [])
  })

  test('allows a dashed rule and a bullet', () => {
    deepStrictEqual(findProseFaults('---\n\n- a bullet\n\n-----\n'), [])
  })

  test('allows both inside a fenced code block', () => {
    const source = '```text\n| a | b |\n| - | - |\n> quoted\n```\n\nprose after the fence.\n'
    deepStrictEqual(findProseFaults(source), [])
  })

  test('sees a fault after the fence closes', () => {
    deepStrictEqual(kinds('```\n| - | - |\n```\n\n> quoted\n'), ['blockquote'])
  })

  test('reads a tilde fence too', () => {
    deepStrictEqual(findProseFaults('~~~\n> quoted\n~~~\n'), [])
  })
})

describe('the mermaid block reader', () => {
  test('finds a tagged block and gives its code', () => {
    const source = 'text\n\n```mermaid\nflowchart LR\n  A --> B\n```\n'
    deepStrictEqual(findMermaidBlocks(source), [{ line: 3, code: 'flowchart LR\n  A --> B' }])
  })

  test('ignores a block tagged as anything else', () => {
    deepStrictEqual(findMermaidBlocks('```json\n{ "a": 1 }\n```\n'), [])
  })

  test('ignores an untagged block', () => {
    deepStrictEqual(findMermaidBlocks('```\nflowchart LR\n```\n'), [])
  })

  test('finds every block in one file', () => {
    const source = '```mermaid\nA\n```\n\ntext\n\n```mermaid\nB\n```\n'
    deepStrictEqual(
      findMermaidBlocks(source).map((block) => block.code),
      ['A', 'B'],
    )
  })

  test('does not read a fence inside a longer fence as a block', () => {
    deepStrictEqual(findMermaidBlocks('````text\n```mermaid\nA\n```\n````\n'), [])
  })
})

describe('the file list', () => {
  test('holds the documents this repository ships', () => {
    const files = listMarkdownFiles(new URL('..', import.meta.url).pathname)
    for (const wanted of [
      'README.md',
      'docs/setup.md',
      'docs/prompts.md',
      'docs/measurements.md',
    ]) {
      strictEqual(files.includes(wanted), true, `expected ${wanted} in ${files.join(', ')}`)
    }
  })

  test('leaves the dependencies out', () => {
    const files = listMarkdownFiles(new URL('..', import.meta.url).pathname)
    strictEqual(
      files.some((file) => file.startsWith('node_modules/')),
      false,
    )
  })
})
