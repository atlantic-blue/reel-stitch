export type {
  Aspect,
  CaptureShot,
  CastingEntry,
  GeneratedShot,
  Goal,
  Look,
  ReelManifest,
  Render,
  Shot,
  ShotPrompt,
  ShotSource,
} from './types.ts'
export { ASPECTS, GOALS, SCHEMA_VERSION, SHOT_SOURCES } from './types.ts'
export type { ValidationError, ValidationResult } from './validate.ts'
export { countWords, validateManifest } from './validate.ts'
export {
  assembledOfWords,
  makeCaptureShot,
  makeCastingEntry,
  makeGeneratedShot,
  makeLook,
  makeManifest,
  makePrompt,
  makeRender,
} from './fixture.ts'
