# Measurements

Every number in this repository comes from one machine. This page names that machine, the software
it ran, and the date. A later reader can then tell whether the numbers still apply.

These are one machine's numbers. They are not a specification. Measure your own hardware before you
plan around any of them. Add your numbers to this page beside these, with your machine and your
date.

## The reference machine

- Apple M4 Max.
- 32 graphics cores.
- 36 gigabytes unified memory.
- macOS, Darwin 24.6.
- Draw Things 1.20260716.0.
- `draw-things-cli` 1.20260716.0.
- Measured on 5 September 2026, except where a line below carries its own date.

## Stills

- 704 by 1280, 20 steps. 44.5 seconds in total. 1.71 seconds for each sampling step.
- 704 by 1280, 20 steps. 46.86 seconds in total. 1.70 seconds for each sampling step. Measured on 6
  September 2026. This is a second observation of the line above, not a replacement for it.
- 768 by 1344, 40 steps. 102.8 seconds in total. 2.27 seconds for each sampling step. Peak memory
  footprint 5.9 gigabytes.

## Clips

- 704 by 1280, 121 frames at 24 frames per second, 20 steps. 3851 seconds in total. Peak memory
  footprint 18.3 gigabytes. Zero swaps.

## The ratio

A clip costs about 40 times a still. This ratio is why the tool renders stills first, and why it
gates on them. An approval on a still is cheap. A clip is not.

## The two phases inside a clip run

The load has two phases. The numbers below come from the graphics counters, sampled every 20
seconds during the clip run above.

- Sampling. Graphics utilisation holds at 99 to 100 per cent. Memory stays near 3.5 gigabytes.
- Decoding. Graphics utilisation drops to between 25 and 60 per cent. Memory climbs to 13.1
  gigabytes.

The decoder sets the memory ceiling, not the sampler. A run can look comfortable for 57 minutes and
still run out of memory at the end.
