# Gauntlet — Design Notes

Gauntlet is an idle expedition game (Idle Castle / Gutter Quest style) whose fights run
on the Demonanic combat engine.

## Core loop

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree, equip
   gear from the vault, buy supplies and load them into quick slots.
2. **Expedition Board:** choose a destination and a party of 1–4 ready heroes.
3. **Adventure (timed, `src/game/expedition.js` + `adventure.js`):** the party explores
   for the region's duration (10 / 20 / 30 min). Every 20–40s a feed event fires:
   flavor 40%, find 20%, hazard 12%, encounter 22%, story choice 6%.
4. **Encounters:** random squads from the region's wildlife, tougher the deeper into the
   timer (+30% HP/damage at the end). 65% are **sightings** (Attack or Sneak, chance from
   party agility, Shadowcraft/Illusion perks, Nimble/Swift traits, level vs region, party
   size, morale, squad size and watchful enemy types); 35% are **ambushes** (an opening
   volley of 8% max HP, then a forced fight). A failed sneak becomes an ambush.
5. **Live or automatic:** prompts pause the timer. While the page is visible the prompt
   waits up to 45s for the player (Attack opens the live Battle screen); otherwise the
   party decides alone and fights through the headless simulator. Alone, it sneaks when
   the odds are ≥60% or it is badly hurt, skips the end boss below 50% HP, and limps
   home after a fight that leaves it under 25%. `tick` replays missed time in order, so
   a party catching up after the app was closed plays out as if watched.
6. **Morale (0–100, starts 60):** moved by flavor, finds, hazards, wins (+8), sneaks (+4)
   and ambushes (−8), drifting 10% back toward 60 each event. Gives −10% to +10% damage
   and nudges sneak odds.
7. **HP:** carries over between fights; living heroes heal 1/900 of max HP per second on
   the road (not during prompts). Fallen heroes sit out and are injured on return.
8. **End:** Boneyard and Ashen Keep end with their boss (fight or head home without the
   bounty); The Gutter just ends. A wipe brings the party home with half the loot.
9. **Rest:** heroes at the guild regenerate HP over time.

### World events (`adventure.js`)

- **Conditions:** weather is rolled per trip (clear 45, rain 25, fog 18, storm 12) and
  turns with a 6% chance per event; night is 20:00–06:00 local time and is re-checked each
  event (dusk/dawn lines). Effects: rain +5% sneak, hazards ×1.3; fog +12% sneak, +10%
  ambush; storm +5% sneak, +5% ambush, hazards ×1.6, loot ×1.15, morale −1.5 per event;
  night +5% sneak, +15% ambush, loot ×1.3.
- **Banter:** 35% of flavor events are a hero's own line, from their trait or the
  party's mood (morale ≥75 or ≤30).
- **Rare events (3% of events):** the wandering merchant (gear one tier above the region,
  at 4× its value, paid from guild gold; an unattended party never buys), a treasure map
  (a 3-minute detour that ends in a stash of gold and Rare/Epic gear), and a legendary
  monster (the region's toughest creature at ×5 HP and ×1.6 damage with two followers;
  beating it pays a hoard of gold plus Rare/Epic gear).
- **Camp:** trips of 20+ minutes stop halfway: Rest (heal 30%), Scout ahead (+15% sneak
  for the rest of the trip) or Forage (gold and supplies).
- **Notifications:** feed lines flagged `notify` (boss reached, legendary monster,
  merchant, treasure, rare gear) and the trip's report trigger a browser notification
  while the page is hidden, if the player turned them on.

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
- **Rarity × tier:** Common ×1, Uncommon ×1.5, Rare ×2.2, Epic ×3.2, Legendary ×4.2, multiplied by the
  tier: ×1 / ×1.6 / ×2.4 for tiers 1–3 (The Gutter / Boneyard Crypt / Frostfang Pass), then
  +0.8 per tier up to tier 10 (ranked bosses, deep Rift waves, the shop's Masterwork).
- **Weapons:** sword (attack), bow (attack + crit, needs arrows), staff (attack + HP). Every hero starts
  with a common one. Secondaries: shield, dagger, focus orb, quiver (20% arrow saving). Trinkets: amulet, ring.
- **Quick slots (2 per hero):** stacks of bandages (heal 20%), health potions (heal 45%)
  whetstones (next 8 attacks +50%) or arrows. Heroes use them on their own: heals below an HP
  threshold, ammo while an elite or boss is on the field. The player can also tap them.
  Spent items are gone; unspent ones stay loaded.
- **Loot:** at most one drop per kill, gear first, then supplies. Chances rise with enemy
  tier; the boss always drops Rare or Epic gear (8% of boss drops are Legendary, 15% for
  legendary monsters). Spare gear sells for gold or salvages into essence.
- **Affixes (`AFFIXES` in items.js):** Uncommon 1, Rare 2, Epic 3. The first two are a
  prefix and a suffix and name the item ("Vampiric Sword of Warmth"). Flat values scale
  with tierMult; percentages +10% per tier; resistances 20% +2% per tier (max 35%). An
  item stores `baseStats` (forged) and `affixes`; `stats` is their sum (`composeStats`).
  Reforge rerolls affixes for essence + a little gold.
- **Special stats (`SPECIAL_STAT_KEYS` in gear.js):** damage/health %, attack speed, crit
  damage, lifesteal, thorns, regen (HP/s), gold find, arrow saving, chill, burn, cleave,
  volley, revive, blast ward, and four resistances. The engine reads them through
  `hero.d.gear` (classlessHeroDerived).
- **Sets (`GEAR_SETS`):** Gravewatch (Boneyard), Frostwarden (Frostfang), Emberforged
  (Ashen), Mirewalker (Blightmire). 6–25% of a region's gear drops are set pieces (Rare or
  Epic). 2-piece bonus: that region's resistance +40% plus a stat; 4-piece: a power stat.
- **Legendaries (`LEGENDARIES`):** Dawnbreaker (sword, cleave 50%), Whisperwind (bow,
  every 3rd shot +2 free arrows, 30% arrow saving), Embercall (staff, burn 40%), Heart of
  the Mountain (chest, immune to environments), Gnomebane Buckler (halves explosions,
  thorns), Gravebinder Ring (revive once per fight at 30%).
- **Arrows:** bows draw one arrow per shot from the first quick slot holding arrows; no
  arrows means no shooting (the hero falls back). Stacks of 50; 60% of plain arrows fired
  are recovered after a won fight. Special arrows (Fletcher: 10 plain + 25–30g) are spent:
  venom 60% of the hit over 4s, flame 35% splash + 30% burn, frost 35% slow for 2.5s.
  Departure restocks every loaded slot from the stash and gives an arrowless archer
  plain arrows in a free slot.

## Environments (`src/game/environment.js`)

| Environment | Region | On the road (per event, ×(1 − resist)) | In battle (×(1 − resist)) | Provision |
| --- | --- | --- | --- | --- |
| Darkness | Boneyard Crypt | 3% HP, +10% ambush chance | 15% of attacks miss | Torch Bundle |
| Bitter Cold | Frostfang Pass | 6% HP | attacks 25% slower, moves 15% slower | Warming Draught |
| Scorching Heat | Ashen Keep | 5% HP, morale −2 | 0.6% max HP/s burn | Cooling Salve |
| Toxic Miasma | The Blightmire | 6% HP | 0.4% max HP/s, healing halved | Antitoxin |

Environment events have weight 12 among the road events. Environment damage never knocks a
hero out. Each hero packs one provision (+50% resistance for the trip) at departure if the
stash has one and their gear isn't already immune.

## Enemy roles (`engine._updateSpecialEnemy`)

- **Gnome Sapper:** sprints at the nearest hero, lights a 0.7s fuse, explodes (6× its
  damage, 72px radius). Killed first, it still goes off at half strength. Self-detonation
  gives no gold or XP.
- **Bandit:** chases the hero with the lowest HP fraction; blitzes (3.2× speed, 0.45s,
  every 6s) and hits 1.6× after a blitz.
- **Dark Elf (sniper):** keeps 150–330px away, aims 0.9s at a ranged hero (else the
  weakest; a dashed line shows the aim), then fires a 2× shot. Cooldown 2.6s.
- **Lesser Necromancer:** keeps 170–230px away, heals the most wounded non-boss ally 18%
  every 4.5s, and raises one fallen non-boss ally at 50% HP (1.5s channel). Raised enemies
  drop nothing.
- **Bandit Warlord** (Frostfang boss): every 10s calls two bandits and blitzes.
- **The Bog Lich** (Blightmire boss): every 7s heals its court 12%, raises up to two
  fallen, and throws toxic bile.

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
| The Gutter | 0.9 | 0.9 | Tutorial: every 10-minute trip succeeds at LV 1 |
| Boneyard Crypt | 2.0 | 1.7 | First clear on the first try, about an hour into the game (LV 4–5) |
| Frostfang Pass | 2.1 | 1.6 | First clear about 1.5 hours in (LV 6–7) |
| Ashen Keep | 2.0 | 1.5 | First clear about 2–3 hours in (1–4 attempts, LV 7–11) |
| The Blightmire | 3.0 | 2.2 | First clear 3–10 hours in (LV 10–14, 25–45% of runs win) |

Since environments and gear sets (Oct 2026), gear tiers are 1–5 for the five campaign
regions (Ashen Keep went from tier 3 to tier 4).

With timed expeditions (Oct 2026), progress is measured in real time: trips are 10–30
minutes long. 4 hours after the first Ashen clear a scripted guild reaches boss rank 8–9,
earning ~60–65 gold/min.

Gear and supplies carry the late game: without equipping drops the first Ashen clear takes
hours longer (measured before the endgame changes: 4–8 hours, LV 12–17).

Before timed expeditions (fixed 3–5 fight runs a few minutes long), boss rank levelled off
around 24–27 eight hours after the first Ashen clear, and Rift runs usually ended at the
boss walls on waves 40 or 50. The compounding boss and wave scaling still sets that
ceiling; it now takes proportionally longer to reach.

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
