/**
 * The word lists the prompt rules are written against, and the matching they use.
 *
 * Every list here comes from a rule in `docs/prompts.md`. The standard negative prompt is the one
 * place a term list also lives in that document, so `terms.test.ts` reads the document and asserts
 * the two agree. Nothing else in this repository may copy a term out of here.
 */

/**
 * The standard negative prompt, term by term, in the order `docs/prompts.md` prints it.
 *
 * `flat lighting` and `underexposed` sit in this list on purpose. They name artifacts, not
 * lighting conditions, so the `negative-lighting` rule must leave them alone.
 */
export const STANDARD_NEGATIVE_TERMS: readonly string[] = [
  'morphing',
  'warping',
  'distortion',
  'blurry',
  'soft focus',
  'low quality',
  'low resolution',
  'face deformation',
  'deformed mouth',
  'eye distortion',
  'extra fingers',
  'extra limbs',
  'plastic skin',
  'waxy skin',
  'flat lighting',
  'stock photo',
  'underexposed',
  'text',
  'watermark',
  'cartoon',
]

/** The standard negative prompt as one string, the way a look carries it. */
export function standardNegativePrompt(): string {
  return joinTerms(STANDARD_NEGATIVE_TERMS)
}

/** Added to the negative prompt when hands are not the subject. Rule seven. */
export const HANDS_NEGATIVE_TERMS: readonly string[] = ['hands', 'fingers']

/** Added to the negative prompt for a night scene. Rule eight. */
export const NIGHT_NEGATIVE_TERMS: readonly string[] = [
  'blue colour cast',
  'teal grade',
  'heavy colour grade',
]

/** A prompt may carry one of these, once. Rule four. */
export const DARKNESS_CUES: readonly string[] = [
  'dark',
  'darkness',
  'night',
  'nighttime',
  'moonlight',
  'moonlit',
  'dim',
  'dimly',
  'gloomy',
  'shadowy',
  'unlit',
  'muted',
  'low light',
]

/** None of these may reach the negative prompt. Rule five. */
export const BANNED_NEGATIVE_LIGHTING: readonly string[] = [
  'daylight',
  'bright',
  'brightness',
  'sunlight',
  'sunny',
  'overexposed',
  'dark',
  'darkness',
  'night',
  'dim',
  'backlit',
  'overcast',
]

/** An entity clause holding one of these names a person, so the shot needs casting. Rule six. */
export const PERSON_WORDS: readonly string[] = [
  'man',
  'woman',
  'person',
  'people',
  'boy',
  'girl',
  'child',
  'couple',
  'he',
  'she',
  'they',
  'someone',
  'somebody',
]

/** The aesthetic clause must name one of these. Rule eight. */
export const WHITE_BALANCES: readonly string[] = [
  'neutral white balance',
  'warm white balance',
  'cool white balance',
  'daylight balanced',
  'tungsten balanced',
]

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`)
}

/**
 * A case insensitive pattern matching `term` as whole words.
 *
 * Whole words are the point of this file. `management` holds the letters of `man` and names no
 * person, and `dimly` holds the letters of `dim`. A pattern that matched letters would report
 * both. A term of several words matches across any run of whitespace.
 */
export function wordPattern(term: string): RegExp {
  const body = term
    .trim()
    .split(/\s+/)
    .map((word) => escapeForPattern(word))
    .join('\\s+')
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, 'giu')
}

/** True when `text` holds `term` as whole words. */
export function holdsWord(text: string, term: string): boolean {
  return wordPattern(term).test(text)
}

/** How many times `text` holds `term` as whole words. */
export function countWordMatches(text: string, term: string): number {
  return text.match(wordPattern(term))?.length ?? 0
}

/** Every term of a comma separated list, trimmed, with the empty ones dropped. */
export function splitTerms(value: string): string[] {
  return value
    .split(',')
    .map((term) => term.trim().replace(/\s+/g, ' '))
    .filter((term) => term.length > 0)
}

/** The same terms with any repeat removed, keeping the first spelling and the first position. */
export function dedupeTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const term of terms) {
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(term)
  }
  return kept
}

/** A comma separated list, the way a negative prompt is written. */
export function joinTerms(terms: readonly string[]): string {
  return terms.join(', ')
}

/** Lowercased terms, for asking whether a negative prompt names one. */
export function termSet(value: string): Set<string> {
  return new Set(splitTerms(value).map((term) => term.toLowerCase()))
}
