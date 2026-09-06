# reel.json

One reel lives in one directory. That directory holds `reel.json` and the media the file names.
Every path in the file is relative to that directory. Each command reads the file, changes one part
of it, and writes it back. You can open the file in an editor at any point.

The types are in `src/manifest/types.ts`. The same shape is in `schema/reel.schema.json`, for other
tools to read. `validateManifest` in `src/manifest/validate.ts` checks a file and returns either the
manifest or a list of errors. Each error gives a field path, for example `shots[2].prompt.assembled`.

Three rules are in the validator only, because JSON Schema cannot say them: shot indexes must be
contiguous and ascending, every id in `castingIds` must match a casting entry, and no two casting
entries may share an id.

## The top level

- `schemaVersion`. The version of this file shape, as a semantic version. Required.
- `id`. A Universally Unique Lexicographically Sortable Identifier, made when you plan the reel.
  Required.
- `createdAt`. The time you planned the reel, as an RFC 3339 timestamp. Required.
- `idea`. The one line the reel came from. 1 to 500 characters. Required.
- `goal`. One of `act`, `reach` or `explain`. Required.
- `aspect`. One of `9:16`, `1:1` or `16:9`. Required.
- `durationSeconds`. How long the finished video runs. A whole number from 5 to 60. Required.
- `look`. The visual rules for the whole reel. Required.
- `casting`. The people, places and objects that more than one shot can name. The list can be empty.
  Required.
- `shots`. 1 to 12 shots. Required.
- `render`. The settings the local models run under. Required.
- `outputPath`. The finished video. It is null until the cut is made. Required.

## look

The look holds the reel together. Every shot obeys it. All six fields are strings, and all are
required.

- `palette`. The colours of the reel.
- `lens`. The lens and the depth of field.
- `lighting`. Where the light comes from.
- `grade`. The colour grade.
- `filmStock`. The film the reel imitates.
- `negativePrompt`. What no shot may contain. It must not be empty.

## casting

Each entry is one person, place or object. A shot names an entry by its id. This keeps the same
face and the same jacket in every shot.

- `id`. 1 to 64 characters. Lowercase letters, digits and hyphens only. It must be unique in the
  reel. Required.
- `description`. 3 to 200 characters. Required.

## shots

The shots are in play order. The first index is 0. Each index is one more than the index before it.

- `index`. The position of the shot, counted from zero. Required.
- `startSeconds`. When the shot starts. 0 or more. Required.
- `durationSeconds`. How long the shot runs. 1 to 10. Required.
- `beat`. What the shot does for the story. 3 to 200 characters. Required.
- `caption`. The text on screen, or null. Required.
- `source`. `generated` if a model draws the still. `capture` if you supply the still. Required.
- `capturePath`. The still you supply. It must be a path when `source` is `capture`. It must be null
  when `source` is `generated`. Required.
- `prompt`. The text the still model reads. It must be an object when `source` is `generated`. It
  must be null when `source` is `capture`. Required.
- `motionPrompt`. How the shot moves, or null. Required.
- `seed`. The seed for the model. A whole number, 0 or more. Required.
- `stillPath`. The still, after you render it, or null. Required.
- `clipPath`. The clip, after you animate it, or null. Required.
- `approved`. True after you approve the still. Required.
- `castingIds`. The casting entries this shot uses. The list can be empty. Each id must match a
  casting entry. Required.

## shots[].prompt

All seven fields are strings. All are required. None may be empty.

- `entity`. Who or what is in the shot.
- `scene`. Where the shot is.
- `motion`. What moves in the shot.
- `aesthetic`. The colour, the light and the texture.
- `style`. The lens, the film and the finish.
- `assembled`. The five fields above joined in that order. It must hold 80 to 120 words. A word is a
  group of characters between spaces.
- `negative`. What this shot may not contain.

## render

- `model`. The model that renders the shot. It must not be empty. Required.
- `width`. 64 to 2048, and a multiple of 64. Required.
- `height`. 64 to 2048, and a multiple of 64. Required.
- `steps`. How many steps the model takes. 1 to 100. Required.
- `frames`. How many frames one clip holds. 1 to 121. Required.
- `fps`. Frames each second. 1 to 60. Required.
- `modelsDir`. Where the model weights are, or null to use the default. Required.

## An example

This is the manifest the fixture builder makes. The tests use it, so it is always valid.

```json
{
  "schemaVersion": "1.0.0",
  "id": "01J8ZQ5X9K7T3M2N4P6R8S0V1W",
  "createdAt": "2026-01-14T09:30:00Z",
  "idea": "a courier makes her last delivery of the night",
  "goal": "act",
  "aspect": "9:16",
  "durationSeconds": 8,
  "look": {
    "palette": "teal shadows, sodium highlights, one red accent",
    "lens": "35mm anamorphic, shallow depth of field",
    "lighting": "wet street practicals, single neon key",
    "grade": "cool shadows, warm skin, lifted blacks",
    "filmStock": "fine grain colour negative",
    "negativePrompt": "text, watermark, extra fingers, blur, low resolution"
  },
  "casting": [
    {
      "id": "courier",
      "description": "A courier in her twenties, short dark hair, green rain jacket"
    }
  ],
  "shots": [
    {
      "index": 0,
      "startSeconds": 0,
      "durationSeconds": 4,
      "beat": "The courier stops under the sign and reads the address on the parcel",
      "caption": null,
      "source": "generated",
      "capturePath": null,
      "prompt": {
        "entity": "A lone courier in a rain slicked jacket, hood down, breath visible, holding a small paper parcel against her chest.",
        "scene": "A narrow market street after midnight, shutters closed, puddles holding the red and green of a single neon sign above a noodle counter.",
        "motion": "She steps forward and turns her head towards the sign, slowing as the camera drifts in at chest height.",
        "aesthetic": "Cool teal shadows, warm sodium highlights, soft rain haze, shallow depth of field, gentle film grain.",
        "style": "Anamorphic thirty five millimetre still, cinematic colour grade, natural skin tones, photographic realism.",
        "assembled": "A lone courier in a rain slicked jacket, hood down, breath visible, holding a small paper parcel against her chest. A narrow market street after midnight, shutters closed, puddles holding the red and green of a single neon sign above a noodle counter. She steps forward and turns her head towards the sign, slowing as the camera drifts in at chest height. Cool teal shadows, warm sodium highlights, soft rain haze, shallow depth of field, gentle film grain. Anamorphic thirty five millimetre still, cinematic colour grade, natural skin tones, photographic realism.",
        "negative": "text, watermark, extra fingers, blur, low resolution"
      },
      "motionPrompt": "slow push in, rain falling, sign flickering once",
      "seed": 1234,
      "stillPath": null,
      "clipPath": null,
      "approved": false,
      "castingIds": ["courier"]
    },
    {
      "index": 1,
      "startSeconds": 4,
      "durationSeconds": 4,
      "beat": "A held shot of the parcel changing hands across the counter",
      "caption": "the last delivery",
      "source": "capture",
      "capturePath": "captures/counter.png",
      "prompt": null,
      "motionPrompt": null,
      "seed": 5678,
      "stillPath": "captures/counter.png",
      "clipPath": null,
      "approved": true,
      "castingIds": []
    }
  ],
  "render": {
    "model": "example-video-model",
    "width": 576,
    "height": 1024,
    "steps": 30,
    "frames": 49,
    "fps": 24,
    "modelsDir": null
  },
  "outputPath": null
}
```
