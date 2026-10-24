# Gauntlet — Design Notes

Gauntlet is an idle expedition game (Idle Castle / Gutter Quest style) whose fights run
on the Demonanic combat engine.

## Core loop

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree.
2. **Expedition Board:** choose a destination and a party of 1–4 ready heroes.
3. **Travel (idle):** a real-time timer runs until the next encounter.
4. **Encounter (always live):** one small enemy squad versus the party, played on the
   Demonanic canvas engine. Heroes auto-fight; the player can fire abilities, order
   moves, change speed.
5. **Between encounters:** HP carries over (attrition). Fallen heroes sit out the rest of
   the run. The player can recall the party and keep all loot.
6. **Return:** loot (gold + equipment drops) is banked when the party gets home.
   - Victory: full loot + region bounty.
   - Defeat ("routed"): the party retreats home with half the loot; fallen heroes are
     injured and can't travel until they recover.
7. **Rest:** heroes at the guild regenerate HP over time.

## Decisions (owner-approved)

| Topic | Decision |
| --- | --- |
| Engine reuse | Copy Demonanic's engine and trim it to an encounter mode |
| Encounter play | Always live (idle = travel/rest timers) |
| Hero model | Demonanic classless model + universal perk tree (Bible v1.0) |
| Failure | Retreat injured, partial loot |

## Code layout

- `src/combat/`: vendored from `demonanic/Demonanic` @ `review/mobile-working-copy`
  (`b0d430f`). `engine.js` is trimmed to encounter mode (no castle, wall, gate, towers,
  barricades, kingdom buildings); enemies hunt the nearest hero. The other modules are
  unmodified copies, including Demonanic's own tests (they run under Vitest via a
  `jest` → `vi` alias).
- `src/game/`: Gauntlet-only logic: regions, encounter builder, guild/expedition state,
  local save, headless encounter simulator.
- `src/screens/`, `src/components/`: React UI (Tailwind).

## Known gaps / next steps

- **Second trim pass:** `engine.js` still has tower/castle branches that are now dead
  (they iterate empty `towers`/`barricades`), plus `logic.js` with castle economy code the
  engine only needs for `heroDerived`/`makeSingleEnemy`.
- **Balance:** level-1 baseline sweep (20 runs each): The Gutter wins solo; Boneyard needs
  2+ heroes; Ashen Keep is not yet beatable at level 1 (gated at LV 6, untested with
  perks).
- **Equipment:** drops land in the vault but can't be equipped yet.
- **Saves:** localStorage only. Supabase-backed accounts would replace `game/storage.js`.
- **Mobile:** the canvas is portrait-first; a Capacitor Android shell like Demonanic's is
  not set up yet.
- **Engine sync:** the copy will drift from Demonanic; port upstream fixes by hand or move
  to a shared package later.
