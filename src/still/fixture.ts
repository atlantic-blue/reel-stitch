/**
 * Builders for the still command: a manifest whose prompt every rule accepts, and a renderer
 * that records what it was asked and runs nothing.
 *
 * The manifest fixture in `src/manifest/fixture.ts` is built to exercise the validator, and its
 * prompt breaks several prompt rules on purpose. This command refuses such a prompt, so a test of
 * the render path starts from a prompt the checker accepts and breaks one thing at a time.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { GeneratedShot, ReelManifest } from '../manifest/index.ts'
import { makeCaptureShot, makeGeneratedShot, makeManifest } from '../manifest/index.ts'
import { makeClauses, makePromptFrom, makePromptLook } from '../prompt/index.ts'

import type { Renderer, RunOptions, RunResult } from './renderer.ts'

/** The eight bytes every PNG file opens with. */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** One transparent pixel, as a whole valid PNG file. */
export const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/** A generated shot whose prompt passes every rule in `docs/prompts.md`. */
export function makeCheckedShot(overrides: Partial<GeneratedShot> = {}): GeneratedShot {
  return makeGeneratedShot({ prompt: makePromptFrom(makeClauses()), seed: 4242, ...overrides })
}

/**
 * A manifest the command renders without refusing: one generated shot at index 0 whose prompt
 * passes the checker, and one capture shot at index 1.
 */
export function makeStillManifest(overrides: Partial<ReelManifest> = {}): ReelManifest {
  return makeManifest({
    look: makePromptLook(),
    shots: [makeCheckedShot(), makeCaptureShot()],
    ...overrides,
  })
}

/** One call the double was asked to make. */
export interface RecordedRun {
  args: string[]
  options: RunOptions
}

/** What the double does when it is called. It writes a whole PNG and exits 0 by default. */
export interface RendererBehaviour {
  /** The exit code to report. */
  code?: number
  /** The signal to report instead of a code. */
  signal?: NodeJS.Signals
  /** What to leave at the `--output` path. */
  writes?: 'png' | 'empty' | 'nothing'
}

/**
 * A renderer that records the whole argument vector and runs nothing.
 *
 * It records rather than matches, so a test asserts the array element by element. A test that
 * asks whether the vector holds `--frames` proves nothing about what the renderer receives.
 */
export class RecordingRenderer implements Renderer {
  readonly runs: RecordedRun[] = []
  private readonly behaviour: RendererBehaviour

  constructor(behaviour: RendererBehaviour = {}) {
    this.behaviour = behaviour
  }

  /** The only call, when there is exactly one. Anything else is a fault in the test. */
  get onlyRun(): RecordedRun {
    const [run] = this.runs
    if (this.runs.length !== 1 || run === undefined) {
      throw new Error(`expected exactly one run, the renderer was called ${this.runs.length} times`)
    }
    return run
  }

  run(args: readonly string[], options: RunOptions): Promise<RunResult> {
    this.runs.push({ args: [...args], options })

    const writes = this.behaviour.writes ?? 'png'
    if (writes !== 'nothing') {
      const output = args[args.indexOf('--output') + 1]
      if (output === undefined) throw new Error('the vector carries no --output path')
      writeFileSync(join(options.cwd, output), writes === 'png' ? ONE_PIXEL_PNG : Buffer.alloc(0))
    }

    return Promise.resolve({
      code: this.behaviour.signal === undefined ? (this.behaviour.code ?? 0) : null,
      signal: this.behaviour.signal ?? null,
    })
  }
}
