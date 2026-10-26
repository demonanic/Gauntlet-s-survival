# Gauntlet — Design Notes

Gauntlet is an idle expedition game (Idle Castle / Gutter Quest style) whose fights run
on the Demonanic combat engine.

## Core loop

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree, equip
   gear from the vault, buy supplies and load them into quick slots.
2. **Expedition Board:** choose a destination and a party of 1–4 ready heroes.
3. **Adventure (timed, `src/game/expedition.js` + `adventure.js`):** the party explores
   for the region's duration (10–40 min). Every 20–40s a feed event fires, weighted
   flavor 38, find 20, hazard 10, encounter 26, story choice 6, rare 3 (plus environment 12
   in harsh regions). Encounters are the backbone: after 3 events in a row without one,
   the next event is always an encounter, so a trip sees a fight about every 1–1.5 min.
   Before an end boss the party takes a breather: everyone heals 30%, heroes knocked
   out on the road get back up for the final fight, and archers gather 15 spent arrows.
   At camp (20+ minute trips), fallen heroes come around at 10% HP, anyone below 40% HP
   uses a bandage or potion from their quick slots, and archers whittle 15 arrows; after
   that it's natural healing (1/450 max HP per second) or the camp's Rest option.
   `startExpedition(..., { revives })` grants second chances: a lost fight puts the whole
   party back on its feet at 50% HP (an end boss must be fought again). Nothing in the
   game grants them yet; the scenarios use them to model revive items or ad revives.
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
7. **HP:** carries over between fights; living heroes heal 1/450 of max HP per second on
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
- `scripts/scenarios.js` (`npm run scenarios`): plays the same expedition many times with
  one thing changed and reports the results side by side: party make-ups (all swords,
  all bows, all staves, mixed, trio, duo, solo), every innate quality and best/worst
  loadouts, and revive rules (Gravebinder Ring, one or two second chances). Reports win
  rate, fights, sneaks, ambushes, knockouts, morale and HP at the end of the trip.
- `scripts/simKit.js`: the scripted player both scripts share (perk and stat build,
  "active" ability use).
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
  arrows means no shooting (the hero falls back). Stacks of 50; 75% of plain arrows fired
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
- **Gear on the sprite** (`src/combat/heroLook.js`): `heroGearMarks(equipment)` gives a few
  plain shapes per armor slot (helm band and crest, shoulder plate, bracers, boots,
  shield/dagger/orb/quiver, amulet or ring) in sprite-frame coordinates, coloured by
  rarity or set. The battle canvas draws them over the body (`drawGearMarks`); roster
  portraits draw the same marks as SVG.
- **Traits** (`src/combat/traits.js`): one per hero, rolled at creation. Combat traits
  feed `classlessHeroDerived` and the hit, heal and kill paths; XP traits apply when an
  encounter resolves. Older saves get a random trait on load.
- **Recruiting:** the guild always has a waiting candidate (trait + look). The player names
  them (16 characters max), may pick another look for free, or pays 25g for a different
  candidate. Recruit cost scales with the roster size, so retiring keeps it affordable.

## Familiars (`src/combat/pets.js`, `src/game/pets.js`)

Five species with a role: Wolf (melee hunter), Hawk (ranged, marks prey: its partner
deals +10% to it; road: spot ambushes, stalkers), Imp (ranged, burn), Sprite (heals its
partner 3% max HP every 3s; road: morale), Stonebark Tortoise (partner takes 6% less
damage, 5% max HP shield every 8s). Pets can't be targeted. One quality at birth (Fierce,
Quick, Loyal, Keen Nose, Lucky, Brave); levels 1–10 from 50% of their partner's fight XP;
a choice of two mods at levels 3, 6 and 9. Attack damage grows 12% per pet level and 8%
per partner level; kills count for the partner. A pet's road effects join its partner's
(`heroRoadEffects`). Getting one: the first win over each boss type (`guild.crateBosses`)
with a level 10+ leader (`heroIds[0]`, `CRATE_LEVEL`) queues a crate in `guild.petCrates`
holding every species in shuffled order (`earnPetCrate`); `CrateDialog` shows identical
crates and `openPetCrate` bonds the picked one with that leader (an old pet goes to
`guild.kennel`). Measured (`npm run scenarios -- --group companions`, plus a direct
Bog Lich fight): pets help without dominating; wolves cut that boss fight ~22%, sprites
leave the party at 58% HP instead of 33%.

## Crystals (`CRYSTALS` in gear.js, items.js)

Sockets: common 0, uncommon/rare 1, epic/legendary 2, +1 for weapons (max 2). Weapon
crystals: Ember (burn), Frost (chill), Venom (poison 4s), Storm (shock: chance to arc 60%
of the hit to a foe within 110 px), Swiftness (attack speed), Blood (lifesteal). Armor
crystals: Hearth/Tide/Purity/Dawn (cold/heat/toxic/dark resistance), Vigor (max HP %),
Stone (defense). Tiers Chipped/Flawless/Radiant; three fuse into one of the next tier.
Infused crystals are part of `composeStats`. Sources: Market (45g Chipped), 1–12% of
kills by tier, a Chipped one with every treasure map, a Flawless one from every end boss.
Extracting costs 30g per tier and returns the crystal.

## Supply styles

`hero.supplyStyle` scales each healing item's threshold (Cautious ×1.3, Balanced ×1,
Thrifty ×0.65); `hero.savePotions` keeps potions until an elite or boss is on the field
(and at camp).

## Tutorial and hints (`src/game/tutorial.js`, `src/game/hints.js`)

- **Tutorial:** ten steps (`TUTORIAL_STEPS`), each pointing at an element by CSS selector
  (`TutorialOverlay` frames it and places its card out of the way). Steps advance when the
  player does what they ask (`advance(guild, ui)`, with `ui` = tab, gear sheet open, in
  battle) or on a button; `skipUnless` passes over steps that no longer apply (the hall
  steps once a party is out, the battle step after sneaking past). Progress is saved in
  `guild.tutorial`; saves from before the tutorial count as done. The tutorial's first
  trip (`startExpedition(..., { tutorial: true })`) has its first event after 6 seconds:
  an easy two-enemy sighting, never an ambush, whose prompt waits (`pending.patient`)
  while the game is open.
- **Hints:** `guildHints` lists up to three things to deal with (unspent AP/SP, better
  vault gear of the same weapon kind by `gearScore`, low arrows, empty quick slots with
  supplies in the stash, a newly opened region, a hero ready to retire), each with a
  button to the right screen. Shown in the Guild Hall once the tutorial is over; "hide"
  hides them for the session.

## Qualities (`src/combat/traits.js`, `src/game/qualities.js`)

Qualities are who a hero is (stored as `hero.traits`). Perks, abilities and gear are the
player's build; qualities are never chosen.

- **Innate** (one at recruitment, `INNATE_KEYS`): combat qualities (numbers in
  `effects`), road qualities (`road` effects read by the expedition), and mixed ones with a
  drawback. Road effects are summed across the living party with caps
  (`partyRoadEffects`): `ambush`, `ambushVolley`, `spotAmbush`, `nightAmbush`, `campGuard`,
  `stalkerDetect`, `sneak`, `moraleBase`, `moraleLossCut`, `moraleOnWin`, `moraleWhenLow`,
  `moralePerDanger`, `findChance`, `rareChance`, `goldFind`, `gambleLuck`, `scavengeOnWin`,
  `postFightHeal`; `hazardDodge` and `envDrain` are personal.
- **Evolved** (`EVOLVED_KEYS`, three tiers each, `hero.qualityTiers`): developed at levels
  10 and 16 (`QUALITY_MILESTONES`) once the hero has 15+ fights on record. Each evolved
  quality scores the hero's history (`hero.history`: trips, fights, wins, kills,
  elite/boss kills, melee/ranged hits, crits, damage dealt/taken, heals, narrow escapes,
  knockouts, sneaks, hard ambushes, low-morale wins). Scores mostly compare against normal
  rates (calibrated with `npm run balance -- --histories`). Candidates scoring 0.8 / 1.6 /
  2.4 earn tier I / II / III; one is picked at random weighted by score (×0.4 if another
  hero in the guild already has it); a later milestone can deepen a quality instead. With
  no candidate, the hero gains a new innate quality. The player sees the story
  (`hero.qualityLog`), never the numbers.
- **Combat effects of evolved qualities:** `rangedCrit`, `critDamage`, `execute` (Master
  Marksman: a ranged crit finishes a non-elite, non-boss, non-legendary foe left below 20%
  HP), `meleeDamage`, `lowHpGuard` (below 30% HP), `eliteDamage`.
- **History** is tallied by the engine per hero (`_tally` → `hero.battleStats` on the
  runtime model) and folded in by `recordFight` when a fight resolves; sneaks and trips are
  recorded by the expedition.

## Stalkers (`expedition.js`)

In regions of tier 2+, 15% of encounters become a stalker instead: `run.stalker` (a
Stalker plus one regional creature) follows the party with only a vague feed line. Each
event: it strikes if a hero is below 35% HP, the party below 55%, or after 12 events; an
unnoticed strike hurts the weakest hero an extra 12% and opens with a volley. Otherwise
the party notices it with 3% + `stalkerDetect` (Tracker 18%, Paranoid 12%, Keen-Eared 5%)
→ a story prompt: turn and fight (no volley), try to lose it (a sneak roll), or keep going
ready for it (its strike loses the volley). Camp rests have a 20% chance of a raid; a Light
Sleeper turns the raid's volley into a warning.

## Enemy behavior families (`C.ENEMY_FAMILIES`)

Hunter, predator, protector, disruptor, attrition, ambusher, skirmisher and watcher tags
on every enemy type, shown on encounter prompts as "Threats". Generic behavior: `hunter`
chases the hero with the lowest HP share; `predator` hits heroes below half HP 40% harder;
`watcher` lowers the party's sneak chance by 12% each. Legendary monsters gain hunter and
predator. New enemies: Harrier (hunter + predator), Carrion Priest (sacrifices an ally
below 25% HP to heal the squad 20% and empower it +15% damage for 6s, or devours a corpse
for 10%), Watcher (marks a hero: +15% damage taken for 4s) and Stalker (elite; its first
strike hits 1.5×).

## Enemy ecology (`src/game/ecology.js`, `C.ENEMY_ROLES`)

Squads are compositions, not piles. Rule for every future enemy: what decision does it
force, which existing enemies does it interact with, and what can the player do about the
combination? No enemy gets a bonus for its allies being present; synergy comes only from
behaviors it already has.

- **Roles** (`C.ENEMY_ROLES`, layered over families): pressure (Sapper, Harrier, Bandit,
  Stalker, Reaper), support (Carrion Priest, Lesser Necromancer), control (Watcher, Dark
  Elf, Warlock), anchor (Bulwark), wildcard (Sapper, Necromancer); the rest are frontline.
  Shown on the prompt as "Roles".
- **Bulwark** (protector + attrition, anchor; 180 HP, slow). Fights whoever reaches it;
  otherwise stands 44 px out from its most threatened ward (support/control ally, by
  nearest-hero distance) toward that hero, hurrying when the hero is within 200. Its shield
  (`shield` on the enemy) multiplies weapon damage it takes: bow 0.8, staff 1.15. A hero
  hit on another enemy whose line passes within 24 px of a Bulwark (hero more than 70 px
  from the target) puts half the damage on the Bulwark (`BULWARK_COVER`); otherwise allies
  within 60 px of one take 10% less. Area and damage-over-time hits ignore it.
- **Battlefield reading:** Harriers hunt the most wounded only once someone is below 70%,
  and otherwise skirmish (strike the nearest, fall back 0.6 s). Watchers mark the unmarked
  hero with the most of their squad within 90 px (then the most wounded). Sappers with a
  Bulwark keep 22 px behind it until they are within 110 px of a hero.
- **Templates** (`ECOLOGIES`): Hunt Pack, Death Cult, Grave Court, Kill Team, Demolition
  Crew. "fodder"/"frontline" slots draw plain fighters from the region's pool.
  `region.wildlife.ecology = { chance, templates }`: Boneyard 20% (Death Cult, Grave
  Court), Frostfang 30% (Hunt Pack, Kill Team), Ashen 35% (all but Hunt Pack), Blightmire
  35% (Death Cult, Hunt Pack, Grave Court). The Gutter has none. Templated waves carry
  `wave.ecology`; legendary, stalker and tutorial squads never use templates.
- **Limits** (`SQUAD_LIMITS`, `constrainSquad`, every wild and Rift squad): ≤1 Bulwark,
  Watcher, Necromancer, Priest; ≤2 Sappers, Dark Elves; ≤2 support and ≤2 control; never
  all support/wildcard. Offenders become plain fighters.
- **Threat intel** (`readFormation`): a formation's name shows once `guild.ecologySeen`
  has it or a party hero is level 8+ (`FORMATION_VETERAN_LEVEL`); otherwise only its sign.
- **Measured** (`npm run scenarios -- --group ecology`, single fights, and `--group party`
  against main at 48 trips): no formation costs a baseline party a fight; they cost time
  and arrows (Grave Court: ~40–47 arrows for a bow party vs ~20–26 for an ordinary squad).
  Whole-trip win rates for every party make-up stay within noise of the pre-ecology game.
  Known, pre-existing: all-bow parties win far less than all-sword parties past the
  Boneyard (Frostfang ~25–40%, Ashen ~20%, Blightmire 0%), with or without ecology.

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

## Luck (`src/combat/luck.js`)

A fifth stat bought with SP (heroes start at 0; old saves get 0). It never adds damage or
HP. Per point (`LUCK.perPoint`), with points past 20 counting half: +0.2% crit chance
(inside the 50% cap), +0.1% dodge (inside agility's 35% dodge cap), +2% weight on
uncommon-or-better gear drops (`rollLoot` `luck`), +0.5% road gamble odds (`gambleLuck`),
+1% finds (`findChance`), +2% rare encounters (`rareChance`) and 1% off wandering
merchants (`merchantDiscount`, max 25%). Battle effects use the hero's own Luck
(`classlessHeroDerived`); road effects, loot and merchants use the party's average
(`partyRoadEffects`, `createEncounterSim`). The Perks screen lists a hero's Luck effects.

Measured (`npm run scenarios -- --group luck`, 48 trips, baseline mixed party; win rate
only, so Luck's loot, event and price value doesn't show):

| SP spent on | Boneyard (2 SP) | Frostfang (3) | Ashen (5) | Blightmire (9) |
| --- | --- | --- | --- | --- |
| attack/defense (default) | 71% | 83% | 81% | 79% |
| all luck | 65% | 67% | 58% | 48% |
| half luck, half attack | 65% | 65% | 69% | 69% |
| all attack | 73% | 90% | 81% | 77% |
| all defense | 58% | 77% | 60% | 50% |

So Luck is a real trade: a party that pours everything into it fights noticeably worse
(about as much as one that pours everything into Defense) in exchange for loot, events
and prices. Side finding: Defense points are weak next to Attack.

## Difficulty and weapon balance (Oct 2026, second pass)

Target: a party of four at a region's minimum level, common gear one tier below the
region, playing idle (`npm run scenarios -- --group party`), wins about 70% of whole trips.
Measured at 64 trips per scenario after tuning:

| Region | HP × | Damage × | mixed | swords | bows | bows, 2 stacks | staves | trio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Boneyard Crypt | 3.3 | 2.8 | 72% | 58% | 100% | 95% | 98% | 38% |
| Frostfang Pass | 2.52 | 1.92 | 77% | 95% | 66% | 33% | 48% | 3% |
| Ashen Keep | 3.07 | 2.31 | 78% | 100% | 78% | 25% | 63% | 0% |
| The Blightmire | 4.63 | 3.35 | 80% | 95% | 0% | 58% | 97% | 3% |

("bows, 2 stacks" swaps every bandage and potion for a second arrow stack.) The Gutter is
unchanged: it teaches the basics.

How the weapons got closer (before: all-bow parties won 0–40% past the Boneyard):

- **Kiting:** auto ranged heroes backpedal at half speed from an enemy within 45 px of
  their body, for the first 40% of each reload (`_kite`, `KITE_*`). Unlimited kiting made
  ranged parties untouchable (heroes are ~5× faster than most enemies), hence the limits.
- **Dodging:** heroes on auto step away from a lobbed bomb or bile whose fixed landing
  point is within its splash (+8 px) and lands within 0.8 s (`_dodgeBlast`). The landing
  circle is drawn. Manual heroes are never moved by either.
- **Bows:** damage ×1.45, interval ×1.15 (≈87% of a sword's damage per second, more per
  arrow). Arrow stacks hold 100 (`ARROW_STACK`).
- **Bosses** (`npm run scenarios -- --group bosses`, fresh party): every make-up beats every
  boss except all-bow parties on one stack at the Bog Lich, which needs ~470 arrows. With
  two stacks they win; it's the one place archers have to prepare for.

Known gaps: three-hero parties (the starting roster) rarely win past the Boneyard; the
best single-weapon party differs by region (ranged in the Boneyard, swords elsewhere).

## Balance (Oct 2026, `npm run balance`)

Heroes close on enemies that sit out of range (previously warlocks and the demon could
out-range the party and stall a fight until it wiped).

| Region | HP × | Damage × | Result |
| --- | --- | --- | --- |
| The Gutter | 0.9 | 0.9 | Tutorial: every 10-minute trip succeeds at LV 1 |
| Boneyard Crypt | 2.0 | 1.7 | First clear on the first try, about an hour into the game (LV 4–5) |
| Frostfang Pass | 2.1 | 1.6 | First clear about 1.5 hours in (LV 6–7) |
| Ashen Keep | 2.0 | 1.5 | First clear about 2–3 hours in (1–4 attempts, LV 7–11) |
| The Blightmire | 3.6 | 2.6 | First clear 3–9 hours in (LV 11–15); about half of unattended runs win, active players win |

The Bog Lich has 9,000 base HP and 70 damage. Bosses lob bombs and bile only at heroes
more than 90 px away (heroes in melee face their regular attacks); the Abomination's slam
still punishes melee. Melee reach is measured from the edge of the target's body, so
swords can hit bosses and elites (before this fix a sword could never reach a boss, and
heroes crowding a boss could shove it off the top of the field).

**Scenarios** (`npm run scenarios`, Oct 2026): every party make-up of three or four
heroes clears every region; duos and solo heroes struggle from Frostfang Pass on. Without
spare arrows an all-bow party could run dry on the 40-minute Blightmire trip (fixed by
camp arrows, pre-boss arrow gathering and 75% recovery). No quality changes win rates
beyond the noise; road qualities show up where they should (Keen-Eared, Trailwise and
Paranoid halve ambushes; Nimble and Swift parties sneak past far more fights; morale
qualities push morale to its cap). Revives mostly show up as HP left at the end of a trip
(a Gravebinder Ring on everyone: 57% vs 24% in the Blightmire).

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
