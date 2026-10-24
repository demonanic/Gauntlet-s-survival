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
- **Rarity × tier:** Common ×1, Uncommon ×1.5, Rare ×2.2, Epic ×3.2, multiplied by the
  tier: ×1 / ×1.6 / ×2.4 for tiers 1–3 (The Gutter / Boneyard Crypt / Ashen Keep), then
  +0.8 per tier up to tier 10 (ranked bosses, deep Rift waves, the shop's Masterwork).
- **Weapons:** sword (attack), bow (attack + crit), staff (attack + HP). Every hero starts
  with a common one. Secondaries: shield, dagger, focus orb. Trinkets: amulet, ring.
- **Quick slots (2 per hero):** stacks of bandages (heal 20%), health potions (heal 45%)
  or barbed ammo (next 8 attacks +50%). Heroes use them on their own: heals below an HP
  threshold, ammo while an elite or boss is on the field. The player can also tap them.
  Spent items are gone; unspent ones stay loaded.
- **Loot:** at most one drop per kill, gear first, then supplies. Chances rise with enemy
  tier; the boss always drops Rare or Epic gear. Spare gear sells for gold.

## Heroes

- **Looks** (`src/combat/heroPalette.js`): each hero has a random `hueShift`; the shared
  sprite is drawn with `hue-rotate(hueShift)`, and the hero's identity (glow, name) and
  accent colors are the sprite's own magenta and cyan rotated by the same amount.
- **Traits** (`src/combat/traits.js`): one per hero, rolled at creation. Combat traits
  feed `classlessHeroDerived` and the hit, heal and kill paths; XP traits apply when an
  encounter resolves. Older saves get a random trait on load.
- **Recruiting:** the guild always has a waiting candidate (trait + look). The player names
  them (16 characters max), may pick another look for free, or pays 25g for a different
  candidate. Recruit cost scales with the roster size, so retiring keeps it affordable.

## Prestige (`src/game/legacy.js`)

Retire a level 20 hero for 3 Renown (+1 per 5 boss ranks); their gear returns to the vault
and their supplies to the stash. Renown buys Hall of Legends ranks (rank *n* costs *n*
Renown): Might (+4% damage), Vigor (+4% max HP), Fortune (+10% gold), Wisdom (+10% XP),
Swift Roads (−8% travel) and Mentorship (recruits start 2 levels higher). Damage and HP
bonuses are stamped onto every hero as `hero.guildBonus` so the engine can read them.

## Cloud saves

- Supabase project **gauntlet** (`xtgpznknlaihmfohdmqs`, us-east-1, org *demonanic*).
- Table `public.saves (user_id, data jsonb, updated_at)`, one row per player, with
  row-level security so players can only read and write their own row
  (`supabase/migrations/`). Saves are capped at 512 KB.
- Email + password auth. Supabase sends a confirmation email on sign-up; set the project's
  **Site URL** (Authentication → URL Configuration) to wherever the game is hosted so the
  confirmation link lands on the game.
- `src/cloud/cloudSave.js` talks to Supabase; `src/components/CloudSync.jsx` syncs every
  45s and when the page is hidden. Each device remembers the cloud version it last
  synced, and the player is asked to choose only when the cloud holds a save this device
  hasn't seen.

## Gold

- **Armory** (Market tab, `src/game/shop.js`): stock rotates every 4 hours. Five items at
  the guild's shop tier (best cleared region tier, +1 per two boss ranks) and one featured
  **Masterwork**: Epic, one tier higher, +15% stats, priced at 10× its sell value. Stock
  comes from a seeded RNG, so only the rotation, its reroll count and sold ids are saved.
  Rerolling the stock costs gold and doubles in price each time within a rotation.
- **Forge:** upgrade any gear up to +5; each level adds 15% of the item's base stats.
- **Infirmary:** cure an injured hero at once (10g + 1g per 3 seconds left) and heal to full.
- **Supplies** and **recruits** as before.

## Endgame

- **Boss rotation:** after the first Ashen Keep clear its final boss cycles Three-Headed
  Demon → Imperial Necromancer → Abomination → Demon… Each kill raises the guild's boss
  rank: enemy HP ×1.15 and damage ×1.09 per rank (compounding), bounty +15% per rank, and
  loot one tier better every two ranks.
  - *Demon:* napalm bottles and two skeletons every 6s.
  - *Imperial Necromancer:* long-range soul bombs; raises two skeletons and a ghost every 8s.
  - *Abomination:* no minions; a toxic slam on every hero within reach, faster once it
    enrages below 35% HP.
  - Minions summoned mid-fight spawn at 60% HP / 70% damage of the encounter's scale.
- **The Endless Rift** (LV 3+): one continuous fight. Each cleared wave rolls into the next
  after 3 seconds; HP ×1.10 and damage ×1.07 per wave, squads grow to 8, a lieutenant
  every 5th wave and a rotating boss every 10th. Loot tier rises every 5 waves. Return home
  at any time to keep everything plus 10 gold per wave; a wipe keeps half. Best wave is
  recorded.

## Balance (Oct 2026, `npm run balance`)

Heroes close on enemies that sit out of range (previously warlocks and the demon could
out-range the party and stall a fight until it wiped).

| Region | HP × | Damage × | Result |
| --- | --- | --- | --- |
| The Gutter | 0.9 | 0.9 | Tutorial: cleared first try at LV 1 |
| Boneyard Crypt | 2.0 | 1.7 | Cleared first try at LV 3–4, but costs HP and supplies |
| Ashen Keep | 2.0 | 1.5 | The wall; every loss is at the demon. ~20–25% win rate per attempt at first: typical first clear ~40–50 min (range 20–130), LV 7–11 |

Gear and supplies carry the late game: without equipping drops the first Ashen clear takes
hours longer (measured before the endgame changes: 4–8 hours, LV 12–17).

Endgame, 8 hours after the first Ashen clear (scripted guild that buys from the Armory and
upgrades in the Forge): boss rank ~13–19 after 2h, ~21–24 after 4h, levelling off at
~24–27 by 8h. Boss runs win ~55% and pay ~150–170 gold/min; Rift runs pay ~220–250
gold/min and usually end at the boss walls on waves 40 or 50.

## Known gaps / next steps

- **Second trim pass:** `engine.js` still has tower/castle branches that are now dead
  (they iterate empty `towers`/`barricades`), plus `logic.js` with castle economy code the
  engine only needs for `heroDerived`/`makeSingleEnemy`.
- **Level cap:** heroes reach LV 20 within the 8-hour endgame; after that only gear grows.
- **Boss walls:** progress past rank ~25 or Rift wave 50 depends on rare Epic drops and
  Masterworks; a deeper gear tier or prestige system would extend it.
- **Cloud saves:** last write wins between devices that are both online; there is no
  merge. Password reset and account deletion are not in the game UI yet.
- **Mobile:** the canvas is portrait-first; a Capacitor Android shell like Demonanic's is
  not set up yet.
- **Engine sync:** the copy will drift from Demonanic; port upstream fixes by hand or move
  to a shared package later.
