import { useState } from "react";
import { GEAR_SETS } from "../combat/gear";
import { ELEMENTS, ROMAN, SCHOOLS, SPELLS, canCast, heroMagic, proficiency, rankFor, spellCasts } from "../combat/spells";
import { MAX_GEAR_TIER, RARITY_ORDER, RARITIES } from "../game/items";
import { REGIONS } from "../game/regions";
import {
  MAX_HERO_LEVEL, debugAddGold, debugAddRenown, debugCareer, debugGivePets, debugGiveCrate, debugClearRegions, debugEndExpedition, debugGiveGearSet, debugGiveSupplies,
  debugGiveCasting, debugLearnSchool, debugSetBossRank, debugSetLevels, debugSetSchoolRank, debugSetSpellRank, debugSkipTimers, debugStoryBattle, debugTestEndless, debugTestFight,
} from "../game/debug";
import { readRealSave } from "../game/storage";
import { NeonButton } from "./ui";

const selectClass = "rounded border border-white/15 bg-black/60 px-1 py-1 font-mono-g text-[11px] text-slate-100";

// Why a test fight couldn't start.
const FIGHT_REASONS = {
  level_required: "Heroes are below this region's level: raise them (All heroes to LV) first.",
  previous_region: "This region isn't open yet: tap Clear all regions first.",
  in_fight: "A fight is already under way.",
  on_trip: "The party is on a trip: recall it first.",
  hero_unavailable: "A hero can't go (knocked out or injured).",
};

// Test mode tools, shown only when the page is opened with ?debug.
// `apply(mutator)` is App's guarded state update; `onTestFight(state)` starts
// the watched fight a test fight set up.
export default function DebugPanel({ guild, apply, onTestFight }) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(10);
  const [rank, setRank] = useState(guild.bossRank || 0);
  const [rarity, setRarity] = useState("rare");
  const [tier, setTier] = useState(3);
  const [set, setSet] = useState("");
  const [heroId, setHeroId] = useState(guild.heroes[0]?.identity.id || "");
  const [school, setSchool] = useState("conjuration");
  const [schoolRank, setSchoolRank] = useState(5);
  const [spellId, setSpellId] = useState("");
  const [spellRank, setSpellRank] = useState(5);
  const [regionId, setRegionId] = useState(guild.expedition?.regionId || "ashen");
  const [depth, setDepth] = useState(0.8);
  const [fightNote, setFightNote] = useState(null);
  const [marchWave, setMarchWave] = useState(1);
  const [roamWave, setRoamWave] = useState(1);
  const [storyBattle, setStoryBattle] = useState(17);
  const startEndless = (regionId, wave) => {
    const result = debugTestEndless(guild, regionId, wave);
    if (!result.ok) { setFightNote(FIGHT_REASONS[result.reason] || `Can't start: ${result.reason}`); return; }
    setFightNote(null);
    setOpen(false);
    onTestFight?.(result.state);
  };
  const startFight = (boss, horde = false) => {
    const result = debugTestFight(guild, regionId, { boss, horde, depth });
    if (!result.ok) { setFightNote(FIGHT_REASONS[result.reason] || `Can't start: ${result.reason}`); return; }
    setFightNote(null);
    setOpen(false);
    onTestFight?.(result.state);
  };

  if (!open) {
    // A thin tab on the middle of the right edge, above the tutorial card
    // (z-97, at the bottom), covering as little of the screen as it can.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-[98] -translate-y-1/2 rounded-l-md border border-r-0 border-orange-400 bg-black/85 px-0.5 py-2 font-mono-g text-[10px] font-bold text-orange-300 shadow-lg"
        style={{ writingMode: "vertical-rl" }}
        data-testid="debug-open"
      >
        TEST
      </button>
    );
  }

  const row = "flex flex-wrap items-center gap-1.5";
  return (
    <div className="fixed inset-x-2 bottom-2 z-[98] mx-auto max-h-[70vh] max-w-md overflow-y-auto rounded-lg border border-orange-400/70 bg-[#0b0906]/95 p-3 font-mono-g text-[11px] text-slate-200 shadow-2xl" data-testid="debug-panel">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display text-sm font-bold text-orange-300">TEST MODE</span>
        <button type="button" className="text-slate-400 underline" onClick={() => setOpen(false)}>close</button>
      </div>
      <div className="space-y-2">
        <div className={row}>
          <span className="text-orange-200">Test save</span>
          <NeonButton color="#FB923C" onClick={() => {
            if (globalThis.confirm?.("Replace this test save with a copy of your real save from this browser?") !== false) apply(() => readRealSave());
          }} data-testid="debug-copy-real">Copy my real save</NeonButton>
        </div>
        <div className={row}>
          <NeonButton color="#FFE600" onClick={() => apply((state) => debugAddGold(state, 1000))} data-testid="debug-gold">+1k gold</NeonButton>
          <NeonButton color="#FFE600" onClick={() => apply((state) => debugAddGold(state, 10000))}>+10k gold</NeonButton>
          <NeonButton color="#E879F9" onClick={() => apply((state) => debugAddRenown(state, 10))}>+10 renown</NeonButton>
        </div>
        <div className={row}>
          <NeonButton color="#39FF14" onClick={() => apply((state) => debugSkipTimers(state, Date.now()))} data-testid="debug-skip">
            Next event + heal
          </NeonButton>
          <NeonButton color="#39FF14" onClick={() => apply((state) => debugEndExpedition(state, Date.now()))} data-testid="debug-end-trip">
            End trip timer
          </NeonButton>
          <NeonButton color="#00F3FF" onClick={() => apply((state) => debugGiveSupplies(state))}>+10 each supply</NeonButton>
        </div>
        <div className={row}>
          <span>All heroes to LV</span>
          <select className={selectClass} value={level} onChange={(event) => setLevel(Number(event.target.value))}>
            {[3, 6, 10, 15, MAX_HERO_LEVEL].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <NeonButton color="#A855F7" onClick={() => apply((state) => debugSetLevels(state, level))} data-testid="debug-level">Set</NeonButton>
          <NeonButton color="#FBBF24" onClick={() => apply((state) => debugCareer(state, Date.now()))} data-testid="debug-career">Career</NeonButton>
          <NeonButton color="#A7F3D0" onClick={() => apply((state) => debugGivePets(state))} data-testid="debug-pets">Pets</NeonButton>
          <NeonButton color="#FCD34D" onClick={() => apply((state) => debugGiveCrate(state))} data-testid="debug-crate">Crate</NeonButton>
        </div>
        <div className={row}>
          <span>Boss rank</span>
          <input
            type="number" min={1} value={rank + 1}
            onChange={(event) => setRank(Math.max(0, Number(event.target.value) - 1))}
            className={`${selectClass} w-16`}
          />
          <NeonButton color="#FF0055" onClick={() => apply((state) => debugSetBossRank(state, rank))}>Set</NeonButton>
          <NeonButton color="#FF3366" onClick={() => apply(debugClearRegions)}>Clear all regions</NeonButton>
        </div>
        <div className={row}>
          <span>Gear set</span>
          <select className={selectClass} value={rarity} onChange={(event) => setRarity(event.target.value)}>
            {RARITY_ORDER.map((key) => <option key={key} value={key}>{RARITIES[key].name}</option>)}
          </select>
          <span>tier</span>
          <select className={selectClass} value={tier} onChange={(event) => setTier(Number(event.target.value))}>
            {Array.from({ length: MAX_GEAR_TIER }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className={selectClass} value={set} onChange={(event) => setSet(event.target.value)} disabled={rarity === "legendary"} data-testid="debug-set">
            <option value="">no set</option>
            {Object.values(GEAR_SETS).map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}
          </select>
          <NeonButton color="#FF6600" onClick={() => apply((state) => debugGiveGearSet(state, rarity, tier, set || null))} data-testid="debug-gear">To vault</NeonButton>
        </div>
        <div className="space-y-1.5 rounded border border-red-400/30 p-2" data-testid="debug-fight">
          <div className={row}>
            <span className="text-red-200">Test fight</span>
            <select className={selectClass} value={regionId} onChange={(event) => setRegionId(event.target.value)} disabled={!!guild.expedition} data-testid="debug-fight-region">
              {REGIONS.filter((region) => !region.endless).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}
            </select>
            <select className={selectClass} value={depth} onChange={(event) => setDepth(Number(event.target.value))} data-testid="debug-fight-depth">
              <option value={0.2}>early</option><option value={0.5}>middle</option><option value={0.8}>deep</option>
            </select>
          </div>
          <div className={row}>
            <NeonButton color="#FF5A5A" onClick={() => startFight(false)} data-testid="debug-fight-wild">Wild fight now</NeonButton>
            <NeonButton color="#FF0055" onClick={() => startFight(true)} data-testid="debug-fight-boss">Boss fight now</NeonButton>
            <NeonButton color="#94C973" onClick={() => startFight(false, true)} data-testid="debug-fight-horde">Horde now</NeonButton>
          </div>
          <div className={row}>
            <span>Dead March from wave</span>
            <select className={selectClass} value={marchWave} onChange={(event) => setMarchWave(Number(event.target.value))} data-testid="debug-march-wave">
              {[1, 3, 5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <NeonButton color="#94C973" onClick={() => startEndless("march", marchWave)} data-testid="debug-march">Start</NeonButton>
          </div>
          <div className={row}>
            <span>Free Roam from wave</span>
            <select className={selectClass} value={roamWave} onChange={(event) => setRoamWave(Number(event.target.value))} data-testid="debug-roam-wave">
              {[1, 3, 5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <NeonButton color="#F472B6" onClick={() => startEndless("roam", roamWave)} data-testid="debug-roam">Start</NeonButton>
          </div>
          <div className={row}>
            <span>Story: go to battle</span>
            <select className={selectClass} value={storyBattle} onChange={(event) => setStoryBattle(Number(event.target.value))} data-testid="debug-story-battle">
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <NeonButton color="#FBBF24" disabled={!guild.story?.run} onClick={() => apply((state) => debugStoryBattle(state, storyBattle))} data-testid="debug-story-go">Go</NeonButton>
          </div>
          <p className="text-[10px] text-slate-500">
            {guild.expedition ? "On a trip: the fight is in its region. " : "The first four heroes set out, healed. "}
            In the fight, test buttons fill mana, ready cooldowns, turn god mode on and kill all foes.
          </p>
          {fightNote && <p className="text-[10px] text-red-300" data-testid="debug-fight-note">{fightNote}</p>}
        </div>
        <MagicTools guild={guild} apply={apply} row={row}
          heroId={heroId} setHeroId={setHeroId} school={school} setSchool={setSchool} schoolRank={schoolRank} setSchoolRank={setSchoolRank}
          spellId={spellId} setSpellId={setSpellId} spellRank={spellRank} setSpellRank={setSpellRank} />
        <p className="text-[10px] text-slate-500">
          Test mode plays on its own save in this browser, apart from your real one, and never syncs to the cloud. Open the
          game without ?debug to get your real save back. Battles get 4× and 8× speed here; Reset save starts the test save clean.
        </p>
      </div>
    </div>
  );
}

const rankOptions = [1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{ROMAN[value - 1]}</option>);

// Magic for any hero: casting, any school (no slot limit), a school's
// proficiency or one spell's rank, set at once.
function MagicTools({ guild, apply, row, heroId, setHeroId, school, setSchool, schoolRank, setSchoolRank, spellId, setSpellId, spellRank, setSpellRank }) {
  const hero = guild.heroes.find((entry) => entry.identity.id === heroId) || guild.heroes[0];
  if (!hero) return null;
  const id = hero.identity.id;
  const spells = Object.entries(SPELLS).filter(([, spell]) => spell.element === school);
  const pickedSpell = spells.some(([key]) => key === spellId) ? spellId : spells[0]?.[0];
  const elements = canCast(hero) ? ["arcane", ...heroMagic(hero).elements] : [];
  return (
    <div className="space-y-1.5 rounded border border-fuchsia-400/30 p-2" data-testid="debug-magic">
      <div className={row}>
        <span className="text-fuchsia-200">Magic</span>
        <select className={selectClass} value={id} onChange={(event) => setHeroId(event.target.value)} data-testid="debug-magic-hero">
          {guild.heroes.map((entry) => <option key={entry.identity.id} value={entry.identity.id}>{entry.identity.name}</option>)}
        </select>
        <NeonButton color="#E879F9" onClick={() => apply((state) => debugGiveCasting(state, id))} data-testid="debug-casting">Give casting</NeonButton>
      </div>
      <div className={row}>
        <select className={selectClass} value={school} onChange={(event) => setSchool(event.target.value)} data-testid="debug-school">
          {["arcane", ...SCHOOLS].map((key) => <option key={key} value={key}>{ELEMENTS[key].name}</option>)}
        </select>
        <NeonButton color="#E879F9" onClick={() => apply((state) => (school === "arcane" ? debugGiveCasting(state, id) : debugLearnSchool(state, id, school)))}
          data-testid="debug-learn">Learn</NeonButton>
        <span>proficiency</span>
        <select className={selectClass} value={schoolRank} onChange={(event) => setSchoolRank(Number(event.target.value))} data-testid="debug-school-rank">{rankOptions}</select>
        <NeonButton color="#E879F9" onClick={() => apply((state) => debugSetSchoolRank(state, id, school, schoolRank))} data-testid="debug-set-school">Set</NeonButton>
      </div>
      <div className={row}>
        <select className={selectClass} value={pickedSpell || ""} onChange={(event) => setSpellId(event.target.value)} data-testid="debug-spell">
          {spells.map(([key, spell]) => <option key={key} value={key}>{spell.name}</option>)}
        </select>
        <span>rank</span>
        <select className={selectClass} value={spellRank} onChange={(event) => setSpellRank(Number(event.target.value))} data-testid="debug-spell-rank">{rankOptions}</select>
        <NeonButton color="#E879F9" onClick={() => pickedSpell && apply((state) => debugSetSpellRank(state, id, pickedSpell, spellRank))} data-testid="debug-set-spell">Set</NeonButton>
      </div>
      <div className="text-[10px] text-slate-400" data-testid="debug-magic-now">
        {elements.length
          ? elements.map((element) => `${ELEMENTS[element].name} ${ROMAN[proficiency(hero, element) - 1]}`).join(" · ")
          : "Can't cast yet."}
        {pickedSpell && elements.includes(SPELLS[pickedSpell].element) && ` · ${SPELLS[pickedSpell].name} rank ${ROMAN[rankFor(spellCasts(hero, pickedSpell)) - 1]}`}
      </div>
      <p className="text-[10px] text-slate-500">A spell's casts count toward its school, so setting a spell's rank can raise the school too. Meteor and Arcane Channel still need their perks.</p>
    </div>
  );
}
