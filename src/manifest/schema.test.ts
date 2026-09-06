import { describe, test } from 'node:test'
import { deepStrictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  makeCaptureShot,
  makeCastingEntry,
  makeLook,
  makeManifest,
  makePrompt,
  makeRender,
} from './fixture.ts'
import { ASPECTS, GOALS, SHOT_SOURCES } from './types.ts'

type Raw = Record<string, unknown>

const schemaPath = new URL('../../schema/reel.schema.json', import.meta.url)
const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as Raw

function at(root: Raw, path: readonly string[]): Raw {
  let current: Raw = root
  for (const key of path) {
    const next = current[key]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      throw new Error(`the schema has no object at ${path.join('.')}`)
    }
    current = next as Raw
  }
  return current
}

function requiredOf(node: Raw): string[] {
  const required = node['required']
  if (!Array.isArray(required)) throw new Error('the schema node has no required list')
  return [...required].map(String).sort()
}

function enumOf(node: Raw): string[] {
  const values = node['enum']
  if (!Array.isArray(values)) throw new Error('the schema node has no enum')
  return values.map(String)
}

function keysOf(value: object): string[] {
  return Object.keys(value).sort()
}

describe('the schema file stays in step with the types', () => {
  test('requires every top level field the manifest carries', () => {
    deepStrictEqual(requiredOf(schema), keysOf(makeManifest()))
  })

  test('requires every field of look, casting, a shot, a prompt and render', () => {
    deepStrictEqual(requiredOf(at(schema, ['$defs', 'look'])), keysOf(makeLook()))
    deepStrictEqual(requiredOf(at(schema, ['$defs', 'castingEntry'])), keysOf(makeCastingEntry()))
    deepStrictEqual(requiredOf(at(schema, ['$defs', 'shot'])), keysOf(makeCaptureShot()))
    deepStrictEqual(requiredOf(at(schema, ['$defs', 'shotPrompt'])), keysOf(makePrompt()))
    deepStrictEqual(requiredOf(at(schema, ['$defs', 'render'])), keysOf(makeRender()))
  })

  test('carries the same sets the types carry', () => {
    deepStrictEqual(enumOf(at(schema, ['properties', 'goal'])), [...GOALS])
    deepStrictEqual(enumOf(at(schema, ['properties', 'aspect'])), [...ASPECTS])
    deepStrictEqual(enumOf(at(schema, ['$defs', 'shot', 'properties', 'source'])), [
      ...SHOT_SOURCES,
    ])
  })
})

describe('the documented example', () => {
  test('is the manifest the fixture builder makes', () => {
    const doc = readFileSync(new URL('../../docs/manifest.md', import.meta.url), 'utf8')
    const block = doc.split('```json')[1]?.split('```')[0]
    if (block === undefined) throw new Error('docs/manifest.md holds no json example')
    deepStrictEqual(JSON.parse(block), JSON.parse(JSON.stringify(makeManifest())))
  })
})
