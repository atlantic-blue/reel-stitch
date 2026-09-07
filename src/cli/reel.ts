#!/usr/bin/env -S node --experimental-strip-types
/**
 * The `reel` command line. One command lives here today, `reel still`.
 *
 * The entry point makes the real renderer and hands it to the command, so a test drives
 * `runStill` with a double of its own and nothing in a test reaches `draw-things-cli`.
 */

import process from 'node:process'

import { drawThingsRenderer, runStill } from '../still/index.ts'

const HELP = `reel, turn one line of an idea into a short vertical video

Usage:
  reel still --shot <index> [--manifest <path>] [--timeout-seconds <number>]
  reel --help

Commands:
  still  render one shot to a still, and write its path into reel.json

Run 'reel still --help' for the flags of that command.`

function out(line: string): void {
  process.stdout.write(`${line}\n`)
}

function err(line: string): void {
  process.stderr.write(`${line}\n`)
}

async function main(argv: readonly string[]): Promise<number> {
  const [name, ...rest] = argv

  if (name === '--help' || name === '-h') {
    out(HELP)
    return 0
  }

  if (name === undefined) {
    err('reel: needs a command')
    err(HELP)
    return 1
  }

  if (name === 'still') {
    return runStill({ argv: rest, cwd: process.cwd(), renderer: drawThingsRenderer(), out, err })
  }

  err(`reel: no command named '${name}'`)
  err(HELP)
  return 1
}

process.exitCode = await main(process.argv.slice(2))
