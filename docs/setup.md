# Setup

How to install the renderer and the models on your own machine, what a working run looks like, and
what it costs. Follow it in order. At the end you render one still.

## Requirements

You need a Mac with an Apple Silicon processor. An Intel Mac cannot run this.

The renderer draws through Metal, which is Apple's own graphics interface. It does not use CUDA. No
NVIDIA card is involved, and you cannot add one.

Apple Silicon has unified memory. The graphics processor and the operating system share one pool of
memory. There is no separate video memory. The model therefore takes its memory from the same pool
as your browser, your editor and everything else you leave open.

That matters when you decide whether your machine will cope. On the reference machine, which has 36
gigabytes, a still reached a peak memory footprint of 5.9 gigabytes and a clip reached 18.3
gigabytes. Both numbers are measured, on 5 September 2026. So a still is comfortable on a small
machine. A clip needs most of a large one. Close your other large applications before you render a
clip. If the machine runs short, macOS moves memory to disk and the run becomes much slower.

## Install

Install two Homebrew packages.

```sh
brew install --cask draw-things
brew install draw-things-cli
```

The cask installs Draw Things, the application. It gives you a window, a model browser and a
canvas. Use it to look at models and to try a prompt by hand.

The formula installs `draw-things-cli`, the command line tool. It renders from one command, so a
script can drive it. Reel Stitch calls this tool and nothing else.

You do not need the application to run the command line tool. The tool renders on its own. Install
the application anyway if you want somewhere to experiment.

## Models

Three files do the work.

- `wan_v2.2_5b_ti2v_q8p.ckpt`, 5.0 gigabytes. The generator. It makes the picture.
- `umt5_xxl_encoder_q8p.ckpt`, 6.4 gigabytes. The text encoder. It reads the prompt and produces
  the vectors the generator conditions on. It is larger than the generator. It runs once for each
  generation, not once for each sampling step. It is multilingual.
- `wan_v2.2_video_vae_f16.ckpt`, 1.3 gigabytes. The video decoder. It turns the frames the
  generator works on into pixels.

The three come to about 13 gigabytes.

The generator pulls the text encoder and the video decoder on the first generation. It does not
pull them when you first fetch the generator. So your first generation runs far longer than the
step count suggests, and most of that time is network, not graphics.

Fetch all three before you generate anything.

```sh
draw-things-cli models ensure --model wan_v2.2_5b_ti2v_q8p.ckpt
```

That command takes the dependencies with it. Let it finish. Read the second trap below for what
happens if you do not.

The models directory on macOS is here.

```
~/Library/Containers/com.liuliu.draw-things/Data/Documents/Models
```

## Verify it works

This command renders one frame.

```sh
draw-things-cli generate \
  --model wan_v2.2_5b_ti2v_q8p.ckpt \
  --prompt "a lighthouse keeper counts ships from a balcony at dawn, wide shot" \
  --width 704 \
  --height 1280 \
  --steps 20 \
  --frames 1 \
  --seed 42 \
  --output still.png
```

Pass `--frames 1`. The generator is a video model, so without a frame count it writes several
numbered files instead of one still. Keep the width and the height as multiples of 64.

A successful run prints these things, in this order.

- The models directory it is using.
- One line for each file it still has to fetch.
- A progress bar that counts the sampling steps. It redraws itself in place.
- The path it wrote.
- A timing summary. It gives the total time and the average time for one sampling step.

Those last two numbers are the ones this repository records.

The lines below give the shape of that output. They are not a capture of one run, and the numbers
change with every machine.

```
Models directory: /Users/you/Library/Containers/com.liuliu.draw-things/Data/Documents/Models
Sampling... 20 / 20 [██████████████████████] 100%
Wrote: /Users/you/still.png
Generation timing:
  Total generation time (including model loading): 44.50 s
  Sampling step time (20 step(s)): avg 1.71 s
```

You now have `still.png` in the directory you ran the command from. If you see it, the renderer
works.

Expect about 44.5 seconds for this command on the reference machine. Expect much longer the first
time, because the models arrive during that run.

## Costs, measured

These are measurements taken on the reference machine on 5 September 2026. They are not a
specification, and your machine will give you different numbers. The reference machine is an Apple
M4 Max. It has 32 graphics cores and 36 gigabytes of unified memory. It runs macOS, Darwin 24.6,
with Draw Things 1.20260716.0 and `draw-things-cli` 1.20260716.0.

- Still, 704 by 1280, 20 steps. 44.5 seconds in total. 1.71 seconds for each sampling step.
- Still, 768 by 1344, 40 steps. 102.8 seconds in total. 2.27 seconds for each sampling step. Peak
  memory footprint 5.9 gigabytes.
- Clip, 704 by 1280, 121 frames at 24 frames per second, 20 steps. 3851 seconds in total. Peak
  memory footprint 18.3 gigabytes. Zero swaps.

A clip costs about 40 times a still. That ratio is why the tool renders stills first and gates on
them.

Inside a clip run the load has two phases. The numbers come from the graphics counters, sampled
every 20 seconds. Sampling holds graphics utilisation at 99 to 100 per cent using about 3.5
gigabytes. Decoding then drops utilisation to between 25 and 60 per cent while memory climbs to
13.1 gigabytes. So the decoder sets the memory ceiling, not the sampler. A run that looks
comfortable for 57 minutes can still run out of memory at the end.

Every measured number this repository holds is in [measurements.md](measurements.md), with the
machine and the date beside it.

## Known traps

**No upscaler exists in the catalogue.** `draw-things-cli models list` returns 365 models. None of
them enlarges an image. Render at a size the model is comfortable with, then enlarge the result
with something else. This is a real limit of the tool chain. There is no upscale step to add.

**Two downloader processes racing kills one of them.** If you start a generation while a model
fetch is still running, both processes write the same temporary files. One of them finishes a file
and renames it. The other then fails with `Error: The file "<name>.ckpt.partial" doesn't exist` and
exits with a non zero status. Fetch the models to completion first. Then generate.

**The command line tool prints no progress when it is not attached to a terminal.** Redirect the
output to a file and that file stays empty for the whole run. Run the command in the background and
you get the same result. You see no step counter and no estimate of the time left. Run it in a
terminal. If you cannot, set an explicit step count in advance. You can then work the cost out from
the time for one step.

**Metal does not implement the Float8_e4m3fn type.** A checkpoint quantised to that format fails on
Apple Silicon. This one is reported by others, not measured here. It was read in published accounts
and it was never reproduced on the reference machine.
