# Prompts

Eight rules for writing a prompt this model answers well. Each rule carries the observation that
produced it. Read the observation. A rule with its reason attached survives. A bare rule does not.
The next person who meets an odd frame needs to know which rule to reach for.

All of the observations below come from the reference machine described in
[measurements.md](measurements.md). They were observed on 5 September 2026.

## Rule one. Use the published clause order

Write the clauses in this order: entity, then scene, then motion, then aesthetic control, then
style.

Why: this is the order the model's own documentation gives.

## Rule two. Keep the assembled prompt between 80 and 120 words

Count the words after you join the clauses, not before.

Why: a shorter prompt loses control of the frame. A longer prompt dilutes it.

## Rule three. One subject, one action

Give the frame one actor. Give that actor one verb. Split a two actor idea into two shots.

Why: a prompt that names two people, each carrying a verb, loses the second one. One prompt asked
for a person snoring and another person lying awake beside him. It produced two sleeping people. A
second attempt with different wording produced the same fault. Making one person the only actor
fixed it in a single attempt.

## Rule four. Use at most one darkness cue

Name night once. Then describe the light source that lights the subject.

Why: one prompt carried five darkness cues at once: dark, quiet, night, moonlight and muted colour
palette. The frame came back with a mean luminance of 23.8 out of 255. No subject was visible in it
at all.

## Rule five. Never put a lighting condition in the negative prompt

The negative prompt is for artifacts. Keep light out of it.

Why: one prompt put bright daylight in the negative. That drove the underexposure in rule four. It
cost an hour of diagnosis on a clip, and the fault was in the prompt.

## Rule six. State the casting explicitly

Name the appearance of the people you want to see.

Why: the generator is trained largely on Chinese data. It defaults to Chinese subjects, rooms and
styling when the prompt leaves appearance unstated. It infers nothing about casting from the rest
of the prompt. Naming the casting changes it immediately.

## Rule seven. Keep hands out of frame unless hands are the subject

Put the arms out of shot. Add `hands, fingers` to the negative prompt.

Why: hands malform at this model size. A hand raised to an ear came out as a mitten with merged
fingers, in the centre of the frame. The two changes above fixed it in one attempt.

## Rule eight. Name the white balance

Ask for neutral white balance and natural colour. Add `blue colour cast, teal grade` to the
negative prompt.

Why: a colour temperature written as a mood produces a colour cast rather than light. Blue
moonlight gave a heavy blue wash over the whole frame. The wording above gave light instead.

## The standard negative prompt

Use this negative prompt for every shot.

```text
morphing, warping, distortion, blurry, soft focus, low quality, low resolution,
face deformation, deformed mouth, eye distortion, extra fingers, extra limbs,
plastic skin, waxy skin, flat lighting, stock photo, underexposed, text,
watermark, cartoon
```

Add `hands, fingers` when hands are not the subject.

Add `blue colour cast, teal grade, heavy colour grade` for a night scene.

Nothing else goes in the negative prompt. Rule five says why.

## The rules in code

`src/prompt/` holds these rules as code. The assembler in `assemble.ts` joins the five clauses and
builds the negative prompt. It does not judge. The checker in `check.ts` judges any prompt, and it
returns a list of findings. Each finding names one rule identifier. The list below says which rule
each identifier enforces, so a reader who gets a finding can find the rule it comes from.

- `order` enforces rule one.
- `length` enforces rule two. It counts a word as a run of characters with no whitespace in it.
- `one-actor` enforces rule three.
- `darkness` enforces rule four.
- `negative-lighting` enforces rule five.
- `casting-stated` enforces rule six.
- `hands` enforces rule seven.
- `white-balance` enforces rule eight.
- `standard-negative` enforces the standard negative prompt above.

The term lists live in `src/prompt/terms.ts`. A test reads this page and holds the lists against
that file, so the document and the code cannot drift apart.
