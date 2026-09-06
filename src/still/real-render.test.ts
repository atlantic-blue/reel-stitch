/**
 * The one test that runs the real renderer.
 *
 * It renders a still at 704 by 1280 with 20 steps, which was measured at 44.5 seconds on the
 * reference machine. Larger numbers cost more with nothing to show for it here.
 *
 * It needs two things: `draw-things-cli` on the path, and `REEL_STITCH_REAL_RENDER` set to `1`.
 * When either is absent the test says which one, out loud. A skip that says nothing reads exactly
 * like a pass.
 */

import { describe, test } from 'node:test'
import { ok, strictEqual } from 'node:assert/strict'
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'

import { makeRender } from '../manifest/index.ts'

import { runStill } from './command.ts'
import { PNG_SIGNATURE, makeStillManifest } from './fixture.ts'
import { stillPathOf } from './paths.ts'
import { RENDERER_PROGRAM, drawThingsRenderer } from './renderer.ts'

/** The generator `docs/setup.md` installs. */
const MODEL = 'wan_v2.2_5b_ti2v_q8p.ckpt'

/** The environment variable that turns this test on. */
const SWITCH = 'REEL_STITCH_REAL_RENDER'

/** True when `draw-things-cli` is an executable file on the path. */
function rendererIsOnThePath(): boolean {
  for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
    if (directory === '') continue
    try {
      accessSync(join(directory, RENDERER_PROGRAM), constants.X_OK)
      return true
    } catch {
      continue
    }
  }
  return false
}

describe('reel still, against the real renderer', () => {
  test('renders one still at 704 by 1280 with 20 steps', async (t) => {
    const onThePath = rendererIsOnThePath()
    const switchedOn = process.env[SWITCH] === '1'

    if (!onThePath || !switchedOn) {
      const missing = [
        onThePath ? null : `${RENDERER_PROGRAM} is not on the path`,
        switchedOn ? null : `${SWITCH} is not set to 1`,
      ].filter((reason) => reason !== null)
      console.log(`the real renderer test did not run: ${missing.join(', and ')}`)
      return
    }

    const directory = mkdtempSync(join(tmpdir(), 'reel-still-real-'))
    t.after(() => rmSync(directory, { recursive: true, force: true }))
    const manifest = makeStillManifest({
      render: makeRender({ model: MODEL, width: 704, height: 1280, steps: 20 }),
    })
    writeFileSync(join(directory, 'reel.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const code = await runStill({
      argv: ['--shot', '0'],
      cwd: directory,
      renderer: drawThingsRenderer(),
      out: (line) => console.log(line),
      err: (line) => console.error(line),
    })

    strictEqual(code, 0)
    const still = readFileSync(join(directory, stillPathOf(0)))
    ok(still.length > 0, 'the still is empty')
    ok(
      still.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
      'the file the renderer wrote does not open with a PNG signature',
    )
  })
})
