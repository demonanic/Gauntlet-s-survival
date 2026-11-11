// Story mode bosses (owner's design, Nov 2026): The Time Warp Breach's three
// rebel warlocks and the Ancient Evil, each with powers from the story's lore.
// Numbers in tuning.js STORY_BOSS. Called from the boss's turn (abilities.js
// bossAbility) instead of the ordinary boss summons; a stun or silence holds
// them, as it holds every boss power.
import { STORY_BOSS } from "./tuning";
import { H, W } from "../arena";

export const STORY_BOSS_TYPES = new Set(Object.keys(STORY_BOSS));

// A timer on `e` that starts at `first` s and repeats every `every` s; true when it fires.
function every(e, key, dt, first, period) {
  e[key] = (e[key] ?? first) - dt;
  if (e[key] > 0) return false;
  e[key] = period;
  return true;
}

export function storyBossTick(engine, e, dt) {
  if (e.type === "gatewarden") gatewarden(engine, e, dt);
  else if (e.type === "chronomancer") chronomancer(engine, e, dt);
  else if (e.type === "ritualist") ritualist(engine, e, dt);
  else if (e.type === "ancientEvil") ancientEvil(engine, e, dt);
}

// The Gatewarden opens portals that pour foes onto the field until destroyed.
function gatewarden(engine, e, dt) {
  const t = STORY_BOSS.gatewarden;
  if (!every(e, "portalCd", dt, t.firstPortal, t.portalEvery)) return;
  const open = engine.active.filter((foe) => foe.portal && foe.hp > 0 && foe.master === e).length;
  if (open >= t.maxPortals) return;
  const portal = engine.sim.makeMinion("portal");
  portal.hp = portal.maxHp = Math.round(e.maxHp * t.portalHp);
  portal.master = e;
  portal.spawnCd = 1.5;
  engine.injectEnemy(portal);
  portal.x = 50 + engine.rng() * (W - 100);
  portal.y = 70 + engine.rng() * (H * 0.3);
  engine._float(portal.x, portal.y - 26, "PORTAL", e.color);
  engine._log("boss", `${engine._foeName(e)} tears open a portal`);
  engine.effects.push({ x: portal.x, y: portal.y, r: 34, life: 0.6, color: e.color, ring: true });
}

// A portal's turn: it never moves or attacks. It spawns until destroyed, and
// collapses when the Gatewarden falls.
export function portalTick(engine, portal, dt) {
  if (portal.master && !(portal.master.hp > 0)) {
    // Gone with its maker: no loot, no XP.
    portal.escaped = true;
    engine._float(portal.x, portal.y - 20, "COLLAPSES", portal.color);
    return;
  }
  // A story goal's object (goals.js) may set its own pace and foes.
  const spawnEvery = portal.spawnEvery ?? STORY_BOSS.gatewarden.spawnEvery;
  portal.spawnCd = (portal.spawnCd ?? spawnEvery) - dt;
  if (portal.spawnCd > 0) return;
  portal.spawnCd = spawnEvery;
  const spawns = portal.spawns || STORY_BOSS.gatewarden.spawns;
  const foe = engine.sim.makeMinion(spawns[Math.floor(engine.rng() * spawns.length)]);
  foe.summoned = true;
  engine.injectEnemy(foe);
  foe.x = portal.x; foe.y = portal.y + 10;
  engine.effects.push({ x: portal.x, y: portal.y, r: 22, life: 0.35, color: portal.color, ring: true });
}

// The Chronomancer bends time: a field that slows heroes' swings and steps,
// and once, when hurt, he winds himself back.
function chronomancer(engine, e, dt) {
  const t = STORY_BOSS.chronomancer;
  if (!e.rewound && e.hp < e.maxHp * t.rewindBelow) {
    e.rewound = true;
    e.hp = Math.round(e.maxHp * t.rewindTo);
    e.dots = [];
    engine._float(e.x, e.y - 34, "REWIND", e.color);
    engine._log("boss", `${engine._foeName(e)} winds back his own wounds`);
    engine.effects.push({ x: e.x, y: e.y, r: 50, life: 0.8, color: e.color, ring: true });
  }
  if (!every(e, "fieldCd", dt, t.firstField, t.fieldEvery)) return;
  const living = engine.heroes.filter((h) => h.alive);
  if (!living.length) return;
  const center = living[Math.floor(engine.rng() * living.length)];
  const caught = living.filter((h) => Math.hypot(h.x - center.x, h.y - center.y) <= t.fieldRadius);
  for (const h of caught) {
    h.timeSlowUntil = engine.time + t.slowSeconds;
    h.timeSlow = t.slow;
    engine._float(h.x, h.y - 24, "SLOWED", e.color);
  }
  engine._log("boss", `${engine._foeName(e)} slows time around ${caught.map((h) => engine._name(h)).join(", ")}`);
  engine.effects.push({ x: center.x, y: center.y, r: t.fieldRadius, life: 0.9, color: e.color, ring: true });
}

// The Ritualist channels the ritual: break it with damage, or it hits everyone.
function ritualist(engine, e, dt) {
  const t = STORY_BOSS.ritualist;
  if (e.channelUntil != null) {
    if (e.channelHp - e.hp >= e.maxHp * t.breakShare) {
      e.channelUntil = null;
      e.stunUntil = engine.time + t.brokenStun;
      e.speed = e.channelSpeed;
      engine._float(e.x, e.y - 34, "RITUAL BROKEN", "#FDE68A");
      engine._log("boss", `${engine._foeName(e)}'s ritual is broken`);
      return;
    }
    if (engine.time < e.channelUntil) return;
    e.channelUntil = null;
    e.speed = e.channelSpeed;
    for (const h of engine.heroes.filter((hero) => hero.alive)) {
      const damage = h.d.maxHp * t.blast * engine._wardCut(h, "magic");
      engine._resolveClasslessHeroDamage(h, damage);
      engine._float(h.x, h.y - 20, "-" + Math.round(damage), e.color);
    }
    engine._float(e.x, e.y - 34, "THE RITUAL!", e.color);
    engine._log("boss", `${engine._foeName(e)} completes the ritual`);
    engine.effects.push({ x: W / 2, y: H * 0.7, r: 220, life: 0.8, color: e.color, ring: true });
    return;
  }
  if (!every(e, "channelCd", dt, t.firstChannel, t.channelEvery)) return;
  e.channelUntil = engine.time + t.channel;
  e.channelStart = engine.time;
  e.channelHp = e.hp;
  e.channelSpeed = e.speed;
  e.speed = 0;
  engine._float(e.x, e.y - 34, "CHANNELING", e.color);
  engine._log("boss", `${engine._foeName(e)} begins the ritual: break it!`);
}

// The Ancient Evil: a tank whose presence hastens and shields its servants,
// who turns heroes on each other, and who opens the wormhole when hurt.
function ancientEvil(engine, e, dt) {
  const t = STORY_BOSS.ancientEvil;
  for (const ally of engine.active) {
    if (ally === e || ally.hp <= 0 || Math.hypot(ally.x - e.x, ally.y - e.y) > t.auraRadius) continue;
    ally._commanderBoost = Math.max(ally._commanderBoost || 1, t.auraBoost);
    ally.evilAuraUntil = engine.time + 0.25;
  }
  e.wormholes = e.wormholes || 0;
  const next = t.wormholeAt[e.wormholes];
  if (next != null && e.hp < e.maxHp * next) {
    e.wormholes += 1;
    for (const type of t.wormholeFoes) { const foe = engine.sim.makeMinion(type); foe.summoned = true; engine.injectEnemy(foe); }
    for (let i = 0; i < t.wormholeZombies; i += 1) {
      const zombie = engine.sim.makeMinion("zombie");
      zombie.summoned = true;
      engine.injectEnemy(zombie);
      engine._hordeEntry(zombie);
    }
    engine._float(e.x, e.y - 40, "THE WORMHOLE OPENS", e.color);
    engine._log("boss", `${engine._foeName(e)} opens the wormhole`);
    engine.effects.push({ x: W / 2, y: 60, r: 80, life: 1, color: e.color, ring: true });
  }
  if (!every(e, "confuseCd", dt, t.firstConfuse, t.confuseEvery)) return;
  const living = engine.heroes.filter((h) => h.alive);
  const picked = [...living].sort(() => engine.rng() - 0.5).slice(0, Math.min(t.confuseCount, Math.max(1, living.length - 1)));
  for (const h of picked) engine._confuseHero(h, t.confuseSeconds, e.color);
}
