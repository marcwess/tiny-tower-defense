# Tiny Tower Defense

A mobile-first 3D tower defense prototype. One grass meadow, stackable towers, four UFO types, and a pen of Cube Pets. Built with [three.js](https://threejs.org/) and [Kenney](https://kenney.nl) CC0 assets. See `DESIGN.md` for the full game.

Play it at <https://marcwess.github.io/tiny-tower-defense/> after a push to `main`.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

The headless playtest builds the game, loads it in Chromium, places a tower with a tap, and plays a wave:

```bash
npx playwright install chromium
npm run test:play
```

GitHub Pages publishes from `.github/workflows/pages.yml` with base path `/tiny-tower-defense/`. Local dev uses `/`.

## How to play

The meadow is under attack. UFOs follow the stone path from the north gate to the pet pen. Each UFO that arrives tractor-beams one pet away. The run ends when the pen is empty, or when all 9 waves are cleared with at least one pet left.

- **Tap or click** a grass tile, then **Build**. Trees, rocks, crystals, and the river are blocked.
- **Stack pieces**, including during a wave:
  - **Swift / Steady / Tall** floors. Height adds range. Swift shoots faster, Tall reaches farther.
  - **Frost / Blast / Hex** roofs. Slow, splash, or extra damage that shreds shields.
  - **Ballista, cannon, catapult, turret.** The weapon picks the shot. Ammo matches the model (arrow, shell, boulder, bullet). A tower with no weapon does not fire.
- **Drag** to pan. **Pinch** or the **mouse wheel** to zoom.
- **Start wave** sends the next group. Between waves a countdown calls the next wave for you; starting early pays a small bonus. **2×** speeds the action up.
- **Sell** returns half of what that tower cost.
- **Sound** mutes music and effects. The first tap starts the music.

You begin with 150 gold. A base is 40 and a turret is 35, so the first tower can shoot before wave 1.

## This prototype

In: one handcrafted grass map, modular round towers, four UFO types (scout, dart, brute, shielded flying warden), animated pets, abduction beams, 9 waves, currency, speed control, win/lose retry, hit sparks, a music loop, and a first-time hint.

Not in this build: square tower pieces, campaign levels, snow and other biomes, stars, endless or daily maps, pet collection, and the native iOS/Android wrapper. The web build is a static Vite app, so a later Capacitor wrap can load the same `dist/`.
