/**
 * Where one shot's files go, relative to the directory holding `reel.json`.
 *
 * Every path in the manifest is relative to that directory, so these builders return relative
 * paths and the command runs the renderer with that directory as its working directory.
 */

/** The directory the stills and their prompt files live in. */
export const STILLS_DIRECTORY = 'stills'

const INDEX_DIGITS = 3

/** The shot index as it appears in a file name, padded to three digits. */
export function padIndex(index: number): string {
  return String(index).padStart(INDEX_DIGITS, '0')
}

/** The still itself, for example `stills/shot-007.png`. */
export function stillPathOf(index: number): string {
  return `${STILLS_DIRECTORY}/shot-${padIndex(index)}.png`
}

/**
 * The prompt the renderer reads, for example `stills/shot-007.prompt.txt`.
 *
 * It is a file on disk rather than a temporary file so a person can read exactly what was sent,
 * and can run the printed command again by hand without this tool.
 */
export function promptPathOf(index: number): string {
  return `${STILLS_DIRECTORY}/shot-${padIndex(index)}.prompt.txt`
}

/** The negative prompt the renderer reads, for example `stills/shot-007.negative.txt`. */
export function negativePathOf(index: number): string {
  return `${STILLS_DIRECTORY}/shot-${padIndex(index)}.negative.txt`
}
