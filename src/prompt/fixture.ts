/**
 * Builders that make a valid prompt, so tests and later slices do not copy clauses around.
 *
 * The clauses below satisfy every rule: one actor, no darkness cue, a white balance in the
 * aesthetic clause, and 104 words when they are joined.
 */

import type { CastingEntry, Look, ShotPrompt } from '../manifest/index.ts'
import { makeCastingEntry, makeLook } from '../manifest/index.ts'
import { countWords } from '../manifest/validate.ts'

import type { PromptClauses } from './assemble.ts'
import { assemblePrompt, joinClauses } from './assemble.ts'
import type { PromptCheckInput } from './check.ts'
import { standardNegativePrompt } from './terms.ts'

const ENTITY =
  'A woman in her twenties stands with her hood down, holding a small paper parcel against her chest, her olive rain jacket beaded with water.'
const SCENE =
  'A narrow market street after closing time, shutters drawn along both sides, puddles holding the red and green of a single neon sign above a noodle counter.'
const MOTION =
  'She steps forward and turns her head towards the sign, slowing as the camera drifts in at chest height.'
const AESTHETIC =
  'Neutral white balance, natural colour, soft rain haze, shallow depth of field, gentle film grain, sodium practicals lighting her face.'
const STYLE =
  'Anamorphic thirty five millimetre still, cinematic colour grade, natural skin tones, photographic realism.'

export function makeClauses(overrides: Partial<PromptClauses> = {}): PromptClauses {
  return {
    entity: ENTITY,
    scene: SCENE,
    motion: MOTION,
    aesthetic: AESTHETIC,
    style: STYLE,
    ...overrides,
  }
}

/** A look carrying the standard negative prompt, the one every shot starts from. */
export function makePromptLook(overrides: Partial<Look> = {}): Look {
  return makeLook({ negativePrompt: standardNegativePrompt(), ...overrides })
}

export interface PromptOptions {
  look?: Look
  handsAreTheSubject?: boolean
  isNightScene?: boolean
}

/** A whole `prompt` object: the clauses, and the two strings the assembler builds from them. */
export function makePromptFrom(clauses: PromptClauses, options: PromptOptions = {}): ShotPrompt {
  const assembled = assemblePrompt({
    clauses,
    look: options.look ?? makePromptLook(),
    handsAreTheSubject: options.handsAreTheSubject ?? false,
    isNightScene: options.isNightScene ?? false,
  })
  return { ...clauses, ...assembled }
}

/** A check input that every rule accepts. Override one field to break one rule. */
export function makeCheckInput(overrides: Partial<PromptCheckInput> = {}): PromptCheckInput {
  const casting: CastingEntry[] = [makeCastingEntry()]
  return {
    prompt: makePromptFrom(makeClauses()),
    shot: { castingIds: [casting[0]?.id ?? 'courier'] },
    casting,
    look: makePromptLook(),
    handsAreTheSubject: false,
    ...overrides,
  }
}

/**
 * Clauses whose joined string holds exactly `total` words, for testing the length limits.
 *
 * The padding lands in the scene clause. Pass `{ scene: '' }` to make a prompt shorter than the
 * default clauses already are.
 */
export function clausesOfWords(
  total: number,
  overrides: Partial<PromptClauses> = {},
): PromptClauses {
  const clauses = makeClauses(overrides)
  const padding = total - countWords(joinClauses(clauses))
  if (padding < 0) {
    throw new Error(`these clauses already hold more than ${total} words`)
  }
  if (padding === 0) return clauses
  const filler = `${Array.from({ length: padding }, () => 'wet').join(' ')}.`
  return { ...clauses, scene: `${clauses.scene} ${filler}`.trim() }
}
