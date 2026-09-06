import { describe, test } from 'node:test'
import { deepStrictEqual, match, ok, strictEqual } from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ReelManifest } from '../manifest/index.ts'
import { makeCaptureShot, makeRender, validateManifest } from '../manifest/index.ts'
import { makeClauses, makePromptFrom } from '../prompt/index.ts'

import { DEFAULT_MANIFEST, runStill } from './command.ts'
import { RecordingRenderer, makeCheckedShot, makeStillManifest } from './fixture.ts'
import { negativePathOf, promptPathOf, stillPathOf } from './paths.ts'

interface Run {
  code: number
  out: string
  err: string
}

/** A reel directory holding one `reel.json`, removed when the test ends. */
function reelDirectory(manifest: unknown, cleanup: (task: () => void) => void): string {
  const directory = mkdtempSync(join(tmpdir(), 'reel-still-'))
  writeFileSync(join(directory, 'reel.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  cleanup(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

async function still(
  directory: string,
  argv: readonly string[],
  renderer: RecordingRenderer,
): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  const code = await runStill({
    argv,
    cwd: directory,
    renderer,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

/** Renders shot 0 of `manifest`, and hands back the run, the double and the directory. */
async function renderShot(
  manifest: unknown,
  cleanup: (task: () => void) => void,
  renderer: RecordingRenderer = new RecordingRenderer(),
  argv: readonly string[] = ['--shot', '0'],
): Promise<{ run: Run; renderer: RecordingRenderer; directory: string }> {
  const directory = reelDirectory(manifest, cleanup)
  const run = await still(directory, argv, renderer)
  return { run, renderer, directory }
}

function manifestOnDisk(directory: string): string {
  return readFileSync(join(directory, 'reel.json'), 'utf8')
}

/** The manifest as data, so a test can read the field the command was meant to write. */
function readManifest(directory: string): ReelManifest {
  const result = validateManifest(JSON.parse(manifestOnDisk(directory)))
  if (!result.ok)
    throw new Error(`the manifest on disk is invalid: ${JSON.stringify(result.errors)}`)
  return result.manifest
}

/** The whole vector for shot 0 of the fixture, the one every other vector test varies from. */
function expectedArguments(overrides: { modelsDir?: string } = {}): string[] {
  const argv = [
    'generate',
    '--model',
    'example-video-model',
    '--prompt-file',
    'stills/shot-000.prompt.txt',
    '--negative-prompt-file',
    'stills/shot-000.negative.txt',
    '--width',
    '576',
    '--height',
    '1024',
    '--frames',
    '1',
    '--steps',
    '30',
    '--seed',
    '4242',
    '--output',
    'stills/shot-000.png',
  ]
  if (overrides.modelsDir !== undefined) argv.push('--models-dir', overrides.modelsDir)
  return argv
}

describe('reel still, the argument vector', () => {
  test('is the whole vector, in order', async (t) => {
    const { run, renderer } = await renderShot(makeStillManifest(), t.after.bind(t))

    strictEqual(run.code, 0, run.err)
    deepStrictEqual(renderer.onlyRun.args, expectedArguments())
  })

  test('carries --models-dir when the manifest names one', async (t) => {
    const manifest = makeStillManifest({
      render: makeRender({ modelsDir: '/Users/you/Models' }),
    })
    const { run, renderer } = await renderShot(manifest, t.after.bind(t))

    strictEqual(run.code, 0, run.err)
    deepStrictEqual(renderer.onlyRun.args, expectedArguments({ modelsDir: '/Users/you/Models' }))
  })

  test('omits --models-dir entirely when it is null', async (t) => {
    const { renderer } = await renderShot(
      makeStillManifest({ render: makeRender({ modelsDir: null }) }),
      t.after.bind(t),
    )

    ok(
      !renderer.onlyRun.args.includes('--models-dir'),
      `the vector names --models-dir: ${renderer.onlyRun.args.join(' ')}`,
    )
  })

  test('renders one frame even when the clip holds 121', async (t) => {
    const { renderer } = await renderShot(
      makeStillManifest({ render: makeRender({ frames: 121 }) }),
      t.after.bind(t),
    )

    const args = renderer.onlyRun.args
    strictEqual(args[args.indexOf('--frames') + 1], '1')
    ok(!args.includes('121'), `the vector carries the clip frame count: ${args.join(' ')}`)
  })

  test('passes the seed of the shot, not any other number in the manifest', async (t) => {
    const manifest = makeStillManifest({
      shots: [makeCheckedShot({ seed: 987654 }), makeCaptureShot({ seed: 5678 })],
    })
    const { renderer } = await renderShot(manifest, t.after.bind(t))

    const args = renderer.onlyRun.args
    strictEqual(args[args.indexOf('--seed') + 1], '987654')
  })

  test('pads the shot index to three digits in every path', async (t) => {
    const shots = Array.from({ length: 8 }, (_, index) =>
      makeCheckedShot({ index, startSeconds: index * 4, seed: 100 + index }),
    )
    const { run, renderer } = await renderShot(
      makeStillManifest({ shots }),
      t.after.bind(t),
      new RecordingRenderer(),
      ['--shot', '7'],
    )

    strictEqual(run.code, 0, run.err)
    const args = renderer.onlyRun.args
    strictEqual(args[args.indexOf('--output') + 1], 'stills/shot-007.png')
    strictEqual(args[args.indexOf('--prompt-file') + 1], 'stills/shot-007.prompt.txt')
    strictEqual(args[args.indexOf('--negative-prompt-file') + 1], 'stills/shot-007.negative.txt')
    strictEqual(args[args.indexOf('--seed') + 1], '107')
  })

  test('is printed, so the run can be repeated by hand', async (t) => {
    const { run } = await renderShot(makeStillManifest(), t.after.bind(t))

    match(run.out, /draw-things-cli generate --model example-video-model/)
    match(run.out, /--output stills\/shot-000\.png/)
  })

  test('runs in the directory holding the manifest', async (t) => {
    const { renderer, directory } = await renderShot(makeStillManifest(), t.after.bind(t))

    strictEqual(renderer.onlyRun.options.cwd, directory)
  })
})

describe('reel still, the files it writes', () => {
  test('creates stills when it is absent', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    strictEqual(existsSync(join(directory, 'stills')), false)

    const run = await still(directory, ['--shot', '0'], new RecordingRenderer())

    strictEqual(run.code, 0, run.err)
    ok(existsSync(join(directory, 'stills')), 'stills was not created')
  })

  test('writes the two prompt files, exactly as the manifest holds them', async (t) => {
    const manifest = makeStillManifest()
    const prompt = manifest.shots[0]?.prompt
    ok(prompt !== null && prompt !== undefined, 'the fixture shot has no prompt')
    const { run, directory } = await renderShot(manifest, t.after.bind(t))

    strictEqual(run.code, 0, run.err)
    strictEqual(readFileSync(join(directory, promptPathOf(0)), 'utf8'), prompt.assembled)
    strictEqual(readFileSync(join(directory, negativePathOf(0)), 'utf8'), prompt.negative)
  })

  test('writes stillPath into the manifest, and the result still validates', async (t) => {
    const { run, directory } = await renderShot(makeStillManifest(), t.after.bind(t))

    strictEqual(run.code, 0, run.err)
    const written = readManifest(directory)
    strictEqual(written.shots[0]?.stillPath, 'stills/shot-000.png')
    strictEqual(stillPathOf(0), 'stills/shot-000.png')
  })

  test('leaves every other field of the manifest as it was', async (t) => {
    const manifest = makeStillManifest()
    const { directory } = await renderShot(manifest, t.after.bind(t))

    const written = readManifest(directory)
    deepStrictEqual(
      {
        ...written,
        shots: written.shots.map((shot, position) =>
          position === 0 ? { ...shot, stillPath: null } : shot,
        ),
      },
      JSON.parse(JSON.stringify(manifest)),
    )
  })
})

describe('reel still, when the renderer fails', () => {
  test('reports a non zero exit and leaves the manifest alone', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const before = manifestOnDisk(directory)

    const run = await still(directory, ['--shot', '0'], new RecordingRenderer({ code: 3 }))

    strictEqual(run.code, 2)
    match(run.err, /3/)
    strictEqual(manifestOnDisk(directory), before)
  })

  test('refuses a run that exits 0 and writes no file', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const before = manifestOnDisk(directory)

    const run = await still(
      directory,
      ['--shot', '0'],
      new RecordingRenderer({ code: 0, writes: 'nothing' }),
    )

    strictEqual(run.code, 2)
    match(run.err, /stills\/shot-000\.png/)
    strictEqual(manifestOnDisk(directory), before)
    strictEqual(existsSync(join(directory, stillPathOf(0))), false)
  })

  test('refuses a run that exits 0 and writes an empty file', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const before = manifestOnDisk(directory)

    const run = await still(
      directory,
      ['--shot', '0'],
      new RecordingRenderer({ code: 0, writes: 'empty' }),
    )

    strictEqual(run.code, 2)
    match(run.err, /empty/)
    strictEqual(manifestOnDisk(directory), before)
  })

  test('reports the signal when one killed the run', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))

    const run = await still(
      directory,
      ['--shot', '0'],
      new RecordingRenderer({ signal: 'SIGTERM', writes: 'nothing' }),
    )

    strictEqual(run.code, 2)
    match(run.err, /SIGTERM/)
  })
})

describe('reel still, the refusals', () => {
  test('refuses a capture shot without calling the renderer', async (t) => {
    const { run, renderer, directory } = await renderShot(
      makeStillManifest(),
      t.after.bind(t),
      new RecordingRenderer(),
      ['--shot', '1'],
    )

    strictEqual(run.code, 1)
    match(run.err, /capture/)
    strictEqual(renderer.runs.length, 0)
    strictEqual(readManifest(directory).shots[1]?.stillPath, 'captures/counter.png')
  })

  test('refuses a prompt that carries findings, and prints every one of them', async (t) => {
    const aesthetic =
      'Natural colour, soft rain haze, shallow depth of field, gentle film grain, sodium practicals lighting her face and the parcel she carries.'
    const prompt = makePromptFrom(makeClauses({ aesthetic }), { handsAreTheSubject: true })
    const manifest = makeStillManifest({
      shots: [makeCheckedShot({ prompt }), makeCaptureShot()],
    })
    const { run, renderer } = await renderShot(manifest, t.after.bind(t))

    strictEqual(run.code, 1)
    strictEqual(renderer.runs.length, 0)
    match(run.err, /shots\[0\]\.prompt\.aesthetic: white-balance:/)
    match(run.err, /shots\[0\]\.prompt\.negative: hands:/)
  })

  test('refuses an index no shot carries, and names the ones that exist', async (t) => {
    const { run, renderer } = await renderShot(
      makeStillManifest(),
      t.after.bind(t),
      new RecordingRenderer(),
      ['--shot', '7'],
    )

    strictEqual(run.code, 1)
    strictEqual(renderer.runs.length, 0)
    match(run.err, /no shot has index 7/)
    match(run.err, /0, 1/)
  })

  test('refuses an invalid manifest before the renderer is called', async (t) => {
    const manifest = JSON.parse(JSON.stringify(makeStillManifest())) as Record<string, unknown>
    ;(manifest['render'] as Record<string, unknown>)['width'] = 100
    const { run, renderer } = await renderShot(manifest, t.after.bind(t))

    strictEqual(run.code, 1)
    strictEqual(renderer.runs.length, 0)
    match(run.err, /render\.width: must be a multiple of 64/)
  })

  test('refuses a manifest that is not there', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['--manifest', 'nowhere.json', '--shot', '0'], renderer)

    strictEqual(run.code, 1)
    match(run.err, /cannot read/)
    strictEqual(renderer.runs.length, 0)
  })

  test('refuses a manifest that is not JSON', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    writeFileSync(join(directory, 'reel.json'), 'not json at all', 'utf8')
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['--shot', '0'], renderer)

    strictEqual(run.code, 1)
    match(run.err, /not valid JSON/)
    strictEqual(renderer.runs.length, 0)
  })

  test('refuses an unknown flag by name', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['--shot', '0', '--upscale'], renderer)

    strictEqual(run.code, 1)
    match(run.err, /--upscale/)
    strictEqual(renderer.runs.length, 0)
  })

  test('refuses a positional argument', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['0'], renderer)

    strictEqual(run.code, 1)
    strictEqual(renderer.runs.length, 0)
  })

  test('refuses a run with no --shot', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, [], renderer)

    strictEqual(run.code, 1)
    match(run.err, /--shot/)
    strictEqual(renderer.runs.length, 0)
  })

  test('refuses a --shot that is not a whole number', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['--shot', 'first'], renderer)

    strictEqual(run.code, 1)
    match(run.err, /--shot must be a whole number/)
    strictEqual(renderer.runs.length, 0)
  })

  test('refuses a --timeout-seconds that is not a positive number', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['--shot', '0', '--timeout-seconds', '0'], renderer)

    strictEqual(run.code, 1)
    match(run.err, /--timeout-seconds/)
    strictEqual(renderer.runs.length, 0)
  })
})

describe('reel still, the flags', () => {
  test('reads ./reel.json when nobody passes --manifest', async (t) => {
    const { run, renderer } = await renderShot(makeStillManifest(), t.after.bind(t))

    strictEqual(run.code, 0, run.err)
    strictEqual(renderer.runs.length, 1)
    strictEqual(DEFAULT_MANIFEST, './reel.json')
  })

  test('reads the manifest the path names, wherever it sits', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const elsewhere = mkdtempSync(join(tmpdir(), 'reel-still-cwd-'))
    t.after(() => rmSync(elsewhere, { recursive: true, force: true }))
    const renderer = new RecordingRenderer()

    const out: string[] = []
    const err: string[] = []
    const code = await runStill({
      argv: ['--manifest', join(directory, 'reel.json'), '--shot', '0'],
      cwd: elsewhere,
      renderer,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    })

    strictEqual(code, 0, err.join('\n'))
    strictEqual(renderer.onlyRun.options.cwd, directory)
    ok(existsSync(join(directory, stillPathOf(0))), 'the still went somewhere else')
  })

  test('passes no timeout when nobody asks for one', async (t) => {
    const { renderer } = await renderShot(makeStillManifest(), t.after.bind(t))

    strictEqual(renderer.onlyRun.options.timeoutSeconds, null)
  })

  test('passes the timeout it was given', async (t) => {
    const { renderer } = await renderShot(
      makeStillManifest(),
      t.after.bind(t),
      new RecordingRenderer(),
      ['--shot', '0', '--timeout-seconds', '900'],
    )

    strictEqual(renderer.onlyRun.options.timeoutSeconds, 900)
  })

  test('prints the help and renders nothing', async (t) => {
    const directory = reelDirectory(makeStillManifest(), t.after.bind(t))
    const renderer = new RecordingRenderer()

    const run = await still(directory, ['--help'], renderer)

    strictEqual(run.code, 0)
    match(run.out, /--timeout-seconds/)
    match(run.out, /Exit codes/)
    strictEqual(renderer.runs.length, 0)
  })
})
