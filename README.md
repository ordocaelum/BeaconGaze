# BeaconGaze — Scroll-Cinematic Celestial Platform

An ultra-premium, scroll-driven metaphysical experience: a Three.js deep-space
descent, a live locally-computed natal chart engine, GSAP ScrollTrigger
choreography, and a Higgsfield Cinema Studio hero film scrubbed by the wheel.

## Run it
Any static host works. Locally:

    python3 -m http.server 8080
    # open http://localhost:8080

GitHub Pages: push this folder to the repo root (index.html at top level),
enable Pages on main.

## The cinematic sequences
`SEQUENCES` at the top of the inline script in index.html holds three slots:

- `hero` — LIVE. Higgsfield Cinema Studio sequence, scroll-scrubbed.
- `alignments`, `blueprint` — paste their CDN URLs in once generated
  (they mount, lazy-load and fade in automatically).

## Slicing footage into optimized scroll frames
By default the hero scrubs the 1080p master directly (smoothed currentTime
seeking). For the pre-sliced frame-sequence variant (zero seek latency):

    ./scripts/slice-frames.sh "<video url or file>" hero 120

This writes `assets/frames/hero/*.webp` + `manifest.json`; the site detects the
manifest on load and switches to canvas frame scrubbing automatically. Repeat
with `alignments` / `blueprint` for the other sequences.

## The astro engine
All chart math runs locally in the browser (no network, no data leaves the
page): Julian day, solar/lunar longitudes (Meeus truncations, verified to
<0.1 deg), Mercury-Saturn via J2000 Keplerian elements, ascendant from local
sidereal time, equal houses, major aspects with orbs, elemental spectrum.

## Structure
- `index.html`   — the entire experience (styles, markup, engine)
- `scripts/slice-frames.sh` — footage -> scroll-frame pipeline (ffmpeg)
- `design-brief.md` — the locked design contract
