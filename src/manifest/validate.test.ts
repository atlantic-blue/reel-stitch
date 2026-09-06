import { describe, test } from 'node:test'
import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import {
  assembledOfWords,
  makeCaptureShot,
  makeCastingEntry,
  makeGeneratedShot,
  makeLook,
  makeManifest,
  makePrompt,
  makeRender,
} from './fixture.ts'
import type { ReelManifest } from './types.ts'
import { ASPECTS, GOALS, SHOT_SOURCES } from './types.ts'
import type { ValidationError } from './validate.ts'
import { countWords, validateManifest } from './validate.ts'

type Raw = Record<string, unknown>

/** A valid manifest as plain data, so a test can put anything at all into a field. */
function raw(overrides: Partial<ReelManifest> = {}): Raw {
  return JSON.parse(JSON.stringify(makeManifest(overrides))) as Raw
}

function shotAt(input: Raw, position: number): Raw {
  const shots = input['shots'] as Raw[]
  const shot = shots[position]
  if (shot === undefined) throw new Error(`the fixture has no shot at ${position}`)
  return shot
}

function nested(input: Raw, key: string): Raw {
  return input[key] as Raw
}

function accepts(input: unknown, what: string): void {
  const result = validateManifest(input)
  if (!result.ok) {
    throw new Error(`${what}: expected an accept, got ${JSON.stringify(result.errors)}`)
  }
}

/** Asserts a rejection carrying an error at `path`, and hands that error back. */
function rejectsAt(input: unknown, path: string): ValidationError {
  const result = validateManifest(input)
  if (result.ok) {
    throw new Error(`expected a rejection naming ${path}, the input was accepted`)
  }
  const match = result.errors.find((error) => error.path === path)
  if (match === undefined) {
    const seen = result.errors.map((error) => `${error.path}: ${error.message}`).join(' | ')
    throw new Error(`expected an error at ${path}, got ${seen}`)
  }
  return match
}

const TOP_LEVEL_FIELDS = [
  'schemaVersion',
  'id',
  'createdAt',
  'idea',
  'goal',
  'aspect',
  'durationSeconds',
  'look',
  'casting',
  'shots',
  'render',
  'outputPath',
] as const

describe('the fixture builder', () => {
  test('builds a manifest the validator accepts', () => {
    accepts(makeManifest(), 'the fixture')
  })

  test('carries the overrides it is given', () => {
    const manifest = makeManifest({ idea: 'a lighthouse keeper counts ships' })
    strictEqual(manifest.idea, 'a lighthouse keeper counts ships')
    accepts(manifest, 'the fixture with an override')
  })

  test('assembles a prompt inside the word limits', () => {
    const words = countWords(makePrompt().assembled)
    strictEqual(words >= 80 && words <= 120, true, `assembled holds ${words} words`)
  })

  test('makes an assembled prompt of the length asked for', () => {
    strictEqual(countWords(assembledOfWords(80)), 80)
    strictEqual(countWords(assembledOfWords(121)), 121)
  })
})

describe('input that is not a manifest at all', () => {
  test('rejects rather than throwing', () => {
    for (const input of ['a string', 7, null, undefined, true, [], [makeManifest()]]) {
      const result = validateManifest(input)
      strictEqual(result.ok, false, `${JSON.stringify(input) ?? 'undefined'} was accepted`)
    }
  })

  test('names the whole document as the path', () => {
    deepStrictEqual(rejectsAt('a string', ''), { path: '', message: 'must be an object' })
  })

  test('does not throw on rubbish inside every field', () => {
    const input: Raw = {
      schemaVersion: 3,
      id: [],
      createdAt: {},
      idea: null,
      goal: 'sell',
      aspect: 42,
      durationSeconds: 'eight',
      look: 'a look',
      casting: 'nobody',
      shots: [1, 'two', null],
      render: null,
      outputPath: 9,
    }
    const result = validateManifest(input)
    strictEqual(result.ok, false)
  })
})

describe('required top level fields', () => {
  test('accepts a manifest carrying all of them', () => {
    accepts(raw(), 'a whole manifest')
  })

  for (const field of TOP_LEVEL_FIELDS) {
    test(`rejects a manifest with no ${field}`, () => {
      const input = raw()
      delete input[field]
      strictEqual(rejectsAt(input, field).message, 'is required')
    })
  }
})

describe('schemaVersion', () => {
  test('accepts a semantic version', () => {
    accepts(raw({ schemaVersion: '2.11.3' }), 'a semantic version')
  })

  test('rejects a version that is not semantic', () => {
    rejectsAt(raw({ schemaVersion: 'one' }), 'schemaVersion')
  })

  test('rejects a version that is not a string', () => {
    const input = raw()
    input['schemaVersion'] = 1
    strictEqual(rejectsAt(input, 'schemaVersion').message, 'must be a string')
  })
})

describe('id', () => {
  test('accepts a ULID', () => {
    accepts(raw({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }), 'a ULID')
  })

  test('rejects anything that is not a ULID', () => {
    rejectsAt(raw({ id: 'reel-1' }), 'id')
  })
})

describe('createdAt', () => {
  test('accepts an RFC 3339 timestamp', () => {
    accepts(raw({ createdAt: '2026-01-14T09:30:00Z' }), 'a timestamp with Z')
    accepts(raw({ createdAt: '2026-01-14T09:30:00.250+01:00' }), 'a timestamp with an offset')
  })

  test('rejects a timestamp in another shape', () => {
    rejectsAt(raw({ createdAt: '14 January 2026' }), 'createdAt')
  })

  test('rejects a date that does not exist', () => {
    strictEqual(
      rejectsAt(raw({ createdAt: '2026-13-45T09:30:00Z' }), 'createdAt').message,
      'must be a real date',
    )
  })
})

describe('idea', () => {
  test('accepts one character and five hundred', () => {
    accepts(raw({ idea: 'a' }), 'one character')
    accepts(raw({ idea: 'a'.repeat(500) }), 'five hundred characters')
  })

  test('rejects an empty idea and one over five hundred characters', () => {
    rejectsAt(raw({ idea: '' }), 'idea')
    rejectsAt(raw({ idea: 'a'.repeat(501) }), 'idea')
  })
})

describe('goal', () => {
  test('accepts every goal in the set', () => {
    for (const goal of GOALS) {
      accepts(raw({ goal }), goal)
    }
  })

  test('rejects a goal outside the set', () => {
    const input = raw()
    input['goal'] = 'sell'
    strictEqual(rejectsAt(input, 'goal').message, "must be one of 'act', 'reach', 'explain'")
  })
})

describe('aspect', () => {
  test('accepts every aspect in the set', () => {
    for (const aspect of ASPECTS) {
      accepts(raw({ aspect }), aspect)
    }
  })

  test('rejects an aspect outside the set', () => {
    const input = raw()
    input['aspect'] = '4:3'
    strictEqual(rejectsAt(input, 'aspect').message, "must be one of '9:16', '1:1', '16:9'")
  })
})

describe('durationSeconds', () => {
  test('accepts the ends of the range', () => {
    accepts(raw({ durationSeconds: 5 }), 'five seconds')
    accepts(raw({ durationSeconds: 60 }), 'sixty seconds')
  })

  test('rejects below five and above sixty', () => {
    rejectsAt(raw({ durationSeconds: 4 }), 'durationSeconds')
    rejectsAt(raw({ durationSeconds: 61 }), 'durationSeconds')
  })

  test('rejects a duration that is not a whole number', () => {
    rejectsAt(raw({ durationSeconds: 10.5 }), 'durationSeconds')
  })
})

describe('look', () => {
  test('accepts a whole look', () => {
    accepts(raw({ look: makeLook() }), 'a whole look')
  })

  test('rejects a look with a field missing', () => {
    const input = raw()
    delete nested(input, 'look')['grade']
    strictEqual(rejectsAt(input, 'look.grade').message, 'is required')
  })

  test('rejects an empty negative prompt', () => {
    accepts(raw({ look: makeLook({ negativePrompt: 'text' }) }), 'a negative prompt')
    rejectsAt(raw({ look: makeLook({ negativePrompt: '' }) }), 'look.negativePrompt')
  })

  test('rejects a look field that is not a string', () => {
    const input = raw()
    nested(input, 'look')['lens'] = 35
    strictEqual(rejectsAt(input, 'look.lens').message, 'must be a string')
  })

  test('rejects a look that is not an object', () => {
    const input = raw()
    input['look'] = 'wet neon'
    strictEqual(rejectsAt(input, 'look').message, 'must be an object')
  })
})

describe('casting', () => {
  test('accepts an empty cast and a cast with entries', () => {
    accepts(
      raw({ casting: [], shots: [makeCaptureShot({ index: 0, startSeconds: 0 })] }),
      'no cast',
    )
    accepts(raw(), 'one casting entry')
  })

  test('accepts an id of lowercase letters, digits and hyphens', () => {
    accepts(
      raw({
        casting: [makeCastingEntry({ id: 'courier-2' })],
        shots: [makeCaptureShot({ index: 0, startSeconds: 0 })],
      }),
      'a hyphenated id',
    )
  })

  test('rejects an id carrying anything else', () => {
    const input = raw({ casting: [makeCastingEntry({ id: 'Courier' })] })
    rejectsAt(input, 'casting[0].id')
  })

  test('rejects an id longer than sixty four characters', () => {
    accepts(
      raw({
        casting: [makeCastingEntry({ id: 'c'.repeat(64) })],
        shots: [makeCaptureShot({ index: 0, startSeconds: 0 })],
      }),
      'sixty four characters',
    )
    rejectsAt(raw({ casting: [makeCastingEntry({ id: 'c'.repeat(65) })] }), 'casting[0].id')
  })

  test('rejects a description shorter than three characters', () => {
    accepts(raw({ casting: [makeCastingEntry({ description: 'she' })] }), 'three characters')
    rejectsAt(raw({ casting: [makeCastingEntry({ description: 'sh' })] }), 'casting[0].description')
  })

  test('rejects two entries sharing an id', () => {
    const twice = raw({
      casting: [makeCastingEntry(), makeCastingEntry({ description: 'The same courier again' })],
    })
    strictEqual(
      rejectsAt(twice, 'casting[1].id').message,
      "must be unique, 'courier' is already used",
    )
    accepts(
      raw({ casting: [makeCastingEntry(), makeCastingEntry({ id: 'counter-hand' })] }),
      'two different ids',
    )
  })

  test('rejects a casting entry that is not an object', () => {
    const input = raw()
    input['casting'] = ['courier']
    strictEqual(rejectsAt(input, 'casting[0]').message, 'must be an object')
  })
})

describe('shots', () => {
  test('accepts one shot and twelve', () => {
    accepts(raw({ shots: [makeGeneratedShot()] }), 'one shot')
    const twelve = Array.from({ length: 12 }, (_, index) =>
      makeGeneratedShot({ index, startSeconds: index * 2, durationSeconds: 2 }),
    )
    accepts(raw({ shots: twelve, durationSeconds: 24 }), 'twelve shots')
  })

  test('rejects no shots at all', () => {
    rejectsAt(raw({ shots: [] }), 'shots')
  })

  test('rejects thirteen shots', () => {
    const thirteen = Array.from({ length: 13 }, (_, index) =>
      makeGeneratedShot({ index, startSeconds: index * 2, durationSeconds: 2 }),
    )
    rejectsAt(raw({ shots: thirteen, durationSeconds: 26 }), 'shots')
  })

  test('rejects shots that are not an array', () => {
    const input = raw()
    input['shots'] = { one: makeGeneratedShot() }
    strictEqual(rejectsAt(input, 'shots').message, 'must be an array')
  })

  test('rejects a shot that is not an object', () => {
    const input = raw()
    input['shots'] = ['a shot']
    strictEqual(rejectsAt(input, 'shots[0]').message, 'must be an object')
  })
})

describe('shot indexes', () => {
  test('accepts indexes that are contiguous and ascending', () => {
    accepts(
      raw({
        shots: [
          makeGeneratedShot({ index: 0, startSeconds: 0 }),
          makeGeneratedShot({ index: 1, startSeconds: 4 }),
          makeGeneratedShot({ index: 2, startSeconds: 8 }),
        ],
        durationSeconds: 12,
      }),
      'three shots in order',
    )
  })

  test('rejects a gap in the indexes', () => {
    const input = raw()
    shotAt(input, 1)['index'] = 2
    rejectsAt(input, 'shots[1].index')
  })

  test('rejects indexes that descend', () => {
    const input = raw()
    shotAt(input, 0)['index'] = 1
    shotAt(input, 1)['index'] = 0
    strictEqual(
      rejectsAt(input, 'shots[1].index').message,
      'must be greater than the index before it, 1',
    )
  })

  test('rejects indexes that do not start at zero', () => {
    const input = raw()
    shotAt(input, 0)['index'] = 1
    shotAt(input, 1)['index'] = 2
    strictEqual(rejectsAt(input, 'shots[0].index').message, 'must start at 0, it is 1')
  })
})

describe('shot fields', () => {
  test('accepts a shot duration of one second and of ten', () => {
    accepts(raw({ shots: [makeGeneratedShot({ durationSeconds: 1 })] }), 'one second')
    accepts(
      raw({ shots: [makeGeneratedShot({ durationSeconds: 10 })], durationSeconds: 10 }),
      'ten seconds',
    )
  })

  test('rejects a shot shorter than one second or longer than ten', () => {
    rejectsAt(
      raw({ shots: [makeGeneratedShot({ durationSeconds: 0.5 })] }),
      'shots[0].durationSeconds',
    )
    rejectsAt(
      raw({ shots: [makeGeneratedShot({ durationSeconds: 11 })] }),
      'shots[0].durationSeconds',
    )
  })

  test('rejects a start before zero', () => {
    accepts(raw({ shots: [makeGeneratedShot({ startSeconds: 0 })] }), 'a start of zero')
    rejectsAt(raw({ shots: [makeGeneratedShot({ startSeconds: -1 })] }), 'shots[0].startSeconds')
  })

  test('holds the beat between three and two hundred characters', () => {
    accepts(raw({ shots: [makeGeneratedShot({ beat: 'she waits' })] }), 'a short beat')
    rejectsAt(raw({ shots: [makeGeneratedShot({ beat: 'no' })] }), 'shots[0].beat')
    rejectsAt(raw({ shots: [makeGeneratedShot({ beat: 'b'.repeat(201) })] }), 'shots[0].beat')
  })

  test('takes a caption of a string or null', () => {
    accepts(raw({ shots: [makeGeneratedShot({ caption: 'the last delivery' })] }), 'a caption')
    accepts(raw({ shots: [makeGeneratedShot({ caption: null })] }), 'no caption')
    const input = raw()
    shotAt(input, 0)['caption'] = 12
    strictEqual(rejectsAt(input, 'shots[0].caption').message, 'must be a string or null')
  })

  test('takes a seed of zero or more, whole', () => {
    accepts(raw({ shots: [makeGeneratedShot({ seed: 0 })] }), 'a seed of zero')
    rejectsAt(raw({ shots: [makeGeneratedShot({ seed: -1 })] }), 'shots[0].seed')
    rejectsAt(raw({ shots: [makeGeneratedShot({ seed: 1.5 })] }), 'shots[0].seed')
  })

  test('takes approved as a boolean', () => {
    accepts(raw({ shots: [makeGeneratedShot({ approved: true })] }), 'an approved shot')
    const input = raw()
    shotAt(input, 0)['approved'] = 'yes'
    strictEqual(rejectsAt(input, 'shots[0].approved').message, 'must be a boolean')
  })

  test('rejects a shot with a field missing', () => {
    const input = raw()
    delete shotAt(input, 0)['motionPrompt']
    strictEqual(rejectsAt(input, 'shots[0].motionPrompt').message, 'is required')
  })
})

describe('a shot source and what it carries', () => {
  test('accepts every source in the set', () => {
    for (const source of SHOT_SOURCES) {
      strictEqual(typeof source, 'string')
    }
    accepts(raw({ shots: [makeGeneratedShot()] }), 'a generated shot')
    accepts(raw({ shots: [makeCaptureShot({ index: 0, startSeconds: 0 })] }), 'a captured shot')
  })

  test('rejects a source outside the set', () => {
    const input = raw()
    shotAt(input, 0)['source'] = 'imported'
    strictEqual(
      rejectsAt(input, 'shots[0].source').message,
      "must be one of 'generated', 'capture'",
    )
  })

  test('accepts a captured shot with a path and no prompt', () => {
    accepts(
      raw({
        shots: [makeCaptureShot({ index: 0, startSeconds: 0, capturePath: 'stills/one.png' })],
      }),
      'a captured shot',
    )
  })

  test('rejects a captured shot with no capture path', () => {
    const input = raw()
    const shot = shotAt(input, 1)
    shot['capturePath'] = null
    strictEqual(
      rejectsAt(input, 'shots[1].capturePath').message,
      "must be a non empty string when source is 'capture'",
    )
  })

  test('rejects a captured shot carrying a prompt', () => {
    const input = raw()
    const shot = shotAt(input, 1)
    shot['prompt'] = makePrompt()
    strictEqual(
      rejectsAt(input, 'shots[1].prompt').message,
      "must be null when source is 'capture'",
    )
  })

  test('rejects a generated shot with no prompt', () => {
    const input = raw()
    shotAt(input, 0)['prompt'] = null
    strictEqual(
      rejectsAt(input, 'shots[0].prompt').message,
      "must be an object when source is 'generated'",
    )
  })

  test('rejects a generated shot carrying a capture path', () => {
    const input = raw()
    shotAt(input, 0)['capturePath'] = 'captures/one.png'
    strictEqual(
      rejectsAt(input, 'shots[0].capturePath').message,
      "must be null when source is 'generated'",
    )
  })
})

describe('a shot prompt', () => {
  test('accepts every part filled in', () => {
    accepts(raw({ shots: [makeGeneratedShot({ prompt: makePrompt() })] }), 'a whole prompt')
  })

  test('rejects a part that is missing', () => {
    const input = raw()
    delete nested(shotAt(input, 0), 'prompt')['scene']
    strictEqual(rejectsAt(input, 'shots[0].prompt.scene').message, 'is required')
  })

  test('rejects a part that is empty', () => {
    const input = raw()
    nested(shotAt(input, 0), 'prompt')['entity'] = '   '
    strictEqual(rejectsAt(input, 'shots[0].prompt.entity').message, 'must not be empty')
  })

  test('accepts an assembled prompt of eighty words and of a hundred and twenty', () => {
    accepts(
      raw({
        shots: [makeGeneratedShot({ prompt: makePrompt({ assembled: assembledOfWords(80) }) })],
      }),
      'eighty words',
    )
    accepts(
      raw({
        shots: [makeGeneratedShot({ prompt: makePrompt({ assembled: assembledOfWords(120) }) })],
      }),
      'a hundred and twenty words',
    )
  })

  test('rejects an assembled prompt of seventy nine words', () => {
    const input = raw({
      shots: [makeGeneratedShot({ prompt: makePrompt({ assembled: assembledOfWords(79) }) })],
    })
    strictEqual(
      rejectsAt(input, 'shots[0].prompt.assembled').message,
      'must hold between 80 and 120 words, it holds 79',
    )
  })

  test('rejects an assembled prompt of a hundred and twenty one words', () => {
    const input = raw({
      shots: [makeGeneratedShot({ prompt: makePrompt({ assembled: assembledOfWords(121) }) })],
    })
    strictEqual(
      rejectsAt(input, 'shots[0].prompt.assembled').message,
      'must hold between 80 and 120 words, it holds 121',
    )
  })

  test('counts words the way whitespace separates them', () => {
    strictEqual(countWords('  two   words \n'), 2)
    strictEqual(countWords(''), 0)
  })
})

describe('castingIds on a shot', () => {
  test('accepts an id that matches a casting entry, and an empty list', () => {
    accepts(raw({ shots: [makeGeneratedShot({ castingIds: ['courier'] })] }), 'a matching id')
    accepts(raw({ shots: [makeGeneratedShot({ castingIds: [] })] }), 'no ids')
  })

  test('rejects an id that matches no casting entry', () => {
    const input = raw({ shots: [makeGeneratedShot({ castingIds: ['ghost'] })] })
    strictEqual(
      rejectsAt(input, 'shots[0].castingIds[0]').message,
      "must match a casting id, 'ghost' does not",
    )
  })

  test('rejects an id that is not a string', () => {
    const input = raw()
    shotAt(input, 0)['castingIds'] = [7]
    strictEqual(rejectsAt(input, 'shots[0].castingIds[0]').message, 'must be a string')
  })
})

describe('render', () => {
  test('accepts whole settings', () => {
    accepts(raw({ render: makeRender() }), 'the default render settings')
  })

  test('accepts a width and height that are multiples of sixty four', () => {
    accepts(raw({ render: makeRender({ width: 64, height: 64 }) }), 'the smallest frame')
    accepts(raw({ render: makeRender({ width: 2048, height: 2048 }) }), 'the largest frame')
  })

  test('rejects a width that is not a multiple of sixty four', () => {
    strictEqual(
      rejectsAt(raw({ render: makeRender({ width: 100 }) }), 'render.width').message,
      'must be a multiple of 64',
    )
  })

  test('rejects a height that is not a multiple of sixty four', () => {
    strictEqual(
      rejectsAt(raw({ render: makeRender({ height: 1000 }) }), 'render.height').message,
      'must be a multiple of 64',
    )
  })

  test('rejects a frame outside sixty four to two thousand and forty eight', () => {
    rejectsAt(raw({ render: makeRender({ width: 0 }) }), 'render.width')
    rejectsAt(raw({ render: makeRender({ height: 2112 }) }), 'render.height')
  })

  test('rejects an empty model name', () => {
    accepts(raw({ render: makeRender({ model: 'a-model' }) }), 'a model name')
    rejectsAt(raw({ render: makeRender({ model: '' }) }), 'render.model')
  })

  test('holds steps between one and a hundred', () => {
    accepts(raw({ render: makeRender({ steps: 1 }) }), 'one step')
    accepts(raw({ render: makeRender({ steps: 100 }) }), 'a hundred steps')
    rejectsAt(raw({ render: makeRender({ steps: 0 }) }), 'render.steps')
    rejectsAt(raw({ render: makeRender({ steps: 101 }) }), 'render.steps')
  })

  test('holds frames between one and a hundred and twenty one', () => {
    accepts(raw({ render: makeRender({ frames: 1 }) }), 'one frame')
    accepts(raw({ render: makeRender({ frames: 121 }) }), 'a hundred and twenty one frames')
    rejectsAt(raw({ render: makeRender({ frames: 122 }) }), 'render.frames')
  })

  test('holds fps between one and sixty', () => {
    accepts(raw({ render: makeRender({ fps: 60 }) }), 'sixty frames a second')
    rejectsAt(raw({ render: makeRender({ fps: 61 }) }), 'render.fps')
  })

  test('takes a models directory of a string or null', () => {
    accepts(raw({ render: makeRender({ modelsDir: '~/models' }) }), 'a models directory')
    accepts(raw({ render: makeRender({ modelsDir: null }) }), 'no models directory')
    const input = raw()
    nested(input, 'render')['modelsDir'] = 3
    strictEqual(rejectsAt(input, 'render.modelsDir').message, 'must be a string or null')
  })

  test('rejects a render setting that is missing', () => {
    const input = raw()
    delete nested(input, 'render')['fps']
    strictEqual(rejectsAt(input, 'render.fps').message, 'is required')
  })
})

describe('outputPath', () => {
  test('takes a path or null', () => {
    accepts(raw({ outputPath: 'reel.mp4' }), 'a path')
    accepts(raw({ outputPath: null }), 'no path yet')
  })

  test('rejects anything else', () => {
    const input = raw()
    input['outputPath'] = false
    strictEqual(rejectsAt(input, 'outputPath').message, 'must be a string or null')
  })
})

describe('what an accepted manifest hands back', () => {
  test('gives the manifest back, typed', () => {
    const result = validateManifest(raw())
    if (!result.ok) {
      throw new Error(`expected an accept, got ${JSON.stringify(result.errors)}`)
    }
    const manifest: ReelManifest = result.manifest
    strictEqual(manifest.shots.length, 2)
    strictEqual(manifest.shots[0]?.source, 'generated')
  })

  test('gives every error at once, not only the first', () => {
    const input = raw()
    delete input['idea']
    delete input['goal']
    const result = validateManifest(input)
    if (result.ok) {
      throw new Error('expected a rejection')
    }
    deepStrictEqual(result.errors.map((error) => error.path).sort(), ['goal', 'idea'])
  })
})
