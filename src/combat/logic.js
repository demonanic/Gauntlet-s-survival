// Pure game-state logic. No React, no rendering. Data-driven from config.js.
import * as C from "./config";
import { aggregateEquipmentStats, emptyEquipmentState, equipItem as equipStoredItem, unequipItem as unequipStoredItem } from "./equipment";
import { getPerk, getPerkTree, normalizePerks, canUnlockPerk, perkEffects } from "./perks";
import { advanceLibraryResearch, ensureMageSpellData } from "./libraryResearch";
import { createHeroModel, ensureHeroIdentityColor, randomNeonIdentityColor } from "./heroModel";
import { classlessMaxHp } from "./classlessCombatEffects";

let _heroSeq = 0;
export function createHero(classKey) {
  // No-argument creation is the classless model. Explicit class keys remain a
  // compatibility path for the existing class-dependent screens and saves.
  if (classKey == null) return createHeroModel();
  const cls = C.HERO_CLASSES[classKey];
  const stats = { ...C.BASE_STATS };
  for (const k in cls.mods) stats[k] += cls.mods[k];
  const maxHp = heroMaxHp(cls, 1, stats);
  const hero = {
    id: `${classKey}-${Date.now().toString(36)}-${_heroSeq++}`,
    key: classKey, name: cls.name, cls: classKey,
    level: 1, xp: 0, sp: 0, ap: 0,
    stats, perks: [], abilityCooldowns: {}, attackConfig: C.ATTACK_CONFIGS[classKey][0],
    equipment: {},
    appearance: { identityColor: randomNeonIdentityColor() },
    quickSlots: [null, null, null],
    hp: maxHp, maxHp,
    maxMana: 100 + stats.intelligence * 5, mana: 100 + stats.intelligence * 5,
  };
  ensureMageSpellData(hero);
  return ensureHeroIdentityColor(hero);
}

export function createClasslessHero(options = {}) {
  return createHeroModel(options);
}

export function heroMaxHp(cls, level, stats) {
  return Math.round(cls.baseHp + (level - 1) * 28 + stats.defense * 3);
}

export function heroDerived(hero) {
  const cls = C.HERO_CLASSES[hero.cls];
  const gear = aggregateEquipmentStats(hero.equipment);
  const perks = perkEffects(hero);
  const effectiveStats = {
    attack: hero.stats.attack + gear.attack,
    defense: hero.stats.defense + gear.defense,
    agility: hero.stats.agility + gear.agility,
    intelligence: hero.stats.intelligence + gear.intelligence,
  };
  const maxHp = Math.round((heroMaxHp(cls, hero.level, effectiveStats) + gear.maxHP) * (1 + perks.maxHpPct));
  return {
    maxHp,
    attack: effectiveStats.attack + (hero.cls === "archer" ? hero.level * 2 : hero.level),
    range: cls.attackRange + perks.range,
    rate: cls.attackRate * Math.max(0.45, 1 - perks.attackRatePct),
    magic: !!cls.magic,
    defense: effectiveStats.defense + perks.defense,
    agility: effectiveStats.agility,
    intelligence: effectiveStats.intelligence,
    critChance: Math.min(0.50, C.BASE_CRIT + (gear.critChance / 100) + perks.critChancePct),
    critMult: C.CRIT_MULT + (gear.critDamage / 100),
    critDmgBonus: Math.floor(effectiveStats.attack / 10) * 0.01 + (gear.critDamage / 100),
    dodge: Math.min(0.50, C.dodgeChance(effectiveStats.agility) + perks.dodgePct),
    lowHpDodge: perks.lowHpDodgePct,
    healPower: 1 + effectiveStats.intelligence / 100 + perks.healPct,
    maxHpMultiplier: 1 + perks.maxHpPct,
    abilityDamageMultiplier: 1 + perks.abilityDamagePct,
    shieldAbilityDamageMultiplier: 1 + perks.shieldAbilityDamagePct,
    moveSpeedMultiplier: 1 + perks.moveSpeedPct,
    reactionBonus: perks.reactionBonus,
    barrierMultiplier: 1 + perks.barrierPct,
    damageReduction: perks.damageReductionPct,
    lowHpDefense: perks.lowHpDefense,
    lowHpDamage: perks.lowHpDamagePct,
    executionDamage: perks.executionDamagePct,
    highHpDamage: perks.highHpDamagePct,
    critHealPct: perks.critHealPct,
    cooldownMultiplier: Math.max(0.5, 1 - perks.cooldownPct),
    multiTarget: perks.multiTarget,
    perkEffects: perks,
    color: hero.appearance?.identityColor || cls.color,
    gear,
  };
}

let _towerSeq = 0;
export function createTower(type, x, y, placementSlot = null) {
  const t = C.TOWERS[type];
  const r = C.TOWER_RESOURCE[type];
  return {
    id: `tw-${Date.now().toString(36)}-${_towerSeq++}`,
    type, x, y, ...(Number.isInteger(placementSlot) ? { placementSlot } : {}), level: 1, xp: 0, hp: t.baseHp, maxHp: t.baseHp,
    ammo: r.kind === "ammo" ? r.max : 0,
    maxAmmo: r.kind === "ammo" ? r.max : 0,
    mana: r.kind === "mana" ? r.max : 0,
    maxMana: r.kind === "mana" ? r.max : 0,
    choices: [], pending: 0, underfunded: false,
  };
}

export function towerDerived(tower) {
  const t = C.TOWERS[tower.type];
  const lvl = Math.max(1, tower.level || 1);
  const combatMul = Math.pow(1 + C.TOWER_UPGRADE.damageMult, lvl - 1);
  const hpMul = Math.pow(1 + C.TOWER_UPGRADE.hpMult, lvl - 1);
  const resourceMul = Math.pow(1 + C.TOWER_UPGRADE.resourceMult, lvl - 1);
  const owned = tower.specializations && typeof tower.specializations === "object" ? tower.specializations : {};
  const specs = (C.TOWER_SPECIALIZATIONS[tower.type] || []).filter((spec) => owned[spec.milestone] === spec.id);
  const mods = specs.reduce((a, spec) => {
    for (const [key, value] of Object.entries(spec.effect || {})) a[key] = (a[key] || 0) + value;
    return a;
  }, {});
  let dmg = t.damage * combatMul * (1 + (mods.damagePct || 0));
  let rate = t.fireRate * (1 + (mods.fireRatePct || 0));
  if (tower.underfunded) { dmg *= C.UNDERFUNDED.damageMult; rate *= C.UNDERFUNDED.fireRateMult; }
  const r = C.TOWER_RESOURCE[tower.type];
  const capacityMul = 1 + (mods.capacityPct || 0);
  return {
    ...t, damage: dmg, fireRate: rate,
    range: Math.round(t.range * (1 + (mods.rangePct || 0))),
    splash: t.splash ? t.splash * (1 + (mods.splashPct || 0)) : undefined,
    maxHp: Math.round(t.baseHp * hpMul * (1 + (mods.hpPct || 0))),
    resourceKind: r.kind, resourceLabel: r.label,
    shotCost: Math.max(1, r.shotCost - (mods.shotCostReduction || 0)),
    bossDamagePct: mods.bossDamagePct || 0,
    maxAmmo: r.kind === "ammo" ? Math.round(r.max * resourceMul * capacityMul) : 0,
    maxMana: r.kind === "mana" ? Math.round(r.max * resourceMul * capacityMul) : 0,
  };
}

export function createNewState(squadClasses) {
  const heroes = squadClasses ? squadClasses.map(createHero) : [];
  const barricades = Array.from({ length: C.BARRICADE.positions }, () => ({ hp: 0, maxHp: 0 }));
  const castleMaxHp = C.castleMaxHp(0);
  return {
    gold: C.STARTING.gold, stone: C.STARTING.stone, metal: C.STARTING.metal,
    workers: C.STARTING.workers, workersGold: C.STARTING.workersGold,
    workersStone: C.STARTING.workersStone, mineGoldRatio: C.STARTING.mineGoldRatio,
    morale: C.MORALE.base,
    castleHp: castleMaxHp, castleMaxHp,
    wave: 1, highestWaveCleared: 0, freeLifeUsed: false,
    surrenderTaxRate: 0, surrenderDebtWave: 0, surrenderTaxAppliedWave: 0,
    lastCompletedWave: 0,
    guildBlockadeLevel: 0, guildBlockadeActiveUntil: 0, guildBlockadeCooldownUntil: 0,
    heroes, bench: [], needsSquad: !squadClasses,
    vault: [],
    shoppe: { inventory: [], nextRefreshAt: 0, lastRefreshAt: 0 },
    towers: [],
    barricades,
    scoutKnowledge: 0,
    kills: { total: 0, byType: {} },
    bests: { highestWave: 0, totalKills: 0 },
    lastSeen: new Date().toISOString(),
  };
}

// Legacy profile compatibility: callers can still explicitly build class squads.
export function setSquad(state, classKeys) {
  state.heroes = classKeys.map(createHero);
  state.bench = state.bench || [];
  state.needsSquad = false;
  emptyEquipmentState(state);
}

// Fresh profiles begin with one shared-model hero and no permanent class.
export function setClasslessSquad(state) {
  if (!state || !state.needsSquad || !Array.isArray(state.heroes) || state.heroes.length) return false;
  const heroes = Array.from({ length: C.HERO_ROSTER.startingHeroes }, (_, index) => createHeroModel({ name: `Hero ${index + 1}` }));
  state.heroes = heroes;
  if (!Array.isArray(state.bench)) state.bench = [];
  state.needsSquad = false;
  emptyEquipmentState(state);
  return true;
}

export function ownedHeroCount(state) {
  return (state?.heroes?.length || 0) + (state?.bench?.length || 0) + (state?.academyHeroes?.length || 0);
}

// Recruit a hero (Gold). Classless profiles recruit shared-model heroes;
// legacy profiles retain their explicit class-based recruitment path.
export function recruitHero(state, classKey) {
  if (!state || state.needsSquad || !Array.isArray(state.heroes)) return false;
  const owned = ownedHeroCount(state);
  if (owned >= C.HERO_ROSTER.maximumOwned) return false;
  const roster = [...state.heroes, ...(Array.isArray(state.bench) ? state.bench : []), ...(Array.isArray(state.academyHeroes) ? state.academyHeroes : [])];
  const classlessProfile = roster.some((hero) => !hero.cls && hero.combat);
  const cost = classlessProfile ? C.classlessRecruitCost(owned) : C.recruitCost(owned);
  if (state.gold < cost) return false;
  const h = classlessProfile ? createHero() : createHero(classKey);
  state.gold -= cost;
  if (state.heroes.length < C.HERO_ROSTER.maximumSquad) state.heroes.push(h);
  else { state.bench = state.bench || []; state.bench.push(h); }
  return true;
}

// swap a bench hero into an active squad slot
export function swapHero(state, benchIndex, squadIndex) {
  if (!state.bench || !state.bench[benchIndex]) return false;
  if (squadIndex < 0 || squadIndex >= state.heroes.length) return false;
  const b = state.bench[benchIndex];
  state.bench[benchIndex] = state.heroes[squadIndex];
  state.heroes[squadIndex] = b;
  return true;
}

export function renameHero(state, list, idx, name) {
  const arr = list === "bench" ? state.bench : state.heroes;
  if (!arr || !arr[idx]) return false;
  const clean = (name || "").trim().slice(0, 18);
  arr[idx].name = clean || C.HERO_CLASSES[arr[idx].cls].name;
  return true;
}
export function retireHero(state, benchIdx) {
  if (!state.bench || !state.bench[benchIdx]) return false;
  state.bench.splice(benchIdx, 1);
  return true;
}

export function castlePower(state) {
  let cp = 0;
  for (const h of state.heroes) cp += h.level ?? h.progression?.level ?? 0;
  for (const t of state.towers) if (t) cp += Math.max(1, Number(t.level) || 1);
  return cp;
}

export function deployedTowers(state) { return state.towers.filter(Boolean); }
export function slotCap(state) { return C.slotCapacity(castlePower(state)); }

// ---- economy ----
export function canAfford(state, cost) {
  return (state.gold >= (cost.gold || 0)) && (state.stone >= (cost.stone || 0)) && (state.metal >= (cost.metal || 0));
}
export function spend(state, cost) {
  state.gold -= (cost.gold || 0); state.stone -= (cost.stone || 0); state.metal -= (cost.metal || 0);
}

// continuous production: returns delta resources for dt seconds
export function recoverOverTime(state, dtSeconds) {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  const hours = dtSeconds / 3600;

  // Morale recovers while the castle is resting. This is deliberately separate
  // from the morale multiplier so recovery itself never creates a runaway loop.
  state.morale = Math.min(100, state.morale + C.RECOVERY.moralePerHour * hours);

  // Wounded heroes recover over time, but defeated heroes remain defeated until
  // the player explicitly revives them. This preserves a meaningful prep decision.
  const hpFrac = (C.RECOVERY.heroHpPercentPerHour / 100) * hours;
  for (const h of state.heroes || []) {
    const classless = !h.cls && h.combat;
    const hp = classless ? h.combat.hp : h.hp;
    const maxHp = classless ? classlessMaxHp(h) : heroDerived(h).maxHp;
    if (hp > 0 && hp < maxHp) {
      if (classless) h.combat.hp = Math.min(maxHp, hp + maxHp * hpFrac);
      else h.hp = Math.min(maxHp, hp + maxHp * hpFrac);
    }
  }
  for (const h of state.bench || []) {
    const classless = !h.cls && h.combat;
    const hp = classless ? h.combat.hp : h.hp;
    const maxHp = classless ? classlessMaxHp(h) : heroDerived(h).maxHp;
    if (hp > 0 && hp < maxHp) {
      if (classless) h.combat.hp = Math.min(maxHp, hp + maxHp * hpFrac);
      else h.hp = Math.min(maxHp, hp + maxHp * hpFrac);
    }
    if (!classless && Number.isFinite(Number(h.maxMana)) && Number(h.maxMana) > 0) {
      const manaFrac = (C.RECOVERY.heroHpPercentPerHour / 100) * hours;
      h.mana = Math.min(Number(h.maxMana), Math.max(0, Number(h.mana) || 0) + Number(h.maxMana) * manaFrac);
    }
  }
}

function buildingProductionMultiplier(state, id) {
  const building = state.buildings?.[id];
  if (!building) return 1; // backward-compatible until a migrated building record exists
  const maxHp = Math.max(1, Number(building.maxHp) || 1);
  const hp = Math.max(0, Math.min(maxHp, Number(building.hp) || 0));
  const frac = hp / maxHp;
  const damageEfficiency = frac <= 0 ? 0 : frac < 0.25 ? 0.25 : frac < 0.5 ? 0.5 : frac < 0.75 ? 0.75 : 1;
  const levelMultiplier = Math.pow(1.08, Math.max(0, (Number(building.level) || 1) - 1));
  return damageEfficiency * levelMultiplier;
}

export function guildStorageCapacity(state) {
  const level = Math.max(1, Number(state.buildings?.guild?.level) || 1);
  return { metal: C.GUILD.baseMetalStorage + (level - 1) * C.GUILD.storagePerLevel, stone: C.GUILD.baseStoneStorage + (level - 1) * C.GUILD.storagePerLevel };
}
export function guildAmmoCapacity(state) {
  const level = Math.max(1, Number(state.buildings?.guild?.level) || 1);
  return C.GUILD.baseAmmoCache + (level - 1) * C.GUILD.ammoCachePerLevel;
}
export function goldAllocation(state) {
  const vaultPercent = Math.max(0, Math.min(100, Number(state.goldVaultPercent) || 0));
  return { vaultPercent, treasuryPercent: 100 - vaultPercent };
}
export function setGoldAllocation(state, percent) {
  state.goldVaultPercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  state.goldTreasuryPercent = 100 - state.goldVaultPercent;
  return true;
}
// Preview per-minute resource rates without mutating the current game state.
export function productionRates(state) {
  const moraleMul = C.moraleMultiplier((Number(state.morale) || 0) / 100);
  const castleMaxHp = Math.max(1, Number(state.castleMaxHp) || 1);
  const castleEff = C.castleEfficiency((Number(state.castleHp) || 0) / castleMaxHp);
  const mul = moraleMul * castleEff;
  const mineOutput = C.workforceOutput(C.PRODUCTION.goldPerWorkerMin, Math.max(0, Number(state.workersGold) || 0)) * mul * buildingProductionMultiplier(state, "mine");
  const ratioValue = Number(state.mineGoldRatio);
  const goldRatio = Math.max(0, Math.min(1, Number.isFinite(ratioValue) ? ratioValue : 0.5));
  const guild = state.buildings?.guild;
  const resourcesEnabled = !guild || (guild.unlocked !== false && Number(guild.hp) > 0);
  return {
    gold: mineOutput * goldRatio,
    metal: resourcesEnabled ? mineOutput * (1 - goldRatio) : 0,
    stone: resourcesEnabled ? C.workforceOutput(C.PRODUCTION.stonePerWorkerMin, Math.max(0, Number(state.workersStone) || 0)) * mul * buildingProductionMultiplier(state, "quarry") : 0,
    moraleMul,
    castleEff,
  };
}

export function produce(state, dtSeconds) {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  recoverOverTime(state, dtSeconds);
  advanceAcademyTraining(state, dtSeconds);
  const moraleMul = C.moraleMultiplier(state.morale / 100);
  const castleEff = C.castleEfficiency(state.castleHp / state.castleMaxHp);
  const mul = moraleMul * castleEff * (dtSeconds / 60);
  const mineOutput = C.workforceOutput(C.PRODUCTION.goldPerWorkerMin, state.workersGold) * mul * buildingProductionMultiplier(state, "mine");
  const goldRatio = Math.max(0, Math.min(1, Number.isFinite(Number(state.mineGoldRatio)) ? Number(state.mineGoldRatio) : 0.5));
  const goldProduced = mineOutput * goldRatio;
  const allocation = goldAllocation(state);
  state.gold += goldProduced * allocation.treasuryPercent / 100;
  state.vaultGold = Math.max(0, Number(state.vaultGold) || 0) + goldProduced * allocation.vaultPercent / 100;
  const cap = guildStorageCapacity(state);
  const guild = state.buildings?.guild;
  if (!guild || (guild.unlocked !== false && Number(guild.hp) > 0)) {
    state.metal = Math.min(cap.metal, Math.max(0, Number(state.metal) || 0) + mineOutput * (1 - goldRatio));
    state.stone = Math.min(cap.stone, Math.max(0, Number(state.stone) || 0) + C.workforceOutput(C.PRODUCTION.stonePerWorkerMin, state.workersStone) * mul * buildingProductionMultiplier(state, "quarry"));
  }
  advanceGuildManufacturing(state, dtSeconds);
  advanceLibraryResearch(state, dtSeconds);
}

// ---- workforce ----
export function buyWorker(state, allocateTo) {
  const cost = C.workerCost(state.workers);
  if (state.gold < cost) return false;
  state.gold -= cost; state.workers += 1;
  if (allocateTo === "stone") state.workersStone += 1; else state.workersGold += 1;
  return true;
}

// ---- tower placement and capacity ----
export function buildTower(state, type, x, y, placementSlot = null) {
  const cost = C.TOWERS[type].construction;
  if (!canAfford(state, cost)) return false;
  if (state.towers.length >= slotCap(state)) return false;
  if (placementSlot !== null && (
    !Number.isInteger(placementSlot) || placementSlot < 0 || placementSlot >= C.BARRICADE.positions ||
    state.towers.some((tower) => tower?.placementSlot === placementSlot)
  )) return false;
  spend(state, cost);
  state.towers.push(createTower(type, x, y, placementSlot));
  return true;
}
export function repositionTower(state, index, x, y) {
  const t = state.towers[index];
  if (!t) return false;
  t.x = x; t.y = y; return true;
}
export function dismantleTower(state, index) {
  const tw = state.towers[index];
  if (!tw) return false;
  const cost = C.TOWERS[tw.type].construction;
  state.gold += Math.floor(cost.gold * 0.3);
  state.stone += Math.floor(cost.stone * 0.3);
  state.towers.splice(index, 1);
  return true;
}
export function addTowerXp(tower, xp) {
  tower.xp += xp;
  const nl = C.towerLevelForXp(tower.xp);
  while (tower.level + (tower.pending || 0) < nl) tower.pending = (tower.pending || 0) + 1;
}
export function upgradeTower(state, slot) {
  const tw = state.towers[slot];
  if (!tw || !(tw.pending > 0)) return false;
  const cost = C.towerUpgradeCost(tw);
  if (state.gold < cost.gold || state.stone < cost.stone) return false;
  state.gold -= cost.gold; state.stone -= cost.stone;
  tw.pending -= 1; tw.level += 1;
  tw.choices = [...(tw.choices || []), `Lv${tw.level}`];
  const d = towerDerived(tw);
  tw.maxHp = d.maxHp; tw.hp = Math.min(d.maxHp, tw.hp + Math.round(d.maxHp * 0.10));
  if (d.resourceKind === "ammo") { tw.maxAmmo = d.maxAmmo; tw.ammo = d.maxAmmo; }
  else { tw.maxMana = d.maxMana; tw.mana = d.maxMana; }
  return true;
}
export function chooseTowerSpecialization(state, slot, milestone, specializationId) {
  const tower = state.towers[slot];
  if (!tower || ![3, 5].includes(milestone) || (tower.level || 1) < milestone) return false;
  tower.specializations = tower.specializations && typeof tower.specializations === "object" ? tower.specializations : {};
  if (tower.specializations[milestone]) return false;
  const choice = (C.TOWER_SPECIALIZATIONS[tower.type] || []).find((spec) => spec.milestone === milestone && spec.id === specializationId);
  if (!choice) return false;
  const oldDerived = towerDerived(tower);
  const oldMaxHp = oldDerived.maxHp;
  const oldMaxResource = oldDerived.resourceKind === "ammo" ? oldDerived.maxAmmo : oldDerived.maxMana;
  const resourceKey = oldDerived.resourceKind === "ammo" ? "ammo" : "mana";
  const maxKey = oldDerived.resourceKind === "ammo" ? "maxAmmo" : "maxMana";
  tower.specializations[milestone] = choice.id;
  const next = towerDerived(tower);
  tower.maxHp = next.maxHp;
  if (tower.hp > 0) tower.hp = Math.min(next.maxHp, tower.hp + Math.max(0, next.maxHp - oldMaxHp));
  tower[maxKey] = next[maxKey];
  tower[resourceKey] = Math.min(next[maxKey], (tower[resourceKey] || 0) + Math.max(0, next[maxKey] - oldMaxResource));
  tower.choices = [...(tower.choices || []), choice.name];
  return true;
}

export function repairTower(state, slot) {
  const tw = state.towers[slot];
  if (!tw) return false;
  const d = towerDerived(tw);
  const missing = d.maxHp - tw.hp;
  if (missing <= 0) return false;
  const cost = C.repairStoneCost(missing);
  if (state.stone < cost) return false;
  state.stone -= cost; tw.hp = d.maxHp; return true;
}
// Guild services: pooled defensive repairs and manufactured ammunition.
export function guildRepairDefenses(state) {
  const guild = state.buildings?.guild;
  if (!guild || guild.unlocked === false || guild.hp <= 0) return false;
  let goldCost = 0;
  let stoneCost = 0;
  const towerRepairs = [];
  for (const tower of state.towers || []) {
    if (!tower) continue;
    const maxHp = towerDerived(tower).maxHp;
    const missing = Math.max(0, maxHp - (Number(tower.hp) || 0));
    if (missing > 0) {
      goldCost += Math.ceil(missing * 0.2);
      stoneCost += Math.ceil(missing * 0.1);
      towerRepairs.push({ tower, maxHp });
    }
  }
  const barricadeRepairs = [];
  for (const barricade of state.barricades || []) {
    if (!barricade || !(barricade.maxHp > 0) || !(barricade.hp > 0)) continue;
    const missing = Math.max(0, barricade.maxHp - (Number(barricade.hp) || 0));
    if (missing > 0) {
      goldCost += Math.ceil(missing * 0.2);
      stoneCost += Math.ceil(missing * 0.1);
      barricadeRepairs.push({ barricade });
    }
  }
  if (!towerRepairs.length && !barricadeRepairs.length) return false;
  if ((Number(state.gold) || 0) < goldCost || (Number(state.stone) || 0) < stoneCost) return false;
  state.gold -= goldCost;
  state.stone -= stoneCost;
  towerRepairs.forEach(({ tower, maxHp }) => { tower.hp = maxHp; });
  barricadeRepairs.forEach(({ barricade }) => { barricade.hp = barricade.maxHp; });
  guild.activity = `Defenses repaired · ${towerRepairs.length} towers / ${barricadeRepairs.length} barricades`;
  return { goldCost, stoneCost, towers: towerRepairs.length, barricades: barricadeRepairs.length };
}

export function guildManufacturingRate(state) {
  const guild = state.buildings?.guild;
  const workers = Math.max(0, Number(state.guildWorkers) || 0);
  if (!guild || guild.unlocked === false || guild.hp <= 0 || workers <= 0) return 0;
  const level = Math.max(1, Number(guild.level) || 1);
  const cp = Math.max(0, castlePower(state));
  return C.GUILD.baseManufacturingPerMinute * (1 + (level - 1) * C.GUILD.guildLevelBonus) * (1 + Math.max(0, cp - 20) * C.GUILD.cpBonusPerPointAbove20) * workers;
}
export function startGuildManufacturing(state, ammoType, quantity) {
  const guild = state.buildings?.guild;
  const resource = C.TOWER_RESOURCE[ammoType];
  const amount = Math.floor(Number(quantity));
  if (!guild || guild.unlocked === false || guild.hp <= 0 || !resource || resource.kind !== "ammo" || amount <= 0 || amount > 5000 || (state.guildManufacturing && state.guildManufacturing.remaining > 0)) return false;
  const cache = state.guildAmmoCache || (state.guildAmmoCache = {});
  const cacheUsed = Object.values(cache).reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0);
  if (cacheUsed + amount > guildAmmoCapacity(state)) return false;
  const metalCost = Math.ceil(amount * C.GUILD.metalPerAmmo);
  const stoneCost = Math.ceil(amount * C.GUILD.stonePerAmmo);
  if ((Number(state.metal) || 0) < metalCost || (Number(state.stone) || 0) < stoneCost) return false;
  state.metal -= metalCost; state.stone -= stoneCost;
  state.guildManufacturing = { ammoType, total: amount, remaining: amount, elapsed: 0 };
  guild.activity = `Manufacturing ${amount} ${resource.label}`;
  const rate = guildManufacturingRate(state);
  return { amount, metalCost, stoneCost, durationSeconds: rate > 0 ? Math.ceil(amount / (rate / 60)) : Infinity };
}
export function advanceGuildManufacturing(state, dtSeconds) {
  const order = state.guildManufacturing;
  if (!order || !(order.remaining > 0) || !Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  const rate = guildManufacturingRate(state) / 60;
  if (rate <= 0) return;
  order.remaining = Math.max(0, order.remaining - rate * dtSeconds);
  order.elapsed = (Number(order.elapsed) || 0) + dtSeconds;
  if (order.remaining <= 0.000001) {
    const cache = state.guildAmmoCache || (state.guildAmmoCache = {});
    cache[order.ammoType] = Math.max(0, Number(cache[order.ammoType]) || 0) + order.total;
    const resource = C.TOWER_RESOURCE[order.ammoType];
    if (state.buildings?.guild) state.buildings.guild.activity = `Completed ${order.total} ${resource?.label || "ammo"}`;
    state.guildManufacturing = null;
  }
}
export function guildManufactureAmmo(state, slot) {
  const tower = state.towers?.[slot];
  if (!tower || C.TOWER_RESOURCE[tower.type]?.kind !== "ammo") return false;
  const maxAmmo = towerDerived(tower).maxAmmo;
  const current = Math.max(0, Number(tower.ammo) || 0);
  const cache = state.guildAmmoCache || (state.guildAmmoCache = {});
  const available = Math.max(0, Number(cache[tower.type]) || 0);
  const amount = Math.min(Math.max(0, maxAmmo - current), available);
  if (amount <= 0) return false;
  tower.ammo = current + amount;
  cache[tower.type] = available - amount;
  if (state.buildings?.guild) state.buildings.guild.activity = `Refilled ${amount} ammunition`;
  return { amount, remaining: cache[tower.type] };
}

export function resupplyTower(state, slot) {
  const tw = state.towers[slot];
  if (!tw) return false;
  const d = towerDerived(tw), r = C.TOWER_RESOURCE[tw.type];
  const current = r.kind === "ammo" ? (tw.ammo || 0) : (tw.mana || 0);
  const max = r.kind === "ammo" ? d.maxAmmo : d.maxMana;
  const missing = Math.max(0, max - current);
  if (missing <= 0) return false;
  if (r.kind === "ammo") {
    const cache = state.guildAmmoCache || {};
    const available = Math.max(0, Number(cache[tw.type]) || 0);
    const amount = Math.min(missing, available);
    if (amount <= 0) return false;
    tw.ammo = current + amount;
    cache[tw.type] = available - amount;
    state.guildAmmoCache = cache;
    return amount;
  }
  const gold = Math.ceil(missing * r.resupplyGold);
  const stone = Math.ceil(missing * r.resupplyStone);
  if (state.gold < gold || state.stone < stone) return false;
  state.gold -= gold; state.stone -= stone; tw.mana = max;
  return true;
}
// charged at wave start
export function chargeUpkeep(state) {
  for (const tw of state.towers) {
    if (!tw) continue;
    const up = C.TOWERS[tw.type].upkeep;
    const scale = 1 + Math.max(0, (tw.level || 1) - 1) * 0.15;
    const gold = Math.ceil(up.gold * scale), stone = Math.ceil(up.stone * scale);
    if (state.gold >= gold && state.stone >= stone) {
      state.gold -= gold; state.stone -= stone; tw.underfunded = false;
    } else tw.underfunded = true;
  }
}

// ---- barricades ----
function guildCanManageBarricades(state) {
  const guild = state.buildings?.guild;
  return !!guild && guild.unlocked !== false && guild.hp > 0 && (Number(guild.level) || 1) >= 1;
}

export function buyBarricade(state, pos, goldAmt) {
  const b = state.barricades?.[pos];
  goldAmt = Math.floor(Number(goldAmt));
  if (!guildCanManageBarricades(state) || !Number.isInteger(pos) || !b ||
    !Number.isFinite(goldAmt) || goldAmt < C.BARRICADE.minGold ||
    goldAmt > C.BARRICADE.maxGold || state.gold < goldAmt ||
    b.hp <= 0 && b.maxHp > 0 || b.maxHp + goldAmt * C.BARRICADE.goldToHp > C.BARRICADE.maxHp) return false;
  const addHp = goldAmt * C.BARRICADE.goldToHp;
  state.gold -= goldAmt;
  b.maxHp += addHp;
  b.hp += addHp;
  return true;
}

export function replaceBarricade(state, pos) {
  const b = state.barricades?.[pos];
  if (!guildCanManageBarricades(state) || !Number.isInteger(pos) || !b ||
    b.maxHp <= 0 || b.hp > 0 || state.gold < C.BARRICADE.maxGold) return false;
  state.gold -= C.BARRICADE.maxGold;
  b.maxHp = C.BARRICADE.maxHp;
  b.hp = C.BARRICADE.maxHp;
  return true;
}

export function upgradeGuildBlockade(state) {
  const guild = state.buildings?.guild;
  if (!guildCanManageBarricades(state) ||
    (Number(guild.level) || 1) < C.GUILD_BLOCKADE.requiredGuildLevel ||
    (Number(state.guildBlockadeLevel) || 0) >= 1 ||
    state.gold < C.GUILD_BLOCKADE.upgradeGold || state.stone < C.GUILD_BLOCKADE.upgradeStone) return false;
  state.gold -= C.GUILD_BLOCKADE.upgradeGold;
  state.stone -= C.GUILD_BLOCKADE.upgradeStone;
  state.guildBlockadeLevel = 1;
  guild.activity = "Universal blockade unlocked";
  return true;
}

export function guildBlockadeStatus(state, now = Date.now()) {
  const activeUntil = Math.max(0, Number(state.guildBlockadeActiveUntil) || 0);
  const cooldownUntil = Math.max(0, Number(state.guildBlockadeCooldownUntil) || 0);
  return {
    unlocked: (Number(state.guildBlockadeLevel) || 0) >= 1,
    active: activeUntil > now,
    remainingMs: Math.max(0, activeUntil - now),
    cooldownMs: Math.max(0, cooldownUntil - now),
  };
}

export function activateGuildBlockade(state, now = Date.now()) {
  const status = guildBlockadeStatus(state, now);
  if (!guildCanManageBarricades(state) || !status.unlocked || status.active ||
    status.cooldownMs > 0 || !(state.barricades || []).some((b) => b && b.hp > 0) ||
    state.gold < C.GUILD_BLOCKADE.activationGold || state.stone < C.GUILD_BLOCKADE.activationStone) return false;
  state.gold -= C.GUILD_BLOCKADE.activationGold;
  state.stone -= C.GUILD_BLOCKADE.activationStone;
  state.guildBlockadeActiveUntil = now + C.GUILD_BLOCKADE.durationMs;
  state.guildBlockadeCooldownUntil = now + C.GUILD_BLOCKADE.cooldownMs;
  return true;
}

export function repairBarricade(state, pos) {
  const b = state.barricades?.[pos];
  const guild = state.buildings?.guild;
  if (!guildCanManageBarricades(state) || !Number.isInteger(pos) || !b || b.hp <= 0 || b.maxHp <= b.hp) return false;
  const goldCost = Math.ceil((b.maxHp - b.hp) * 0.2);
  const stoneCost = Math.ceil((b.maxHp - b.hp) * 0.1);
  if (state.gold < goldCost || state.stone < stoneCost) return false;
  state.gold -= goldCost;
  state.stone -= stoneCost;
  b.hp = b.maxHp;
  guild.activity = `Repaired barricade lane ${pos + 1}`;
  return true;
}

// ---- hero progression ----
export function addHeroXp(hero, xp) {
  hero.xp += xp;
  const newLvl = C.heroLevelForXp(hero.xp);
  while (hero.level < newLvl) { hero.level += 1; hero.sp += 1; hero.ap += 1; }
  hero.perks = normalizePerks(hero.cls, hero.perks);
  if (!hero.abilityCooldowns || typeof hero.abilityCooldowns !== "object") hero.abilityCooldowns = {};
}
export function allocateSp(hero, stat) {
  if (!hero || !["attack", "defense", "agility", "intelligence"].includes(stat) ||
    !Number.isInteger(hero.sp) || hero.sp <= 0 || !Number.isInteger(hero.stats?.[stat])) return false;
  hero.sp -= 1; hero.stats[stat] += 1;
  return true;
}
export function buyPerk(hero, perkId) {
  if (!hero) return false;
  const perk = getPerk(hero.cls, perkId);
  if (!perk || !canUnlockPerk(hero, hero.cls, perkId)) return false;
  hero.perks = normalizePerks(hero.cls, hero.perks);
  hero.ap -= perk.cost;
  hero.perks.push(perk.id);
  hero.perks = [...new Set(hero.perks)];
  return true;
}

export function undoPendingSp(hero, stat, originalStats) {
  if (!hero || !originalStats || !["attack", "defense", "agility", "intelligence"].includes(stat) ||
    !Number.isInteger(hero.sp) || hero.sp < 0 || !Number.isInteger(hero.stats?.[stat]) ||
    !Number.isInteger(originalStats[stat]) || hero.stats[stat] <= originalStats[stat]) return false;
  hero.stats[stat] -= 1;
  hero.sp += 1;
  return true;
}

export function undoPendingPerk(hero, perkId, originalPerks) {
  if (!hero || !Array.isArray(hero.perks) || !Array.isArray(originalPerks) ||
    originalPerks.includes(perkId) || hero.perks.filter((id) => id === perkId).length !== 1 ||
    !Number.isInteger(hero.ap) || hero.ap < 0) return false;
  const perk = getPerk(hero.cls, perkId);
  if (!perk || !Number.isInteger(perk.cost) || perk.cost <= 0) return false;
  const hasPurchasedChild = getPerkTree(hero.cls).children.some((child) =>
    child.parent === perkId && hero.perks.includes(child.id));
  if (hasPurchasedChild) return false;
  hero.perks = hero.perks.filter((id) => id !== perkId);
  hero.ap += perk.cost;
  return true;
}

export function commitHeroProgressionDraft(hero, original, draft) {
  const statKeys = ["attack", "defense", "agility", "intelligence"];
  if (!hero || !original || !draft || !Number.isInteger(original.sp) || !Number.isInteger(original.ap) ||
    hero.sp !== original.sp || hero.ap !== original.ap ||
    JSON.stringify(hero.stats) !== JSON.stringify(original.stats) ||
    JSON.stringify(normalizePerks(hero.cls, hero.perks)) !== JSON.stringify(normalizePerks(original.cls, original.perks)) ||
    !Number.isInteger(draft.sp) || draft.sp < 0 || !Number.isInteger(draft.ap) || draft.ap < 0 ||
    !Array.isArray(draft.perks)) return false;

  let statPointsSpent = 0;
  for (const stat of statKeys) {
    const before = original.stats?.[stat];
    const after = draft.stats?.[stat];
    if (!Number.isInteger(before) || !Number.isInteger(after) || after < before) return false;
    statPointsSpent += after - before;
  }
  if (statPointsSpent > original.sp || draft.sp !== original.sp - statPointsSpent) return false;

  const originalPerks = normalizePerks(hero.cls, original.perks);
  const draftPerks = normalizePerks(hero.cls, draft.perks);
  if (originalPerks.some((id) => !draftPerks.includes(id)) || draftPerks.length !== draft.perks.length) return false;
  const candidate = { ...hero, ap: original.ap, perks: [...originalPerks] };
  for (const perkId of draftPerks.filter((id) => !originalPerks.includes(id))) {
    if (!buyPerk(candidate, perkId)) return false;
  }
  if (candidate.ap !== draft.ap) return false;

  hero.stats = { ...draft.stats };
  hero.sp = draft.sp;
  hero.ap = draft.ap;
  hero.perks = [...candidate.perks];
  return true;
}

// ---- recovery / morale ----
export function addMorale(state, delta) {
  state.morale = Math.max(0, Math.min(100, state.morale + delta));
}

// Academy training: one permanent stat point per completed course.
export function academySeats(state) {
  const level = Math.max(1, Number(state.buildings?.academy?.level) || 1);
  return 2 + Math.floor(Math.max(0, level - 1) / 3);
}
export function academyTrainingHours(state, hero, stat) {
  const allowed = ["attack", "defense", "agility", "intelligence"];
  if (!hero || !allowed.includes(stat)) return 6;
  const cp = castlePower(state);
  const cpScale = 1 + Math.max(0, cp - 20) * 0.002;
  const prior = Number(hero.academyTrainingCounts?.[stat]) || 0;
  const intelligence = Math.max(0, Number(hero.stats?.intelligence) || 0);
  const intScale = Math.max(0.5, 1 - 0.02 * Math.max(0, intelligence - 10));
  return 6 * cpScale * (prior + 1) * intScale;
}
export function enrollAcademyHero(state, heroId, stat, now = Date.now()) {
  const allowed = ["attack", "defense", "agility", "intelligence"];
  const academy = state.buildings?.academy;
  if (!academy || academy.unlocked === false || academy.hp <= 0 || !allowed.includes(stat)) return false;
  state.academyTraining = Array.isArray(state.academyTraining) ? state.academyTraining : [];
  state.academyHeroes = Array.isArray(state.academyHeroes) ? state.academyHeroes : [];
  state.academyTraining = state.academyTraining.filter((t) => state.academyHeroes.some((h) => h.id === t.heroId) || (state.bench || []).some((h) => h.id === t.heroId && t.paused));
  const active = state.academyTraining.filter((t) => !t.paused);
  if (active.length >= academySeats(state)) return false;
  const heroIndex = (state.bench || []).findIndex((h) => h.id === heroId);
  if (heroIndex < 0) return false; // Only reserve heroes may enroll.
  const hero = state.bench[heroIndex];
  const existing = state.academyTraining.find((t) => t.heroId === heroId && t.paused);
  if (existing) {
    if (existing.stat !== stat) return false; // Resume the same course; progress and duration are locked.
    state.bench.splice(heroIndex, 1);
    state.academyHeroes.push(hero);
    existing.paused = false;
    existing.startedAt = now - (Number(existing.elapsedMs) || 0);
    existing.completesAt = now + Math.max(0, existing.durationMs - (Number(existing.elapsedMs) || 0));
    academy.activity = `Resumed ${hero.name} · ${stat}`;
    return true;
  }
  if (state.academyTraining.some((t) => t.heroId === heroId)) return false;
  const hours = academyTrainingHours(state, hero, stat);
  state.bench.splice(heroIndex, 1);
  state.academyHeroes.push(hero);
  state.academyTraining.push({ heroId, stat, startedAt: now, completesAt: now + hours * 3600000, durationMs: hours * 3600000, elapsedMs: 0, paused: false });
  academy.activity = `Training ${hero.name} · ${stat}`;
  return true;
}
export function recallAcademyHero(state, heroId, now = Date.now()) {
  state.academyHeroes = Array.isArray(state.academyHeroes) ? state.academyHeroes : [];
  state.academyTraining = Array.isArray(state.academyTraining) ? state.academyTraining : [];
  const index = state.academyHeroes.findIndex((h) => h.id === heroId);
  if (index < 0) return false;
  const hero = state.academyHeroes[index];
  const training = state.academyTraining.find((t) => t.heroId === heroId);
  if (training && !training.paused) {
    training.elapsedMs = Math.min(training.durationMs, Math.max(Number(training.elapsedMs) || 0, now - (Number(training.startedAt) || now)));
    training.paused = true;
  }
  state.academyHeroes.splice(index, 1);
  state.bench = state.bench || [];
  state.bench.push(hero);
  if (state.buildings?.academy) state.buildings.academy.activity = `Recalled ${hero.name}`;
  return true;
}
export function advanceAcademyTraining(state, dtSeconds, now = Date.now()) {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return;
  state.academyTraining = Array.isArray(state.academyTraining) ? state.academyTraining : [];
  state.academyHeroes = Array.isArray(state.academyHeroes) ? state.academyHeroes : [];
  // Use elapsed simulation time so normal ticks and offline catch-up share one path.
  for (const training of state.academyTraining) {
    training.elapsedMs = Math.min(training.durationMs || 0, Math.max(Number(training.elapsedMs) || 0, now - (Number(training.startedAt) || now)));
  }
  const done = state.academyTraining.filter((t) => (t.elapsedMs || 0) >= (t.durationMs || Infinity));
  for (const training of done) {
    const hero = state.academyHeroes.find((h) => h.id === training.heroId);
    if (hero && ["attack", "defense", "agility", "intelligence"].includes(training.stat)) {
      hero.stats = hero.stats || {};
      hero.stats[training.stat] = (Number(hero.stats[training.stat]) || 0) + 1;
      hero.academyTrainingCounts = hero.academyTrainingCounts || {};
      hero.academyTrainingCounts[training.stat] = (Number(hero.academyTrainingCounts[training.stat]) || 0) + 1;
      const oldMaxHp = Number(hero.maxHp) || heroDerived(hero).maxHp;
      const nextMaxHp = heroDerived(hero).maxHp;
      hero.maxHp = nextMaxHp;
      if (hero.hp > 0) hero.hp = Math.min(nextMaxHp, hero.hp + Math.max(0, nextMaxHp - oldMaxHp));
    }
    if (hero) {
      state.academyHeroes = state.academyHeroes.filter((h) => h.id !== hero.id);
      state.bench = state.bench || [];
      state.bench.push(hero);
    }
    state.buildings.academy.activity = hero ? `Trained ${hero.name} · ${training.stat}` : "Training completed";
  }
  state.academyTraining = state.academyTraining.filter((t) => !done.includes(t));
}

// Tavern service: a modest, resource-funded morale boost. No resources are
// charged when the building is disabled, the player cannot afford it, or
// morale is already full.
export function hostTavernFeast(state) {
  const tavern = state.buildings?.tavern;
  if (!tavern || tavern.unlocked === false || tavern.hp <= 0) return false;
  const cost = C.TAVERN_FEAST;
  if (state.morale >= 100 || state.gold < cost.gold || state.stone < cost.stone) return false;
  state.gold -= cost.gold;
  state.stone -= cost.stone;
  addMorale(state, cost.morale);
  tavern.activity = "Hosted a Feast";
  return true;
}

export function healHero(state, hero) {
  const classless = !!hero && !hero.cls && !!hero.combat;
  const hp = classless ? hero.combat.hp : hero?.hp;
  if (!hero || hp <= 0) return false;
  const maxHp = classless ? classlessMaxHp(hero) : heroDerived(hero).maxHp;
  const missing = maxHp - hp;
  if (missing <= 0) return false;
  const cost = Math.ceil(missing / 10) * C.HERO_HEAL_GOLD_PER_10HP;
  if (state.gold < cost) return false;
  state.gold -= cost;
  if (classless) hero.combat.hp = maxHp;
  else hero.hp = maxHp;
  return true;
}

export function reviveHero(state, hero) {
  const classless = !!hero && !hero.cls && !!hero.combat;
  const hp = classless ? hero.combat.hp : hero?.hp;
  if (!hero || hp > 0) return false;
  const cost = C.paidRevivalCost(classless ? hero.progression?.level : hero.level);
  if (state.gold < cost) return false;
  const maxHp = classless ? classlessMaxHp(hero) : heroDerived(hero).maxHp;
  state.gold -= cost;
  const revivedHp = Math.max(1, Math.round(maxHp * (C.RECOVERY.reviveHpPercent / 100)));
  if (classless) hero.combat.hp = revivedHp;
  else hero.hp = revivedHp;
  return true;
}

export function recoverAllWounded(state) {
  recoverOverTime(state, 3600);
}

// ---- castle repair (prep) ----
export function repairCastle(state) {
  const missing = state.castleMaxHp - state.castleHp;
  if (missing <= 0) return false;
  const cost = C.repairStoneCost(missing);
  if (state.stone < cost) return false;
  state.stone -= cost; state.castleHp = state.castleMaxHp; return true;
}

// ---- wave composition ----
export function buildWave(state, seedRand = Math.random) {
  const cp = castlePower(state);
  const count = state.wave <= 3
    ? C.earlyWaveEnemyCount(state.wave, cp)
    : Math.max(6, C.targetEnemyCount(state.wave, cp));
  const earlyScale = C.earlyWaveCombatScale(state.wave);
  const hpS = C.enemyHpScale(state.wave, cp) * earlyScale;
  const dmgS = C.enemyDmgScale(state.wave, cp) * earlyScale;
  const groups = Math.min(5, Math.max(2, 2 + Math.floor(state.wave / 3)));
  const weights = C.GROUP_WEIGHTS.slice(0, groups);
  const wsum = weights.reduce((a, b) => a + b, 0);
  // Fresh-player opening: W1 is basic-only; specialists are introduced
  // gradually instead of arriving at full pressure immediately.
  const specCap = state.wave === 1
    ? 0
    : state.wave === 2
      ? 0.10
      : state.wave === 3
        ? 0.15
        : state.wave <= 5
          ? 0.20
          : Math.min(0.5, 0.2 + cp * 0.01);
  const objectives = ["castle", "towers", "resources", "castle", "squad"];

  // Counter-aware specialists: keep the existing specialist introduction cap,
  // but bias the random pick toward enemies that challenge the player's current
  // defensive composition. This affects composition only, never enemy stats.
  const specialistWeights = Object.fromEntries(C.SPEC_POOL.map((key) => [key, 1]));
  const heroClasses = new Set((state.heroes || []).map((hero) => hero.cls || hero.class).filter(Boolean));
  const towerCounts = (state.towers || []).reduce((counts, tower) => {
    if (tower?.type) counts[tower.type] = (counts[tower.type] || 0) + 1;
    return counts;
  }, {});
  if (heroClasses.has("mage")) specialistWeights.warlock += 2;
  if ((towerCounts.wizard || 0) > 0) specialistWeights.warlock += 1;
  if ((towerCounts.archer || 0) + (towerCounts.ballista || 0) > 0) {
    specialistWeights.orc += 1;
    specialistWeights.reaper += 1;
    specialistWeights.darkElf += 1;
  }
  if ((towerCounts.catapult || 0) > 0) specialistWeights.reaper += 2;
  const deployedTowerCount = (state.towers || []).filter(Boolean).length;
  if (deployedTowerCount >= 2) {
    specialistWeights.darkElf += 1;
    specialistWeights.warlock += 1;
  }
  const pickWeighted = (weights) => {
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = seedRand() * totalWeight;
    for (const [key, weight] of entries) {
      roll -= weight;
      if (roll < 0) return key;
    }
    return entries[entries.length - 1][0];
  };
  const pickSpecialist = () => pickWeighted(specialistWeights);
  const basicWeights = { ghost: 1, slime: 1, goblin: 1 };
  if ((towerCounts.wizard || 0) > 0) basicWeights.slime += 2;
  const pickBasic = () => pickWeighted(basicWeights);

  const enemies = [];
  let idCounter = 0;
  const bossWave = state.wave % 5 === 0;

  for (let g = 0; g < groups; g++) {
    const gCount = Math.max(1, Math.round(count * (weights[g] / wsum)));
    const objective = objectives[g % objectives.length];
    for (let i = 0; i < gCount; i++) {
      const earlyPool = C.EARLY_WAVE_POOLS[state.wave];
      let poolKey;
      if (earlyPool) {
        poolKey = earlyPool[Math.floor(seedRand() * earlyPool.length)];
      } else if (seedRand() < specCap) {
        poolKey = pickSpecialist();
      } else {
        poolKey = pickBasic();
      }
      const base = C.ENEMIES[poolKey];
      enemies.push(makeEnemy(idCounter++, base, hpS, dmgS, g, objective));
    }
  }
  // Introduce the first lieutenant after the three-wave onboarding
  // window; W1-W3 remain focused on learning the basic combat loop.
  if (state.wave >= 4) {
    const elites = 1 + Math.floor(state.wave / 5);
    for (let i = 0; i < elites; i++)
      enemies.push(makeEnemy(idCounter++, C.ENEMIES.lieutenant, hpS, dmgS, 0, "squad"));
  }
  if (bossWave) {
    const bossCycle = ["demon", "imperialNecromancer", "nuclearBehemoth"];
    const bossKey = bossCycle[(Math.floor(state.wave / 5) - 1) % bossCycle.length];
    enemies.push(makeEnemy(idCounter++, C.ENEMIES[bossKey], hpS, dmgS, 0, "castle"));
  }

  return { enemies, total: enemies.length, groups, hasBoss: bossWave };
}

function makeEnemy(id, base, hpS, dmgS, group, objective) {
  const maxHp = Math.round(base.hp * hpS);
  return {
    id, type: base.key, name: base.name, tier: base.tier,
    hp: maxHp, maxHp, speed: base.speed, damage: base.damage * dmgS,
    color: base.color, floats: !!base.floats, magicImmune: !!base.magicImmune,
    boss: !!base.boss, group, objective,
    affinities: { ...(base.affinities || {}) },
  };
}

// single enemy for debug spawning, scaled to current wave/CP
export function makeSingleEnemy(state, typeKey) {
  const cp = castlePower(state);
  const base = C.ENEMIES[typeKey] || C.ENEMIES.ghost;
  return makeEnemy(Date.now() + Math.random(), base, C.enemyHpScale(state.wave, cp), C.enemyDmgScale(state.wave, cp), 0, "castle");
}

// ---- wave results & failure ----
export function freeLife(state) {
  if (!state || state.freeLifeUsed) return false;
  const vaultProtected = state.buildings?.vault?.unlocked !== false && (Number(state.buildings?.vault?.hp) || 0) > 0;
  const treasury = Math.max(0, Number(state.gold) || 0);
  const vault = vaultProtected ? 0 : Math.max(0, Number(state.vaultGold) || 0);
  const exposedGold = treasury + vault;
  deductGoldLoss(state, exposedGold - Math.floor(exposedGold * C.FREE_LIFE.keepResourceFrac), !vaultProtected);
  state.stone = Math.floor(state.stone * C.FREE_LIFE.keepResourceFrac);
  state.metal = Math.floor((Number(state.metal) || 0) * C.FREE_LIFE.keepResourceFrac);
  for (const h of state.heroes) {
    if (!h.cls && h.combat) h.combat.hp = classlessMaxHp(h);
    else { const d = heroDerived(h); h.hp = d.maxHp; }
  }
  for (const t of state.towers) if (t) {
    const d = towerDerived(t);
    t.hp = d.maxHp;
    if (d.resourceKind === "ammo") { t.maxAmmo = d.maxAmmo; t.ammo = d.maxAmmo; }
    else { t.maxMana = d.maxMana; t.mana = d.maxMana; }
  }
  state.castleHp = state.castleMaxHp;
  state.morale = C.FREE_LIFE.moraleReset;
  state.freeLifeUsed = true;
  return true;
}

export function surrender(state) {
  const wave = Math.max(1, Number(state.wave) || 1);
  if (Number(state.surrenderTaxAppliedWave) === wave) return false;
  state.surrenderTaxRate = C.surrenderTaxRate(state.wave);
  state.surrenderDebtWave = wave;
  const vaultProtected = state.buildings?.vault?.unlocked !== false && (Number(state.buildings?.vault?.hp) || 0) > 0;
  const exposedGold = Math.max(0, Number(state.gold) || 0) +
    (vaultProtected ? 0 : Math.max(0, Number(state.vaultGold) || 0));
  deductGoldLoss(state, Math.ceil(exposedGold * state.surrenderTaxRate), !vaultProtected);
  state.surrenderTaxAppliedWave = wave;
  addMorale(state, C.MORALE.surrender);
  return true;
}

function deductGoldLoss(state, amount, exposeVault) {
  let remaining = Math.max(0, Number(amount) || 0);
  const treasuryLoss = Math.min(Math.max(0, Number(state.gold) || 0), remaining);
  state.gold = Math.max(0, (Number(state.gold) || 0) - treasuryLoss);
  remaining -= treasuryLoss;
  if (exposeVault && remaining > 0) {
    const vaultLoss = Math.min(Math.max(0, Number(state.vaultGold) || 0), remaining);
    state.vaultGold = Math.max(0, (Number(state.vaultGold) || 0) - vaultLoss);
  }
}

export function completeWave(state, clearedWave = state.wave) {
  if (!Number.isInteger(clearedWave) || clearedWave !== state.wave ||
    Number(state.lastCompletedWave) === clearedWave) return false;
  state.lastCompletedWave = clearedWave;
  state.highestWaveCleared = Math.max(state.highestWaveCleared, state.wave);
  state.castleMaxHp = C.castleMaxHp(state.highestWaveCleared);
  addMorale(state, C.MORALE.waveComplete);
  state.bests.highestWave = Math.max(state.bests.highestWave, state.highestWaveCleared);
  if (state.surrenderDebtWave && state.wave >= state.surrenderDebtWave) {
    state.surrenderTaxRate = 0; state.surrenderDebtWave = 0; state.surrenderTaxAppliedWave = 0;
  }
  state.wave += 1;
  return true;
}


export function reconcileEquipmentHp(state, hero) {
  if (!hero) return;
  const d = heroDerived(hero);
  if (hero.hp > 0) hero.hp = Math.min(hero.hp, d.maxHp);
  hero.maxHp = d.maxHp;
}

export function equipHeroItem(state, heroIndex, itemId, targetSlot = null) {
  const hero = state.heroes?.[heroIndex];
  if (!hero) return false;
  if (!equipStoredItem(state, heroIndex, itemId, targetSlot)) return false;
  const afterMax = heroDerived(hero).maxHp;

  // Equipment changes modify the hero's maximum HP, but do not heal them.
  // Preserve current HP and only clamp it if the new maximum is lower.
  if (hero.hp > 0) hero.hp = Math.min(hero.hp, afterMax);
  hero.maxHp = afterMax;
  return true;
}

export function unequipHeroItem(state, heroIndex, slot) {
  const hero = state.heroes?.[heroIndex];
  if (!hero) return false;
  if (!unequipStoredItem(state, heroIndex, slot)) return false;
  reconcileEquipmentHp(state, hero);
  return true;
}
