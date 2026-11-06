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
- `--seed N` on `balance`, `scenarios` and `ranks` makes a run repeatable (same seed and
  flags, same numbers). In the game, randomness comes in as an `rng` function
  (`src/game/random.js`): `Math.random` in play, `seededRandom(seed)` in tests and tools.
  The combat engine and encounter sim take it from `createEncounterSim(..., { rng })`.
- `scripts/simKit.js`: the scripted player both scripts share (perk and stat build,
  "active" ability use).
- `src/screens/`, `src/components/`: React UI (Tailwind).

## Equipment

A deliberately small model (not Demonanic's 11 slots), defined in `src/combat/gear.js` and
`src/game/items.js`:

- **Gear slots:** head, chest, legs, arms, weapon, secondary, amulet/ring. Gear adds flat
  attack, defense, max HP, agility (dodge) and crit chance.
- **Rarity × tier:** Common ×1, Uncommon ×1.25, Rare ×1.5, Epic ×1.8, Legendary ×2.1 (flattened Oct 2026
  from ×1.5 / 2.2 / 3.2 / 4.2; older saves are rescaled once, `rescaleItemRarity`), multiplied by the
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

## Spells and moves, part 4: Conjuration and Mirror Self (Nov 2026, `SPELLS`, `ELEMENTALS`, `heroes/conjured.js`)

Owner-approved plan (Sam: blades go by spell rank; summons stack; "a sword spinning in mid air: anything that gets close just gets hurt"), then retuned on Sam's picks after measuring (blades 25% → 15%; the elemental 50% / 30% HP / 34 mana → 80% / 40% / 24; Mirror Self 40% → 60%, fooling every foe on the caster). Draft PR #59.

- **Conjuration**, a new school (blue, `#60A5FA`; learned like any other with Elementalism). Two spells, at I and IV (no II spell).
  - **Spectral Blades** (I, 20 mana, 18 s, 10 s): one sword per spell rank (I–V). Foes can't hit them. Each blade flies to a foe near the party (blades spread over the closest foes, within 320 of the caster; a new pick every 1.5 s), spins around it, and cuts every foe within 22 px of it (plus the foe's body) once a second for 15% of the caster's attack, scaled by spell power. With no foe it circles the caster.
  - **Summon Elemental** (IV, 24 mana, 30 s, 12 s): an elemental of the caster's best other school (highest proficiency; ties: the first learned; none: Arcane). 40% of the caster's HP, foes can hit it, one hit a second for 80% of the caster's attack (scaled by spell power) with its school's touch: Fire burns (30%), Ice slows (30%), Poison poisons (40%), Lightning arcs to another foe (50%), Mind stuns 0.3 s (bosses a third), Shadow blinds (30% miss for 2 s; bosses half), Wild Magic webs (1 s every 4 s). Support schools' elementals hit for half and, every second, help allies within 120: Restoration heals 3% of max HP (within the 4% a second regeneration limit), Warding shields 2% (up to the shield cap), Enchanting has them attack and move 10% faster. The Spellbook shows which elemental a hero would call.
- **Mirror Self** (Shadow V, 30 mana, 35 s, 8 s): a copy of the caster with 60% of their attack and HP (fixed, not scaled by rank), using their basic attack (melee, or ranged up to 240; a bow copy needs no arrows). When it appears, every foe on the caster (fighting them, or within 110) but a boss turns on it until it goes or falls. Unlike a taunt this reaches every kind of foe (orcs, lieutenants, ghosts, Warlocks, role foes): a fooled foe walks to the copy and strikes it in melee (`mirrorTurn` in enemies/turn.js). It's drawn as the caster, see-through.
- **Stacking:** each summon is one at a time per caster, but blades, an elemental and a spirit beast can all be out together.
- **On auto:** blades once a foe is within 200 of the party, keeping the 20 mana reserve; the elemental like the spirit beast (a foe in the fight, the reserve); Mirror Self when the caster is under 60% and was hit in the last 1.5 s.
- **Measured** (sword with a wolf, bow with 40 arrows, the tested caster at V, a Fire III caster; level 8, common tier-1 gear, wild fights at depth 0.8; 120 seeded fights each; wins, damage the party took, the tested caster's share of the party's damage). Frostfang wild / Ashen wild / Blightmire wild / Boneyard boss:
  - Fire V: 116 / 87 / 47 / 120 wins; 613 / 914 / 1095 / 326 taken; 31–34%. Restoration V: 120 / 119 / 95 / 120; 691 / 971 / 1287 / 430. Fire V + Ice V: 119 / 86 / 42 / 120.
  - Conjuration V (Arcane elemental): 119 / 108 / 62 / 120 wins; 487 / 728 / 1024 / 231 taken; 44–46%; fights 15–20% shorter. Blades 1,500–3,650 damage a fight (2–6 casts); the elemental 270–470 (about 2 casts).
  - The same with blades off: 117 / 86 / 45 / 120; with the elemental off: 119 / 108 / 67 / 120 (the elemental doesn't pay for its mana). Restoration V + Conjuration V: 120 / 120 / 97 / 120, and 120 / 120 / 110 / 120 with the elemental off.
  - Mirror Self: never cast on auto (Shadow V's numbers match with it off). Cast by hand whenever a foe is within 150 of the caster: about 0.7–1 cast a fight, about 50 damage, wins and damage taken unchanged (119 / 96 / 50 / 120). Orcs, lieutenants, ghosts, Warlocks and foes with a role pick their own targets before a taunt counts (as with the tortoise), so most foes in these regions aren't fooled.
  - First version (25% blades; elemental 50% / 30% HP / 34 mana; 40% mirror pulling half) above. Shipped, on Sam's picks: Conjuration V 119 / 107 / 57 / 120 wins, 516 / 732 / 1018 / 263 taken, 39–42% of the party's damage; with the elemental off 119 / 100 / 52 / 120 (so the elemental now adds 7 / 5 wins in Ashen / Blightmire); blades 960–2,370 a fight, the elemental 460–1,010. Restoration V + Conjuration V: 120 / 120 / 95 / 120 (103 Blightmire wins with the elemental off: a Restoration elemental hits for half and its heal shares the regeneration limit). Fire V + Conjuration V: 118 / 100 / 49 / 120.
  - Mirror Self shipped (60%, fooling every foe on the caster, by hand): 119 / 95 / 48 / 120 wins, 458 / 802 / 1004 / 231 taken: still no measurable effect for a staff caster (about 70–85 damage a fight). Not measured: a melee Shadow hero.

## Spells and moves, part 3: Enchanting and two wards (Nov 2026, `SPELLS`, `heroes/spells.js`)

Owner-approved plan, reshaped after measuring.

- **Enchanting**, a new support school (pink, `#F472B6`; learned like any other with Elementalism):
  - **Haste** (I, 18 mana, 14 s): allies within 220 px of the caster attack and move 30% faster for 10 s. It stacks on top of the +20% attack-speed cap.
  - **True Aim** (I, 16 mana, 12 s): allies within 220 px can't miss in the dark and get +15% crit chance for 10 s. (Heroes only miss in the dark, so the planned "+25% hit chance" would do nothing elsewhere.)
  - **Endless Quiver** (II, 18 mana, 20 s): a bow ally shoots without using arrows, even with none left, for 10 s.
  - **Kindred Bond** (II, 20 mana, 20 s): an ally's familiar deals 50% more and takes 30% less for 15 s.
  - **Insight** (IV, 24 mana): the party earns 25% more XP from the rest of the fight, once a fight.
- **Warding** adds **Iron Skin** (II, 22 mana, 25 s): an ally takes 75% less from melee hits and arrows for 6 s; and **Spellguard** (II, 22 mana, 25 s): 75% less from magic bolts (Warlock, Priest, Lesser Necromancer, Watcher) and bombs. A Warlock's mage hunt counts as magic.
- Strengths are fixed (`amount`), not scaled by spell rank.
- **On auto:** Haste and True Aim once at least two allies nearby lack them and someone is fighting; Endless Quiver on a fighting archer with under 30 arrows; Kindred Bond when a familiar is near a foe; Insight once, keeping the mana reserve; Iron Skin on a hurt ally (below 70%, hit in the last 1.5 s) with a melee foe beside them, Spellguard on one with a magic shooter or boss within 320 px. The wards come after Barrier (owner's call after measuring).
- **Measured** (sword with a wolf, bow with 40 arrows, a caster of the tested school at V, a Fire III caster; 120 seeded fights each; wins, damage the party took):
  - First version (one ally, 6 s): Enchanting 118 / 103 / 69 / 119 wins (Frostfang wild, Ashen wild, Blightmire wild, Boneyard boss), against Fire 119 / 103 / 76 / 120 and Restoration 119 / 114 / 92 / 120; the most XP (about 15–20% more, from Insight). Longer buffs (10 s, Kindred Bond 15 s) changed nothing measurable: the caster has about 70 mana, spends most of it on Arcane Bolt, and casts each buff about once a fight.
  - Party-wide Haste and True Aim (shipped): 119 / 102 / 75 / 119 wins; damage taken 403 / 622 / 820 / 489, against 448 / 646 / 897 / 533 for the one-ally version and 421 / 671 / 823 / 515 for Fire; XP 306 / 299 / 228 / 415, against 254 / 245 / 179 / 345 for Fire.
  - Iron Skin and Spellguard were neutral either way (a Warding caster's damage taken within about 3% of main's; Iron Skin about 0.3 casts a fight, Spellguard almost never): tools to fire by hand at the right moment.

## Battle log (Nov 2026, `combat/battleLog.js`, `screens/Battle.jsx`)

Owner-approved (Sam's mockup; LOG tab + ticker chosen for phones).

- **Lines** (newest first, the last 60 kept, `LOG_CAP`): spells that land, with the target (support spells: the ally, or "the party"); fizzles, with the strain if any; special moves, with the target; control spells and hexes, with how many foes they took ("Enfeeble → Reaper + 2") or "resisted"/"no effect"; a hero down and what downed them; elites and bosses slain and by whom; Clutch moments; boss moments (enrage, Warlord's call, Raise Dead, champion wards, swarms, frenzy).
- **No flood:** hits, misses (darkness), crits, dodges, spells, fizzles, damage dealt and taken are counted per hero; every 10 s (`SUMMARY_EVERY`) each hero who did anything gets one line ("Brann · 6 hits, 2 misses, 1 crit, 2 dodges, 198 dmg, took 41"); at the end, "Victory"/"Defeat"/"Returned home" and a whole-fight line per hero.
- **Screen:** a LOG tab beside the hero tabs shows the log in place of the action panel, with filter chips (All · Spells · Moves · Deaths · Summary; control and hexes show under Spells, boss moments under Deaths) and Copy (plain text, oldest first, for pasting). A two-line ticker under the field always shows the latest lines. Tapping a hero tab closes the log.
- **Records only:** the engine writes to `engine.battleLog` and never reads it; no random numbers. With the log in, every characterization hash (fight results, party decisions, drawing) is unchanged.

## Spell targets (Nov 2026, `markHeroTarget`, `heroSpellTarget`, `enemyAt` in engine.js)

Owner-approved.

- **Tap a foe** on the battle field: it becomes the shown hero's spell target (a four-arc reticle in the hero's colour). Tap it again to clear it.
- Spells the player taps or queues go at the marked foe; queued spells aim at whatever is marked when they fire. Auto bolts and curses follow the mark while it's within 340 px. Out of range, spells fall back to the old choice (weapon target, then nearest) and the mark stays. A dead or turned (Dominated) foe clears it. Support, control and hex spells keep their own targeting.
- **Move orders armed** (tap the hero's tab twice): a tap on a foe is an attack order (`commandHeroAttack`, which existed but had no button); a tap on the ground is a move, as before.
- **Auto bolts and curses aim at the weakest foe in range** (300 px) when nothing is marked, then the weapon target, then the nearest (`AUTO_WEAKEST`; owner-approved after measuring). Measured: auto bolts on the weakest foe in range instead of the weapon target/nearest, for a sword, bow, Fire III and Ice III party, 120 seeded fights each (wins; damage taken): Frostfang wild 105 → 109, 648 → 631; Ashen wild 67 → 71, 926 → 901; Blightmire wild 36 → 40, 1121 → 1108; Boneyard boss 82 → 91, 944 → 872.

## Spells and moves, part 2: hexes (Nov 2026, `HEX` and the hex entries in `SPELLS`)

Owner-approved plan ("75% for seconds"), then reshaped after measuring.

- **Blind** (Shadow I, 16 mana, 12 s): foes within 70 px of the target miss 75% of their attacks for 6 s (melee, bolts and attacks on familiars; boss bombs are areas, not attacks, so Blind doesn't stop them).
- **Disarm** (Shadow II, 18 mana, 14 s): foes within 70 px can't attack for 3 s (they still move and use abilities).
- **Enfeeble** (Mind I, 16 mana, 12 s): foes within 70 px deal 75% less for 6 s (melee, bolts, bombs, a Sapper's blast).
- **Silence** (Mind II, 18 mana, 14 s): one foe uses no abilities for 5 s: boss abilities, champion powers, Warlock's mage hunt and shield break, Carrion Priest's sacrifice, a Lesser Necromancer's mending and raising (a raise in progress is broken off), Bandit Blitz.
- **Expose** (Mind IV, 20 mana, 16 s): one foe takes 30% more from the party's main kind of damage (melee, ranged or magic: whatever most living heroes carry; ties go to the caster's own) for 6 s.
- **Elites and bosses** (`HEX`): elites take hexes in full, bosses half (strength, or Silence and Disarm time). Magic-immune foes are unaffected. Each hex shows a small sign over the foe (Blind also a band over the eyes, Expose a reticle).
- **On auto** (`_autoHex`, after support and control spells, before damage spells): Silence on a boss, champion or a foe with abilities; Enfeeble, Disarm, then Blind centred where they catch the most fresh foes in the fight (2+, or a big one, or one on a hurt hero); Expose on a boss or elite above 40% HP.
- **Measured** (sword, bow, Shadow III and Mind III casters; 120 seeded fights each, wins / damage the party took):
  - First version (single target, 4 s, elites half, bosses a quarter): neutral to slightly worse than main (Frostfang wild 94 vs 104 wins in one run). Stronger single-target versions (elites full, bosses half, 8 s on a 10 s cooldown), casting hexes only after damage spells, and a player keeping hexes on the boss by hand were all within noise of main. With every foe permanently Enfeebled the party took about 75% less damage, so the hooks work; one hex on one foe for a few seconds, about twice a fight, was too little to matter.
  - Area version (shipped): Frostfang wild 110 vs 111 wins, damage taken 576 vs 613; Ashen wild 72 vs 67, 893 vs 913; Blightmire wild 42 vs 39, 1071 vs 1092; Boneyard boss 90 vs 90, 889 vs 911. A small gain: about 2–6% less damage taken.

## One spell at a time: cast pacing, strain and the spell queue (Nov 2026, `CASTING` in spells.js)

Owner-approved (Sam: casters shouldn't cast 3 spells at once; fast casting should raise the fizzle rate; add a capped queue).

- **Before:** only a 0.8 s swing between spells, so a caster opened with everything ready (measured: Meteor, Arcane Channel, Cinder Field, Arcane Bolt within 2.4 s).
- **Auto-cast gap:** after any spell, auto-cast waits 2.5 s (`CASTING.autoGap`). It never strains. It also waits while the player's queue has spells.
- **Focus strain:** a spell cast within 2.5 s of the last one (`strainWindow`) costs −20% to land per quick cast in a row (`strainPerCast`, stacking: −20%, −40%, …; the floor stays 5%). A "STRAINED −N%" floater shows it, and the spell panel shows "Strained" and the chance to land if cast now (`strain`, `nowSuccess` in the spell status). Strain clears after 2.5 s without casting.
- **Queue** (`queueHeroSpell`, `_playSpellQueue`): tapping a spell on a free caster casts it; on a busy caster (in the swing or inside the window) it queues, up to 3 (`queueCap`). The queue fires in order at the safe pace, so queued spells never strain. Mana and cooldown are spent when a spell fires; one it can't cast by then (no mana, no target) is dropped. Tapping a queued spell (or its chip in the QUEUED row) cancels it.
- **Hold to cast now:** holding a spell tile for 0.45 s casts it at once, skipping the queue, at the strain cost.
- **Measured** (4 casters: Arcane, Fire IV, Restoration IV, Mind V; 40 seeded two-wave fights per region, main → this change): casts per fight fell about 8–10% (Boneyard 37.5 → 33.9, Ashen 50.6 → 46.8); fights ran about 1 s longer (Boneyard 27.2 → 28.5 s); every fight was won either way, so this test can't show a win-rate change. The balance scripts' heroes don't cast, so their numbers don't move.
- With the gap set back to 0.8 s and strain to 0, the five drawing fingerprints match main exactly; they were re-recorded for the new pacing.

## Spells and moves, part 1: starter moves and clearer unlocks (Nov 2026)

Owner request: make spells and special moves easier to get and to understand. The full
plan, in order: this part; Hexes (Blind, Enfeeble, Silence, Disarm, Expose); Enchanting
and wards (Haste, True Aim, Endless Quiver, Kindred Bond, Insight; Iron Skin and
Spellguard at 75% less of that damage for 6 s); Conjuration and Mirror Self (Spectral
Blades, Summon Elemental). Then the battle log.

- **Starter moves** (`STARTER_MOVES` in classlessAbilities.js), from level 1 with the
  weapon held, no perk: Lunge (sword: dash to a foe up to 160 away, 160% weapon damage,
  stun 1 s, bosses 0.3 s; 14 s), Pinning Shot (bow: 140%, root 2 s, bosses 0.5 s; 14 s),
  Mana Surge (staff: +25 mana and the next spell is free; 20 s; needs spells, so it says
  "Needs spells" until the hero has Arcane Spark). Manual only; Mastery applies.
- **Execution and Cleaving Strike** open at level 5 for 2 AP (were level 10, 3 AP). With
  1 AP per level and two earlier perks to buy first, that's level 6 in practice.
- **Clarity:** the perk tree marks move perks with a ⚡ MOVE badge and says where moves and
  spells come from. The battle panel lists the hero's locked perk moves (level, AP,
  prerequisites; folded away) and the next spell in each element with cast progress, or
  how to start casting (`moveGuide.js`); it shows when the next spell is free.
- **Measured** (`npm run balance`, 12 guilds per style, seed 7): idle players identical to
  before (they never press moves). Active players: Blightmire trips won 100% (was 86%),
  more pushes deeper. The sim's perk order buys the two moves last, as its build intends.

## Small fixes (Nov 2026)

- **New-version banner** (`src/app/updateCheck.js`, `UpdateBanner.jsx`): each build writes
  `version.json` and bakes its id in as `__BUILD_ID__` (vite.config.js; the commit on CI).
  The page checks every 5 minutes and when the tab comes back; a different id shows "A new
  version is ready · Tap to reload". Tapping saves, then loads `?v=<build>` so a cached
  page isn't reused. Never during a live battle; never on the dev server.
- **Cloud accounts** (`src/cloud/cloudSave.js`, `CloudSync.jsx`): "Forgot password?"
  emails a reset link (`resetPasswordForEmail`); opening it signs the player in with a
  "Choose a new password" form (`PASSWORD_RECOVERY`). "Delete account" asks for DELETE
  typed, then calls `public.delete_my_account()` (migration 20261105220000), which removes
  the caller's auth user; their cloud save cascades. This device's save is kept. Email
  links go to the game's own address (they used to go to the site root); inside the
  Android app they go to the web game. Supabase only follows links to addresses on its
  allowed redirect list (Authentication → URL Configuration).
- **Android test app** (`capacitor.config.json`, `.github/workflows/android.yml`): every
  push to main (and manual runs) builds the web game, generates a Capacitor 7 Android
  project and uploads a debug APK as the run's artifact (gauntlet-debug-apk). App id
  com.buzzfuzz.gauntlet. Nothing Android-specific is committed besides the config.

## Regions open in order (Nov 2026, `regionOpen` in expedition.js)

Owner request: tackle the progression wall. Measured cause (`npm run balance`, 12 guilds
per style): a region opened when the party's highest hero reached its level, and
Frostfang opens at level 4, one level after the Boneyard. Guilds left the Gutter at
level 3-4, skipped the Boneyard and its tier-2 gear, and idle players won 0-11% of
Frostfang trips (mostly retreats) and about 20% of Ashen Keep trips; they only got past
by out-levelling. The spells, familiars and armory work didn't move these numbers.

Owner-approved fix: each campaign region also needs the one before it cleared. A region
stays open if the guild has cleared it or any region after it, so a guild that has gone
further keeps everything behind it (only clears are recorded, so a region entered but
never cleared, with nothing later cleared, closes until the one before it is cleared).
The Endless Rift is outside the order. No enemy numbers changed. The destinations list
shows "Clear <region> first" on a closed region.

| Idle players | Before | Regions in order |
| --- | --- | --- |
| Frostfang trips won | 0-11% | 63% |
| Ashen Keep trips won | 19-20% | 100% |
| Blightmire trips won | 39-57% | 71% |
| Campaign finished | 137-193 min | 124-204 min |

Active players: Frostfang and Ashen 100% of trips (before about 50% and 46-65%),
Blightmire 86%. Gating on the party's average level as well was tried and only slowed
idle players (147-266 min). `scripts/scenarios.js` opens the region it tests.

## Mastery: heroes improve at what they do (Nov 2026, `src/combat/mastery.js`)

Owner request: reward heroes for using their special moves, weapons, dodges and
backstabs, the way successful casts already rank up spells. Ranks I to V; rank I adds
nothing, so heroes fight exactly as before until they rank up (characterization: with
`hero.mastery` and the new history counters left out, every recorded case produced the
same state as before).

- **Special moves** (every landed use, including Shared Strike; moves stay manual only):
  15 / 45 / 100 / 200 uses. Each rank above I: +5% to the move's numbers (damage,
  healing, shields, buff size and duration) and -3% cooldown (`masteredMove`).
- **Weapons** (hits with that kind of weapon): 300 / 1,000 / 2,500 / 5,000. Each rank:
  +2% weapon damage; bows also +0.5% crit.
- **Evasion** (dodges): 40 / 120 / 300 / 600. Each rank +0.5% dodge, inside the agility
  dodge cap (35%).
- **Backstab** (melee hits on a foe that attacked another hero or a familiar in the last
  3 s, `BACKSTAB_WINDOW`; Phantom Strike always counts): 100 / 300 / 750 / 1,500. Each
  rank +4% backstab damage.
- Counts are tallied in the fight (`battleStats`) and folded in after it
  (`recordMastery` in fightResults.js), watched or unattended; rank-ups go in the trip
  feed. The hero sheet's Mastery section shows ranks, progress and bonuses.
- **Five new evolved qualities**, three tiers each, grown at the usual milestones from
  new history counters (`casts`, `supportCasts`, `moves`, `backstabs`, `dodges`):
  Spellwright (+4/6/8% cast success, +5/8/12% spell power), Lifebinder (healing and
  shielding spells +8/12/16%), Duelist (move cooldowns -5/8/12%), Shadowblade (backstab
  damage +10/15/20%), Untouchable (+2/3/4% dodge, inside the cap). Scores are per-fight
  rates calibrated on measured fights (see `SPELLWRIGHT_RATE` and the rest in
  qualities.js). Duelist was retuned after the campaign sim showed players who fire every
  move landing 4-6 a fight and all reaching Duelist Master: `DUELIST_RATE` 0.8 → 0.35, so
  that habit now earns tier 1 or 2 and tier 3 needs about 7 a fight.
- **Measured** (local run, 24 seeded fights each; party of two swords, a bow and an Int 20
  Arcane/Restoration staff caster, common gear a tier low; the bow had no arrows loaded,
  so it didn't shoot): per hero per fight, a sword lands 55-78 hits, 7-21 backstabs and
  2-10 dodges; the caster 12-29 attack spells and 4-9 support spells. So sword rank II
  takes about 5 fights and rank V about 75; evasion V about 200 fights. A fully mastered
  party against a fresh one: Boneyard boss LV4 won 24/24 vs 23/24 (party HP left 80% vs
  74%); Frostfang boss LV6 5/24 vs 3/24 (10% vs 5%); fights about 10% shorter.

## Armory: best gear and clearing the vault (Nov 2026, `src/game/armory.js`)

Owner request: the vault was hard to sort and to find the best gear per hero in; add bulk
and automatic selling. Menus only: fights are unchanged (characterization hashes stable).

- **Fit (`heroFit`, `ROLE_WEIGHTS`):** every stat a hero wears, set bonuses included,
  weighted by their weapon. Swords value attack, crit, attack speed, lifesteal and cleave;
  bows add volley and arrow saving; staffs weigh HP and defense a little more. Stats a hero
  can't use are worth nothing (arrow saving without a bow). All value defense, HP,
  resistances and on-hit effects. A hero is only offered their own weapon type; an
  empty-handed hero can take any.
- **Upgrade:** a swap that adds at least 1% fit (`UPGRADE_MIN`). The gear picker lists
  the best piece first, tagged "Upgrade +N%", "About the same" or "Worse".
- **Equip best** (hero sheet) fills every slot from the vault, never taking from another
  hero. **Equip best for party** (vault) repeatedly makes the swap that adds the most fit
  to any hero at home; cast-offs return to the vault and can go to someone else.
- **Vault view:** filter by slot and rarity; sort by best for a chosen hero, newest,
  rarity or sell value. Each piece says who it's an upgrade for (top three, best first)
  or "Spare". ☆ locks a piece (vault or worn): it can't be sold or salvaged.
- **Clear junk:** ticks unprotected gear that's no upgrade for any hero (home or away).
  Protected: locked, forged, crystal-set, set pieces, Legendaries. One spare per slot
  (per weapon type) is kept unless the vault already holds a piece for it. The player
  can untick any, then sells or salvages them in one go after a confirmation with totals.
- **Auto-clear (opt-in, `guild.autoClear`):** when an expedition comes home, new loot at
  or below the chosen rarity (Common, Uncommon or Rare; default Uncommon, by selling) that
  no hero needs and isn't protected is sold or salvaged. Set pieces, Legendaries and
  locked gear are never touched. The return report shows the count and the gold or
  essence. The field is absent until the player first changes the setting.
- **Essence** has one use, the Reforge (reroll affixes on Uncommon to Epic). Selling pays
  gold, salvaging pays essence.

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
damage, 5% max HP shield every 8s).

In battle each familiar is a unit of its own (owner-approved, Nov 2026; `PET_BODIES`):
HP is a share of its partner's max HP, +5% per pet level (wolf 25%, hawk 15% and
airborne so melee misses half the time, imp 18%, sprite 15%, tortoise 45% with a shell
that shrugs off 40%). A downed familiar sits out the rest of the fight, back at full HP
for the next, and its help stops with it (guard, heals, shields, the hawk's mark).
Enemies still go for heroes first; a melee enemy with a familiar in reach picks it as it
would a hero (hawk, imp and sprite count as twice as far away). Every 8 s the tortoise
taunts foes within 90 (not bosses) for 3 s. No leash: the wolf hunts the most wounded
foe anywhere, the hawk dives at its partner's target, the imp picks unburnt foes, the
sprite heals at its partner's side and darts from foes, the tortoise stands between its
partner and the nearest foe. Drawn animated (`familiarSprites.js`). Measured (temporary
CI test, 24 seeded boss fights, four heroes with a level 6 wolf, tortoise, hawk and
sprite, common gear one tier low): Boneyard LV4 won 15/24 without familiars, 22/24 with
them before this change and 24/24 after (party HP left 28%, 56%, 74%; 1 familiar
downed per fight). Frostfang LV7 and Ashen LV10 were lost in all three setups, but the
Ashen fight lasted 184 s with the old familiars and 226 s now (2.75 downed). So far
they help more as units, by taking blows meant for heroes. One quality at birth (Fierce,
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
  rank: bounty +15% per rank, loot one tier better every two ranks, and the boss grows
  (`bossRankScale`, compounding): HP ×1.08 and damage ×1.24 per rank up to rank 20, then
  HP ×1.06 and damage ×1.14. (Before Oct 2026 it was HP ×1.15 / damage ×1.09: guilds won
  100% of boss runs, and high ranks only got longer, with 6+ minute fights at rank 25.)
  Measured (`npm run balance -- --hours 24`, idle): rank 17–19 eight hours after the
  campaign, 25–29 at twelve, 29–38 at twenty-four; 69–74% of boss runs won. Steeper all
  the way (×1.24) stopped guilds dead around rank 27; gentler after 20 (×1.04/×1.06) let
  them win 82–92% and pass rank 50. `npm run ranks` measures a maxed party rank by rank.
  - *Demon:* napalm bottles and two skeletons every 6s.
  - *Imperial Necromancer:* long-range soul bombs; raises two skeletons and a ghost every 8s.
  - *Abomination:* no minions; a toxic slam on every hero within reach, faster once it
    enrages below 35% HP.
  - Minions summoned mid-fight spawn at 60% HP / 70% damage of the encounter's scale.
- **Champions** (owner-approved, Oct 2026; `championFor`, `CHAMPIONS` in regions.js,
  `_championTick` / `_vampiric` in the engine): boss ranks 5, 10, 15... (`CHAMPION_EVERY`)
  rotate Warded (at 66% and 33% HP restore 15% max HP), Swarming (two skeletons every 4 s,
  up to 6 summons alive), Frenzied (below 50%: attack speed ×1.4, damage ×1.2, once) and
  Vampiric (2% max HP back per hit landed, melee or projectile, and 0.5% per hit one of its summoned minions lands; added Nov 2026 because the Imperial Necromancer lands almost no hits itself). The boss is named for it
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

## Perk tree status (Oct 2026)

Every Bible node is purchasable and wired except the three Phase 2 nodes (C3 Construct,
C3a Familiar, N3 Primal Bond), still gated as in Demonanic. The last pending ones:

- **Ward (C2a, special move):** absorb the next 80 damage to the lowest-HP ally within
  150 units, or the caster; 18 s. The Bible left the range open; the owner chose 150 (same
  as Interpose).
- **Loaded Dice (F2, passive):** each direct weapon hit has a 10% chance of ×1.5 and 20% of
  ×0.75; neutral on average (the owner's option 3).
- **Jackpot (F3, special move):** the next 3 direct weapon hits are crits; 35 s.
- **Special moves are manual** (owner's call): they fire only when the player taps them on
  the battle card, never on auto or in unattended fights. Spells, by contrast, cast on auto
  and on tap. Nodes that add a button are tagged ★ Special move / ✦ Spell in the tree.

## Spells (Arcana, `src/combat/spells.js`)

Owner-approved design (Oct 2026). The Bible's Arcana nodes, built for Gauntlet:

- **Who casts:** heroes with A1 (Arcane Spark): mana `60 + 4 × (Int − 10) + 2 × level`,
  regenerating `2 + 0.04 × Int` per second (the engine's existing mana tick); Arcane Bolt;
  +8% arcane spell damage. A2 (Elementalism): choose an element on the Perks screen
  (`learnElement`) and get its spells; +10% spell damage with it. A2a (Chain Spark):
  elemental bolts jump to 2 more foes within 140 px for 40%. A3 (Arcane Channel: 175%,
  20 s) and A3a (Meteor: lands after 2 s on up to 5 foes within 90 px for 180%, 25 s) are
  spells. All five nodes are now purchasable.
- **Spells** (`SPELLS`, from the old Library database): per element a bolt (one target,
  known on learning), an area spell (proficiency II) and a lingering curse (IV: damage over
  time, double the hit, plus a stronger element effect). Element effects
  (`_spellElement`): fire burns 30% over 3 s, poison 40% over 5 s, ice slows 30% for 2.5 s,
  mind stuns 0.6 s (bosses 0.2 s), lightning arcs to one more foe for 50%. Magic-immune
  foes are unaffected. Damage = attack × power × (1 + 10% per spell rank above I) × element
  bonus × (1 + 1.2% per Int above 10) × 1.2 with a staff (`spellPower`).
- **Fizzles:** success = 60% + 1.5% per Int above 10 + 0.3% per effective Luck point + 5%
  per proficiency rank above I, capped at 95% (`castSuccessChance`). Mana and cooldown are
  spent either way; only successes count (`engine.spellSuccesses` → `outcome.spellCasts` →
  `recordCasts` in `applyFightResult`, with feed lines on rank-ups).
- **Ranks:** a spell's rank and an element's proficiency (summed over its spells) are I–V
  at 15/45/100/200 successful casts (`RANK_CASTS`). Spell rank: +10% power, +8% area per
  rank. Proficiency: +5% success per rank, and teaches the area spell (II) and curse (IV).
- **More elements** (`elementSlot`): a second at proficiency III and level 12, a third at V
  and level 18, 2 AP each (owner's call: "a mix between 1 and 3").
- **In battle:** casters on auto cast by themselves (`_autoCast`: Meteor on a crowd,
  Arcane Channel, an area spell on 2+ foes, a curse on a fresh target, else a bolt; 2.5 s
  between casts since Nov 2026, see "One spell at a time"); the player can tap a spell on the hero card (`castHeroSpell`). The card
  shows a mana bar. Saved per hero as `hero.magic = { elements, casts }`.
- **Perks screen:** a Spellbook (proficiency, success chance, each spell's rank and next
  rank), element choice, and ★ "Special move" / ✦ "Spell" tags on nodes that add a button.
- The balance scripts' heroes don't take Arcana, so their numbers don't move.

## Battle screen: moves and spells (Nov 2026, `screens/Battle.jsx`, `combat/abilityLook.js`)

Owner-approved design (canvas "Gauntlet battle ability UI"):

- **Party tabs** under the battle: each hero's name, HP bar and a badge counting their
  ready moves. Tapping a tab shows that hero's actions; tapping the shown hero again arms
  move orders (then tap the field), as before; Auto ends them.
- **Action panel** for the shown hero. Special moves are 64 px round buttons with an icon
  (`MOVE_ICONS`), ringed in their perk branch's colour (`BRANCH_COLORS`; Shared Strike is
  "Basic"). Ready: a pulse in that colour. Cooling: a dark sweep that shrinks, seconds in
  the middle. Can't fire: a grey ring and the reason (Down, No target, Low HP, Needs a
  weak foe). Spells are tiles in their element's colour with an icon per shape (bolt,
  area, curse, meteor), mana cost and chance to land; a draining bar while cooling;
  faded with "Needs N mana" when short. Quick-slot items are full-width buttons.
- **Callouts** (`_callout`): a move that fires, or a spell the player taps that lands,
  flashes its name over the hero in its colour for about a second. Auto casts and
  fizzles show none. **Hit-stop:** Execution, Killshot, Cleaving Strike, Phantom Strike,
  Arcane Channel and Meteor freeze the frame for 0.09 s (`BIG_MOVES`, `BIG_SPELLS`).
  Both run only in the live frame loop (`_loop`), never in headless fights, so they
  cannot change a fight's result.
- The hero sprites, enemies and the rest of the battle canvas are unchanged.
- **Layout (fixed Nov 2026, Sam's report):** the field keeps at least half the screen height (`min-h-[50dvh]`); the dock under it (party tabs pinned at its top, then the action panel or the log) scrolls instead of squeezing the field. Before, a caster's panel could shrink the field to almost nothing on a phone. Measured on a 412×760 screen: the field is 210×380 with a caster's panel open (it had been a sliver), 251×454 with the log open.

## Spells and familiars: the agreed plan (Nov 2026, not built yet)

Owner-approved direction; each step is its own PR, built in this order:

1. Battle screen above (done).
2. **A distinct effect per element, and a new fizzle** (done: `combat/spellVfx.js`). Each element differs in colour,
   shape and motion: Arcane stars and glyph rings, orbiting; Fire round flames and
   embers, flickering up; Ice angular shards, spinning, cracking on impact; Poison blobs
   and bubbles, arcing and dripping; Lightning zig-zag lines, instant with jitter; Mind
   rings and waves, pulsing. Effects grow with the caster's proficiency (I–V), each
   element in its own way: Fire hotter (dull red to white-hot), Ice bigger shard
   clusters, Poison thicker trails, Lightning more forks (1 to 4), Mind a faster pulse,
   Arcane more rune rings (1 to 3). Fizzle: the cast starts in its element's style, then
   breaks into a grey puff with a wobbling FIZZLE. Visual only. Effects stay fully vivid
   unless the frame rate drops (below about 50 fps for a second), then particles thin
   out step by step and come back when it recovers; they never touch the fight.
   Built as planned. Also: statuses show on the foe (fire flames and an ember glow,
   poison haze and bubbles, ice a frost crust and snowflakes, mind dizzy stars and a
   spiral); area spells erupt across their circle, and lightning's strikes down as
   bolts; Meteor shows a tightening target ring, then a rock streaks in 0.22 s before
   it lands. The engine makes a `SpellVfx` only when it has a real canvas, updates it
   in the live frame loop at game speed (paused during hit-stop), and the module uses
   its own random numbers, never `Math.random` or the fight's rng (tested).
3. **Restoration and Warding** (done: `SPELLS` in spells.js, `_castSupport` in the engine), new schools chosen like elements, three spells each
   (start, proficiency II, IV): Mend, Renewal, Lifeline; Barrier, Empower, Aegis.
   Restoration: soft green-white motes; Warding: gold hexagon shells (1 to 3 layers).
   Owner-approved starting numbers (Nov 2026), scaled by `supportPower` (spell rank,
   +10% school bonus, Intelligence, staff): Mend 18% max HP on the most-hurt ally (14
   mana, 6 s); Renewal 12% over 6 s to everyone within 220 (26, 14 s); Lifeline, 8 s:
   a killing blow leaves 1 HP and heals 25%, once (30, 30 s); Barrier, a 15% max-HP
   shield for 10 s, shields capped at 30% (14, 7 s); Empower, everyone within 220 +12%
   damage and +10% attack speed for 8 s, attack speed still capped at +20% (24, 20 s);
   Aegis, 15% less damage taken for 6 s within the 30% cap (28, 24 s). Spell heals skip
   the 4%/s regeneration limit. Auto: support first, only when needed (Lifeline under
   35% while hit, Mend under 55%, Renewal with 2+ under 70%, Barrier on whoever is
   being hit, Aegis in boss fights or under 60% party HP, Empower against a boss, an
   elite or 3+ foes). Nobody to help: the spell can't be cast ("No one needs it").
   Measured (temporary CI test, 24 seeded fights each; party of sword, sword, bow and
   a staff caster at Int 20 with proficiency IV, common gear one tier low; boss
   fights): Boneyard LV4 won 15/24 with an Arcane-only caster, 24/24 with
   Restoration, 20/24 with Warding; Frostfang LV6 0/24, 14/24, 2/24; Ashen LV9 0/24,
   4/24, 0/24. Restoration nearly removes knockouts in fights a party can win. Sam
   tests these in play before any tuning.
4. **Familiars as real units** (done; see Familiars above): their own HP (enemies can hit them; downed for the rest
   of the fight, never lost), their own targets and a simple role per species, and
   animated sprites. Balance re-measured (`npm run scenarios -- --group companions`).
5. **Shadow and Wild Magic, plus Dominate** (done: `SPELLS`, `CONTROL` and `BEASTS` in
   spells.js, `_castControl` and `_summonBeast` in the engine). Shadow (start, II, IV):
   Veil, the most-hunted ally can't be targeted for 3 s (16 mana, 12 s); Terror, foes
   within 80 flee for 2.5 s (22, 14 s); Confusion, one foe attacks its own side for 4 s
   (24, 16 s). Wild Magic: Ensnare, a 2 s root (12, 7 s); Thornfield, a 70-radius patch
   that roots 1.5 s and bleeds (22, 12 s); Summon Spirit Beast, a 10 s spirit unit with
   30% of the caster's max HP (34, 30 s). Mind V: Dominate, an ordinary foe fights for
   the party for 6 s (40, 40 s). Controls last half as long on elites; bosses take half
   of Terror, Ensnare and Thornfield, and are immune to Confusion and Dominate, as are
   nemeses. Auto keeps 20 mana back before Dominate or a summon. Spirit beasts: Tiger
   (pounce), Wolf (taunt), Hawk (ranged, flies), Bat (lifelink), Rat swarm (three),
   Wasp (poison), Spider (webs), Dragon (fire cone, at Wild Magic V). The beast comes from
   the hero's trait as below, unlisted traits included (Keen Eye: Hawk; Keen-Eared,
   Night Eyes, Light Sleeper: Bat; Quick Hands: Spider; Sure-Footed, Fast Learner: Wolf;
   Treasure Hunter: Rat; Glass Cannon: Wasp; none: Wolf), or the Spellbook pick.
   Trait map: Tiger (Brawny, Berserker), Wolf (Stalwart, Ironhide,
   Steadfast, Charismatic, Inspiring, Optimist), Hawk (Nimble, Swift, Tracker,
   Trailwise), Bat (Loud, Paranoid), Rat swarm (Scavenger, Greedy, Frail), Wasp
   (Reckless), Spider (Bloodhound, Field Medic).
   Measured (same temporary CI setup as step 3, proficiency IV, Mind at V): Boneyard
   LV4 won 16/24 Arcane-only, 18/24 Shadow, 18/24 Wild Magic, 16/24 Mind; heroes down
   per fight 2.13, 1.58, 1.54, 1.96. Frostfang LV6 0, 1, 0, 0 of 24; Ashen LV9 0 for
   all. Control helps a little where a party can already win; it does not carry a
   party the way Restoration does. Sam tests in play before any tuning.

All spells cast on auto too, with guardrails: never into nothing (no heal at full HP, no
root on a rooted foe), a mana reserve before Dominate or a summon, no wasted controls on
bosses. If a guardrail clashes with gameplay, flag it to Sam rather than change it.

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

## Enemies that keep up (Oct 2026, `src/game/threat.js`)

Owner report: in Rare gear, parties came home from the Blightmire at 99% HP and won every
ranked Ashen boss. Owner-approved fix: flatter rarity, and enemies that adapt to the party.

- **Rarity:** Common ×1, Uncommon ×1.25, Rare ×1.5, Epic ×1.8, Legendary ×2.1 (was up to ×4.2).
  Saves are rescaled once (`GEAR_VERSION` 2, `rescaleItemRarity`).
- **Threat:** at departure the party's offense (attack with crits) and toughness (HP through
  defense and dodge) are compared with a reference hero: the region's minimum level, Common
  gear a tier below (`regionReference`), the party each region is tuned for. Enemy HP ×
  `(offense ratio / 1.2) ^ 1.5`, enemy damage × the same for toughness, each capped at ×3,
  fixed for the trip (`run.threat`). The 1.2 slack is for perks the reference lacks; the
  1.5 power because the measure misses affixes and kill speed. The Rift's waves carry the
  same threat from wave 1.
- **First try, reverted:** tuning regions for Rare gear at a higher level. Real parties
  arrive in mostly Common gear, so Boneyard, Frostfang and Ashen won 0% of hundreds of trips.

Measured (`npm run scenarios -- --group party`, mixed party of four):

| Party | Boneyard | Frostfang | Ashen | Blightmire |
| --- | --- | --- | --- | --- |
| Arrival (min level, Common, tier −1) | 75–88% | 71% | 71% | 67% |
| Rare gear, +3 levels, +1 tier: wins / HP left | – | 100% / 60% | – | 94% / 82% |
| Same party, enemies closing only the measured gap (power 1) | 100% / 58% | 100% / 79% | 100% / 88% | 100% / 95% |

`npm run balance` (6 idle + 6 active guilds): first Blightmire clear 1.8–5 h in (main:
1.8–3 h). Endgame 8 h on: idle Ashen boss runs won 61–64% (main 100%), boss rank 9–14
(main 16–20), Rift median 29–31 waves. Tuning knobs for scripts: `THREAT_CLOSE`,
`THREAT_SLACK`, `THREAT_MAX` env vars; `--levels N --tiers N` on scenarios.

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

- **Sound:** the game has no sound effects yet; a sound overhaul is planned as its own later update (fizzles are visual only until then).

- **Second trim pass:** `engine.js` still has tower/castle branches that are now dead
  (they iterate empty `towers`/`barricades`), plus `logic.js` with castle economy code the
  engine only needs for `heroDerived`/`makeSingleEnemy`.
- **Level cap:** heroes reach LV 20 within the 8-hour endgame; after that only gear grows.
- **Boss walls:** progress past rank ~25 or Rift wave 50 depends on rare Epic drops and
  Masterworks; a deeper gear tier or prestige system would extend it.
- **Cloud saves:** last write wins between devices that are both online; there is no
  merge. The free Supabase project pauses after a week without use (it was found paused
  and restored on 2026-11-05); while paused, sign-in and sync fail.
- **Mobile:** the Android app is a debug build for sideloading (see "Small fixes"); a
  Play Store release needs a signing key and a store listing.
- **Engine sync:** the copy will drift from Demonanic; port upstream fixes by hand or move
  to a shared package later.
