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
4. **Adventure (timed):** The Gutter runs 6 minutes, Boneyard Crypt 10, Ashen Keep 15.
   A live feed fills with what happens on the road every 20–40 seconds: flavor ("the air
   is still, the vibes are chill"), finds (gold, supplies, gear), close calls and hazards,
   and story choices (pray at a shrine or loot it? open the chest?).
5. **Encounters** are the heart of a trip: one about every 45 seconds or so, never more
   than two quiet events in a row, and each one a real fight of two or three **waves**
   (about a minute all told) rather than a few seconds of trading blows. **Sightings** let you **Attack** or **Sneak
   by**; the sneak chance depends on the party's agility, stealth perks and traits, level,
   party size, morale, and how many and which enemies there are. A failed sneak, or a
   surprise **ambush**, opens with a volley and forces a fight. While the game is open the
   timer pauses at each prompt; tap Attack to fight it live. Ignore it (or close the app)
   and the party decides and fights on its own, so expeditions keep going while you're
   away.
6. **Morale** rises and falls with the feed (wins, finds, scares) and gives up to ±10%
   damage. HP carries over between fights; each hero still standing gets back 25% after a
   win, with slow healing on the road; fallen heroes
   come around (weak) when the party makes camp on long trips, and get back up for the
   end boss; bandages and natural healing do the rest. Recall the party at any time to keep the loot.
7. **World:** each trip has weather (clear, rain, fog, storm) and knows whether it's
   night (local time). Night means more ambushes but better finds; fog helps sneaking;
   storms bring hazards. Heroes banter in the feed about their traits and the mood.
   Rare events: a **wandering merchant** selling better gear for guild gold, a **treasure
   map** detour that ends in a stash, and **legendary monsters** with a hoard. Trips of 10
   minutes or more stop to **make camp** halfway: rest, scout ahead (better sneak odds) or
   forage. Turn on **Notifications** (bottom of the page) to hear about bosses, legends,
   merchants, treasure and the party coming home while the game is in the background.
8. **End boss:** Boneyard Crypt and Ashen Keep end with their boss. Win for the region
   bounty, or head home without it. A wiped party comes home with half the loot.
9. **Push deeper:** when a trip is done (boss beaten, or the timer out in the Gutter),
   head home, or press on for another 3-minute leg. Each leg the creatures grow stronger
   (×1.15 per leg, compounding) and the spoils richer: +30% gold per leg on what's found,
   20% of the trip's bounty per leg of depth, and a cache of gear that improves with depth. Fall down there and everything found
   past the trip's end is lost, and half the rest as usual. Ask again after every leg, as
   deep as you dare; left alone, a healthy party with nobody down pushes up to 3 legs
   (a Reckless or Berserker along makes it bolder). Your deepest push per region is kept.

### Heroes

Every hero has an individual neon look (their sprite is tinted with their own hue, and the
armor they wear shows on it as simple marks in each piece's rarity colour) and is
born with a **quality**: who they are, not a choice you make. Some are combat qualities
(Brawny, Berserker, Field Medic), some change the expedition itself (a **Tracker** notices
things stalking the party, **Keen-Eared** heroes blunt ambushes, **Night Eyes**,
**Trailwise**, **Light Sleeper**, **Sure-Footed**, **Scavenger**, **Bloodhound**,
**Charismatic**, **Inspiring**, **Steadfast**, **Optimist**), and some are mixed blessings
(**Reckless**, **Loud**, **Frail**, **Greedy**, **Paranoid**).

**A full party is four.** You start with three heroes, and the tutorial has you recruit a
fourth for free; three-hero parties have a hard time once the real fights start.

**Stat points.** Each level gives a stat point to spend on Attack, Defense, Agility,
Intelligence or **Luck**. Luck never adds damage or HP; it tilts the odds. Per point: +0.2%
crit chance, +0.5% Clutch Ultra Crit chance and +0.1% dodge (inside their usual caps), better gear drops, better odds
on road gambles, a few more finds and rare encounters, and 1% off wandering merchants (up to
25%). Points past 20 count half. In a fight a hero uses their own Luck; on the road the
party uses its average. The Perks screen lists exactly what a hero's Luck is doing.

**Clutch** (Fortune perk, level 5, 2 AP, after Lucky Edge): once per fight, when the next
hit would bring a hero down, the battle slows to a crawl and you get 5 seconds to choose.
**Drink** heals for sure (the hero's best potion or bandage, or a 30% second wind without
one), but the fight goes on. **Ultra Crit** is a long shot (15%, plus Luck) that kills the
hero's target outright (a boss loses a quarter of its HP); a miss changes nothing. If you
don't choose, the hero's nature does: Reckless and Berserker heroes swing, everyone else
drinks. Fights you aren't watching decide the same way, and the feed tells the story.

**Bonds:** heroes who come through won fights side by side grow closer: **Acquainted** after
10 shared wins; after 30 they can become **Comrades** (+5% damage while both are standing),
and after 75 swear to be **Sworn** (each hero has only one Sworn partner: when one drops
below a quarter of their HP, the other leaps in and shields them, once a fight). Comrades
and Sworn are your call: a card in the Guild Hall explains what the bond does and asks;
"Not now" asks again after 10 more shared wins. A bond is a commitment: setting out
without a hero's Comrade costs the party 2 morale (4 for a Sworn partner). When a bonded partner falls mid-fight,
most heroes fly into **Vengeance** (+25% damage for 10 seconds); calm ones (Stalwart,
Steadfast, Paranoid) are **Shaken** instead (-10% for the rest of the fight). Retire a
Comrade or Sworn partner and the other remembers them: +3% damage, up to three memories.
The roster shows each hero's bonds.

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

Each hero starts with a weapon and a plain set of armor (helm, cuirass, greaves, bracers);
secondaries and trinkets are found or bought. Each hero has seven gear slots (head, chest, legs, arms, weapon, secondary, amulet/ring)
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
- **Arrows:** bows can't shoot without arrows in a quick slot (stacks of 100, one every 4 shots,
  75% picked back up after a win). A long boss fight can eat a whole stack, so archers
  heading for the Blightmire want two. The Fletcher in the Market turns plain arrows into
  venom (poison), flame (burst and burn) or frost (slow) arrows.

### Familiars

Familiars are rare. The first time your guild beats each boss with a level 10+ hero
leading the party (the first hero you pick), the boss leaves a **weird crate with
breathing holes**: you choose one of several identical crates, blind, and whatever is
inside bonds with the leader. A hero who already has a familiar sends the old one to the
kennel, where any hero can take it along later from their Gear screen. Familiars fight on their own and can't be hurt: a **Wolf** bites
whatever its partner is fighting, a **Hawk** strikes from the air and marks prey (and
spots ambushes on the road), an **Imp** sets foes alight, a **Sprite** heals its partner,
and a **Stonebark Tortoise** guards and shields them. Each is born with a quality
(Fierce, Quick, Loyal, Keen Nose, Lucky, Brave) and grows with its partner's fights; at
levels 3, 6 and 9 you choose one of two new tricks.

### Crystals

Gear has sockets (more on rarer gear, one extra on weapons). Infuse crystals from the Gear
screen: weapon crystals add **Ember** (burn), **Frost** (slow), **Venom** (poison),
**Storm** (lightning that arcs to another foe), **Swiftness** or **Blood** (lifesteal);
armor crystals add resistances (**Hearth**, **Tide**, **Purity**, **Dawn**), **Vigor** or
**Stone**. Three of a kind fuse into the next tier (Chipped → Flawless → Radiant). Buy them
in the Market; bosses, treasure and tough enemies drop them. Extract one for a little gold.

### Supplies

Heroes use quick-slot supplies on their own: bandages below 50% HP, potions below 30%,
whetstones against elites and bosses, arrows every shot. Each hero's Gear screen sets
their **supply style** (Cautious, Balanced, Thrifty) and whether to **save potions for
bosses**.

### Environments

Every region past the Gutter has harsh conditions that wear heroes down on the road and
handicap them in battle: Darkness (missed attacks, more ambushes), Bitter Cold (frostbite,
slower attacks), Scorching Heat (burns) and Toxic Miasma (poison, halved healing). Counter
them with resistance gear, or buy provisions in the Market (Torches, Warming Draughts,
Cooling Salves, Antitoxins): each hero packs one when the party sets out.

### How heroes fight on their own

Swords close in and hit hardest. Bows and staves shoot from range: when an enemy gets up
close, a ranged hero backpedals while it reloads (a step, not a sprint, so fast enemies
still catch it). Every hero on auto steps out from under a boss's lobbed bomb or bile
when it's about to land (the landing spot is marked). Taking manual control of a hero
turns all of that off: it stays exactly where you put it.

### Difficulty

The game is meant to be beatable, not won every time. A full party of four arriving at a
region's minimum level in plain gear a tier below the region wins roughly 70% of trips if
you leave it alone; good play (abilities, moving heroes, picking fights) and better gear
push that up. Smaller parties have a much harder time.

### Enemies

Enemies come in behavior families (hunters, predators, protectors, disruptors, attrition,
ambushers, skirmishers, watchers), shown on every encounter prompt. **Gnome Sappers** run
at the party and blow up (they go off even when killed), **Bandits** blitz the weakest hero,
**Dark Elf** snipers aim at ranged heroes, **Lesser Necromancers** heal and raise the
fallen, **Harriers** hunt and maul wounded heroes, **Carrion Priests** sacrifice dying
allies to heal and empower the rest, and **Watchers** make sneaking past a squad much harder
and mark heroes in battle. Legendary monsters hunt the wounded.

**Formations.** Away from the Gutter, some squads are organized rather than random, and
their strength comes from how their members' behaviors feed each other (nobody gets a
hidden bonus for being in one):

- **Hunt Pack** (Watcher, two Harriers): the Watcher marks a hero, the Harriers run down whoever gets hurt.
- **Kill Team** (Dark Elf, Bandit, Watcher): sniper fire on your ranged heroes, a blitz on the wounded.
- **Death Cult** (Bulwark, Carrion Priest, two fodder): the "fodder" is what the Priest feeds on.
- **Grave Court** (Bulwark, Lesser Necromancer, two fighters): killing the Necromancer means reaching it.
- **Demolition Crew** (Bulwark, two Gnome Sappers): the Sappers come in behind the shield.

The **Bulwark** is the anchor: a shield-bearer that plants itself between the heroes and
its squad's casters and archers. It takes half of any hit aimed past it, allies beside it
are a little harder to hurt, and arrows glance off the shield while spells get around it.
Move a hero around it (or up close to its ward) and the backline is open.

Each region has its own personality: the Boneyard's dead keep each other going, Frostfang's
hunters go for the weakest, Ashen Keep fights in formation, and the Blightmire grinds you
down. Every squad is checked against limits that keep it fair: one Bulwark, at most two
Sappers, one of each resurrector, no squad of nothing but healers. The encounter prompt
shows a squad's threats and roles (pressure, support, control, anchor, wildcard); a
formation shows its signs, and its name once your guild has met it (or a level 8+
veteran is along). It never tells you what to do about it.

**Stalkers** don't attack right away: something starts following the party, unseen, and
strikes when a hero is badly hurt. A Tracker (or a lucky glance) may notice it first, and
then the party can turn and fight, try to lose it, or keep going ready for it.

**Nemeses:** when a creature knocks out one of your heroes (from Boneyard Crypt on), it
may rise as a named nemesis: "Grak the Bonebreaker". It always does if it wipes the party.
It remembers every hero it beat, gains a level every 2 hours on its own and another for
each hero it downs, and waits for you in its region (one per region, three at most). It
may find the party on a later trip, more often when one of its victims is along, leading
a squad as a named elite. With levels come traits: Relentless (attacks faster, LV 3),
Ironhide (+25% HP, LV 5), Regenerating (LV 7) and Dread (never flees, hits harder, LV 9).
Nearly dead, it may flee to come back a level stronger. Kill it for gold, a Rare or Epic
trophy and bonus XP for every hero it once beat. The Guild Hall lists your nemeses and
the ones you've slain.

### Endgame

- **Boss rotation:** after the Three-Headed Demon falls, Ashen Keep's throne passes to the
  Imperial Necromancer, then the Abomination, then back to the Demon. Every kill raises the
  boss rank: tougher bosses, bigger bounties, better loot.
- **Champions:** every 5th rank (5, 10, 15...) the boss is a Champion with one extra
  mechanic, in turn: **Warded** (shields itself at 66% and 33% HP, restoring 15% of its
  health), **Swarming** (two skeletons every 4 seconds, up to six alive), **Frenzied**
  (below half HP: 40% faster, 20% harder hits) and **Vampiric** (heals 2% of its max HP with
  every hit). A Champion pays double bounty and an extra crystal.
- **The Endless Rift:** one nonstop fight with ever-stronger waves (a boss every 10th
  wave). Return home whenever you like to keep everything; get overrun and keep half.

### Regions

| Region | Min level | Length | End boss | Bounty |
| --- | --- | --- | --- | --- |
| The Gutter | 1 | 6 min | none | 80g |
| Boneyard Crypt (darkness) | 3 | 10 min | Lieutenant | 300g |
| Frostfang Pass (cold) | 4 | 12 min | Bandit Warlord | 500g |
| Ashen Keep (heat) | 6 | 15 min | rotating (Demon → Necromancer → Abomination) | 800g, +15% per boss rank |
| The Blightmire (toxic) | 10 | 20 min | The Bog Lich | 1600g |
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
