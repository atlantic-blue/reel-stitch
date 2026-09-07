/**
 * Tests the real renderer against a stub program of the same name, so the spawn path itself is
 * covered without a model on disk. The stub is a shell script because it stands in for an
 * external binary, which is the one place a shell script is the interface.
 */

import { describe, test } from 'node:test'
import { ok, strictEqual } from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import process from 'node:process'

import { RENDERER_PROGRAM, drawThingsRenderer } from './renderer.ts'

/** Puts a stub named `draw-things-cli` first on the path, and takes it away again. */
function stubRenderer(body: string, cleanup: (task: () => void) => void): string {
  const directory = mkdtempSync(join(tmpdir(), 'reel-stub-'))
  const program = join(directory, RENDERER_PROGRAM)
  writeFileSync(program, body, 'utf8')
  chmodSync(program, 0o755)
  const previous = process.env['PATH']
  process.env['PATH'] = `${directory}${delimiter}${previous ?? ''}`
  cleanup(() => {
    process.env['PATH'] = previous
    rmSync(directory, { recursive: true, force: true })
  })
  return directory
}

/** A working directory for the run, which is also where the stub writes what it saw. */
function workingDirectory(cleanup: (task: () => void) => void): string {
  const directory = mkdtempSync(join(tmpdir(), 'reel-run-'))
  cleanup(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

describe('the real renderer', () => {
  test('runs the program with the argument array, in the directory it was given', async (t) => {
    stubRenderer('#!/bin/sh\nfor arg in "$@"; do echo "$arg" >> seen.txt; done\n', t.after.bind(t))
    const cwd = workingDirectory(t.after.bind(t))

    const result = await drawThingsRenderer().run(['generate', '--seed', '4242'], {
      cwd,
      timeoutSeconds: null,
    })

    strictEqual(result.code, 0)
    strictEqual(result.signal, null)
    strictEqual(readFileSync(join(cwd, 'seen.txt'), 'utf8'), 'generate\n--seed\n4242\n')
  })

  test('passes an argument holding a space through as one argument', async (t) => {
    stubRenderer('#!/bin/sh\nfor arg in "$@"; do echo "$arg" >> seen.txt; done\n', t.after.bind(t))
    const cwd = workingDirectory(t.after.bind(t))

    await drawThingsRenderer().run(['--models-dir', '/Users/you/My Models'], {
      cwd,
      timeoutSeconds: null,
    })

    strictEqual(readFileSync(join(cwd, 'seen.txt'), 'utf8'), '--models-dir\n/Users/you/My Models\n')
  })

  test('reports the exit code the program gave', async (t) => {
    stubRenderer('#!/bin/sh\nexit 3\n', t.after.bind(t))
    const cwd = workingDirectory(t.after.bind(t))

    const result = await drawThingsRenderer().run(['generate'], { cwd, timeoutSeconds: null })

    strictEqual(result.code, 3)
  })

  // The stub execs, so the signal reaches sleep itself. A shell that waits on a child
  // instead leaves that child holding the inherited output, and the test run then waits for it.
  test('kills a run that outlasts the timeout, and reports the signal', async (t) => {
    stubRenderer('#!/bin/sh\nexec sleep 30\n', t.after.bind(t))
    const cwd = workingDirectory(t.after.bind(t))

    const result = await drawThingsRenderer().run(['generate'], { cwd, timeoutSeconds: 0.2 })

    strictEqual(result.code, null)
    ok(result.signal !== null, 'the run was not killed')
  })
})
