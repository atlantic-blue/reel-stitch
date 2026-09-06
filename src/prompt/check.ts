/**
 * Judges a prompt against the eight rules in `docs/prompts.md`.
 *
 * The checker never throws and never rewrites. It reads whatever it is given and hands back a
 * list of findings, each one naming a field path, a rule identifier and what is wrong. A caller
 * decides what to do with them. Fixing a prompt is a person's job.
 *
 * It is separate from the assembler on purpose: a prompt can arrive from a person editing
 * `reel.json` by hand, so the checker must judge any prompt, not only an assembled one.
 */

// The word bounds and the word count come from the manifest contract, so the two cannot drift.
import { ASSEMBLED_MAX_WORDS, ASSEMBLED_MIN_WORDS, countWords } from '../manifest/validate.ts'

import type { PromptClauses } from './assemble.ts'
import { joinClauses } from './assemble.ts'
import {
  BANNED_NEGATIVE_LIGHTING,
  DARKNESS_CUES,
  HANDS_NEGATIVE_TERMS,
  PERSON_WORDS,
  STANDARD_NEGATIVE_TERMS,
  WHITE_BALANCES,
  countWordMatches,
  holdsWord,
  termSet,
} from './terms.ts'

/** The identifier a finding carries, so a caller can filter on the rule that produced it. */
export type RuleId =
  | 'order'
  | 'length'
  | 'one-actor'
  | 'darkness'
  | 'negative-lighting'
  | 'casting-stated'
  | 'hands'
  | 'white-balance'
  | 'standard-negative'

export const RULE_IDS: readonly RuleId[] = [
  'order',
  'length',
  'one-actor',
  'darkness',
  'negative-lighting',
  'casting-stated',
  'hands',
  'white-balance',
  'standard-negative',
]

export interface Finding {
  /** Where the problem is, for example `shots[2].prompt.assembled`. */
  path: string
  rule: RuleId
  /** One sentence saying what is wrong. */
  message: string
}

/**
 * What `checkPrompt` reads. It takes `unknown` rather than this type because it must judge a
 * manifest a person edited by hand, so every field here is read defensively.
 */
export interface PromptCheckInput {
  /** The shot's `prompt` object, holding the five clauses, `assembled` and `negative`. */
  prompt: unknown
  /** The shot carrying that prompt. Only `castingIds` is read. */
  shot: unknown
  /** The reel's casting entries. */
  casting: unknown
  /** The reel's look. Its `negativePrompt` reaches every shot, so it is read for rule five. */
  look: unknown
  /** False means the negative prompt must keep hands out. Rule seven. */
  handsAreTheSubject: boolean
  /** The path the findings are reported under. `shot` when a caller gives none. */
  shotPath?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/** A field that is missing, null, or not a string reads as empty, so no rule can throw on it. */
function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function quoteAll(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ')
}

/** The five clauses as strings, whatever the prompt object actually holds. */
function readClauses(prompt: Record<string, unknown>): PromptClauses {
  return {
    entity: asText(prompt['entity']),
    scene: asText(prompt['scene']),
    motion: asText(prompt['motion']),
    aesthetic: asText(prompt['aesthetic']),
    style: asText(prompt['style']),
  }
}

/**
 * Reads a prompt and says what is wrong with it. An empty list means every rule is satisfied.
 *
 * Input that is not an object, or a prompt with a null field, reads as empty strings. That still
 * breaks several rules, so nonsense comes back as findings rather than as a silent pass.
 */
export function checkPrompt(input: unknown): Finding[] {
  const findings: Finding[] = []
  const root = asRecord(input)

  const shotPath = typeof root['shotPath'] === 'string' ? root['shotPath'] : 'shot'
  const promptPath = `${shotPath}.prompt`
  const prompt = asRecord(root['prompt'])
  const shot = asRecord(root['shot'])
  const look = asRecord(root['look'])
  const casting = asArray(root['casting'])
  // A caller who says nothing gets the stricter reading, that hands are not the subject.
  const handsAreTheSubject = root['handsAreTheSubject'] === true

  const clauses = readClauses(prompt)
  const assembled = asText(prompt['assembled'])
  const negative = asText(prompt['negative'])
  const negativeTerms = termSet(negative)
  const castingIds = asArray(shot['castingIds']).filter(
    (id): id is string => typeof id === 'string',
  )

  // order. Proving the assembled string was built from the parts in the right sequence beats
  // parsing the prose for a subject and a verb.
  if (assembled !== joinClauses(clauses)) {
    findings.push({
      path: `${promptPath}.assembled`,
      rule: 'order',
      message:
        'must be the five clauses joined in the published order, entity, scene, motion, aesthetic, style, one space between them',
    })
  }

  // length. A word is a run of characters with no whitespace in it.
  const words = countWords(assembled)
  if (words < ASSEMBLED_MIN_WORDS || words > ASSEMBLED_MAX_WORDS) {
    findings.push({
      path: `${promptPath}.assembled`,
      rule: 'length',
      message: `must hold between ${ASSEMBLED_MIN_WORDS} and ${ASSEMBLED_MAX_WORDS} words, counting a word as a run of characters with no whitespace in it, it holds ${words}`,
    })
  }

  // one-actor. A prompt that names two people, each carrying a verb, loses the second one. Two
  // attempts at the same two person idea produced the same fault, and making one person the only
  // actor fixed it in one attempt. So a second person in the frame is written into the prose as
  // scenery and gets no casting entry, which is why this counts casting entries rather than
  // reading the prose for people.
  if (castingIds.length > 1) {
    findings.push({
      path: `${shotPath}.castingIds`,
      rule: 'one-actor',
      message: `must name at most one casting entry, so the frame has one actor, it names ${castingIds.length}: ${quoteAll(castingIds)}`,
    })
  }

  // darkness. Name night once, then describe the light source that lights the subject.
  const cueCount = DARKNESS_CUES.reduce((total, cue) => total + countWordMatches(assembled, cue), 0)
  if (cueCount > 1) {
    findings.push({
      path: `${promptPath}.assembled`,
      rule: 'darkness',
      message: `must carry at most one darkness cue, it carries ${cueCount}`,
    })
  }

  // negative-lighting. The negative prompt is for artifacts. `underexposed` and `flat lighting`
  // name artifacts and stay. A condition drives the frame under, which cost an hour of diagnosis
  // on one clip.
  const bannedInNegative = BANNED_NEGATIVE_LIGHTING.filter((term) => holdsWord(negative, term))
  if (bannedInNegative.length > 0) {
    findings.push({
      path: `${promptPath}.negative`,
      rule: 'negative-lighting',
      message: `must name no lighting or exposure condition, it names ${quoteAll(bannedInNegative)}`,
    })
  }

  // The look's negative prompt reaches every shot, so a condition sitting there is the same
  // fault, reported where a person fixes it once.
  const lookNegative = asText(look['negativePrompt'])
  const bannedInLook = BANNED_NEGATIVE_LIGHTING.filter((term) => holdsWord(lookNegative, term))
  if (bannedInLook.length > 0) {
    findings.push({
      path: 'look.negativePrompt',
      rule: 'negative-lighting',
      message: `must name no lighting or exposure condition, it names ${quoteAll(bannedInLook)}`,
    })
  }

  // casting-stated. The generator infers nothing about appearance from the rest of the prompt.
  const personWords = PERSON_WORDS.filter((word) => holdsWord(clauses.entity, word))
  if (personWords.length > 0 && castingIds.length === 0) {
    findings.push({
      path: `${shotPath}.castingIds`,
      rule: 'casting-stated',
      message: `must name a casting entry, because the entity clause names a person with ${quoteAll(personWords)}, and the reel holds ${casting.length} casting entries to choose from`,
    })
  }

  // hands. Hands malform at this model size, so they leave the frame and the negative prompt.
  if (!handsAreTheSubject) {
    const missingHands = HANDS_NEGATIVE_TERMS.filter((term) => !negativeTerms.has(term))
    if (missingHands.length > 0) {
      findings.push({
        path: `${promptPath}.negative`,
        rule: 'hands',
        message: `must name ${quoteAll(missingHands)}, because hands are not the subject of this shot`,
      })
    }
  }

  // white-balance. A colour temperature written as a mood produces a colour cast, not light.
  if (!WHITE_BALANCES.some((balance) => holdsWord(clauses.aesthetic, balance))) {
    findings.push({
      path: `${promptPath}.aesthetic`,
      rule: 'white-balance',
      message: `must name a white balance, one of ${quoteAll(WHITE_BALANCES)}`,
    })
  }

  // standard-negative. The list lives in `terms.ts`, and a test holds it against the document.
  const missingStandard = STANDARD_NEGATIVE_TERMS.filter((term) => !negativeTerms.has(term))
  if (missingStandard.length > 0) {
    findings.push({
      path: `${promptPath}.negative`,
      rule: 'standard-negative',
      message: `must name every term of the standard negative prompt, it is missing ${quoteAll(missingStandard)}`,
    })
  }

  return findings
}

/** Pass or fail, so callers in later slices do not each invent one. */
export function promptPasses(findings: readonly Finding[]): boolean {
  return findings.length === 0
}
