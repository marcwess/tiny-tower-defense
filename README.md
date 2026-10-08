# Tiny Tower Defense

A mobile-first 3D tower defense prototype. One grass meadow, stackable towers, four UFO types, and a pen of Cube Pets. Built with [three.js](https://threejs.org/) and [Kenney](https://kenney.nl) CC0 assets, including the tower kit and the Game Icons, Game Icons Expansion, and Board Game Icons used on the HUD. See `DESIGN.md` for the full game.

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

The title screen opens on a slow orbit of the meadow. Pick one of three levels. Meadow is the first pen, Switchback is a tighter grass route, and Snow is a frozen curve. The next level unlocks after you beat the one before it. Stars are saved on this device.

The meadow is under attack. UFOs follow the stone path from the north gate to the pet pen. A UFO that arrives beams a pet and carries it back toward the gate. Shoot that UFO down and the pet parachutes home. A pet is only lost if the UFO escapes. The run ends when every pet is gone, or when all 9 waves are cleared with at least one pet left.

Match the weapon to the UFO. The next-wave card lists who is coming and what they are weak to. A good hit pops **Effective!**

- **Scout** (slim orange): weak to Turret and Frost.
- **Swarm** (tiny green): weak to Cannon splash and Blast.
- **Tank** (bulky steel): weak to Ballista pierce and Hex. Other shots barely scratch the armor.
- **Shield** (cyan, flying): the bubble has to break under rapid hits before the hull does.
- **Boss** on wave 9: a huge armored UFO with a shield. Ballista or Hex, and something rapid for the bubble.

- **Tap or click** a grass tile, then **Base**. Trees, rocks, crystals, and the river are blocked. Hold a piece to read what it does.
- **Stack pieces**, including during a wave. Each extra layer costs more than the last.
  - **Swift / Steady / Tall** floors. Height adds range. Swift shoots faster, Tall reaches farther.
  - **Frost / Blast / Hex** roofs. Slow, splash, or extra damage that shreds armor.
  - **Ballista, cannon, catapult, turret.** The weapon picks the shot.
  - **Upgrade** three times. The weapon grows and the trim changes color.
- **Drag** to pan. **Pinch** or the **mouse wheel** to zoom.
- **Call wave** sends the next group. Between waves a small timer counts down and then calls it for you; **Call +gold** pays a bonus for starting early. **2×** speeds the action up. **Nums** toggles damage numbers.
- **Sell** returns half of what that tower cost.
- The **speaker** opens settings: sound, music, haptics, damage numbers, and quality. The first tap starts the music. On level 1, a few short hints point at the pad, the weapon, the weak-to tags, a pet rescue, and the early-wave bonus. Tap Next to skip one.
- Clear the meadow for a star rating: 3 if all five pets are home, 2 for three or four, 1 for one or two.

You begin with 120 gold. A base is 40 and a turret is 36, so the first tower can shoot before wave 1.

## This prototype

In: a title screen and three levels (grass meadow, grass switchback, snow), modular round towers with rising stack costs and 3 upgrade tiers, five UFO roles (scout, swarm, tank, shield, boss), pet rescue, 9 waves, star rating, currency, speed control, win/lose retry and next, a settings sheet, and a music loop. It can be added to a phone home screen.

Not in this build: square tower pieces, endless or daily maps, pet collection, and the native iOS/Android wrapper. The web build is a static Vite app, so a later Capacitor wrap can load the same `dist/`.
