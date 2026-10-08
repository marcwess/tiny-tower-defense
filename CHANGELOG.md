# Meadow rebuild

One level, built to feel good in the hand. Levels 2 and 3 stay loadable and show as coming soon.

## Feel

- Meadow is a 7×14 board seen from about 58° with a 32° lens, so towers and trees read in 3/4. Portrait looks up the path. Wide screens turn the path sideways. At 390×844 the grass covers about 82% of the gap between the HUD and the bottom bar, and the pen sits above the wave button.
- The build menu is a ring of 64px circles (Turret, Cannon, Frost, Ballista) with a coin pill under each. Upgrade and sell use the same ring. The ring clamps inside the safe area, and a choice you cannot afford is grey.
- Hits print a small outlined number, throttled so a stream of shots does not flood the screen. "Effective!" shows only every few seconds.
- A shot kicks the barrel and flashes at the muzzle. Cannon and ballista leave a trail. A kill pops a colored burst, debris, and a coin that flies to the gold pill. A frost hit turns the UFO icy blue and plants a frost ring. Shake is short and capped, and a boss death adds a screen flash and a bigger burst.
- Pause is a yellow rounded button with two drawn bars. The tutorial hand hides while a ring is open, then points at Call wave, and ends when the wave starts or Skip is pressed. Hearts float over a pet only while it is being carried or dropped.
- Wave 1 is a stream of scouts. Later waves mix and overlap. The next countdown starts when the last UFO of a wave has spawned. Calling early pays gold. The bottom bar is the 1×/2× toggle, one wave button with a countdown ring, and icon chips for the next group.

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

- Live geometries stayed at 95, textures at 198, and programs at 17 from wave 1 through the wave 4 breather. The 17th program is the muzzle-flash sprite, compiled once during warmup.
- Canvas resizes during play: 0. Shader compiles during play: 0. The only resize is the first layout, before the wave.
- Texture uploads per second in combat: 0 (max and average). `playUploads` stayed 0.
- Tier stayed High. No automatic tier change.

`?perf=1` draws FPS, a frame-time graph with p95 and worst, steps, draws, triangles, live geometries, textures, programs, popups and sounds per second, tier, DPR, canvas size, and a log of tier changes, resizes, and compiles. Toggles cover damage numbers, sound, shadows, and a forced tier. The tier is chosen once at load. Changing it is a settings action, not an automatic drop mid-wave.
