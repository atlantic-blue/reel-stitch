/**
 * Checks unknown input against the manifest contract.
 *
 * The validator never throws. Anything it cannot accept comes back as a list of errors, each one
 * naming the field path it found the problem at.
 */

import type { ReelManifest, ShotSource } from './types.ts'
import { ASPECTS, GOALS, SHOT_SOURCES } from './types.ts'

export interface ValidationError {
  /** Where the problem is, for example `shots[2].prompt.assembled`. */
  path: string
  /** What is wrong with it. */
  message: string
}

export type ValidationResult =
  { ok: true; manifest: ReelManifest } | { ok: false; errors: ValidationError[] }

export const IDEA_MIN_LENGTH = 1
export const IDEA_MAX_LENGTH = 500
export const DURATION_MIN_SECONDS = 5
export const DURATION_MAX_SECONDS = 60
export const SHOTS_MIN = 1
export const SHOTS_MAX = 12
export const SHOT_DURATION_MIN_SECONDS = 1
export const SHOT_DURATION_MAX_SECONDS = 10
export const ASSEMBLED_MIN_WORDS = 80
export const ASSEMBLED_MAX_WORDS = 120
export const FRAME_SIZE_MIN = 64
export const FRAME_SIZE_MAX = 2048
export const FRAME_SIZE_STEP = 64

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/
const RFC_3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/
const CASTING_ID = /^[a-z0-9-]+$/

type Errors = ValidationError[]

const MISSING = Symbol('missing')

/** Counts whitespace separated tokens, the way the word limits are measured. */
export function countWords(value: string): number {
  return value.split(/\s+/).filter((token) => token.length > 0).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function quoteAll(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(', ')
}

function read(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
): unknown | typeof MISSING {
  const value = record[key]
  if (!(key in record) || value === undefined) {
    errors.push({ path, message: 'is required' })
    return MISSING
  }
  return value
}

function readString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
): string | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (typeof value !== 'string') {
    errors.push({ path, message: 'must be a string' })
    return undefined
  }
  return value
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
): string | null | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (value !== null && typeof value !== 'string') {
    errors.push({ path, message: 'must be a string or null' })
    return undefined
  }
  return value
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
): boolean | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (typeof value !== 'boolean') {
    errors.push({ path, message: 'must be a boolean' })
    return undefined
  }
  return value
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
  min: number,
  max: number,
): number | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push({ path, message: 'must be a number' })
    return undefined
  }
  if (value < min || value > max) {
    errors.push({ path, message: `must be a number between ${min} and ${max}` })
    return undefined
  }
  return value
}

function readInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
  min: number,
  max: number,
): number | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (!isInteger(value)) {
    errors.push({ path, message: 'must be an integer' })
    return undefined
  }
  if (value < min || value > max) {
    errors.push({ path, message: `must be an integer between ${min} and ${max}` })
    return undefined
  }
  return value
}

function readRecord(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
): Record<string, unknown> | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (!isRecord(value)) {
    errors.push({ path, message: 'must be an object' })
    return undefined
  }
  return value
}

function readArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
): unknown[] | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (!Array.isArray(value)) {
    errors.push({ path, message: 'must be an array' })
    return undefined
  }
  return value
}

function readOneOf<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: Errors,
  allowed: readonly T[],
): T | undefined {
  const value = read(record, key, path, errors)
  if (value === MISSING) return undefined
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    errors.push({ path, message: `must be one of ${quoteAll(allowed)}` })
    return undefined
  }
  return value as T
}

function checkLength(
  value: string | undefined,
  path: string,
  errors: Errors,
  min: number,
  max: number,
): void {
  if (value === undefined) return
  if (value.length < min || value.length > max) {
    errors.push({ path, message: `must be between ${min} and ${max} characters` })
  }
}

function checkNonEmpty(value: string | undefined, path: string, errors: Errors): void {
  if (value === undefined) return
  if (value.trim().length === 0) {
    errors.push({ path, message: 'must not be empty' })
  }
}

function checkPattern(
  value: string | undefined,
  path: string,
  errors: Errors,
  pattern: RegExp,
  message: string,
): void {
  if (value === undefined) return
  if (!pattern.test(value)) {
    errors.push({ path, message })
  }
}

function validateLook(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) return
  for (const key of ['palette', 'lens', 'lighting', 'grade', 'filmStock'] as const) {
    readString(value, key, `${path}.${key}`, errors)
  }
  const negativePrompt = readString(value, 'negativePrompt', `${path}.negativePrompt`, errors)
  checkNonEmpty(negativePrompt, `${path}.negativePrompt`, errors)
}

function validateCasting(entries: unknown[], path: string, errors: Errors): Set<string> {
  const ids = new Set<string>()
  entries.forEach((entry, position) => {
    const entryPath = `${path}[${position}]`
    if (!isRecord(entry)) {
      errors.push({ path: entryPath, message: 'must be an object' })
      return
    }
    const id = readString(entry, 'id', `${entryPath}.id`, errors)
    checkLength(id, `${entryPath}.id`, errors, 1, 64)
    checkPattern(
      id,
      `${entryPath}.id`,
      errors,
      CASTING_ID,
      'must hold only lowercase letters, digits and hyphens',
    )
    if (id !== undefined) {
      if (ids.has(id)) {
        errors.push({ path: `${entryPath}.id`, message: `must be unique, '${id}' is already used` })
      }
      ids.add(id)
    }
    const description = readString(entry, 'description', `${entryPath}.description`, errors)
    checkLength(description, `${entryPath}.description`, errors, 3, 200)
  })
  return ids
}

function validatePrompt(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) return
  for (const key of ['entity', 'scene', 'motion', 'aesthetic', 'style', 'negative'] as const) {
    const field = readString(value, key, `${path}.${key}`, errors)
    checkNonEmpty(field, `${path}.${key}`, errors)
  }
  const assembled = readString(value, 'assembled', `${path}.assembled`, errors)
  checkNonEmpty(assembled, `${path}.assembled`, errors)
  if (assembled !== undefined) {
    const words = countWords(assembled)
    if (words < ASSEMBLED_MIN_WORDS || words > ASSEMBLED_MAX_WORDS) {
      errors.push({
        path: `${path}.assembled`,
        message: `must hold between ${ASSEMBLED_MIN_WORDS} and ${ASSEMBLED_MAX_WORDS} words, it holds ${words}`,
      })
    }
  }
}

function validateShot(
  shot: Record<string, unknown>,
  path: string,
  castingIds: Set<string>,
  errors: Errors,
): void {
  readInteger(shot, 'index', `${path}.index`, errors, 0, Number.MAX_SAFE_INTEGER)
  readNumber(shot, 'startSeconds', `${path}.startSeconds`, errors, 0, Number.MAX_SAFE_INTEGER)
  readNumber(
    shot,
    'durationSeconds',
    `${path}.durationSeconds`,
    errors,
    SHOT_DURATION_MIN_SECONDS,
    SHOT_DURATION_MAX_SECONDS,
  )
  const beat = readString(shot, 'beat', `${path}.beat`, errors)
  checkLength(beat, `${path}.beat`, errors, 3, 200)
  readNullableString(shot, 'caption', `${path}.caption`, errors)
  readNullableString(shot, 'motionPrompt', `${path}.motionPrompt`, errors)
  readInteger(shot, 'seed', `${path}.seed`, errors, 0, Number.MAX_SAFE_INTEGER)
  readNullableString(shot, 'stillPath', `${path}.stillPath`, errors)
  readNullableString(shot, 'clipPath', `${path}.clipPath`, errors)
  readBoolean(shot, 'approved', `${path}.approved`, errors)

  const source: ShotSource | undefined = readOneOf(
    shot,
    'source',
    `${path}.source`,
    errors,
    SHOT_SOURCES,
  )

  const capturePath = readNullableString(shot, 'capturePath', `${path}.capturePath`, errors)
  const prompt = read(shot, 'prompt', `${path}.prompt`, errors)
  if (prompt !== MISSING && prompt !== null && !isRecord(prompt)) {
    errors.push({ path: `${path}.prompt`, message: 'must be an object or null' })
  }

  if (source === 'capture') {
    if (
      capturePath === null ||
      (typeof capturePath === 'string' && capturePath.trim().length === 0)
    ) {
      errors.push({
        path: `${path}.capturePath`,
        message: "must be a non empty string when source is 'capture'",
      })
    }
    if (prompt !== MISSING && prompt !== null) {
      errors.push({ path: `${path}.prompt`, message: "must be null when source is 'capture'" })
    }
  }

  if (source === 'generated') {
    if (typeof capturePath === 'string') {
      errors.push({
        path: `${path}.capturePath`,
        message: "must be null when source is 'generated'",
      })
    }
    if (prompt === null) {
      errors.push({
        path: `${path}.prompt`,
        message: "must be an object when source is 'generated'",
      })
    }
  }

  if (isRecord(prompt)) {
    validatePrompt(prompt, `${path}.prompt`, errors)
  }

  const shotCastingIds = readArray(shot, 'castingIds', `${path}.castingIds`, errors)
  if (shotCastingIds !== undefined) {
    shotCastingIds.forEach((entry, position) => {
      const entryPath = `${path}.castingIds[${position}]`
      if (typeof entry !== 'string') {
        errors.push({ path: entryPath, message: 'must be a string' })
        return
      }
      if (!castingIds.has(entry)) {
        errors.push({ path: entryPath, message: `must match a casting id, '${entry}' does not` })
      }
    })
  }
}

function validateShotIndexes(shots: unknown[], errors: Errors): void {
  let previous: number | undefined
  shots.forEach((shot, position) => {
    if (!isRecord(shot)) return
    const index = shot['index']
    if (!isInteger(index)) return
    const path = `shots[${position}].index`
    if (previous === undefined) {
      if (index !== 0) {
        errors.push({ path, message: `must start at 0, it is ${index}` })
      }
    } else if (index <= previous) {
      errors.push({ path, message: `must be greater than the index before it, ${previous}` })
    } else if (index !== previous + 1) {
      errors.push({ path, message: `must follow ${previous} without a gap, it is ${index}` })
    }
    previous = index
  })
}

function validateRender(value: unknown, path: string, errors: Errors): void {
  if (!isRecord(value)) return
  const model = readString(value, 'model', `${path}.model`, errors)
  checkNonEmpty(model, `${path}.model`, errors)
  for (const key of ['width', 'height'] as const) {
    const size = readInteger(value, key, `${path}.${key}`, errors, FRAME_SIZE_MIN, FRAME_SIZE_MAX)
    if (size !== undefined && size % FRAME_SIZE_STEP !== 0) {
      errors.push({ path: `${path}.${key}`, message: `must be a multiple of ${FRAME_SIZE_STEP}` })
    }
  }
  readInteger(value, 'steps', `${path}.steps`, errors, 1, 100)
  readInteger(value, 'frames', `${path}.frames`, errors, 1, 121)
  readInteger(value, 'fps', `${path}.fps`, errors, 1, 60)
  readNullableString(value, 'modelsDir', `${path}.modelsDir`, errors)
}

/**
 * Reads unknown input and either hands back a typed manifest or says what is wrong with it.
 */
export function validateManifest(input: unknown): ValidationResult {
  const errors: Errors = []

  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '', message: 'must be an object' }] }
  }

  const schemaVersion = readString(input, 'schemaVersion', 'schemaVersion', errors)
  checkPattern(schemaVersion, 'schemaVersion', errors, SEMVER, 'must be a semantic version')

  const id = readString(input, 'id', 'id', errors)
  checkPattern(id, 'id', errors, ULID, 'must be a ULID')

  const createdAt = readString(input, 'createdAt', 'createdAt', errors)
  checkPattern(createdAt, 'createdAt', errors, RFC_3339, 'must be an RFC 3339 timestamp')
  if (createdAt !== undefined && RFC_3339.test(createdAt) && Number.isNaN(Date.parse(createdAt))) {
    errors.push({ path: 'createdAt', message: 'must be a real date' })
  }

  const idea = readString(input, 'idea', 'idea', errors)
  checkLength(idea, 'idea', errors, IDEA_MIN_LENGTH, IDEA_MAX_LENGTH)

  readOneOf(input, 'goal', 'goal', errors, GOALS)
  readOneOf(input, 'aspect', 'aspect', errors, ASPECTS)
  readInteger(
    input,
    'durationSeconds',
    'durationSeconds',
    errors,
    DURATION_MIN_SECONDS,
    DURATION_MAX_SECONDS,
  )

  const look = readRecord(input, 'look', 'look', errors)
  validateLook(look, 'look', errors)

  const casting = readArray(input, 'casting', 'casting', errors)
  const castingIds =
    casting === undefined ? new Set<string>() : validateCasting(casting, 'casting', errors)

  const shots = readArray(input, 'shots', 'shots', errors)
  if (shots !== undefined) {
    if (shots.length < SHOTS_MIN || shots.length > SHOTS_MAX) {
      errors.push({
        path: 'shots',
        message: `must hold between ${SHOTS_MIN} and ${SHOTS_MAX} entries, it holds ${shots.length}`,
      })
    }
    shots.forEach((shot, position) => {
      const path = `shots[${position}]`
      if (!isRecord(shot)) {
        errors.push({ path, message: 'must be an object' })
        return
      }
      validateShot(shot, path, castingIds, errors)
    })
    validateShotIndexes(shots, errors)
  }

  const render = readRecord(input, 'render', 'render', errors)
  validateRender(render, 'render', errors)

  readNullableString(input, 'outputPath', 'outputPath', errors)

  if (errors.length > 0) {
    return { ok: false, errors }
  }
  return { ok: true, manifest: input as unknown as ReelManifest }
}
