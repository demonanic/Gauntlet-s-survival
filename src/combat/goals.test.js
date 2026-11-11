import { classlessMaxHp } from "./classlessCombatEffects";
import { Engine } from "./engine";
import { EXIT_Y } from "./goals";
import { createEncounterSim } from "../game/encounters";
import { createGuild } from "../game/guild";
import { createGearItem } from "../game/items";
import { seededRandom } from "../game/random";
import { TIME_WARP } from "../game/campaigns/timeWarp";
import { buildStoryWave, campaignBattles } from "../game/story";

// Story battle goals (owner's design, Nov 2026): the engine tracks the
// battle's second goal and reports it at the end.
const battles = campaignBattles(TIME_WARP);

// Battle `index` with its goal changed by `goal`, fought by three sword heroes in god mode.
function storyFight(index, goal = {}, { heroCount = 3, god = true } = {}) {
  const heroes = createGuild().heroes.slice(0, heroCount).map((hero) => {
    const copy = structuredClone(hero);
    copy.traits = [];
    copy.equipment = { weapon: createGearItem({ slot: "weapon", variant: "sword", rarity: "epic", tier: 6 }, seededRandom(1)) };
    copy.combat.hp = classlessMaxHp(copy);
    return copy;
  });
  const battle = { ...battles[index], goal: { ...battles[index].goal, ...goal } };
  const wave = buildStoryWave(battle);
  let result = null;
  const engine = new Engine({ getContext: () => null }, createEncounterSim(heroes, 1, wave, { rng: seededRandom(9) }), wave, { onEnd: (r) => { result = r; } });
  engine.godMode = god;
  return { engine, result: () => result };
}
const step = (engine, seconds) => { for (let i = 0; i < seconds * 30 && !engine.ended; i += 1) engine.update(1 / 30); };

describe("story goals", () => {
  test("assassinate: the marked foe flees when its time is up, and the goal fails", () => {
    const { engine, result } = storyFight(0, { escapeAfter: 0.5 });
    step(engine, 2);
    expect(engine.goal.state).toBe("failed");
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "assassinate", done: false, critical: false } });
  });

  test("assassinate: killing it in time completes the goal", () => {
    const { engine, result } = storyFight(0, { escapeAfter: 999 });
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "assassinate", done: true } });
  });

  test("destroy: the objects appear at once; left standing past the deadline, they vanish and the goal fails", () => {
    const { engine, result } = storyFight(2, { within: 1, hpMult: 1000 });
    step(engine, 0.2);
    const objects = engine.active.filter((enemy) => enemy.goalObject);
    expect(objects.map((o) => o.name)).toEqual(["Signal brazier", "Signal brazier"]);
    step(engine, 1.5);
    expect(engine.goal.state).toBe("failed");
    expect(engine.active.some((enemy) => enemy.goalObject)).toBe(false);
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "destroy", done: false } });
  });

  test("destroy: broken in time, the goal is done", () => {
    const { engine, result } = storyFight(2, { within: 999, hpMult: 0.01 });
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "destroy", done: true } });
  });

  test("hold: raiders who get away cost the wagon a life each; out of lives, the goal fails", () => {
    const { engine, result } = storyFight(6, { raidAfter: 0.1, lives: 2 });
    step(engine, 8);
    expect(engine.goal).toMatchObject({ state: "failed", livesLeft: 0 });
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "hold", done: false } });
  });

  test("hold: the wagon standing at the end is a goal done", () => {
    const { engine, result } = storyFight(6, { raidAfter: 999 });
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "hold", done: true } });
  });

  test("the battle screen sees the goal and its clock", () => {
    const { engine } = storyFight(2, { within: 40, hpMult: 1000 });
    let hud = null;
    engine.cb.onHud = (h) => { hud = h; };
    step(engine, 1);
    engine._hud();
    expect(hud.goal).toMatchObject({ kind: "destroy", state: "active", left: 2, total: 2 });
    expect(hud.goal.secondsLeft).toBeGreaterThan(30);
  });

  test("no fallen: a hero going down fails it; nobody down by the end is a goal done", () => {
    const fallen = storyFight(8);
    fallen.engine.heroes[0].alive = false;
    step(fallen.engine, 0.1);
    expect(fallen.engine.goal.state).toBe("failed");
    const { engine, result } = storyFight(8);
    step(engine, 240);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "noFallen", done: true } });
  });

  test("small band: more heroes than allowed misses it at once; few enough and won is done", () => {
    const crowded = storyFight(10, { max: 2 }, { heroCount: 3 });
    step(crowded.engine, 0.1);
    expect(crowded.engine.goal.state).toBe("failed");
    const { engine, result } = storyFight(10, { max: 2 }, { heroCount: 2 });
    step(engine, 300);
    expect(result()).toMatchObject({ victory: true, goal: { kind: "smallBand", done: true } });
  });

  test("escape: everyone standing in the exit ends the battle, won, with foes left", () => {
    const { engine, result } = storyFight(9, { within: 999, opensAfter: 1 });
    step(engine, 0.3);
    for (const hero of engine.heroes) hero.y = EXIT_Y - 10;
    step(engine, 0.2);
    expect(engine.goal.state).toBe("active"); // not open yet
    step(engine, 0.6);
    for (const hero of engine.heroes) hero.y = EXIT_Y - 10;
    step(engine, 0.2);
    expect(result()).toMatchObject({ victory: true, reason: "escaped", goal: { kind: "escape", done: true } });
  });

  test("escape: out of time, the goal fails and the fight goes on", () => {
    const { engine } = storyFight(9, { within: 0.5, opensAfter: 0 });
    step(engine, 1);
    expect(engine.goal.state).toBe("failed");
    expect(engine.ended).toBe(false);
  });

  test("rescue: a hero beside the captive long enough frees them; too late fails", () => {
    const { engine } = storyFight(11, { within: 999, freeAfter: 1 });
    step(engine, 0.2);
    Object.assign(engine.heroes[0], { x: engine.goal.captive.x, y: engine.goal.captive.y });
    engine.heroes[0].manual = true;
    for (let i = 0; i < 40; i += 1) { Object.assign(engine.heroes[0], { x: engine.goal.captive.x, y: engine.goal.captive.y }); engine.update(1 / 30); }
    expect(engine.goal.state).toBe("done");
    const late = storyFight(11, { within: 0.5 });
    step(late.engine, 1);
    expect(late.engine.goal.state).toBe("failed");
  });
});
