/**
 * The shape of `reel.json`, the one file every command reads and writes.
 *
 * One directory holds one reel. The manifest sits beside the media it names, and every path
 * inside it is relative to that directory.
 */

/** What the reel is for. */
export type Goal = 'act' | 'reach' | 'explain'

/** The frame shape of the finished video. */
export type Aspect = '9:16' | '1:1' | '16:9'

/** Where a shot's still comes from. */
export type ShotSource = 'generated' | 'capture'

/** The visual rules that hold across every shot in the reel. */
export interface Look {
  palette: string
  lens: string
  lighting: string
  grade: string
  filmStock: string
  /** What no shot may contain. Never empty. */
  negativePrompt: string
}

/** A person, place or object that more than one shot can name. */
export interface CastingEntry {
  /** Lowercase letters, digits and hyphens. Unique within the reel. */
  id: string
  description: string
}

/** The text a still model reads for one shot. */
export interface ShotPrompt {
  entity: string
  scene: string
  motion: string
  aesthetic: string
  style: string
  /** The five above joined in that order, between 80 and 120 words. */
  assembled: string
  negative: string
}

/** The fields every shot carries, whatever its source. */
interface ShotBase {
  /** Position in the reel, counted from zero. */
  index: number
  startSeconds: number
  durationSeconds: number
  /** What this shot does for the story. */
  beat: string
  caption: string | null
  motionPrompt: string | null
  seed: number
  stillPath: string | null
  clipPath: string | null
  approved: boolean
  /** Ids of casting entries this shot uses. */
  castingIds: string[]
}

/** A shot whose still a model draws. */
export interface GeneratedShot extends ShotBase {
  source: 'generated'
  capturePath: null
  prompt: ShotPrompt
}

/** A shot whose still the user supplies. */
export interface CaptureShot extends ShotBase {
  source: 'capture'
  capturePath: string
  prompt: null
}

export type Shot = GeneratedShot | CaptureShot

/** The settings the local models run under. */
export interface Render {
  model: string
  /** A multiple of 64, from 64 to 2048. */
  width: number
  /** A multiple of 64, from 64 to 2048. */
  height: number
  steps: number
  frames: number
  fps: number
  modelsDir: string | null
}

export interface ReelManifest {
  /** Semantic version of the manifest shape. */
  schemaVersion: string
  /** A ULID, made when the reel is planned. */
  id: string
  /** An RFC 3339 timestamp. */
  createdAt: string
  idea: string
  goal: Goal
  aspect: Aspect
  durationSeconds: number
  look: Look
  casting: CastingEntry[]
  /** One to twelve shots, indexed from zero, contiguous and ascending. */
  shots: Shot[]
  render: Render
  /** The finished video. Null until a later slice cuts it. */
  outputPath: string | null
}

/** The manifest shape this slice describes. */
export const SCHEMA_VERSION = '1.0.0'

export const GOALS: readonly Goal[] = ['act', 'reach', 'explain']
export const ASPECTS: readonly Aspect[] = ['9:16', '1:1', '16:9']
export const SHOT_SOURCES: readonly ShotSource[] = ['generated', 'capture']
