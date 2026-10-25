# Gauntlet's Survival

[![CI](https://github.com/demonanic/Gauntlet-s-survival/actions/workflows/ci.yml/badge.svg)](https://github.com/demonanic/Gauntlet-s-survival/actions/workflows/ci.yml)

An idle expedition game: recruit heroes, send a party on expeditions, and fight each
encounter live on the [Demonanic](https://github.com/demonanic/Demonanic) combat engine.

Travel and resting tick by in real time; every encounter along the way is played out
on a canvas battlefield where your heroes auto-fight and you can step in with
abilities, move orders and speed controls.

## Gameplay

New players get a two-minute guided tour on their first visit: meet the heroes, open a
hero's gear, send a first party to The Gutter, and face (and fight) a first, easy
encounter. Each step moves on when you do what it asks. It can be skipped, and replayed
from the link at the bottom of the page. Afterwards, a **Next up** panel in the Guild
Hall points out what needs attention: unspent points, better gear in the vault, empty
quick slots, low arrows, a newly opened region, a hero ready to retire.

1. **Guild Hall:** recruit classless heroes, spend AP/SP in the universal perk tree, equip
   and upgrade gear, and treat injured heroes.
2. **Market:** buy gear from the Armory (stock rotates every 4 hours, with one featured
   Masterwork) and supplies for your heroes' quick slots.
3. **Expedition Board:** pick a destination and a party of 1–4 ready heroes.
4. **Adventure (timed):** The Gutter runs 10 minutes, Boneyard Crypt 20, Ashen Keep 30.
   A live feed fills with what happens on the road every 20–40 seconds: flavor ("the air
   is still, the vibes are chill"), finds (gold, supplies, gear), close calls and hazards,
   and story choices (pray at a shrine or loot it? open the chest?).
5. **Encounters** are the heart of a trip: one about every minute or so, and never more
   than three quiet events in a row. **Sightings** let you **Attack** or **Sneak
   by**; the sneak chance depends on the party's agility, stealth perks and traits, level,
   party size, morale, and how many and which enemies there are. A failed sneak, or a
   surprise **ambush**, opens with a volley and forces a fight. While the game is open the
   timer pauses at each prompt; tap Attack to fight it live. Ignore it (or close the app)
   and the party decides and fights on its own, so expeditions keep going while you're
   away.
6. **Morale** rises and falls with the feed (wins, finds, scares) and gives up to ±10%
   damage. HP carries over between fights, with slow healing on the road; fallen heroes
   come around (weak) when the party makes camp on long trips, and get back up for the
   end boss; bandages and natural healing do the rest. Recall the party at any time to keep the loot.
7. **World:** each trip has weather (clear, rain, fog, storm) and knows whether it's
   night (local time). Night means more ambushes but better finds; fog helps sneaking;
   storms bring hazards. Heroes banter in the feed about their traits and the mood.
   Rare events: a **wandering merchant** selling better gear for guild gold, a **treasure
   map** detour that ends in a stash, and **legendary monsters** with a hoard. Trips of 20
   minutes or more stop to **make camp** halfway: rest, scout ahead (better sneak odds) or
   forage. Turn on **Notifications** (bottom of the page) to hear about bosses, legends,
   merchants, treasure and the party coming home while the game is in the background.
8. **End boss:** Boneyard Crypt and Ashen Keep end with their boss. Win for the region
   bounty, or head home without it. A wiped party comes home with half the loot.

### Heroes

Every hero has an individual neon look (their sprite is tinted with their own hue) and is
born with a **quality**: who they are, not a choice you make. Some are combat qualities
(Brawny, Berserker, Field Medic), some change the expedition itself (a **Tracker** notices
things stalking the party, **Keen-Eared** heroes blunt ambushes, **Night Eyes**,
**Trailwise**, **Light Sleeper**, **Sure-Footed**, **Scavenger**, **Bloodhound**,
**Charismatic**, **Inspiring**, **Steadfast**, **Optimist**), and some are mixed blessings
(**Reckless**, **Loud**, **Frail**, **Greedy**, **Paranoid**).

Veterans develop more qualities from how they actually fought and travelled: at level 10
and 16 the game looks back over the hero's career and they may become a **Marksman**,
**Bladesworn**, **Survivor**, **Giantslayer**, **Ghost-Step**, **Bulwark**, **Field
Surgeon**, **Unshakable** or **Rallying Heart**, at a strength that matches how strongly
they showed it. You see the result and the story, never the counters.

Recruits are shown before you hire them: name them yourself, pick a new look for free, or
pay 25g to see a different candidate. Heroes can be renamed from their Gear screen.

**Prestige:** retire a level 20 hero to earn Renown, and spend it in the Hall of Legends
on permanent upgrades (damage, HP, gold, XP, travel time, and recruits that start at a
higher level). Retired heroes are remembered there.

### Gear and supplies

Each hero has seven gear slots (head, chest, legs, arms, weapon, secondary, amulet/ring)
and two quick slots for stacks of bandages, health potions, whetstones or arrows. Heroes
use their supplies on their own in battle, or you can tap them. Loaded quick slots refill
from the stash every time a party sets out.

- **Rarity and affixes:** Uncommon, Rare and Epic gear roll 1, 2 or 3 random affixes
  (Vampiric, Swift, Brutal, Spiked, *of Warmth*, *of Purity*, ...): lifesteal, attack
  speed, crit damage, thorns, regeneration, burn and chill on hit, and resistances.
- **Sets:** each harsh region drops pieces of its own set, with bonuses at 2 and 4 pieces.
- **Legendaries:** bosses (and legendary monsters) sometimes drop one of six legendary items
  with a unique power, e.g. Whisperwind (free volleys), Gravebinder Ring (rise again once
  per fight) or Heart of the Mountain (immune to every environment).
- **Forge, Salvage, Reforge:** upgrade gear with gold; break spare gear down into essence;
  spend essence to reroll an item's affixes.
- **Arrows:** bows can't shoot without arrows in a quick slot (stacks of 50, one per shot,
  75% picked back up after a win). The Fletcher in the Market turns plain arrows into
  venom (poison), flame (burst and burn) or frost (slow) arrows.

### Environments

Every region past the Gutter has harsh conditions that wear heroes down on the road and
handicap them in battle: Darkness (missed attacks, more ambushes), Bitter Cold (frostbite,
slower attacks), Scorching Heat (burns) and Toxic Miasma (poison, halved healing). Counter
them with resistance gear, or buy provisions in the Market (Torches, Warming Draughts,
Cooling Salves, Antitoxins): each hero packs one when the party sets out.

### Enemies

Enemies come in behavior families (hunters, predators, protectors, disruptors, attrition,
ambushers, skirmishers, watchers), shown on every encounter prompt. **Gnome Sappers** run
at the party and blow up (they go off even when killed), **Bandits** blitz the weakest hero,
**Dark Elf** snipers aim at ranged heroes, **Lesser Necromancers** heal and raise the
fallen, **Harriers** hunt and maul wounded heroes, **Carrion Priests** sacrifice dying
allies to heal and empower the rest, and **Watchers** make sneaking past a squad much harder
and mark heroes in battle. Legendary monsters hunt the wounded.

**Stalkers** don't attack right away: something starts following the party, unseen, and
strikes when a hero is badly hurt. A Tracker (or a lucky glance) may notice it first, and
then the party can turn and fight, try to lose it, or keep going ready for it.

### Endgame

- **Boss rotation:** after the Three-Headed Demon falls, Ashen Keep's throne passes to the
  Imperial Necromancer, then the Abomination, then back to the Demon. Every kill raises the
  boss rank: tougher bosses, bigger bounties, better loot.
- **The Endless Rift:** one nonstop fight with ever-stronger waves (a boss every 10th
  wave). Return home whenever you like to keep everything; get overrun and keep half.

### Regions

| Region | Min level | Length | End boss | Bounty |
| --- | --- | --- | --- | --- |
| The Gutter | 1 | 10 min | none | 80g |
| Boneyard Crypt (darkness) | 3 | 20 min | Lieutenant | 300g |
| Frostfang Pass (cold) | 4 | 25 min | Bandit Warlord | 500g |
| Ashen Keep (heat) | 6 | 30 min | rotating (Demon → Necromancer → Abomination) | 800g, +15% per boss rank |
| The Blightmire (toxic) | 10 | 40 min | The Bog Lich | 1600g |
| The Endless Rift | 3 | until you return | a boss every 10th wave | 10g per wave |

## Play it

**Online:** https://demonanic.github.io/Gauntlet-s-survival/ (rebuilt automatically from
`main` by `.github/workflows/pages.yml`).

**Test mode:** add `?debug` to the address
(https://demonanic.github.io/Gauntlet-s-survival/?debug). A **TEST** button opens tools to
add gold and renown, level every hero, skip travel and injury timers, set the boss rank,
clear all regions, and drop a full gear set of any rarity and tier into the vault. Battles
also get 4× and 8× speed. Everything it does is real save data, so use **Reset save** to
start clean.

## Getting started

Requires Node.js 22 (see `.nvmrc`).

```bash
npm install
npm run dev       # dev server at http://localhost:5173 (add -- --host to open it on your phone)
npm test          # Vitest: vendored Demonanic engine tests + Gauntlet game tests
npm run build     # production build in dist/
npm run preview   # serve the production build
npm run balance   # simulate full playthroughs and report balance numbers
npm run scenarios # compare party make-ups, qualities and revive rules side by side
```

Saves live in the browser's `localStorage`. Use **Reset save** at the bottom of the
page to start over.

**Cloud saves:** tap **Cloud: sign in** (top right) to create an account with email and
password. The guild then syncs to Supabase every 45 seconds and whenever the page is
hidden. Signing in on a device with a different guild asks which one to keep. The
Supabase project, table and row-level security are described in
[docs/DESIGN.md](docs/DESIGN.md#cloud-saves); `.env.example` shows how to point the game
at another project.

## Tech stack

- [React 19](https://react.dev) + [Vite 6](https://vite.dev)
- [Tailwind CSS 3](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for tests
- [Supabase](https://supabase.com) for accounts and cloud saves
- A canvas combat engine vendored from Demonanic

## Project layout

```
src/
  combat/      Combat engine vendored from demonanic/Demonanic, trimmed to encounter mode
  game/        Gauntlet logic: regions, encounters, guild/expedition state, items, shop,
               prestige, saves, simulator
  cloud/       Supabase accounts and cloud saves
  screens/     Guild Hall, Expedition Board, Battle
  components/  Shared React UI
  test/        Vitest setup (aliases jest → vi for the vendored tests)
public/sprites Hero atlas, weapon icons, projectile and impact VFX
docs/          Design notes
supabase/      Database migrations for cloud saves
scripts/       Balance simulator (npm run balance) and scenarios (npm run scenarios)
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
