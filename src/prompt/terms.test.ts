import { describe, test } from 'node:test'
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { RULE_IDS } from './check.ts'
import {
  HANDS_NEGATIVE_TERMS,
  NIGHT_NEGATIVE_TERMS,
  STANDARD_NEGATIVE_TERMS,
  countWordMatches,
  dedupeTerms,
  holdsWord,
  splitTerms,
  standardNegativePrompt,
} from './terms.ts'

const document = readFileSync(new URL('../../docs/prompts.md', import.meta.url), 'utf8')

/** The one fenced `text` block in the document, which is the standard negative prompt. */
function fencedTextBlock(): string {
  const match = /```text\n([\s\S]*?)```/.exec(document)
  if (match === null || match[1] === undefined) {
    throw new Error('docs/prompts.md holds no fenced text block, so this check proved nothing')
  }
  return match[1]
}

/** The backticked list on the one line of the document that starts `Add`. */
function addedTerms(after: string): string[] {
  const pattern = new RegExp(`Add \`([^\`]+)\` ${after}`)
  const match = pattern.exec(document)
  if (match === null || match[1] === undefined) {
    throw new Error(`docs/prompts.md names no terms to add ${after}`)
  }
  return splitTerms(match[1])
}

describe('the term lists and docs/prompts.md', () => {
  test('agree on the standard negative prompt', () => {
    const fromDocument = splitTerms(fencedTextBlock().replace(/\n/g, ' '))
    ok(fromDocument.length > 0, 'the document listed no term, so this check proved nothing')
    deepStrictEqual(fromDocument, [...STANDARD_NEGATIVE_TERMS])
  })

  test('agree on the terms hands add', () => {
    deepStrictEqual(addedTerms('when hands are not the subject'), [...HANDS_NEGATIVE_TERMS])
  })

  test('agree on the terms a night scene adds', () => {
    deepStrictEqual(addedTerms('for a night scene'), [...NIGHT_NEGATIVE_TERMS])
  })

  test('agree on the rule identifiers, so a finding leads back to a rule', () => {
    for (const rule of RULE_IDS) {
      ok(document.includes(`\`${rule}\``), `docs/prompts.md never names the '${rule}' rule`)
    }
  })

  test('write the standard negative prompt as one comma separated string', () => {
    strictEqual(splitTerms(standardNegativePrompt()).length, STANDARD_NEGATIVE_TERMS.length)
  })
})

describe('whole word matching', () => {
  test('reads a word inside another word as no match', () => {
    strictEqual(holdsWord('A management office door.', 'man'), false)
    strictEqual(holdsWord('Lit dimly along one side.', 'dim'), false)
    strictEqual(holdsWord('Nighttime market.', 'night'), false)
  })

  test('reads a whole word whatever its case', () => {
    ok(holdsWord('A Woman waits.', 'woman'))
    ok(holdsWord('DARK street.', 'dark'))
  })

  test('reads a term of several words across any whitespace', () => {
    ok(holdsWord('shot in low light throughout', 'low light'))
    ok(holdsWord('shot in low\nlight throughout', 'low light'))
    strictEqual(holdsWord('a lowlight scene', 'low light'), false)
  })

  test('counts every time a word appears', () => {
    strictEqual(countWordMatches('dark room, dark street, darkness', 'dark'), 2)
    strictEqual(countWordMatches('a quiet street', 'dark'), 0)
  })
})

describe('term lists', () => {
  test('split on commas and drop the empty ones', () => {
    deepStrictEqual(splitTerms(' text,, low  quality , '), ['text', 'low quality'])
  })

  test('keep the first spelling of a repeated term', () => {
    deepStrictEqual(dedupeTerms(['Text', 'text', 'blurry', 'TEXT']), ['Text', 'blurry'])
  })
})
