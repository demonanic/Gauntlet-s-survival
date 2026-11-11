// The Time Warp Breach: Sam's first story campaign (owner's design, Nov 2026).
// Story text is a first draft by Claude from Sam's synopsis, for Sam to edit.
//
// Each battle is a scripted scenario (encounters.js buildScenarioWave): a
// faction's leaders and grunts, a horde layer, a twist, and `level`, the
// Free Roam wave whose strength it fights at. Difficulty, from Sam's plan:
// battles 1-5 low, 6-10 harder, 11-16 critical, 17-20 bosses.
//
// Every battle's first goal is to survive and move on. A battle may add a
// second (`goal`, combat/goals.js; outcomes in game/story.js): assassinate a
// marked foe before it flees, destroy objects within a time, or hold a wagon
// against raiders. `critical`: missing it sends the party back to the
// chapter's first battle. Chapters 1-2 have goals so far (story batch A).
//
// Chapter 5 is the three rebel warlocks and the Ancient Evil, each with
// powers of their own (combat/enemies/storyBosses.js).

const chaos = (leaders, grunts, extra = {}) => ({ faction: "chaos", leaders, grunts, ...extra });
const times = (key, count) => Array.from({ length: count }, () => key);

export const TIME_WARP = Object.freeze({
  id: "timeWarp",
  title: "The Time Warp Breach",
  author: "Sam",
  synopsis: "The Chaos warlocks have found a ritual that tears a wormhole through time: a one-way, first-class passage for an ancient evil prophesied to enslave the world. Fight through their ranks and break the ritual before the breach opens for good.",
  // About 1.4x a measured fast clear (DESIGN.md "Story mode"); Sam kept 45 minutes and will test it in a run.
  timerMinutes: 45,
  chapters: [
    {
      title: "The Omen",
      intro: "The sky over the eastern hills has turned the colour of a bruise. Scouts speak of warlocks chanting in a ring of black stone, and of a hum that makes teeth ache. Something is coming. The guild rides out to see what.",
      outro: "Among the dead warlocks you find a torn page: a ritual, half in a language no one living speaks. One line is clear enough: when the circle is complete, the door opens, and it does not close.",
      battles: [
        { title: "Scouts on the ridge", text: "A warlock and his hired blades watch the road. They were not expecting company.", wave: chaos(["warlock"], ["bandit", "bandit"]), level: 1,
          goal: { kind: "assassinate", text: "Kill the warlock before he slips away to warn the others.", escapeAfter: 12, hpMult: 3 } },
        { title: "Coin for silence", text: "The warlocks pay outlaws to keep the curious away. Today the curious are armed.", wave: { faction: "outlaws", leaders: ["bandit"], grunts: ["goblin", "goblin", "gnome"] }, level: 2,
          goal: { kind: "assassinate", text: "Cut down the paymaster before he runs with the warlocks' coin.", escapeAfter: 8, hpMult: 3 } },
        { title: "The patrol", text: "A full patrol marches out of the hills, and something dead shuffles in their wake.", wave: chaos(["warlock"], ["orc", "bandit", "bandit"], { layer: "trickle" }), level: 3,
          goal: { kind: "destroy", text: "Smash the 2 signal braziers before the hills answer them.", object: "Signal brazier", count: 2, within: 24, spawnEvery: 9, spawns: ["bandit", "goblin"] } },
        { title: "Wardens of the stone", text: "Two warlocks hold the outer ring, their grunts bound in a shimmering ward. Break the casters and the ward breaks with them.", wave: chaos(["warlock", "warlock"], ["orc", "orc"], { layer: "trickle", twist: "warded" }), level: 4,
          goal: { kind: "destroy", text: "Break the 2 ward stones before the ring closes. The story needs this one.", object: "Ward stone", count: 2, within: 27, spawnEvery: 10, spawns: ["orc", "bandit"], critical: true } },
      ],
    },
    {
      title: "The Gathering Dark",
      intro: "The ritual is not one circle but many, stitched across the land. Each one the warlocks complete, the hum grows louder and the nights grow longer. The guild follows the trail of scorched stone.",
      outro: "The last circle in the valley falls silent. But the hum does not stop. It is coming from beneath your feet now, from the old road that runs under the mountain.",
      battles: [
        { title: "A leak in the world", text: "A crack in the air spills the dead onto the field, and the warlocks use them as a shield.", wave: chaos(["warlock"], ["orc", "bandit", "bandit"], { layer: "horde" }), level: 5,
          goal: { kind: "destroy", text: "Seal the crack in the air before more of the dead spill out.", object: "Crack in the air", count: 1, within: 24, hpMult: 2.2, spawnEvery: 6, spawns: ["zombie", "zombie", "skeleton"] } },
        { title: "Iron for hire", text: "The Iron Legion sells its swords to whoever pays. The warlocks paid well.", wave: { faction: "iron", leaders: ["lieutenant"], grunts: ["bulwark", "orc", "orc", "orc"] }, level: 7,
          goal: { kind: "assassinate", text: "The lieutenant holds the warlocks' contract. Take him before he falls back.", escapeAfter: 18, hpMult: 2 } },
        { title: "Raiders at the camp", text: "Outlaws hit your camp while you sleep, grabbing what gold they can. Stop them before they slip away.", wave: { faction: "outlaws", leaders: ["bandit", "bandit"], grunts: ["gnome", "gnome", "goblin", "goblin"], layer: "trickle", twist: "thieves" }, level: 8,
          goal: { kind: "hold", text: "Hold the supply wagon: two raiders away with loot and it is lost.", lives: 2, raidAfter: 5 } },
        { title: "What came through", text: "The warlocks have learned to call the dead across the breach. Necromancers walk out of it, and a tide of corpses behind them.", wave: { faction: "undead", leaders: ["lesserNecromancer", "carrionPriest"], grunts: ["skeleton", "skeleton", "reaper", "reaper"], layer: "horde" }, level: 9,
          goal: { kind: "assassinate", text: "The necromancer is the one holding the breach open. Kill her before she steps back through. The story needs this one.", escapeAfter: 28, hpMult: 2, critical: true } },
      ],
    },
    {
      title: "Through the Breach",
      intro: "Under the mountain, time runs wrong. Torches burn backwards. Footsteps arrive before the feet. The warlocks' allies wait in the dark, and they are no longer only of this world.",
      outro: "You reach the chamber where the circles meet. At its heart, the wormhole turns slowly, and something on the far side turns with it, watching.",
      battles: [
        { title: "Hunters in the dark", text: "Dark elf hunters have come to share the spoils of a broken world. They strike from both sides of the tunnel.", wave: { faction: "darkElves", leaders: ["darkElf", "darkElf"], grunts: ["harrier", "harrier", "watcher", "watcher"], twist: "flanked" }, level: 10 },
        { title: "The vanguard", text: "The warband's vanguard holds the tunnel, and the dead are gathering behind them for when you tire.", wave: chaos(["warlock", "warlock"], [...times("orc", 3), "bandit", "bandit"], { layer: "horde", twist: "lateHorde" }), level: 11 },
        { title: "The inner circle", text: "Three warlocks chant around a pillar of light. Their ward holds everyone else in place. The casters first, always the casters.", wave: chaos(times("warlock", 3), [...times("orc", 3), "bandit", "bandit"], { layer: "trickle", twist: "warded" }), level: 12 },
        { title: "The tide", text: "The breach widens and the dead pour out, led by necromancers drunk on the power leaking through.", wave: { faction: "undead", leaders: ["lesserNecromancer", "lesserNecromancer"], grunts: [...times("skeleton", 3), ...times("reaper", 3)], layer: "horde" }, level: 13 },
      ],
    },
    {
      title: "The Edge of Time",
      intro: "The chamber opens onto a bridge of frozen moments over nothing at all. On the far side the ritual's masters wait: three warlocks who broke from their own order to bring the Ancient Evil through. Everything they have stands between you and them.",
      outro: "The bridge is yours. Ahead, three rebel warlocks turn to face you, and above them the wormhole groans open another inch.",
      battles: [
        { title: "The bridge", text: "The Iron Legion holds the bridge, and the dead climb up both sides of it.", wave: { faction: "iron", leaders: ["lieutenant"], grunts: ["bulwark", "bulwark", ...times("orc", 4)], layer: "horde", twist: "flanked" }, level: 14 },
        { title: "Shadows on the span", text: "Dark elves drop from the arches on both sides, the dead close behind.", wave: { faction: "darkElves", leaders: times("darkElf", 3), grunts: [...times("harrier", 3), "watcher", "watcher"], layer: "trickle", twist: "flanked" }, level: 15 },
        { title: "The conclave", text: "The warband's casters lock their ward around the last of their fighters, and the dead creep in behind. Break the casters and the way is open.", wave: chaos(times("warlock", 3), [...times("orc", 4), "bandit", "bandit"], { layer: "trickle", twist: "warded" }), level: 15 },
        { title: "The last gate", text: "Everything the warband has left. Behind it, the gate to the rebels' sanctum, and behind you a horde gathering for one last push.", wave: chaos(times("warlock", 3), [...times("orc", 4), ...times("bandit", 3)], { layer: "horde", twist: "lateHorde" }), level: 16 },
      ],
    },
    {
      title: "The Ancient Evil",
      intro: "Three rebel warlocks, each master of a piece of the breach, and beyond them the thing the prophecy warned of, already half through.",
      outro: "The wormhole folds in on itself with a sound like a held breath let go. The Ancient Evil is dragged back to whatever age it came from, and the hum stops. For the first time in weeks, the night is quiet.",
      battles: [
        { title: "The Gatewarden", text: "She opens doors that should stay closed, and things come through them. Close the portals, or there will be no end to it.", wave: chaos([], ["bandit", "bandit"], { boss: "gatewarden" }), level: 13 },
        { title: "The Chronomancer", text: "He bends the seconds around you until every swing comes too late. Spread out, and don't let him catch you together.", wave: chaos(["warlock"], ["orc", "orc"], { boss: "chronomancer" }), level: 17 },
        { title: "The Ritualist", text: "She is finishing the ritual as you arrive. When she starts chanting, hit her with everything before the last word.", wave: chaos([], ["orc", "orc", "bandit"], { boss: "ritualist", layer: "trickle" }), level: 16 },
        { title: "The Ancient Evil", text: "It steps out of the breach, older than the stars it remembers. It does not need to win. It only needs you to turn on each other.", wave: chaos([], [], { boss: "ancientEvil" }), level: 17 },
      ],
    },
  ],
});
