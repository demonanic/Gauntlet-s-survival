// Enemy abilities (Phase 8B, moved out of engine.js unchanged): what bosses,
// Champion bosses and Warlocks do besides moving and attacking. The engine
// calls these from its enemy turn; Silence stops all three.
import { BOSS_MINIONS, CHAMPION_SWARM, CHAMPION_WARD, WARLORD_GANG } from "./tuning";
import { STORY_BOSS_TYPES, storyBossTick } from "./storyBosses";

// A boss's special (every few seconds): the Abomination's toxic slam and its
// one-time enrage, the Bandit Warlord's call and charge, the Bog Lich's
// mending, raising and bile, and the Demon's and Imperial Necromancer's
// summons; bombs are lobbed at heroes keeping their distance.
export function bossAbility(engine, e, dt) {
  // Story mode's bosses have powers of their own (storyBosses.js), on top of
  // their ordinary bolts.
  if (STORY_BOSS_TYPES.has(e.type)) { storyBossTick(engine, e, dt); return; }
  e.abilityCd = (e.abilityCd == null ? 5 : e.abilityCd) - dt;
  // Gauntlet boss identities: the Abomination enrages once, below 35% HP.
  if (e.type === "nuclearBehemoth" && !e.enraged && e.hp < e.maxHp * 0.35) {
    e.enraged = true;
    e.speed *= 1.5;
    e.damage *= 1.3;
    engine._float(e.x, e.y - 34, "ENRAGED", "#84CC16");
    engine._log("boss", `${engine._foeName(e)} is enraged`);
    engine.effects.push({ x: e.x, y: e.y, r: 46, life: 0.6, color: "#84CC16", ring: true });
  }
  if (e.abilityCd <= 0) {
    const range = e.attackRange || 420;
    const target = engine._nearestDefender(e.x, e.y, range);
    // Gauntlet: bombs and bile are lobbed at heroes keeping their distance;
    // heroes in melee face the boss's own attacks instead.
    const lobTarget = engine._lobTarget(e, range);
    if (e.type === "nuclearBehemoth") {
      // Toxic slam: no minions, heavy damage to every hero close by.
      if (engine._nearestDefender(e.x, e.y, 110)) {
        e.abilityCd = e.enraged ? 3.5 : 5;
        engine.effects.push({ x: e.x, y: e.y, r: 100, life: 0.45, color: "#84CC16", ring: true });
        engine._explodeNapalm(e.x, e.y, { dmg: e.damage * 1.1 * engine._hexDamage(e), splash: 100 });
      } else {
        e.abilityCd = 0.5;
      }
    } else if (e.type === "banditWarlord") {
      // Calls his gang in (topping it back up to WARLORD_GANG, never
      // past it, so cutting his bandits down gets somewhere), then
      // charges the weakest hero himself.
      e.abilityCd = 10;
      const gang = engine.active.filter((ally) => ally.type === "bandit" && ally.hp > 0).length;
      const called = Math.min(2, Math.max(0, WARLORD_GANG - gang));
      for (let k = 0; k < called; k++) engine._summon("bandit", e);
      if (called) { engine._float(e.x, e.y - 34, "TO ME, LADS!", e.color); engine._log("boss", `${engine._foeName(e)} calls ${called} bandit${called > 1 ? "s" : ""}`); }
      e.blitzUntil = engine.time + 0.6;
      e.blitzStrike = true;
    } else if (target && e.type === "bogLich") {
      // Mends its court, drags the dead back up, and spits bile.
      e.abilityCd = 7;
      engine._healAllies(e, 250, 0.12);
      engine._raiseFallen(e, 250, 2);
      if (lobTarget) engine._throwNapalm(e, lobTarget);
    } else if (target) {
      // Both top their minions back up to BOSS_MINIONS alive, never past
      // it: in a long fight, unlimited summons buried the party.
      if (e.type === "imperialNecromancer") {
        // Raise dead: a larger, slower pack of minions, plus a soul bomb.
        e.abilityCd = 8;
        if (engine._summonUpTo(["skeleton", "skeleton", "ghost"], BOSS_MINIONS, e)) { engine._float(e.x, e.y - 34, "RAISE DEAD", e.color); engine._log("boss", `${engine._foeName(e)} raises the dead`); }
      } else {
        e.abilityCd = 6;
        engine._summonUpTo(["skeleton", "skeleton"], BOSS_MINIONS, e);
      }
      if (lobTarget) engine._throwNapalm(e, lobTarget);
    } else {
      e.abilityCd = 1;
    }
  }
}

// Champion bosses (game/regions.js CHAMPIONS): Warded, Swarming, Frenzied.
// (Vampiric heals on each hit it or its minions land: engine._vampiric.)
export function championTick(engine, e, dt) {
  const share = e.hp / e.maxHp;
  if (e.champion === "warded") {
    const next = [0.66, 0.33][e.wardsUsed || 0];
    if (next != null && share < next) {
      e.wardsUsed = (e.wardsUsed || 0) + 1;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * CHAMPION_WARD);
      engine._float(e.x, e.y - 34, "WARDED", "#38BDF8");
      engine._log("boss", `${engine._foeName(e)} wards itself`);
      engine.effects.push({ kind: "shield", x: e.x, y: e.y, r: 44, life: 1, color: "#38BDF8" });
    }
  } else if (e.champion === "swarming") {
    e.swarmCd = (e.swarmCd ?? 3) - dt;
    if (e.swarmCd <= 0) {
      e.swarmCd = 4;
      if (engine._summonUpTo(["skeleton", "skeleton"], CHAMPION_SWARM, e)) { engine._float(e.x, e.y - 34, "SWARM", e.color); engine._log("boss", `${engine._foeName(e)} calls a swarm`); }
    }
  } else if (e.champion === "frenzied" && !e.frenzied && share < 0.5) {
    e.frenzied = true;
    e.attackSpeed = (e.attackSpeed || 1) * 1.4;
    e.damage *= 1.2;
    engine._float(e.x, e.y - 34, "FRENZY", "#F43F5E");
    engine._log("boss", `${engine._foeName(e)} goes into a frenzy`);
    engine.effects.push({ kind: "impact", x: e.x, y: e.y, r: 46, life: 0.7, color: "#F43F5E" });
  }
}

// Warlocks are Mage Hunters: every few seconds they strike a mage (or any
// living hero) within reach.
export function warlockMageHunt(engine, e, dt) {
  e.abilityCd = (e.abilityCd == null ? 3 : e.abilityCd) - dt;
  if (e.abilityCd <= 0) {
    // Warlocks are Mage Hunters: Mage first, then any living hero.
    const target =
      engine._nearestMageEntity(e.x, e.y, 300) ||
      engine._nearestHeroEntity(e.x, e.y, 300);

    if (target?.kind === "hero") {
      engine._enemyAttack(e, target);
      if (target.obj?.ref?.type === "mage") {
        engine._float(target.obj.x, target.obj.y - 22, "MAGE HUNT", e.color);
      }
      e.abilityCd = 4.5;
    } else {
      e.abilityCd = 1;
    }
  }
}
