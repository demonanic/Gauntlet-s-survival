// What a finished fight does to the expedition: XP, loot, injuries, quality
// and bond growth, nemeses, second chances, and where the trip goes next.
// Both fight paths end here: unattended fights (expedition.js autoFight) and
// fights the player watched on the Battle screen (resolveEncounter). The
// outcome is the canonical fight result from fightOutcome.js.
import { mergeClasslessBattleResults } from "../combat/classlessBattleResults";
import { classlessMaxHp } from "../combat/classlessCombatEffects";
import * as C from "../combat/config";
import { ARROW_RECOVERY, CONSUMABLES, GEAR_SLOTS, crystalInfo, heroArrowCount, heroUsesArrows } from "../combat/gear";
import { PET_MOD_LEVELS, PET_SPECIES, PET_XP_SHARE } from "../combat/pets";
import { ELEMENTS, ROMAN, SPELLS, recordCasts } from "../combat/spells";
import { heroTraitEffects, roadEffect } from "../combat/traits";
import { LEGENDARY } from "./adventure";
import { BOND_NAMES, recordSharedWin } from "./bonds";
import {
  addFeed, changeMorale, closePending, completeExpedition, findHero, firstName, halveLoot, heal, heroId, livingParty, offerDeeper, pick,
  randomBetween, returnArrows, road,
} from "./expeditionRun";
import { createGearItem, normalizeHeroGear, randomCrystal, tierMult } from "./items";
import { legacyBonuses } from "./legacy";
import { NEMESIS, growNemesis, nemesisLevel, nemesisTriumphs, riseNemesis, slayNemesis } from "./nemesis";
import { awardPetXp, earnPetCrate } from "./pets";
import { developQualities, recordFight, sharedQualities } from "./qualities";
import { BOSS_RANK_SCALING, CHAMPIONS, bossForRank, championFor } from "./regions";

// Share of max HP each standing hero gets back after winning a fight, so each
// fight is its own challenge instead of one long bleed across the trip.
const AFTER_FIGHT_HEAL = 0.25;

// Endless Rift bounty paid for the waves cleared on one run.
export function riftBounty(wavesCleared) {
  return 10 * wavesCleared;
}

export function applyFightResult(state, region, { victory, party, xpGains, gold, items, wavesCleared = 0, ...outcome }, at, rng) {
  // Wisdom (guild) and Fast Learner (hero) boost the XP the engine awarded.
  const xpBonus = legacyBonuses(state).xp;
  const boostedXp = Object.fromEntries(Object.entries(xpGains || {}).map(([index, xp]) =>
    [index, Math.round(Number(xp) * (1 + xpBonus + heroTraitEffects(party[index]).xpBonus))]));
  // Heroes who avenge themselves on a nemesis learn the most from it.
  const fought = state.expedition.pending?.nemesisId && state.nemeses?.find((entry) => entry.id === state.expedition.pending.nemesisId);
  if (fought && victory && outcome.nemesisSlain === fought.id) {
    for (const [index, hero] of party.entries()) {
      if (fought.victims.some((victim) => victim.id === heroId(hero))) {
        boostedXp[index] = (boostedXp[index] || 0) + NEMESIS.vengeanceXp * nemesisLevel(fought, at);
      }
    }
  }
  const merged = mergeClasslessBattleResults(state, { heroIds: party.map(heroId), runtimeHeroes: party, xpGains: boostedXp });
  Object.assign(state, merged);
  const run = state.expedition;
  // Quick-slot stacks spent in the fight come back on the runtime party. After
  // a win, the party picks up some of the plain arrows it fired.
  let recovered = 0;
  for (const [index, runtime] of party.entries()) {
    const saved = findHero(state, heroId(runtime));
    if (!saved) continue;
    // Familiars learn alongside their partner.
    if (saved.pet) {
      for (const level of awardPetXp(saved.pet, (boostedXp[index] || 0) * PET_XP_SHARE)) {
        const mod = PET_MOD_LEVELS.includes(level) ? " A new trick to choose on the Gear screen!" : "";
        addFeed(run, at, `${saved.identity.name}'s ${PET_SPECIES[saved.pet.species].name.toLowerCase()} ${saved.pet.name} reaches level ${level}.${mod}`, "good", !!mod);
      }
    }
    saved.quickSlots = normalizeHeroGear(runtime).quickSlots;
    // Successful casts rank up spells and element proficiency.
    for (const up of recordCasts(saved, outcome.spellCasts?.[index])) {
      addFeed(run, at, up.kind === "spell"
        ? `${saved.identity.name}'s ${SPELLS[up.id].name} reaches rank ${ROMAN[up.rank - 1]}.`
        : `${saved.identity.name} grows more skilled with ${ELEMENTS[up.id].name} magic (proficiency ${ROMAN[up.rank - 1]}).`, "good", up.kind === "element");
    }
    const spent = Math.floor((runtime.arrowsSpent?.arrows || 0) * ARROW_RECOVERY);
    if (victory && spent > 0) recovered += returnArrows(state, saved, spent);
    recordFight(saved, runtime.battleStats, { victory, morale: run.morale, ambush: run.pending?.kind === "ambush" });
    for (const development of developQualities(saved, at, rng, sharedQualities(state.heroes, saved))) {
      addFeed(run, at, development.text, "good", true);
    }
  }
  run.loot.gold += Math.round(gold || 0);
  run.loot.items.push(...(items || []));
  const fallen = party.filter((hero) => hero.combat.hp <= 0);
  for (const hero of fallen) state.injuries[heroId(hero)] = at + region.recoverySeconds * 1000;
  if (fallen.length && victory) {
    addFeed(run, at, `${fallen.map((hero) => hero.identity.name).join(" and ")} ${fallen.length > 1 ? "are" : "is"} down${run.campAt != null ? " until the party makes camp"
      : region.boss && !run.bossDone ? " until the party regroups for the final fight" : " and will sit out the rest of the trip"}.`, "danger");
  }
  const { pending } = run;
  run.stats.fights += 1;
  if (pending.kind !== "rift") settleNemeses(state, region, party, { victory, ...outcome }, at, rng);
  for (const { hero, choice, landed } of outcome.clutches || []) {
    const name = party[hero]?.identity?.name;
    if (!name) continue;
    addFeed(run, at, choice === "crit"
      ? (landed ? `CLUTCH! One hit from falling, ${name} lands an Ultra Crit!` : `One hit from falling, ${name} swings for an Ultra Crit... and misses.`)
      : `One hit from falling, ${name} grits their teeth and drinks.`, choice === "crit" && landed ? "good" : "flavor", choice === "crit" && landed);
  }

  if (pending.kind === "rift") {
    const bounty = riftBounty(wavesCleared);
    run.loot.gold += bounty;
    run.wavesCleared = wavesCleared;
    state.records = { ...(state.records || {}), riftBest: Math.max(state.records?.riftBest || 0, wavesCleared) };
    run.pending = null;
    if (!victory) {
      halveLoot(run);
      addFeed(run, at, `Overrun on wave ${wavesCleared + 1}. Retreating with half the loot.`, "danger");
      completeExpedition(state, "retreat", at);
    } else {
      addFeed(run, at, `Returned from the Rift after ${wavesCleared} waves. +${bounty} gold bounty.`, "good");
      completeExpedition(state, "returned", at);
    }
    return;
  }
  if (!victory && run.revives > 0) {
    secondChance(state, at);
    return;
  }
  if (!victory) {
    halveLoot(run);
    addFeed(run, at, `The party is overrun by ${pending.label} and flees with half the loot.`, "danger");
    run.pending = null;
    completeExpedition(state, "retreat", at);
    return;
  }
  const qualities = road(state);
  changeMorale(state, 8 + roadEffect(qualities, "moraleOnWin"));
  // Heroes who came through it standing grow closer.
  for (const { a, b, level, offer } of recordSharedWin(state, party.filter((hero) => hero.combat.hp > 0).map(heroId))) {
    const [first, second] = [a, b].map((id) => findHero(state, id)?.identity.name);
    addFeed(run, at, offer === "sworn"
      ? `${first} and ${second} would trust each other with their lives. They could swear to fight as one (decide at the Guild Hall).`
      : offer === "comrades"
        ? `${first} and ${second} have grown close. They could become Comrades (decide at the Guild Hall).`
        : `${first} and ${second} are ${BOND_NAMES[level]} now.`, "good", !!offer);
  }
  for (const hero of livingParty(state)) heal(hero, AFTER_FIGHT_HEAL);
  afterVictory(state, qualities, at, rng);
  if (recovered > 0) addFeed(run, at, `Picked up ${recovered} arrow${recovered > 1 ? "s" : ""} from the field.`, "flavor");
  for (const hero of party) {
    if (heroUsesArrows(hero) && hero.combat.hp > 0 && heroArrowCount(findHero(state, heroId(hero))) === 0) {
      addFeed(run, at, `${hero.identity.name} is out of arrows!`, "danger");
    }
  }
  addFeed(run, at, `Victory over ${pending.label}! +${Math.round(gold || 0)} gold${items?.length ? `, ${items.length} item${items.length > 1 ? "s" : ""}` : ""}.`, "good");
  if (pending.legendary) {
    const bonus = Math.round(randomBetween(LEGENDARY.rewardGold, rng) * tierMult(region.tier));
    const trophy = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity: pick(["rare", "epic"], rng), tier: region.tier + 1 }, rng);
    run.loot.gold += bonus;
    run.loot.items.push(trophy);
    changeMorale(state, 15);
    addFeed(run, at, `The legend falls! Its hoard: ${bonus} gold and a ${trophy.name}.`, "loot", true);
  }
  if (pending.kind === "boss") {
    run.bossDone = true;
    let bounty = region.completionGold;
    if (region.bossRotation) {
      const rank = state.bossRank || 0;
      bounty = Math.round(bounty * (1 + BOSS_RANK_SCALING.bounty * rank));
      state.bossRank = rank + 1;
      const next = championFor(rank + 1);
      addFeed(run, at, `${C.ENEMIES[bossForRank(rank)].name} slain! Next on the throne: ${next ? `a Champion: ${CHAMPIONS[next].name} ` : ""}${C.ENEMIES[bossForRank(rank + 1)].name} (rank ${rank + 2}).`, "good");
    }
    // A Champion pays double, and leaves a second crystal.
    if (pending.wave.champion) {
      bounty *= 2;
      run.loot.items.push(randomCrystal(2, rng));
      addFeed(run, at, `The Champion is broken! Double bounty and an extra crystal.`, "loot", true);
    }
    run.loot.gold += bounty;
    run.bounty = bounty;
    state.clears[region.id] = (state.clears[region.id] || 0) + 1;
    // Every end boss leaves a Flawless crystal behind.
    const crystal = randomCrystal(2, rng);
    run.loot.items.push(crystal);
    addFeed(run, at, `${region.name} conquered! +${bounty} gold bounty and a ${crystalInfo(crystal.key).fullName}.`, "good");
    // The first time each boss falls to a party led by a level 10+ hero, a crate turns up.
    const boss = pending.wave.enemies.find((enemy) => enemy.boss) || pending.wave.enemies[0];
    if (earnPetCrate(state, boss.type, run.heroIds[0], rng)) {
      addFeed(run, at, `Among ${boss.name}'s hoard: a weird crate with breathing holes. Something inside is scratching.`, "loot", true);
    }
    run.pending = null;
    run.explored = true;
    offerDeeper(state, at);
    return;
  }
  closePending(run, at);
  if (!livingParty(state).length) completeExpedition(state, "retreat", at);
}

// Qualities that kick in after a won fight: a Scavenger picks over the
// fallen, a Field Surgeon patches everyone up.
function afterVictory(state, qualities, at, rng) {
  const run = state.expedition;
  if (rng() < roadEffect(qualities, "scavengeOnWin")) {
    const key = pick(["bandage", "bandage", "potion", "arrows"], rng);
    const qty = key === "arrows" ? 6 : 1;
    run.loot.items.push({ kind: "consumable", key, qty });
    addFeed(run, at, `${firstName(qualities.who.scavengeOnWin, rng)} scavenges ${key === "arrows" ? `${qty} arrows` : `a ${CONSUMABLES[key].name}`} from the fallen.`, "loot");
  }
  const patch = roadEffect(qualities, "postFightHeal");
  if (patch > 0) {
    for (const hero of livingParty(state)) heal(hero, patch);
    addFeed(run, at, `${firstName(qualities.who.postFightHeal, rng)} patches up the party's wounds.`, "good");
  }
}

// A second chance (see startExpedition): the whole party is back on its feet
// at half HP. An end boss has to be faced again; anything else has moved on.
function secondChance(state, at) {
  const run = state.expedition;
  run.revives -= 1;
  for (const id of run.heroIds) {
    const hero = findHero(state, id);
    if (hero) hero.combat.hp = Math.max(hero.combat.hp, Math.round(classlessMaxHp(hero) * 0.5));
  }
  addFeed(run, at, "A second chance! The party is back on its feet.", "good", true);
  if (run.pending.kind === "boss") {
    run.pending = { ...run.pending, promptAt: at, engagedAt: null };
  } else {
    closePending(run, at);
  }
}

// After a fight: a nemesis that was there grows, flees or falls, and a
// creature that knocked a hero out may rise as a new one.
function settleNemeses(state, region, party, { victory, downed, nemesisSlain, nemesisFled }, at, rng) {
  if (!region.wildlife || region.tier < NEMESIS.fromTier) return;
  const run = state.expedition;
  const byFoe = new Map();
  for (const [index, foe] of Object.entries(downed || {})) {
    const hero = party[index];
    if (!foe || !hero || foe.boss || foe.summoned || !C.ENEMIES[foe.type]) continue;
    const key = foe.nemesisId || foe.type;
    const entry = byFoe.get(key) || { foe, heroes: [] };
    entry.heroes.push({ id: heroId(hero), name: hero.identity.name });
    byFoe.set(key, entry);
  }
  const nemesis = run.pending?.nemesisId ? state.nemeses?.find((entry) => entry.id === run.pending.nemesisId) : null;
  if (nemesis) {
    byFoe.delete(nemesis.id);
    if (nemesisSlain === nemesis.id) {
      const level = nemesisLevel(nemesis, at);
      const gold = Math.round(NEMESIS.rewardGold * level * tierMult(region.tier));
      const trophy = createGearItem({ slot: pick(GEAR_SLOTS, rng), rarity: level >= 6 ? "epic" : pick(["rare", "epic"], rng), tier: region.tier + 1 }, rng);
      run.loot.gold += gold;
      run.loot.items.push(trophy);
      changeMorale(state, 20);
      const avengers = nemesis.victims.filter((victim) => run.heroIds.includes(victim.id)).map((victim) => victim.name);
      slayNemesis(state, nemesis, run.heroIds, at);
      addFeed(run, at, `${nemesis.name} falls at last!${avengers.length ? ` ${avengers.join(" and ")} ${avengers.length > 1 ? "have" : "has"} their revenge.` : ""} Its hoard: ${gold} gold and a ${trophy.name}.`, "loot", true);
    } else {
      const triumph = downedBy(downed, nemesis.id, party);
      if (triumph.length || !victory) {
        const level = nemesisTriumphs(nemesis, triumph, !victory, at);
        addFeed(run, at, `${nemesis.name} ${triumph.length ? `stands over ${triumph.map((hero) => hero.name).join(" and ")}` : "drives the party off"} and grows stronger (LV ${level}).`, "danger", true);
      }
      if (nemesisFled === nemesis.id) {
        nemesis.fled = (nemesis.fled || 0) + 1;
        const level = growNemesis(nemesis, 1, at);
        addFeed(run, at, `${nemesis.name} escapes, bleeding and furious. It will be back (LV ${level}).`, "danger", true);
      }
    }
  }
  for (const { foe, heroes } of byFoe.values()) {
    if (foe.nemesisId) continue;
    const risen = riseNemesis(state, { type: foe.type, typeName: foe.name, regionId: region.id, heroes, wiped: !victory }, at, rng);
    if (risen) {
      addFeed(run, at, `The ${foe.name} that downed ${heroes.map((hero) => hero.name).join(" and ")} lets out a howl and slinks away. It has a name now: ${risen.name}. It will remember this.`, "danger", true);
      break;
    }
  }
}

function downedBy(downed, nemesisId, party) {
  return Object.entries(downed || {}).filter(([, foe]) => foe?.nemesisId === nemesisId)
    .map(([index]) => party[index]).filter(Boolean).map((hero) => ({ id: heroId(hero), name: hero.identity.name }));
}
