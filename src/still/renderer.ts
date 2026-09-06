/**
 * The one thing this command runs, behind one interface.
 *
 * The command takes a renderer rather than making one, so a test supplies a double that records
 * what was asked and runs nothing. There is one real implementation and no registry: the
 * repository calls `draw-things-cli` and nothing else.
 */

import { spawn } from 'node:child_process'

/** The program the real renderer runs. */
export const RENDERER_PROGRAM = 'draw-things-cli'

export interface RunOptions {
  /** The directory the renderer runs in. Every path in the vector is relative to it. */
  cwd: string
  /** Seconds before the run is killed, or null to let it run as long as it needs. */
  timeoutSeconds: number | null
}

export interface RunResult {
  /** The exit code, or null when a signal ended the run. */
  code: number | null
  /** The signal that ended the run, or null when it exited on its own. */
  signal: NodeJS.Signals | null
}

export interface Renderer {
  run(args: readonly string[], options: RunOptions): Promise<RunResult>
}

/**
 * Runs `draw-things-cli` as a program with an argument array.
 *
 * The vector never becomes a shell command string, so a path holding a space or a quote cannot
 * change what runs. The renderer's own output goes straight through to this process, unbuffered
 * and uncaptured, because a progress bar that is collected and printed at the end is no longer a
 * progress bar.
 */
export function drawThingsRenderer(): Renderer {
  return {
    run(args, options) {
      return new Promise((resolve, reject) => {
        const child = spawn(RENDERER_PROGRAM, [...args], {
          cwd: options.cwd,
          stdio: 'inherit',
          shell: false,
          ...(options.timeoutSeconds === null ? {} : { timeout: options.timeoutSeconds * 1000 }),
        })
        child.on('error', reject)
        child.on('close', (code, signal) => {
          resolve({ code, signal })
        })
      })
    },
  }
}
