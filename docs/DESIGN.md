# Gauntlet — Design Notes

Gauntlet is an idle expedition game (Idle Castle / Gutter Quest style) whose fights run
on the Demonanic combat engine.

## Core loop

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree, equip
   gear from the vault, buy supplies and load them into quick slots.
2. **Expedition Board:** choose a destination and a party of 1–4 ready heroes.
3. **Adventure (timed, `src/game/expedition.js` + `adventure.js`):** the party explores
   for the region's duration (6–20 min). Every 20–40s a feed event fires, weighted
   flavor 28, find 20, hazard 10, encounter 36, story choice 6, rare 3 (plus environment 12
   in harsh regions). Encounters are the backbone: after 2 events in a row without one,
   the next event is always an encounter, so a trip sees a fight about every 45–60 s of
   road (see Combat pacing).
   Before an end boss the party takes a breather: everyone heals 30%, heroes knocked
   out on the road get back up for the final fight, and archers gather 15 spent arrows.
   After every won fight each standing hero heals 25% (`AFTER_FIGHT_HEAL`).
   At camp (10+ minute trips), fallen heroes come around at 10% HP, anyone below 40% HP
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
- **Camp:** trips of 10+ minutes stop halfway: Rest (heal 30%), Scout ahead (+15% sneak
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
  `--trace <region>` prints every trip there (party levels, gear, supplies, how it
  ended); `--until <region>` stops each playthrough after its first trip there.
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
- **Arrows:** bows draw one arrow every 4 shots (`ARROW_SHOTS`) from the first quick slot holding arrows; no
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

- **Tutorial:** eleven steps (`TUTORIAL_STEPS`), each pointing at an element by CSS selector
  (`TutorialOverlay` frames it and places its card out of the way; a step may list several
  selectors and the first one on screen wins). Steps advance when the
  player does what they ask (`advance(guild, ui)`, with `ui` = tab, gear sheet open, in
  battle) or on a button; `skipUnless` passes over steps that no longer apply (the hall
  steps once a party is out, the battle step after sneaking past). Progress is saved in
  `guild.tutorial`; saves from before the tutorial count as done. The tutorial's first
  trip (`startExpedition(..., { tutorial: true })`) has its first event after 6 seconds:
  an easy two-enemy sighting, never an ambush, whose prompt waits (`pending.patient`)
  while the game is open.
- **Free fourth hero:** three-hero parties rarely win past the Boneyard at the ~70% difficulty
  target, so a guild's first recruit is free while its roster is under four
  (`freeRecruitAvailable`, `guild.freeRecruitUsed`). The tutorial's "One more hero" step,
  right after the roster, points at Recruit and then Hire, and advances once there are four
  heroes. Old saves with three heroes get it too, through a "Next up" hint that opens the
  recruit dialog. After it, recruits cost what they always did (the fifth hero 128g).
- **Starter armor:** every new hero (starters and recruits) comes with common tier-1 helm,
  cuirass, greaves and bracers as well as their weapon (`STARTER_ARMOR` in `guild.js`).
  Region difficulty is tuned for at least that much armor, but armor only drops 4–8% of
  the time from ordinary enemies, so new parties used to reach the Boneyard in little more
  than their weapons. Traced with `npm run balance -- --runs 12 --trace boneyard --until
  boneyard`: idle players' first Boneyard trips went from 5 of 11 won (the losses: worn
  down, or overrun right after an ambush) to 8 of 12; active players from 10 of 12 to 12 of 12.
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

## Nemeses (`src/game/nemesis.js`)

- **Rising:** after a fight in a region of tier 2+ (`NEMESIS.fromTier`), each creature that
  downed a hero (the engine records the last enemy to hit each hero who falls:
  `engine.downed`, passed on as `outcome.downed`) may rise as a nemesis: 35% per fight
  (`riseChance`), always if the party was wiped. Bosses and summoned or raised minions
  never rise. One per region, three active at most (`maxActive`). It gets a name
  (`nemesisName`), its victims (hero id and name) and level 1.
- **Leveling (automated):** +1 level every 2 hours of real time (`growthHours`, computed
  on read by `nemesisLevel`, settled into `level` by `growNemesis`), +1 per hero it downs
  and +1 for wiping the party (`nemesisTriumphs`), +1 when it flees. Cap 10.
- **Stats** (`nemesisStats`, on top of the region and depth scaling): HP ×(3 + 0.3 per
  level after 1), damage ×(1.3 + 0.08 per level). Traits: Relentless at LV 3 (attacks
  25% faster: `enemy.attackSpeed`), Ironhide at 5 (HP ×1.25), Regenerating at 7 (1% max
  HP per second: `enemy.regen`), Dread at 9 (damage ×1.15 and it never flees).
- **Meeting it:** each ordinary encounter in its region has a 12% chance
  (`appearChance`, doubled if one of its victims is in the party) to be the nemesis
  instead, at most once a trip (`run.nemesisMet`). `buildNemesisEncounter` puts it at the
  head of a normal multi-wave encounter as a named elite that hunts the wounded; the
  feed and prompt name it, its level and traits, and whom it remembers. Its name and level
  float above it in battle.
- **Fleeing:** below 20% HP it rolls once per fight (50%, `fleeChance`) to escape
  (`engine._nemesisTick`); it leaves the wave, the fight goes on, and it gains a level.
- **Slain:** gold 45 × level × the tier multiplier, a Rare/Epic trophy one tier up (Epic
  from LV 6), +20 morale, and every hero in the party it once beat gets 40 XP × its level.
  The last 12 slain stay on the Guild Hall's Nemeses board.

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
- **Champions** (owner-approved, Oct 2026; `championFor`, `CHAMPIONS` in regions.js,
  `_championTick` / `_vampiric` in the engine): boss ranks 5, 10, 15... (`CHAMPION_EVERY`)
  rotate Warded (at 66% and 33% HP restore 15% max HP), Swarming (two skeletons every 4 s,
  up to 6 summons alive), Frenzied (below 50%: attack speed ×1.4, damage ×1.2, once) and
  Vampiric (2% max HP back per hit landed, melee or projectile). The boss is named for it
  ("Frenzied Abomination"), the feed explains the mechanic, and a kill pays double bounty
  and a second Flawless crystal.
- **The Endless Rift** (LV 3+): one continuous fight. Each cleared wave rolls into the next
  after 3 seconds; HP ×1.10 and damage ×1.07 per wave, squads grow to 8, a lieutenant
  every 5th wave and a rotating boss every 10th. Loot tier rises every 5 waves. Return home
  at any time to keep everything plus 10 gold per wave; a wipe keeps half. Best wave is
  recorded.

## Bonds (`src/game/bonds.js`, `BONDS`)

Owner-approved design (Oct 2026).

- **Growth:** `state.bonds[bondKey(a, b)] = { wins, comrades?, sworn?, askAt? }`. After
  every won fight, each pair of heroes still standing gains a win (`recordSharedWin`, in
  `applyFightResult`). Acquainted (10 wins) is automatic. Comrades (30) and Sworn (75) are
  the player's choice (owner's call): the feed says the pair could bond, and
  `bondOffers` lists it on the Guild Hall's Bonds card (`BondOffers`), which explains the
  bond and asks; `answerBond` accepts, or on "Not now" sets `askAt` 10 wins later. Sworn is
  offered only while neither hero has a Sworn partner (`swornPartner`), so accepting one
  pact withdraws the hero's other Sworn offers. Unattended play never decides.
- **Separation** (`separation`, in `startExpedition`): each Comrade (2) or Sworn (4)
  partner left at home costs the party morale on departure ("Kestra misses Brann").
- **Progress:** the roster shows wins toward the next step ("Comrades: Odo · 34/75").
- **Into battle:** `currentEncounterParty` gives each hero `bonds` (`combatBonds`: Comrades
  or Sworn partners in this fight). The engine's `_bondDamage` adds +5% while any such
  partner is standing, +25% for 10 s of Vengeance after one falls (`_bondsReactToFall`,
  from `_heroDowned`), -10% for the rest of the fight if Shaken instead (traits Stalwart,
  Steadfast, Paranoid), and memories of the retired.
- **Sworn guard** (`_swornGuard`, after each hit in `_resolveClasslessHeroDamage`): when a
  hero drops below 25% HP, their Sworn partner (if standing, once per fight) jumps beside
  them and adds a shield of 20% of their max HP.
- **Retiring** (`rememberRetired`, in `retireHero`): Comrade and Sworn partners get a
  memorial (`hero.memorials`, +3% damage each, at most 3); all bonds with the retired
  hero are removed.
- **UI:** the roster and party picker list a hero's bonds and memories (`HeroRow`).

## Push deeper (`DEEPER` in expedition.js)

Owner-approved design (Oct 2026): set-length legs, not an open-ended run, so the
press-your-luck question comes back every few minutes.

- **When:** where a trip used to end in victory (`reachEnd` without a boss, or after the
  end boss falls), `offerDeeper` opens a `deeper` prompt: `push` or `home`. The guided
  tutorial trip (`run.guided`) just ends. The region bounty and clear count once
  (`run.explored`).
- **A leg:** 3 minutes (`legMs`) of ordinary road. Creatures use `deeperRegion(region,
  depth)`: HP and damage ×1.15^depth (`deeperDanger`; legs 1–3 +15/32/52%, leg 10 ×4),
  for every encounter, boss-free. `tripRegion(run)` feeds it everywhere a trip builds
  enemies. Surviving a leg (`finishLeg`) adds 30% × depth of the gold found during that
  leg, plus 20% × depth of the bounty the trip paid (`bountyShare`, `run.bounty`, so a
  leg pays about as well per minute as a new trip; without it idle guilds pushing 3 legs
  fell from boss rank 24–27 to 16–18 eight hours after the campaign), and a cache of gear one tier up (uncommon/rare at leg 1, rare/epic from 2,
  epic/legendary from 4), then the prompt comes back.
- **Stakes:** the first push banks the trip's loot (`run.banked`). A wipe resets the loot
  to the banked amount before the usual halving (`halveLoot`); a recall keeps everything.
- **Unattended** (`decideDeeper`): pushes while the party is whole and at 60%+ HP (45% with
  a Reckless or Berserker along), at most 3 legs (`autoMaxDepth`); the player has no cap.
- **Measured** (`npm run balance`, 6 idle and 6 active playthroughs): the campaign ends
  112–182 minutes in as before; unattended parties push on most trips (avg 2.6–3 legs) and
  rarely fall. Eight hours after the campaign, idle guilds earn ~195 gold/min (170 before
  push deeper) but reach boss rank 16–18 instead of 24–27: time spent deeper isn't spent
  on boss fights. Owner's call: keep it; depth is a second way to progress.
- **Records:** `state.records.deepest[regionId]`; reports carry `depth`. The balance and
  scenario scripts count a finished trip as won even if the depths went badly.

## Clutch (Fortune perk F2a, `CLUTCH` in engine.js)

A Gauntlet addition to the Bible's Fortune branch: tier 2 (level 5, 2 AP, after F1); F3
Jackpot now follows F2 or F2a. Owner-approved design (Oct 2026):

- **Trigger** (`_resolveClasslessHeroDamage`): a hit leaves the hero alive with HP no more
  than that hit's damage (the same hit again would kill). Once per hero per fight
  (`hero.clutchUsed`), one moment at a time.
- **Live battle:** the engine calls `onClutch(info)` and runs at 20% speed
  (`CLUTCH.slowMotion`) for 5 real seconds (`CLUTCH.seconds`, measured before the speed
  setting); the Battle screen shows the prompt and calls `resolveClutch("drink" | "crit")`.
  On timeout, or if the hero falls meanwhile, the moment ends.
- **Drink:** the quick slot with the strongest healing item (heal bonuses and environment
  cuts apply), else a 30% max-HP second wind (`CLUTCH.secondWind`). Not limited by the
  quick-item cooldown or the sustain cap.
- **Ultra Crit:** on the hero's current target (else the first enemy alive), chance 15% +
  Luck × 0.5% (`clutchCritChance`). A landed hit kills a non-boss outright (nemeses and
  legends included) and takes 25% of a boss's max HP (`CLUTCH.bossDamage`); credited to
  the hero. A miss does nothing more.
- **Who decides without the player:** `clutchDefault`: heroes with Reckless or Berserker
  (`CLUTCH.gamblers`) swing, everyone else drinks. Headless fights (unattended trips,
  simulations) resolve at once. Outcomes (`engine.clutches`) reach the expedition feed.

## Luck (`src/combat/luck.js`)

A fifth stat bought with SP (heroes start at 0; old saves get 0). It never adds damage or
HP. Per point (`LUCK.perPoint`), with points past 20 counting half: +0.2% crit chance
(inside the 50% cap), +0.1% dodge (inside agility's 35% dodge cap), +2% weight on
uncommon-or-better gear drops (`rollLoot` `luck`), +0.5% road gamble odds (`gambleLuck`),
+1% finds (`findChance`), +2% rare encounters (`rareChance`), +0.5% Clutch Ultra Crit
(`clutchChance`) and 1% off wandering
merchants (`merchantDiscount`, max 25%). Battle effects use the hero's own Luck
(`classlessHeroDerived`); road effects, loot and merchants use the party's average
(`partyRoadEffects`, `createEncounterSim`). The Perks screen lists a hero's Luck effects.

Measured (`npm run scenarios -- --group luck`, 48 trips, baseline mixed party, after the
Defense fix below; win rate only, so Luck's loot, event and price value doesn't show):

| SP spent on | Boneyard (2 SP) | Frostfang (3) | Ashen (5) | Blightmire (9) |
| --- | --- | --- | --- | --- |
| attack/defense (default) | 73% | 79% | 67% | 77% |
| all luck | 56% | 63% | 52% | 44% |
| half luck, half attack | 67% | 69% | 54% | 63% |
| all attack | 71% | 75% | 83% | 67% |
| all defense | 67% | 77% | 79% | 77% |

So Luck is a real trade: a party that pours everything into it fights noticeably worse in
exchange for loot, events and prices.

**Defense points** (`DEFENSE_PER_POINT`, `statDefense` in `heroModel.js`): defense works on
a curve (damage × 100 / (100 + defense)), so one point added under 1% survivability
while an Attack point added 2–4% damage, and all-defense parties won 50–77%. Each SP in
Defense now counts as 4 defense (about 2.5–3% survivability per point); gear defense is
unchanged. All-defense and all-attack parties now land close together.

## Combat pacing (Oct 2026)

Fights used to be over in a few seconds, with long road gaps in between. Now the fights
are the main event:

- **Waves:** an ordinary encounter comes in 3 waves (`ENCOUNTER_WAVES`; the Gutter's
  wildlife sets `waves: 2`) with a 3 s breather between them (`WAVE_BREAK_SECONDS`); the
  battle header shows "Wave x/y". The first wave can use an ecology template; the others
  are plain squads. Legendary monsters, stalkers and the tutorial fight are one wave.
- **Tougher, slower-hitting enemies:** every enemy gets HP ×2.6 and damage ×0.45
  (`COMBAT_PACING`), so abilities, perks and positioning have time to matter. A whole
  encounter lasts about 45–90 s.
- **Bosses** use their own pacing (HP ×1.1, damage ×0.45) and bring one guard wave of the
  region's wildlife first (`wave.vanguard`). The Demon and the Imperial Necromancer only
  summon up to 4 living minions (`BOSS_MINIONS`); uncapped, the Ashen Demon buried idle
  parties (mixed party 38% → 100%). Boss fights run 70–120 s; the Bog Lich about 4 min.
- **Arrows:** a bow spends one arrow every 4 shots (`ARROW_SHOTS`); longer fights would
  otherwise eat 100+ arrows each.
- **Trips:** 6 / 10 / 12 / 15 / 20 minutes (Gutter → Blightmire), events every 20–40 s,
  encounter weight 36 and at most 2 quiet events in a row, camp on 10+ minute trips. A
  trip has about 7 (Boneyard) to 17 (Blightmire) fights, so with the fights played out a
  trip takes about as long as before. After each won fight the standing heroes heal 25%
  (`AFTER_FIGHT_HEAL`) so each fight is its own challenge rather than one long bleed.

Region multipliers were retuned for the ~70% baseline (40 trips per scenario):

| Region | HP × | Damage × | mixed | swords | bows | staves | trio |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Boneyard Crypt | 2.48 | 1.67 | 68% | 93% | 100% | 100% | 10% |
| Frostfang Pass | 2.95 | 1.59 | 78% | 95% | 88% | 73% | 0% |
| Ashen Keep | 3.07 | 1.67 | 75% | 88% | 88% | 93% | 0% |
| The Blightmire | 4.63 | 1.66 | 80% | 93% | 85% | 95% | 5% |

Campaign (`npm run balance`, 6 playthroughs each): idle players finish the Blightmire
111–266 minutes in, active players 116–168; boss rank 25–27 eight hours later. The
mixed party is now the weakest four-hero make-up; trios rarely win (every guild gets a
fourth hero in the tutorial). The table below is the previous pass, for comparison.

## Difficulty and weapon balance (Oct 2026, second pass)

Target: a party of four at a region's minimum level, common gear one tier below the
region, playing idle (`npm run scenarios -- --group party`), wins about 70% of whole trips.
Measured at 64 trips per scenario after tuning:

| Region | HP × | Damage × | mixed | swords | bows | bows, 2 stacks | staves | trio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Boneyard Crypt | 3.3 | 2.8 | 72% | 58% | 100% | 95% | 98% | 38% |
| Frostfang Pass | 2.95 | 2.25 | 77% | 94% | 77% | 16% | 66% | 0% |
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

**Bandit Warlord** (Frostfang's boss): every 10 s he calls bandits, but only to top his
gang back up to three alive (`WARLORD_GANG`), never past it. Before, he added two every
10 s with no limit, so a party arriving worn out from the trip was buried in bandits: all
of the idle campaign's Frostfang losses were at him (`npm run balance -- --trace frostfang
--until frostfang`: idle first trips won 7 of 14, active 12 of 14). The cap alone made
the region too easy (baseline 98%), so Frostfang's enemies were raised ×1.17 (HP 2.95,
damage 2.25; the row above is after both). Now: baseline 77%; idle first trips 10 of 15,
active 15 of 15.

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
