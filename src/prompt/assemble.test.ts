import { describe, test } from 'node:test'
import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'

import { assemblePrompt, buildNegative, joinClauses } from './assemble.ts'
import { checkPrompt } from './check.ts'
import { makeCheckInput, makeClauses, makePromptFrom, makePromptLook } from './fixture.ts'
import { HANDS_NEGATIVE_TERMS, NIGHT_NEGATIVE_TERMS, splitTerms } from './terms.ts'

function assembleWith(handsAreTheSubject: boolean, isNightScene: boolean): string {
  return assemblePrompt({
    clauses: makeClauses(),
    look: makePromptLook(),
    handsAreTheSubject,
    isNightScene,
  }).negative
}

describe('the assembled string', () => {
  test('is the five clauses in the published order, one space between them', () => {
    const clauses = makeClauses()
    const { assembled } = assemblePrompt({
      clauses,
      look: makePromptLook(),
      handsAreTheSubject: false,
      isNightScene: false,
    })
    strictEqual(
      assembled,
      [clauses.entity, clauses.scene, clauses.motion, clauses.aesthetic, clauses.style].join(' '),
    )
  })

  test('keeps the full stop each clause ends with', () => {
    const assembled = joinClauses(makeClauses())
    strictEqual(assembled.split('. ').length, 5)
    ok(assembled.endsWith('.'))
  })

  test('holds no double space, whatever whitespace a clause carries', () => {
    const assembled = joinClauses(
      makeClauses({ entity: '  A woman  waits at the counter.  ', scene: 'Rain\noutside.' }),
    )
    strictEqual(assembled.includes('  '), false)
    ok(assembled.startsWith('A woman waits at the counter. Rain outside. '))
  })

  test('is accepted by the order rule the checker applies', () => {
    deepStrictEqual(
      checkPrompt(makeCheckInput()).filter((finding) => finding.rule === 'order'),
      [],
    )
  })
})

describe('the negative prompt', () => {
  test('opens with the look, in the order the look wrote it', () => {
    const look = makePromptLook({ negativePrompt: 'warping, blurry, text' })
    const { negative } = assemblePrompt({
      clauses: makeClauses(),
      look,
      handsAreTheSubject: true,
      isNightScene: false,
    })
    strictEqual(negative, 'warping, blurry, text')
  })

  test('adds hands and fingers only when hands are not the subject', () => {
    const withHands = splitTerms(assembleWith(false, false))
    const withoutHands = splitTerms(assembleWith(true, false))
    for (const term of HANDS_NEGATIVE_TERMS) {
      ok(withHands.includes(term), `expected the negative prompt to name ${term}`)
      strictEqual(withoutHands.includes(term), false, `expected no ${term} in the negative prompt`)
    }
  })

  test('adds the night terms only for a night scene', () => {
    const night = splitTerms(assembleWith(false, true))
    const day = splitTerms(assembleWith(false, false))
    for (const term of NIGHT_NEGATIVE_TERMS) {
      ok(night.includes(term), `expected the negative prompt to name ${term}`)
      strictEqual(day.includes(term), false, `expected no ${term} in the negative prompt`)
    }
  })

  test('names a term once, however many times it is asked for', () => {
    const negative = buildNegative('text, hands, text, HANDS, fingers', false, true)
    const terms = splitTerms(negative)
    strictEqual(terms.length, new Set(terms.map((term) => term.toLowerCase())).size)
    strictEqual(negative, 'text, hands, fingers, blue colour cast, teal grade, heavy colour grade')
  })

  test('drops an empty term and collapses the whitespace inside one', () => {
    strictEqual(buildNegative('text, , low  quality,  ', true, false), 'text, low quality')
  })

  test('gives the same string every time, in a stable order', () => {
    const first = buildNegative('warping, blurry', false, true)
    const second = buildNegative('warping, blurry', false, true)
    strictEqual(first, second)
    strictEqual(
      first,
      'warping, blurry, hands, fingers, blue colour cast, teal grade, heavy colour grade',
    )
  })
})

describe('a prompt the assembler built', () => {
  test('carries the clauses it was built from', () => {
    const clauses = makeClauses()
    const prompt = makePromptFrom(clauses)
    strictEqual(prompt.entity, clauses.entity)
    strictEqual(prompt.style, clauses.style)
    strictEqual(prompt.assembled, joinClauses(clauses))
  })
})
