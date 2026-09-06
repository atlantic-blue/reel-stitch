/**
 * Joins the five clauses into the strings a shot's `prompt` object carries.
 *
 * The assembler does not judge. It joins the clauses in the published order and builds the
 * negative prompt from the look. `check.ts` decides whether the result obeys the rules, because a
 * prompt can also arrive from a person editing `reel.json` by hand.
 */

import type { Look } from '../manifest/index.ts'

import {
  HANDS_NEGATIVE_TERMS,
  NIGHT_NEGATIVE_TERMS,
  dedupeTerms,
  joinTerms,
  splitTerms,
} from './terms.ts'

/** The five clauses of a prompt, before they are joined. */
export interface PromptClauses {
  entity: string
  scene: string
  motion: string
  aesthetic: string
  style: string
}

/** The published clause order. Rule one. Every join reads this list. */
export const CLAUSE_ORDER = ['entity', 'scene', 'motion', 'aesthetic', 'style'] as const

export interface AssembleInput {
  clauses: PromptClauses
  /** The reel's look. Its `negativePrompt` opens the negative prompt of every shot. */
  look: Look
  /** False puts `hands, fingers` in the negative prompt. Rule seven. */
  handsAreTheSubject: boolean
  /** True puts the night terms in the negative prompt. Rule eight. */
  isNightScene: boolean
}

/** The two strings the assembler produces. The clauses go into the prompt object beside them. */
export interface AssembledPrompt {
  assembled: string
  negative: string
}

/**
 * The five clauses in the published order, one space between them.
 *
 * Each clause keeps its own trailing full stop. Whitespace inside a clause collapses to one
 * space, and an empty clause contributes nothing, so the joined string never holds two spaces in
 * a row.
 */
export function joinClauses(clauses: PromptClauses): string {
  return CLAUSE_ORDER.map((name) => clauses[name].trim().replace(/\s+/g, ' '))
    .filter((clause) => clause.length > 0)
    .join(' ')
}

/**
 * The look's negative prompt, then the hands terms, then the night terms.
 *
 * A term appears once however many times it is asked for, and the order never changes, so the
 * same input always gives the same string.
 */
export function buildNegative(
  lookNegativePrompt: string,
  handsAreTheSubject: boolean,
  isNightScene: boolean,
): string {
  const terms = splitTerms(lookNegativePrompt)
  if (!handsAreTheSubject) terms.push(...HANDS_NEGATIVE_TERMS)
  if (isNightScene) terms.push(...NIGHT_NEGATIVE_TERMS)
  return joinTerms(dedupeTerms(terms))
}

export function assemblePrompt(input: AssembleInput): AssembledPrompt {
  return {
    assembled: joinClauses(input.clauses),
    negative: buildNegative(
      input.look.negativePrompt,
      input.handsAreTheSubject,
      input.isNightScene,
    ),
  }
}
