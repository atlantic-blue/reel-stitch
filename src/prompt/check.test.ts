import { describe, test } from 'node:test'
import { deepStrictEqual, match, ok, strictEqual } from 'node:assert/strict'

import { makeCastingEntry } from '../manifest/index.ts'
import { countWords } from '../manifest/validate.ts'

import { joinClauses } from './assemble.ts'
import type { Finding, RuleId } from './check.ts'
import { RULE_IDS, checkPrompt, promptPasses } from './check.ts'
import {
  clausesOfWords,
  makeCheckInput,
  makeClauses,
  makePromptFrom,
  makePromptLook,
} from './fixture.ts'
import {
  PERSON_WORDS,
  STANDARD_NEGATIVE_TERMS,
  WHITE_BALANCES,
  joinTerms,
  standardNegativePrompt,
} from './terms.ts'

function describeFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return 'no finding'
  return findings.map((finding) => `${finding.rule} at ${finding.path}`).join(' | ')
}

/** Asserts one finding carrying `rule` at `path`, and hands it back. */
function expectFinding(input: unknown, rule: RuleId, path: string): Finding {
  const found = checkPrompt(input)
  const match = found.find((finding) => finding.rule === rule && finding.path === path)
  if (match === undefined) {
    throw new Error(`expected a '${rule}' finding at ${path}, got ${describeFindings(found)}`)
  }
  return match
}

function expectNoFinding(input: unknown, rule: RuleId, what: string): void {
  const found = checkPrompt(input).filter((finding) => finding.rule === rule)
  if (found.length > 0) {
    throw new Error(`${what}: expected no '${rule}' finding, got ${describeFindings(found)}`)
  }
}

function expectClean(input: unknown, what: string): void {
  const found = checkPrompt(input)
  if (found.length > 0) {
    throw new Error(`${what}: expected no finding at all, got ${describeFindings(found)}`)
  }
}

/** The default prompt with one string replaced, so a test can break one rule at a time. */
function promptWithNegative(negative: string): Record<string, unknown> {
  return { ...makePromptFrom(makeClauses()), negative }
}

function negativeWithout(term: string): string {
  return joinTerms([
    ...STANDARD_NEGATIVE_TERMS.filter((standard) => standard !== term),
    'hands',
    'fingers',
  ])
}

describe('checkPrompt, on a prompt the assembler built', () => {
  test('finds nothing wrong with it', () => {
    deepStrictEqual(checkPrompt(makeCheckInput()), [])
    ok(promptPasses(checkPrompt(makeCheckInput())))
  })

  test('reports findings under the path the caller gives', () => {
    const finding = expectFinding(
      makeCheckInput({ shotPath: 'shots[2]', shot: { castingIds: ['courier', 'vendor'] } }),
      'one-actor',
      'shots[2].castingIds',
    )
    strictEqual(finding.rule, 'one-actor')
  })
})

describe('the order rule', () => {
  test('accepts the five clauses joined in the published order', () => {
    expectNoFinding(makeCheckInput(), 'order', 'an assembled string the assembler built')
  })

  test('reports an assembled string built in another order', () => {
    const clauses = makeClauses()
    const outOfOrder = joinClauses({ ...clauses, entity: clauses.scene, scene: clauses.entity })
    const finding = expectFinding(
      makeCheckInput({ prompt: { ...makePromptFrom(clauses), assembled: outOfOrder } }),
      'order',
      'shot.prompt.assembled',
    )
    match(finding.message, /entity, scene, motion, aesthetic, style/)
  })

  test('reports an assembled string that drops a clause', () => {
    const clauses = makeClauses()
    const withoutStyle = joinClauses({ ...clauses, style: '' })
    expectFinding(
      makeCheckInput({ prompt: { ...makePromptFrom(clauses), assembled: withoutStyle } }),
      'order',
      'shot.prompt.assembled',
    )
  })
})

describe('the length rule', () => {
  function inputOfWords(total: number): unknown {
    const clauses = clausesOfWords(total, { scene: '' })
    strictEqual(countWords(joinClauses(clauses)), total)
    return makeCheckInput({ prompt: makePromptFrom(clauses) })
  }

  test('reports 79 words', () => {
    const finding = expectFinding(inputOfWords(79), 'length', 'shot.prompt.assembled')
    match(finding.message, /it holds 79/)
  })

  test('reports 121 words', () => {
    const finding = expectFinding(inputOfWords(121), 'length', 'shot.prompt.assembled')
    match(finding.message, /it holds 121/)
  })

  test('accepts exactly 80 words', () => {
    expectClean(inputOfWords(80), 'an assembled string of exactly 80 words')
  })

  test('accepts exactly 120 words', () => {
    expectClean(inputOfWords(120), 'an assembled string of exactly 120 words')
  })
})

describe('the one-actor rule', () => {
  test('accepts a shot naming one casting entry', () => {
    expectNoFinding(makeCheckInput(), 'one-actor', 'a shot naming one casting entry')
  })

  test('reports a shot naming two casting entries', () => {
    const finding = expectFinding(
      makeCheckInput({
        shot: { castingIds: ['courier', 'vendor'] },
        casting: [makeCastingEntry(), makeCastingEntry({ id: 'vendor' })],
      }),
      'one-actor',
      'shot.castingIds',
    )
    match(finding.message, /it names 2/)
  })

  test('accepts a shot naming none', () => {
    const clauses = makeClauses({
      entity:
        'A parcel shelf stacked with unclaimed boxes, one brown envelope tipped forward against the wire.',
      motion: 'The camera drifts in at chest height, slowing as the shelf fills the frame.',
    })
    expectNoFinding(
      makeCheckInput({ prompt: makePromptFrom(clauses), shot: { castingIds: [] } }),
      'one-actor',
      'a shot naming no casting entry',
    )
  })
})

describe('the darkness rule', () => {
  function inputWithScene(scene: string): unknown {
    return makeCheckInput({ prompt: makePromptFrom(makeClauses({ scene })) })
  }

  test('accepts exactly one darkness cue', () => {
    expectClean(
      inputWithScene(
        'A narrow market street at night, shutters drawn along both sides, puddles holding the red and green of a single neon sign above a noodle counter.',
      ),
      'an assembled string carrying one darkness cue',
    )
  })

  test('reports two darkness cues', () => {
    const finding = expectFinding(
      inputWithScene(
        'A narrow market street at night, dark shutters drawn along both sides, puddles holding the red and green of a single neon sign above a noodle counter.',
      ),
      'darkness',
      'shot.prompt.assembled',
    )
    match(finding.message, /it carries 2/)
  })

  test('reports three darkness cues', () => {
    const finding = expectFinding(
      inputWithScene(
        'A narrow market street at night, dark shutters drawn along both sides, a moonlit puddle holding the red and green of a single neon sign above a noodle counter.',
      ),
      'darkness',
      'shot.prompt.assembled',
    )
    match(finding.message, /it carries 3/)
  })

  test('reads a cue as a whole word, so dimly is not dim twice', () => {
    expectNoFinding(
      inputWithScene(
        'A narrow market street lit dimly along one side, shutters drawn, puddles holding the red and green of a single neon sign above a noodle counter.',
      ),
      'darkness',
      'an assembled string carrying dimly once',
    )
  })
})

describe('the negative-lighting rule', () => {
  test('accepts the standard negative prompt', () => {
    expectNoFinding(makeCheckInput(), 'negative-lighting', 'the standard negative prompt')
  })

  test('reports bright', () => {
    const finding = expectFinding(
      makeCheckInput({ prompt: promptWithNegative(`${standardNegativePrompt()}, bright`) }),
      'negative-lighting',
      'shot.prompt.negative',
    )
    match(finding.message, /'bright'/)
  })

  test('reports daylight', () => {
    const finding = expectFinding(
      makeCheckInput({ prompt: promptWithNegative(`${standardNegativePrompt()}, daylight`) }),
      'negative-lighting',
      'shot.prompt.negative',
    )
    match(finding.message, /'daylight'/)
  })

  test('leaves underexposed alone, because it names an artifact', () => {
    expectClean(
      makeCheckInput({
        prompt: promptWithNegative(joinTerms([...STANDARD_NEGATIVE_TERMS, 'hands', 'fingers'])),
      }),
      'a negative prompt holding underexposed',
    )
  })

  test('leaves flat lighting alone, because it names an artifact', () => {
    const negative = joinTerms([
      ...STANDARD_NEGATIVE_TERMS.filter((term) => term !== 'flat lighting'),
      'hands',
      'fingers',
      'flat lighting',
    ])
    expectClean(
      makeCheckInput({ prompt: promptWithNegative(negative) }),
      'a negative prompt holding flat lighting',
    )
  })

  test('reads the look, because its negative prompt reaches every shot', () => {
    expectFinding(
      makeCheckInput({
        look: makePromptLook({ negativePrompt: `${standardNegativePrompt()}, overexposed` }),
      }),
      'negative-lighting',
      'look.negativePrompt',
    )
  })
})

describe('the casting-stated rule', () => {
  test('accepts an entity naming a person when the shot names a casting entry', () => {
    expectNoFinding(makeCheckInput(), 'casting-stated', 'an entity naming a person, with casting')
  })

  test('reports an entity naming a person while castingIds is empty', () => {
    const finding = expectFinding(
      makeCheckInput({ shot: { castingIds: [] } }),
      'casting-stated',
      'shot.castingIds',
    )
    match(finding.message, /'woman'/)
  })

  test('reads every person word', () => {
    for (const word of PERSON_WORDS) {
      const clauses = makeClauses({
        entity: `A ${word} at the counter, hood down, holding a small paper parcel against the chest.`,
      })
      expectFinding(
        makeCheckInput({ prompt: makePromptFrom(clauses), shot: { castingIds: [] } }),
        'casting-stated',
        'shot.castingIds',
      )
    }
  })

  test('leaves management alone, because it holds man and names no person', () => {
    const clauses = makeClauses({
      entity:
        'A management office door with a brass plate, closed, the parcel shelf below it stacked with unclaimed boxes.',
      motion: 'The camera drifts in at chest height, slowing as the shelf fills the frame.',
    })
    expectClean(
      makeCheckInput({ prompt: makePromptFrom(clauses), shot: { castingIds: [] } }),
      'an entity clause holding the word management',
    )
  })
})

describe('the hands rule', () => {
  const handsAreSubject = makePromptFrom(makeClauses(), { handsAreTheSubject: true })

  test('accepts a negative prompt naming hands and fingers', () => {
    expectNoFinding(makeCheckInput(), 'hands', 'a negative prompt naming hands and fingers')
  })

  test('reports a negative prompt missing hands when hands are not the subject', () => {
    const finding = expectFinding(
      makeCheckInput({ prompt: handsAreSubject, handsAreTheSubject: false }),
      'hands',
      'shot.prompt.negative',
    )
    match(finding.message, /'hands'/)
  })

  test('reports a negative prompt missing only fingers', () => {
    const finding = expectFinding(
      makeCheckInput({
        prompt: promptWithNegative(joinTerms([...STANDARD_NEGATIVE_TERMS, 'hands'])),
        handsAreTheSubject: false,
      }),
      'hands',
      'shot.prompt.negative',
    )
    match(finding.message, /'fingers'/)
  })

  test('accepts a negative prompt missing hands when hands are the subject', () => {
    expectClean(
      makeCheckInput({ prompt: handsAreSubject, handsAreTheSubject: true }),
      'a prompt whose negative omits hands while hands are the subject',
    )
  })
})

describe('the white-balance rule', () => {
  test('accepts every white balance on the list', () => {
    for (const balance of WHITE_BALANCES) {
      const clauses = makeClauses({
        aesthetic: `Soft rain haze, shallow depth of field, gentle film grain, ${balance}, natural colour throughout the frame.`,
      })
      expectNoFinding(
        makeCheckInput({ prompt: makePromptFrom(clauses) }),
        'white-balance',
        `an aesthetic clause naming ${balance}`,
      )
    }
  })

  test('reports an aesthetic clause naming none', () => {
    const clauses = makeClauses({
      aesthetic:
        'Natural colour, soft rain haze, shallow depth of field, gentle film grain, sodium practicals lighting her face.',
    })
    const finding = expectFinding(
      makeCheckInput({ prompt: makePromptFrom(clauses) }),
      'white-balance',
      'shot.prompt.aesthetic',
    )
    match(finding.message, /neutral white balance/)
  })
})

describe('the standard-negative rule', () => {
  test('accepts a negative prompt holding every standard term', () => {
    expectNoFinding(makeCheckInput(), 'standard-negative', 'the standard negative prompt')
  })

  test('reports a negative prompt missing waxy skin', () => {
    const finding = expectFinding(
      makeCheckInput({ prompt: promptWithNegative(negativeWithout('waxy skin')) }),
      'standard-negative',
      'shot.prompt.negative',
    )
    match(finding.message, /'waxy skin'/)
  })

  test('reports every standard term that is missing', () => {
    for (const term of STANDARD_NEGATIVE_TERMS) {
      const finding = expectFinding(
        makeCheckInput({ prompt: promptWithNegative(negativeWithout(term)) }),
        'standard-negative',
        'shot.prompt.negative',
      )
      ok(
        finding.message.includes(`'${term}'`),
        `expected the finding to name '${term}', got ${finding.message}`,
      )
    }
  })
})

describe('checkPrompt, on input it cannot read', () => {
  const nonsense: unknown[] = [undefined, null, 'a prompt', 42, [], true]

  test('does not throw, and does not pass', () => {
    for (const input of nonsense) {
      const found = checkPrompt(input)
      ok(Array.isArray(found), `expected a list for ${String(input)}`)
      strictEqual(promptPasses(found), false, `expected ${String(input)} to fail`)
    }
  })

  test('does not throw on a prompt whose every field is null', () => {
    const found = checkPrompt(
      makeCheckInput({
        prompt: {
          entity: null,
          scene: null,
          motion: null,
          aesthetic: null,
          style: null,
          assembled: null,
          negative: null,
        },
      }),
    )
    strictEqual(promptPasses(found), false)
  })

  test('does not throw when the shot, the casting and the look are missing', () => {
    const found = checkPrompt({ prompt: makePromptFrom(makeClauses()) })
    ok(Array.isArray(found))
  })

  test('does not throw when castingIds holds something that is not a string', () => {
    const found = checkPrompt(makeCheckInput({ shot: { castingIds: [1, null, 'courier'] } }))
    ok(Array.isArray(found))
  })
})

describe('promptPasses', () => {
  test('passes an empty list and fails any finding', () => {
    ok(promptPasses([]))
    strictEqual(
      promptPasses([{ path: 'shot.prompt.assembled', rule: 'length', message: 'too short' }]),
      false,
    )
  })
})

describe('RULE_IDS', () => {
  test('names nine rules, each one once', () => {
    strictEqual(RULE_IDS.length, 9)
    strictEqual(new Set(RULE_IDS).size, 9)
  })
})
