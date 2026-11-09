import { classlessMaxHp } from "./classlessCombatEffects";
import { Engine } from "./engine";
import { STORY_BOSS } from "./enemies/tuning";
import { buildScenarioWave, createEncounterSim } from "../game/encounters";
import { createGuild } from "../game/guild";
import { createGearItem } from "../game/items";
import { seededRandom } from "../game/random";

// A fight against `boss` alone, with three sword heroes in god mode.
function bossFight(boss, { god = true } = {}) {
  const heroes = createGuild().heroes.map((hero) => {
    const copy = structuredClone(hero);
    copy.traits = [];
    copy.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "common", tier: 1 }, seededRandom(1)) };
    copy.combat.hp = classlessMaxHp(copy);
    return copy;
  });
  const wave = buildScenarioWave({ faction: "chaos", boss }, 1);
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1, wave, { rng: seededRandom(9) }), wave, {});
  engine.godMode = god;
  return engine;
}
const step = (engine, seconds) => { for (let i = 0; i < seconds * 30 && !engine.ended; i += 1) engine.update(1 / 30); };
const bossOf = (engine) => engine.active.find((enemy) => enemy.boss);

describe("story bosses", () => {
  test("the Gatewarden opens portals (two at most) that spawn foes until destroyed, and collapse with her", () => {
    const engine = bossFight("gatewarden");
    step(engine, 1);
    const boss = bossOf(engine);
    boss.hp = boss.maxHp = 1e9;
    step(engine, STORY_BOSS.gatewarden.firstPortal + 0.5);
    const portals = () => engine.active.filter((enemy) => enemy.portal);
    expect(portals()).toHaveLength(1);
    expect(portals()[0].hp).toBe(Math.round(1e9 * STORY_BOSS.gatewarden.portalHp));
    // Every foe that comes in counts toward the wave's total.
    const before = engine.wave.total;
    const at = { x: portals()[0].x, y: portals()[0].y };
    step(engine, STORY_BOSS.gatewarden.spawnEvery + 1);
    expect(engine.wave.total).toBeGreaterThan(before);
    expect({ x: portals()[0].x, y: portals()[0].y }).toEqual(at); // stays put
    step(engine, STORY_BOSS.gatewarden.portalEvery * 3);
    expect(portals().length).toBeLessThanOrEqual(STORY_BOSS.gatewarden.maxPortals);
    const gold = engine.sim.gold;
    boss.hp = 0;
    engine._killEnemy(boss, "H0");
    step(engine, 0.2);
    expect(portals()).toHaveLength(0);
    expect(engine.fallen.some((entry) => entry.enemy.portal)).toBe(false);
    expect(engine.sim.gold - gold).toBeLessThan(1e6);
  });

  test("the Chronomancer's time field slows heroes' steps and swings; once, hurt, he rewinds", () => {
    const engine = bossFight("chronomancer");
    step(engine, 1);
    const boss = bossOf(engine);
    boss.hp = boss.maxHp = 1e9;
    step(engine, STORY_BOSS.chronomancer.firstField + 0.2);
    const slowed = engine.heroes.filter((h) => h.timeSlowUntil > engine.time);
    expect(slowed.length).toBeGreaterThan(0);
    const h = slowed[0];
    h.cd = 1;
    engine.update(0.1);
    expect(h.cd).toBeGreaterThan(1 - 0.1); // a slowed swing timer runs at 60%
    // So do special-move and spell cooldowns.
    h.abilityCooldowns = { lunge: 10 };
    h.spellCooldowns = { firebolt: 10 };
    engine.update(1);
    expect(h.abilityCooldowns.lunge).toBeCloseTo(10 - (1 - STORY_BOSS.chronomancer.slow), 5);
    expect(h.spellCooldowns.firebolt).toBeCloseTo(10 - (1 - STORY_BOSS.chronomancer.slow), 5);
    boss.hp = boss.maxHp * 0.4;
    engine.update(1 / 30);
    expect(boss.hp).toBe(Math.round(boss.maxHp * STORY_BOSS.chronomancer.rewindTo));
    boss.hp = boss.maxHp * 0.4;
    engine.update(1 / 30);
    expect(boss.hp).toBeLessThan(boss.maxHp * 0.5); // only once
  });

  test("the Ritualist's ritual: broken by enough damage, otherwise it blasts the whole party", () => {
    const broken = bossFight("ritualist");
    step(broken, 1);
    const boss = bossOf(broken);
    boss.hp = boss.maxHp = 1e9;
    step(broken, STORY_BOSS.ritualist.firstChannel);
    expect(boss.channelUntil).toBeGreaterThan(broken.time);
    expect(boss.speed).toBe(0);
    boss.hp -= boss.maxHp * STORY_BOSS.ritualist.breakShare;
    broken.update(1 / 30);
    expect(boss.channelUntil).toBeNull();
    expect(boss.stunUntil).toBeGreaterThan(broken.time);

    const blasted = bossFight("ritualist", { god: false });
    step(blasted, 1);
    const ritualist = bossOf(blasted);
    ritualist.hp = ritualist.maxHp = 1e12;
    ritualist.damage = 0;
    step(blasted, STORY_BOSS.ritualist.firstChannel);
    for (const h of blasted.heroes) h.ref.hp = h.d.maxHp;
    blasted.active = [ritualist];
    step(blasted, STORY_BOSS.ritualist.channel + 0.2);
    for (const h of blasted.heroes) expect(h.ref.hp).toBeLessThanOrEqual(Math.ceil(h.d.maxHp * (1 - STORY_BOSS.ritualist.blast)) + 1);
  });

  test("the Ancient Evil shields its servants, confuses heroes (Spellguard wards it off), and opens the wormhole", () => {
    const engine = bossFight("ancientEvil");
    step(engine, 1);
    const boss = bossOf(engine);
    boss.hp = boss.maxHp = 1e9;
    // Its aura: servants nearby take 25% less.
    const servant = engine.sim.makeMinion("orc");
    engine.injectEnemy(servant);
    servant.x = boss.x + 20; servant.y = boss.y;
    engine.update(1 / 30);
    expect(engine._foeWardCut(servant)).toBeCloseTo(1 - STORY_BOSS.ancientEvil.auraCut, 5);
    // Confusion, but not through Spellguard.
    const [guarded] = engine.heroes;
    guarded.spellguardUntil = 1e9;
    step(engine, STORY_BOSS.ancientEvil.firstConfuse);
    expect(guarded.confusedUntil || 0).toBeLessThanOrEqual(engine.time);
    expect(engine.heroes.some((h) => h.confusedUntil > engine.time)).toBe(true);
    // The wormhole, at 66% and 33%.
    const before = engine.active.length;
    boss.hp = boss.maxHp * 0.6;
    engine.update(1 / 30);
    expect(engine.active.length).toBeGreaterThanOrEqual(before + STORY_BOSS.ancientEvil.wormholeFoes.length + STORY_BOSS.ancientEvil.wormholeZombies - 2);
    expect(boss.wormholes).toBe(1);
  });

  test("a confused hero strikes friend or foe; an ally takes half the blow", () => {
    const engine = bossFight("ancientEvil", { god: false });
    step(engine, 0.5);
    const [h, ally] = engine.heroes;
    engine.active = [];
    ally.x = h.x + 10; ally.y = h.y;
    const hp = ally.ref.hp;
    h.confusedUntil = engine.time + 5;
    h.cd = 0;
    engine._confusedTurn(h);
    expect(ally.ref.hp).toBeLessThan(hp);
    expect(hp - ally.ref.hp).toBeLessThanOrEqual(h.d.damage * 0.5 + 1e-9);
  });
});
