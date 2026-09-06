# Commands

One command exists today. It renders one shot to a still.

## reel still

```sh
reel still --shot 0
```

The command reads `reel.json`, renders the shot you name, and writes the path of the still back
into the file. It renders one shot. Run it again for the next shot.

A still is the cheap artifact this tool is built around. On the reference machine a still costs
102.8 seconds and a clip costs 3851 seconds, so every judgement happens on a still. See
[measurements.md](measurements.md) for both numbers.

### Flags

- `--manifest <path>`. The `reel.json` to read and write. It defaults to `./reel.json`.
- `--shot <index>`. The shot to render. This is the shot's `index` field, not its position in the
  array. Required.
- `--timeout-seconds <number>`. Kill the renderer after this many seconds. There is no default.
  The first run fetches about 13 gigabytes of model files, and that duration depends on a network
  nobody has measured. Pick your own number, or leave the flag out and let the run take as long as
  it takes.
- `--help`. Print the usage and stop.

An unknown flag is refused by name, and nothing runs.

### What it does, in order

1. It reads the manifest and validates it. Any error is printed with its field path, and the
   renderer is never called.
2. It finds the shot whose `index` you gave. No match is a refusal that names the indexes the
   manifest does hold.
3. It refuses a shot whose `source` is `capture`. You supply that still yourself, so there is
   nothing to render.
4. It checks the prompt against the eight rules in [prompts.md](prompts.md). Every finding is
   printed with its field path and its rule identifier, and nothing is rendered. Fixing a prompt is
   your job, and the checker exists so a bad prompt costs a second rather than two minutes.
5. It writes the two prompt files, prints the command it is about to run, and runs the renderer.
6. It confirms the still is on disk and is not empty.
7. It sets `stillPath`, validates the manifest again, and writes the file.

Step 6 is not optional. A renderer that exits zero having written nothing is not a success, and the
manifest is left as it was.

### The paths it writes

Every path in the manifest is relative to the directory holding `reel.json`, and the renderer runs
in that directory. The command creates `stills/` when it is absent.

- `stills/shot-NNN.png`. The still. `NNN` is the shot's `index`, padded to three digits.
- `stills/shot-NNN.prompt.txt`. The prompt, exactly as `prompt.assembled` holds it.
- `stills/shot-NNN.negative.txt`. The negative prompt, exactly as `prompt.negative` holds it.

The prompt files are files on disk rather than temporary files on purpose. You can read exactly
what was sent. The command also prints the argument vector it is about to run, so you can copy that
line, paste it and run the same render by hand without this tool.

### The output buffers when you redirect it

The renderer's own output goes straight through, unbuffered and uncaptured. That works in a
terminal, where you get the progress bar as it counts the sampling steps.

Redirect the output to a file and that file stays empty until the process exits. Everything then
arrives at once. Nothing is lost, but you cannot watch a redirected run, so a run that looks hung is
usually a run that is working. [setup.md](setup.md) records the same trap for the renderer on its
own.

### Exit codes

- `0`. The still was rendered and the manifest was written.
- `1`. The command refused before running the renderer: bad arguments, an invalid manifest, no such
  shot, a capture shot, or a prompt with findings.
- `2`. The renderer ran and failed, or produced no file. The manifest is unchanged.

A manifest that fails validation with `stillPath` set also exits `2` and leaves the file alone. That
means the file changed while the render was running.

### Hands cannot be the subject today

The prompt checker asks whether hands are the subject of the shot. The manifest carries no such
field, so this command always answers no, which is the stricter reading and requires
`hands, fingers` in the negative prompt. A shot whose subject really is a pair of hands therefore
cannot pass the check. The manifest is a contract other commands read, so the field is not being
added to solve this.
