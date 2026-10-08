# Tiny Tower Defense — Design Brief

Mobile-first 3D tower defense (iOS + Android), also playable in a browser on mobile and PC. Built only with Kenney assets (CC0), found in `public/assets/`.

## Pillars (our edge)
1. **Build-your-own towers.** Towers are stacked from Kenney's modular pieces (round/square bases, middles, tops, roofs, variants a/b/c) topped with a weapon (ballista, cannon, catapult, turret). Players stack pieces, even mid-wave. Each layer changes the tower: height = range, middle = fire rate, roof = special (slow, splash, etc.), weapon = damage type.
2. **Protect the pets.** Lives are animated Cube Pets in a pen at the end of the path. When a UFO gets through it tractor-beams a pet away (enemy-ufo-beam models). Pets saved across levels join a collection.
3. **Endless maps.** Snap-together tiles (paths, rivers, bridges, slopes, waterfalls; grass + snow sets) for handcrafted campaign maps plus generated maps, including a date-seeded daily map.

## Stretching the assets
- 4 UFO models → 15+ enemy types via size, tint, speed, shields, splitting, cloaking, boss versions.
- Grass/snow tilesets → extra biomes (autumn, desert, night) via lighting and color grading.
- 3 stars per level + challenge variants per map; endless mode; daily map; unlockable tower parts and pets.

## Scope
- **50 campaign levels.**
- Targets: iOS and Android (native wrap, e.g. Capacitor) first; same build runs in mobile and desktop browsers (touch + mouse).

## Roadmap
1. Prototype — one map, placement + stacking, 4 UFOs, pet pen, playable on a phone.
2. Vertical slice — 10 polished grass levels, sound, effects, upgrades, stars.
3. Content — snow + tinted biomes, 50 levels, bosses, enemy variants.
4. Replay — endless mode, daily map, unlocks, pet collection.
5. Polish & ship — balance, tutorial, performance on older phones, app store builds.
