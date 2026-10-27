// "Next up" hints for the Guild Hall: the few things that most need the
// player's attention right now, each with where to go to deal with it.
// Pure: computed from the save every render, nothing stored.
import { CONSUMABLES, heroArrowCount, heroUsesArrows } from "../combat/gear";
import { freeRecruitAvailable, heroStatus } from "./guild";
import { gearScore } from "./items";
import { canRetire } from "./legacy";
import { pendingPetMods } from "./pets";
import { REGIONS } from "./regions";

// Archers carrying fewer arrows than this (stash included) get a warning.
const LOW_ARROWS = 30;
const MAX_HINTS = 3;

const names = (heroes) => heroes.map((hero) => hero.identity.name).join(", ");

// Each hint: { id, text, action: { kind: "perks" | "gear" | "tab" | "recruit", heroId?, tab? } }.
export function guildHints(guild, now) {
  const hints = [];
  const home = guild.heroes.filter((hero) => heroStatus(guild, hero, now) !== "away");

  // A short roster is the most common reason an early party loses.
  if (freeRecruitAvailable(guild)) {
    hints.push({
      id: "free-recruit",
      text: "Your first recruit is free. A party of four is much stronger than three.",
      action: { kind: "recruit", label: "Recruit" },
    });
  }

  const learner = home.find((hero) => hero.pet && pendingPetMods(hero.pet).length);
  if (learner) {
    hints.push({
      id: `pet-${learner.identity.id}`,
      text: `${learner.identity.name}'s familiar ${learner.pet.name} is ready to learn a new trick.`,
      action: { kind: "gear", heroId: learner.identity.id, label: "Gear" },
    });
  }

  const unspent = home.filter((hero) => hero.progression.ap > 0 || hero.progression.sp > 0);
  if (unspent.length) {
    hints.push({
      id: "points",
      text: `${names(unspent)} ${unspent.length > 1 ? "have" : "has"} unspent perk or stat points.`,
      action: { kind: "perks", heroId: unspent[0].identity.id, label: "Perks" },
    });
  }

  for (const hero of home) {
    // Only a weapon of the same kind: swapping a sword for a bow is a choice, not an upgrade.
    const better = guild.vault.find((item) => (item.slot !== "weapon" || item.weaponType === hero.equipment?.weapon?.weaponType) &&
      gearScore(item) > gearScore(hero.equipment?.[item.slot]) * 1.1 + 1);
    if (better) {
      hints.push({
        id: `gear-${hero.identity.id}`,
        text: `The vault has a ${better.name} that beats what ${hero.identity.name} is wearing.`,
        action: { kind: "gear", heroId: hero.identity.id, label: "Gear" },
      });
      break;
    }
  }

  const archers = guild.heroes.filter(heroUsesArrows);
  const arrows = (guild.stash.arrows || 0) + archers.reduce((sum, hero) => sum + heroArrowCount(hero), 0);
  if (archers.length && arrows < LOW_ARROWS * archers.length) {
    hints.push({
      id: "arrows",
      text: `Your archers are low on arrows (${arrows} left). Bows can't shoot without them.`,
      action: { kind: "tab", tab: "market", label: "Market" },
    });
  }

  const emptyHanded = home.find((hero) => (hero.quickSlots || []).every((slot) => !slot || !(slot.qty > 0)) &&
    Object.keys(CONSUMABLES).some((key) => CONSUMABLES[key].heal && guild.stash[key] > 0));
  if (emptyHanded) {
    hints.push({
      id: `quick-${emptyHanded.identity.id}`,
      text: `${emptyHanded.identity.name} has no supplies in their quick slots.`,
      action: { kind: "gear", heroId: emptyHanded.identity.id, label: "Gear" },
    });
  }

  const topLevel = Math.max(0, ...guild.heroes.map((hero) => hero.progression.level));
  const fresh = REGIONS.find((region) => !region.endless && topLevel >= region.minLevel && !guild.clears?.[region.id] &&
    REGIONS.indexOf(region) > 0 && guild.clears?.[REGIONS[REGIONS.indexOf(region) - 1].id]);
  if (fresh) {
    hints.push({ id: `region-${fresh.id}`, text: `${fresh.name} is open to your heroes.`, action: { kind: "tab", tab: "board", label: "Expeditions" } });
  }

  const veteran = home.find((hero) => !canRetire(guild, hero));
  if (veteran) {
    hints.push({
      id: `retire-${veteran.identity.id}`,
      text: `${veteran.identity.name} can retire to the Hall of Legends for renown.`,
      action: { kind: "tab", tab: "hall", label: "Hall of Legends" },
    });
  }

  return hints.slice(0, MAX_HINTS);
}
