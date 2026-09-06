/**
 * Builders that make a valid manifest, so tests and later slices do not copy literals around.
 *
 * Every builder takes an optional set of overrides and fills in the rest.
 */

import type {
  CaptureShot,
  CastingEntry,
  GeneratedShot,
  Look,
  ReelManifest,
  Render,
  ShotPrompt,
} from './types.ts'
import { SCHEMA_VERSION } from './types.ts'

const PROMPT_ENTITY =
  'A lone courier in a rain slicked jacket, hood down, breath visible, holding a small paper parcel against her chest.'
const PROMPT_SCENE =
  'A narrow market street after midnight, shutters closed, puddles holding the red and green of a single neon sign above a noodle counter.'
const PROMPT_MOTION =
  'She steps forward and turns her head towards the sign, slowing as the camera drifts in at chest height.'
const PROMPT_AESTHETIC =
  'Cool teal shadows, warm sodium highlights, soft rain haze, shallow depth of field, gentle film grain.'
const PROMPT_STYLE =
  'Anamorphic thirty five millimetre still, cinematic colour grade, natural skin tones, photographic realism.'

/** A string of exactly `count` whitespace separated words, for testing the word limits. */
export function assembledOfWords(count: number): string {
  return Array.from({ length: count }, (_, position) => `word${position}`).join(' ')
}

export function makeLook(overrides: Partial<Look> = {}): Look {
  return {
    palette: 'teal shadows, sodium highlights, one red accent',
    lens: '35mm anamorphic, shallow depth of field',
    lighting: 'wet street practicals, single neon key',
    grade: 'cool shadows, warm skin, lifted blacks',
    filmStock: 'fine grain colour negative',
    negativePrompt: 'text, watermark, extra fingers, blur, low resolution',
    ...overrides,
  }
}

export function makeCastingEntry(overrides: Partial<CastingEntry> = {}): CastingEntry {
  return {
    id: 'courier',
    description: 'A courier in her twenties, short dark hair, green rain jacket',
    ...overrides,
  }
}

export function makePrompt(overrides: Partial<ShotPrompt> = {}): ShotPrompt {
  return {
    entity: PROMPT_ENTITY,
    scene: PROMPT_SCENE,
    motion: PROMPT_MOTION,
    aesthetic: PROMPT_AESTHETIC,
    style: PROMPT_STYLE,
    assembled: [PROMPT_ENTITY, PROMPT_SCENE, PROMPT_MOTION, PROMPT_AESTHETIC, PROMPT_STYLE].join(
      ' ',
    ),
    negative: 'text, watermark, extra fingers, blur, low resolution',
    ...overrides,
  }
}

export function makeGeneratedShot(overrides: Partial<GeneratedShot> = {}): GeneratedShot {
  return {
    index: 0,
    startSeconds: 0,
    durationSeconds: 4,
    beat: 'The courier stops under the sign and reads the address on the parcel',
    caption: null,
    source: 'generated',
    capturePath: null,
    prompt: makePrompt(),
    motionPrompt: 'slow push in, rain falling, sign flickering once',
    seed: 1234,
    stillPath: null,
    clipPath: null,
    approved: false,
    castingIds: ['courier'],
    ...overrides,
  }
}

export function makeCaptureShot(overrides: Partial<CaptureShot> = {}): CaptureShot {
  return {
    index: 1,
    startSeconds: 4,
    durationSeconds: 4,
    beat: 'A held shot of the parcel changing hands across the counter',
    caption: 'the last delivery',
    source: 'capture',
    capturePath: 'captures/counter.png',
    prompt: null,
    motionPrompt: null,
    seed: 5678,
    stillPath: 'captures/counter.png',
    clipPath: null,
    approved: true,
    castingIds: [],
    ...overrides,
  }
}

export function makeRender(overrides: Partial<Render> = {}): Render {
  return {
    model: 'example-video-model',
    width: 576,
    height: 1024,
    steps: 30,
    frames: 49,
    fps: 24,
    modelsDir: null,
    ...overrides,
  }
}

export function makeManifest(overrides: Partial<ReelManifest> = {}): ReelManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: '01J8ZQ5X9K7T3M2N4P6R8S0V1W',
    createdAt: '2026-01-14T09:30:00Z',
    idea: 'a courier makes her last delivery of the night',
    goal: 'act',
    aspect: '9:16',
    durationSeconds: 8,
    look: makeLook(),
    casting: [makeCastingEntry()],
    shots: [makeGeneratedShot(), makeCaptureShot()],
    render: makeRender(),
    outputPath: null,
    ...overrides,
  }
}
