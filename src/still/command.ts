/**
 * `reel still`. Renders one shot to a PNG through the renderer, then writes `stillPath` back
 * into `reel.json`.
 *
 * A still is the cheap artifact this tool is built around: on the reference machine a still costs
 * 102.8 seconds and a clip costs 3851 seconds. So every refusal this command can make happens
 * before the renderer starts, and the manifest is written only after the file is on disk.
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import type { ReelManifest, Shot } from '../manifest/index.ts'
import { validateManifest } from '../manifest/index.ts'
import type { Finding } from '../prompt/index.ts'
import { checkPrompt } from '../prompt/index.ts'

import { STILLS_DIRECTORY, negativePathOf, promptPathOf, stillPathOf } from './paths.ts'
import type { Renderer } from './renderer.ts'
import { RENDERER_PROGRAM } from './renderer.ts'

/** Where the command looks when nobody passes `--manifest`. */
export const DEFAULT_MANIFEST = './reel.json'

/**
 * `checkPrompt` asks whether hands are the subject of the shot. The manifest carries no such
 * field, so this command always answers false, which is the stricter reading and requires
 * `hands, fingers` in the negative prompt. A shot whose subject really is a pair of hands
 * therefore cannot pass the check. Adding a field to the manifest would change a contract other
 * commands read, so the limitation stands and `docs/commands.md` records it.
 */
const HANDS_ARE_THE_SUBJECT = false

/** The frame count this command renders. `render.frames` describes the clip, which is a later slice. */
const STILL_FRAMES = '1'

export const STILL_HELP = `reel still, render one shot to a still

Usage:
  reel still --shot <index> [--manifest <path>] [--timeout-seconds <number>]

Options:
  --manifest <path>           the reel.json to read and write. Defaults to ${DEFAULT_MANIFEST}
  --shot <index>              the shot's index field, not its position in the array. Required
  --timeout-seconds <number>  kill the renderer after this many seconds. There is no default,
                              because the first run fetches about 13 gigabytes of model files
                              and nobody has measured how long that takes on your network
  --help                      print this text

Exit codes:
  0  the still was rendered and the manifest was written
  1  the command refused before running the renderer
  2  the renderer ran and failed, or produced no file`

/** Everything the command reaches the outside world through, so a test can supply all of it. */
export interface StillCommand {
  /** The arguments after `still`. */
  argv: readonly string[]
  /** The directory a relative `--manifest` resolves against. */
  cwd: string
  renderer: Renderer
  out: (line: string) => void
  err: (line: string) => void
}

interface Arguments {
  manifest: string
  shot: number
  timeoutSeconds: number | null
  help: boolean
}

type Refusal = { ok: false; message: string }

type Parsed = { ok: true; arguments: Arguments } | Refusal

function parse(argv: readonly string[]): Parsed {
  let values: {
    manifest?: string | undefined
    shot?: string | undefined
    'timeout-seconds'?: string | undefined
    help?: boolean | undefined
  }
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        manifest: { type: 'string' },
        shot: { type: 'string' },
        'timeout-seconds': { type: 'string' },
        help: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }).values
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }

  if (values.help === true) {
    return {
      ok: true,
      arguments: { manifest: DEFAULT_MANIFEST, shot: 0, timeoutSeconds: null, help: true },
    }
  }

  const shotText = values.shot
  if (shotText === undefined) {
    return { ok: false, message: 'requires --shot, the index of the shot to render' }
  }
  if (!/^\d+$/.test(shotText)) {
    return {
      ok: false,
      message: `--shot must be a whole number, 0 or more, it is '${shotText}'`,
    }
  }

  const timeoutText = values['timeout-seconds']
  let timeoutSeconds: number | null = null
  if (timeoutText !== undefined) {
    const seconds = Number(timeoutText)
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return {
        ok: false,
        message: `--timeout-seconds must be a number greater than 0, it is '${timeoutText}'`,
      }
    }
    timeoutSeconds = seconds
  }

  return {
    ok: true,
    arguments: {
      manifest: values.manifest ?? DEFAULT_MANIFEST,
      shot: Number(shotText),
      timeoutSeconds,
      help: false,
    },
  }
}

/** Quotes a token for display only. The renderer is never given a shell command string. */
function quoteForDisplay(token: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(token) ? token : `'${token.replaceAll("'", "'\\''")}'`
}

/**
 * The whole vector, and nothing else. The flag names were read from
 * `draw-things-cli generate --help` at version 1.20260716.0.
 */
export function renderArguments(manifest: ReelManifest, shot: Shot): string[] {
  const { render } = manifest
  const argv = [
    'generate',
    '--model',
    render.model,
    '--prompt-file',
    promptPathOf(shot.index),
    '--negative-prompt-file',
    negativePathOf(shot.index),
    '--width',
    String(render.width),
    '--height',
    String(render.height),
    '--frames',
    STILL_FRAMES,
    '--steps',
    String(render.steps),
    '--seed',
    String(shot.seed),
    '--output',
    stillPathOf(shot.index),
  ]
  // Omitted entirely when it is null, so the renderer applies its own resolution order.
  if (render.modelsDir !== null) {
    argv.push('--models-dir', render.modelsDir)
  }
  return argv
}

function describeFinding(finding: Finding): string {
  return `${finding.path}: ${finding.rule}: ${finding.message}`
}

function readManifestFile(path: string): { ok: true; data: unknown } | Refusal {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    return {
      ok: false,
      message: `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  try {
    return { ok: true, data: JSON.parse(text) as unknown }
  } catch (error) {
    return {
      ok: false,
      message: `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/** A copy of the parsed file with one shot's `stillPath` set, so any other field a person put in it survives. */
function withStillPath(data: unknown, position: number, stillPath: string): unknown {
  const next = structuredClone(data) as { shots: { stillPath: string | null }[] }
  const shot = next.shots[position]
  if (shot === undefined) throw new Error(`the manifest has no shot at position ${position}`)
  shot.stillPath = stillPath
  return next
}

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return `it was killed by ${signal}`
  return `it exited with code ${code ?? 'no code at all'}`
}

/**
 * Runs the command and returns the process exit code.
 *
 * 0 means the still was rendered and the manifest was written. 1 means the command refused before
 * the renderer ran. 2 means the renderer ran and failed, or produced no usable file.
 */
export async function runStill(command: StillCommand): Promise<number> {
  const { out, err } = command

  const parsed = parse(command.argv)
  if (!parsed.ok) {
    err(`reel still: ${parsed.message}`)
    err(STILL_HELP)
    return 1
  }
  if (parsed.arguments.help) {
    out(STILL_HELP)
    return 0
  }
  const { manifest: manifestOption, shot: shotIndex, timeoutSeconds } = parsed.arguments

  const manifestPath = isAbsolute(manifestOption)
    ? manifestOption
    : resolve(command.cwd, manifestOption)
  // Every path inside the manifest is relative to the directory holding it, so that is where the
  // files are written and where the renderer runs.
  const reelDirectory = dirname(manifestPath)

  const file = readManifestFile(manifestPath)
  if (!file.ok) {
    err(`reel still: ${file.message}`)
    return 1
  }

  const validated = validateManifest(file.data)
  if (!validated.ok) {
    err(`reel still: ${manifestPath} is not a valid manifest`)
    for (const error of validated.errors) {
      err(`${error.path === '' ? '.' : error.path}: ${error.message}`)
    }
    return 1
  }
  const manifest = validated.manifest

  const position = manifest.shots.findIndex((shot) => shot.index === shotIndex)
  const shot = manifest.shots[position]
  if (shot === undefined) {
    const existing = manifest.shots.map((entry) => entry.index).join(', ')
    err(`reel still: no shot has index ${shotIndex}, the manifest holds ${existing}`)
    return 1
  }
  const shotPath = `shots[${position}]`

  if (shot.source === 'capture') {
    err(
      `reel still: ${shotPath} has source 'capture', so you supply its still and there is nothing to render`,
    )
    err(`its still is ${shot.capturePath}`)
    return 1
  }

  const findings = checkPrompt({
    prompt: shot.prompt,
    shot,
    casting: manifest.casting,
    look: manifest.look,
    handsAreTheSubject: HANDS_ARE_THE_SUBJECT,
    shotPath,
  })
  if (findings.length > 0) {
    err(`reel still: the prompt of ${shotPath} breaks ${findings.length} rule(s), nothing rendered`)
    for (const finding of findings) {
      err(describeFinding(finding))
    }
    err('the rules are in docs/prompts.md')
    return 1
  }

  mkdirSync(join(reelDirectory, STILLS_DIRECTORY), { recursive: true })
  writeFileSync(join(reelDirectory, promptPathOf(shot.index)), shot.prompt.assembled, 'utf8')
  writeFileSync(join(reelDirectory, negativePathOf(shot.index)), shot.prompt.negative, 'utf8')

  const argv = renderArguments(manifest, shot)
  out(`running in ${reelDirectory}`)
  out([RENDERER_PROGRAM, ...argv].map(quoteForDisplay).join(' '))
  // The renderer buffers its progress output when it is not attached to a terminal, so a
  // redirected run prints nothing until it exits. docs/commands.md says so beside the command.

  const result = await command.renderer.run(argv, { cwd: reelDirectory, timeoutSeconds })
  if (result.code !== 0) {
    err(`reel still: the renderer failed, ${describeExit(result.code, result.signal)}`)
    err(`${manifestPath} is unchanged`)
    return 2
  }

  // A renderer that exits zero having written nothing must not be recorded as a success.
  const stillPath = stillPathOf(shot.index)
  const absoluteStill = join(reelDirectory, stillPath)
  let bytes: number
  try {
    bytes = statSync(absoluteStill).size
  } catch {
    err(`reel still: the renderer exited 0 but wrote no file at ${stillPath}`)
    err(`${manifestPath} is unchanged`)
    return 2
  }
  if (bytes === 0) {
    err(`reel still: the renderer exited 0 but ${stillPath} is empty`)
    err(`${manifestPath} is unchanged`)
    return 2
  }

  const written = withStillPath(file.data, position, stillPath)
  const revalidated = validateManifest(written)
  if (!revalidated.ok) {
    err(`reel still: the manifest does not validate with ${stillPath} set, so it is unchanged`)
    for (const error of revalidated.errors) {
      err(`${error.path === '' ? '.' : error.path}: ${error.message}`)
    }
    return 2
  }
  writeFileSync(manifestPath, `${JSON.stringify(written, null, 2)}\n`, 'utf8')

  out(`wrote ${stillPath}, ${bytes} bytes`)
  out(`set ${shotPath}.stillPath in ${manifestPath}`)
  return 0
}
