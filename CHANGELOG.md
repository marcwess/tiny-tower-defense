# Meadow rebuild

One level, built to feel good in the hand. Levels 2 and 3 stay loadable and show as coming soon.

## Feel

- Tap a stone pad for a radial build menu: Turret, Cannon, Frost, Ballista. Tap a tower to upgrade or sell, with a range ring. Tap elsewhere to cancel.
- Each upgrade adds a visible stack layer (mid, top, crown) and a short build pop.
- Meadow waves start within a few seconds, overlap, and can run at 2×. The speed choice is remembered.
- UFOs and pets are larger, hits flash and wobble, kills burst, and the camera sits closer to the path.
- Kenney Future on the UI, one rounded button style, a pause menu, and a pointing-hand tutorial with a skip button.

## Performance

Phase 0, measured on main `f4e91bd` before this branch (see the perf diagnosis) and again on this build.

Before, 30 seconds of combat on that build:

- Camera drag moved on every other event (0, then a step, then 0).
- Auto-quality resized the canvas and recompiled shaders mid-fight. iPhone starts on High because WebKit has no `deviceMemory`, then drops on the first slow frames.
- About 135 canvas-texture uploads, ~140MB, for damage numbers.
- About 6.4 sounds per second through HTMLAudio elements. iOS ignores `.volume`.
- HUD layout reads ran on every 20ms step.
- Live GPU buffers grew from 556 to 1063. Enemies and abduction beams were never freed.
- Ammo and debris were in the shadow pass.
- Screen shake used wall-clock time and stacked on every kill.
- About 8 major garbage collections from per-shot allocations.

After, three Meadow waves in headless Chromium with damage numbers on (`scripts/perf-probe.mjs`, phone-sized viewport, DPR 2):

- Live geometries stayed at 95, textures at 198, and programs at 16 from wave 1 through the wave 4 breather.
- Canvas resizes during play: 0. Shader compiles during play: 0. The only resize is the first layout, before the wave.
- Texture uploads per second in combat: 0 (max and average). `playUploads` stayed 0.
- Tier stayed High. No automatic tier change.

`?perf=1` draws FPS, a frame-time graph with p95 and worst, steps, draws, triangles, live geometries, textures, programs, popups and sounds per second, tier, DPR, canvas size, and a log of tier changes, resizes, and compiles. Toggles cover damage numbers, sound, shadows, and a forced tier. The tier is chosen once at load. Changing it is a settings action, not an automatic drop mid-wave.
