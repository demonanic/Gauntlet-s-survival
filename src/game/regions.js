// Expedition destinations. Each region is a fixed chain of encounters; every
// encounter is one small enemy squad resolved by the Demonanic combat engine.
// Enemy keys reference the vendored roster in combat/config.js (C.ENEMIES).

export const REGIONS = Object.freeze([
  {
    id: "gutter",
    name: "The Gutter",
    blurb: "Sewer tunnels under the guild hall. Goblins, ghosts and worse.",
    color: "#39FF14",
    minLevel: 1,
    travelSeconds: 20,
    hpScale: 0.9,
    dmgScale: 0.9,
    completionGold: 60,
    recoverySeconds: 60,
    encounters: [
      ["goblin", "ghost", "goblin", "ghost"],
      ["slime", "goblin", "ghost", "goblin", "goblin"],
      ["slime", "slime", "goblin", "skeleton", "skeleton"],
    ],
  },
  {
    id: "boneyard",
    name: "Boneyard Crypt",
    blurb: "An ossuary that refuses to stay buried.",
    color: "#FF3366",
    minLevel: 3,
    travelSeconds: 40,
    hpScale: 2.0,
    dmgScale: 1.7,
    completionGold: 180,
    recoverySeconds: 120,
    encounters: [
      ["skeleton", "ghost", "ghost", "skeleton"],
      ["reaper", "skeleton", "skeleton"],
      ["orc", "skeleton", "ghost", "ghost", "goblin"],
      ["lieutenant", "skeleton", "skeleton"],
    ],
  },
  {
    id: "ashen",
    name: "Ashen Keep",
    blurb: "A burned fortress where a three-headed demon holds court.",
    color: "#FF0055",
    minLevel: 6,
    travelSeconds: 60,
    hpScale: 2.2,
    dmgScale: 1.6,
    completionGold: 500,
    recoverySeconds: 240,
    encounters: [
      ["darkElf", "orc", "goblin", "goblin"],
      ["warlock", "reaper", "skeleton", "skeleton"],
      ["lieutenant", "orc", "darkElf"],
      ["orc", "orc", "warlock", "reaper"],
      ["demon", "skeleton", "skeleton"],
    ],
  },
]);

export function getRegion(regionId) {
  return REGIONS.find((region) => region.id === regionId) || null;
}
