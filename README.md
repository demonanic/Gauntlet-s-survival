# Gauntlet's Survival

[![CI](https://github.com/demonanic/Gauntlet-s-survival/actions/workflows/ci.yml/badge.svg)](https://github.com/demonanic/Gauntlet-s-survival/actions/workflows/ci.yml)

An idle expedition game: recruit heroes, send a party on expeditions, and fight each
encounter live on the [Demonanic](https://github.com/demonanic/Demonanic) combat engine.

Travel and resting tick by in real time; every encounter along the way is played out
on a canvas battlefield where your heroes auto-fight and you can step in with
abilities, move orders and speed controls.

## Gameplay

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree, equip
   gear and buy supplies.
2. **Expedition Board:** pick a destination and a party of 1–4 ready heroes.
3. **Travel:** a timer runs until the next encounter.
4. **Encounter:** a live fight against a small enemy squad. HP carries over between
   fights, and fallen heroes sit out the rest of the run. You can recall the party at
   any time and keep the loot.
5. **Return:** victory banks the full loot plus the region bounty. A routed party comes
   home with half the loot, and fallen heroes stay injured until they recover.

### Gear and supplies

Each hero has seven gear slots (head, chest, legs, arms, weapon, secondary, amulet/ring)
and two quick slots for stacks of bandages, health potions or barbed ammo. Enemies drop
gear in four rarities; better regions drop stronger gear. Heroes use their supplies on
their own in battle, or you can tap them.

### Regions

| Region | Min level | Encounters | Bounty |
| --- | --- | --- | --- |
| The Gutter | 1 | 3 | 60g |
| Boneyard Crypt | 3 | 4 | 180g |
| Ashen Keep | 6 | 5 | 500g |

## Getting started

Requires Node.js 22 (see `.nvmrc`).

```bash
npm install
npm run dev       # dev server at http://localhost:5173
npm test          # Vitest: vendored Demonanic engine tests + Gauntlet game tests
npm run build     # production build in dist/
npm run preview   # serve the production build
npm run balance   # simulate full playthroughs and report balance numbers
```

Saves live in the browser's `localStorage`. Use **Reset save** at the bottom of the
page to start over.

## Tech stack

- [React 19](https://react.dev) + [Vite 6](https://vite.dev)
- [Tailwind CSS 3](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for tests
- A canvas combat engine vendored from Demonanic

## Project layout

```
src/
  combat/      Combat engine vendored from demonanic/Demonanic, trimmed to encounter mode
  game/        Gauntlet logic: regions, encounters, guild/expedition state, saves, simulator
  screens/     Guild Hall, Expedition Board, Battle
  components/  Shared React UI
  test/        Vitest setup (aliases jest → vi for the vendored tests)
public/sprites Hero atlas, weapon icons, projectile and impact VFX
docs/          Design notes
```

## Documentation

See [docs/DESIGN.md](docs/DESIGN.md) for the full game loop, owner-approved decisions,
and the roadmap of known gaps (engine trim pass, balance, equipping gear, cloud saves,
mobile shell).

## Contributing

Work on a branch and open a pull request against `main`. CI runs `npm test` and
`npm run build` on every PR; both must pass before merging.

## License

All rights reserved. This is a personal project, and no license is granted to copy,
modify or redistribute the code or assets.
