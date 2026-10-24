# Gauntlet — Design Notes

Gauntlet is an idle expedition game (Idle Castle / Gutter Quest style) whose fights run
on the Demonanic combat engine.

## Core loop

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree, equip
   gear from the vault, buy supplies and load them into quick slots.
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
  items (gear, loot, supplies), local save, headless encounter simulator.
- `scripts/balance.js` (`npm run balance`): plays scripted guilds from a fresh save through
  the real game code and reports first-clear times, attempts, levels and win rates.
- `src/screens/`, `src/components/`: React UI (Tailwind).

## Equipment

A deliberately small model (not Demonanic's 11 slots), defined in `src/combat/gear.js` and
`src/game/items.js`:

- **Gear slots:** head, chest, legs, arms, weapon, secondary, amulet/ring. Gear adds flat
  attack, defense, max HP, agility (dodge) and crit chance.
- **Rarity × region tier:** Common ×1, Uncommon ×1.5, Rare ×2.2, Epic ×3.2, multiplied by
  ×1 / ×1.6 / ×2.4 for gear from The Gutter / Boneyard Crypt / Ashen Keep.
- **Weapons:** sword (attack), bow (attack + crit), staff (attack + HP). Every hero starts
  with a common one. Secondaries: shield, dagger, focus orb. Trinkets: amulet, ring.
- **Quick slots (2 per hero):** stacks of bandages (heal 20%), health potions (heal 45%)
  or barbed ammo (next 8 attacks +50%). Heroes use them on their own: heals below an HP
  threshold, ammo while an elite or boss is on the field. The player can also tap them.
  Spent items are gone; unspent ones stay loaded.
- **Loot:** at most one drop per kill, gear first, then supplies. Chances rise with enemy
  tier; the boss always drops Rare or Epic gear. Spare gear sells for gold.

## Balance (Oct 2026, `npm run balance`)

Heroes now close on enemies that sit out of range (previously warlocks and the demon could
out-range the party and stall a fight until it wiped). Region multipliers after that fix:

| Region | HP × | Damage × | Result |
| --- | --- | --- | --- |
| The Gutter | 0.9 | 0.9 | Tutorial: cleared first try at LV 1 |
| Boneyard Crypt | 2.0 | 1.7 | Cleared first try at LV 3–4, but costs HP and supplies |
| Ashen Keep | 2.2 | 1.6 | The wall. Every loss is at the demon. First clear: active players ~30–65 min (2–6 attempts, LV 7–9); idle players ~40–180 min |

Gear and supplies carry the late game: without equipping drops the first Ashen clear takes
4–8 hours (LV 12–17); without supplies 2–4.5 hours.

## Known gaps / next steps

- **Second trim pass:** `engine.js` still has tower/castle branches that are now dead
  (they iterate empty `towers`/`barricades`), plus `logic.js` with castle economy code the
  engine only needs for `heroDerived`/`makeSingleEnemy`.
- **Gold sink:** by the first Ashen clear a guild banks 1,000–2,000 unspent gold. Supplies
  are the only steady expense; something worth buying is still missing.
- **Post-game:** nothing after the demon yet; Ashen Keep farming is the endgame.
- **Saves:** localStorage only. Supabase-backed accounts would replace `game/storage.js`.
- **Mobile:** the canvas is portrait-first; a Capacitor Android shell like Demonanic's is
  not set up yet.
- **Engine sync:** the copy will drift from Demonanic; port upstream fixes by hand or move
  to a shared package later.
