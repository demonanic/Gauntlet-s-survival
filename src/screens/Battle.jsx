import { useEffect, useRef, useState } from "react";
import { Engine, LAYOUT } from "../combat/engine";
import { Bar, NeonButton } from "../components/ui";
import { branchColor, moveIcon, spellIcon } from "../combat/abilityLook";
import { lockedMoves, nextSpells } from "../combat/moveGuide";
import { heroWeaponProfile } from "../combat/gear";
import { createEncounterSim, endlessWaveSource } from "../game/encounters";
import { LOG_FILTERS, formatTime } from "../combat/battleLog";
import { buildFightOutcome } from "../game/fightOutcome";
import { getRegion } from "../game/regions";

const COUNTDOWN_SECONDS = 3;
const HUD_THROTTLE_MS = 90;
const EVENT_CARD_MS = 5000;

// One live encounter: the trimmed Demonanic engine on a canvas, plus a light
// tactical HUD (abilities, move orders, speed). Hands the result back up.
// `cheats`: test mode's buttons (fill mana, ready cooldowns, god mode, kill all).
// `bench`: Free Roam only, heroes at the guild who can be swapped in (Camp).
export default function Battle({ expedition, party, createWave, onComplete, speeds = [1, 2], cheats = false, bench = null }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const hudThrottle = useRef(0);
  const hudLatest = useRef(null);
  const hudTimer = useRef(null);
  const [hud, setHud] = useState(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  // `selected`: the hero who takes move orders on a field tap (as before).
  // `shown`: the hero whose moves and spells the action panel shows.
  const [selected, setSelected] = useState(null);
  const [shown, setShown] = useState(0);
  // The battle log takes the action panel's place while open.
  const [logOpen, setLogOpen] = useState(false);
  const [logFilter, setLogFilter] = useState("all");
  const [speed, setSpeed] = useState(1);
  // The canonical fight result (game/fightOutcome.js), once the fight ends.
  const [result, setResult] = useState(null);
  const [engineError, setEngineError] = useState(null);
  // A Clutch moment (Fortune perk): which hero, the odds, and when it started.
  const [clutch, setClutch] = useState(null);
  const [clutchLeft, setClutchLeft] = useState(0);
  const [god, setGod] = useState(false);
  // Free Roam: each wave's event card, shown over the field for a few seconds.
  const [eventCard, setEventCard] = useState(null);
  // Free Roam's Camp: who goes back (slot index) and who comes (hero id).
  const [campOpen, setCampOpen] = useState(false);
  const [campOut, setCampOut] = useState(null);
  const [campIn, setCampIn] = useState(null);
  const [campNote, setCampNote] = useState(null);
  // Test mode: frames drawn per second, to check performance on a real phone.
  const [fps, setFps] = useState(null);
  useEffect(() => {
    if (!cheats) return undefined;
    let frames = 0, since = performance.now(), raf = 0;
    const step = (t) => {
      frames += 1;
      if (t - since >= 1000) { setFps(Math.round((frames * 1000) / (t - since))); frames = 0; since = t; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cheats]);
  const region = getRegion(expedition.regionId);
  // Story battles are one fight each, even though their region is endless-kind.
  const endless = !!region.endless && region.endlessKind !== "story";

  useEffect(() => {
    const wave = createWave();
    const sim = createEncounterSim(party, region.tier, wave);
    const engine = new Engine(canvasRef.current, sim, wave, {
      ...(endless ? { nextWave: endlessWaveSource(sim, sim.rng, region.endlessKind) } : {}),
      // Throttled, but the latest HUD always lands: one skipped is shown when
      // the throttle opens again, and the fight's last one when it ends (at
      // 8× the final "enemies left" was often skipped and went stale).
      onHud: (next) => {
        const t = performance.now();
        hudLatest.current = next;
        if (t - hudThrottle.current > HUD_THROTTLE_MS) {
          hudThrottle.current = t; setHud(next);
        } else if (!hudTimer.current) {
          hudTimer.current = setTimeout(() => {
            hudTimer.current = null; hudThrottle.current = performance.now(); setHud(hudLatest.current);
          }, HUD_THROTTLE_MS);
        }
      },
      onEnd: (outcome) => {
        // The fight can end after this frame's HUD went out: send a fresh one.
        clearTimeout(hudTimer.current); hudTimer.current = null;
        hudThrottle.current = 0;
        engine._hud();
        setResult(buildFightOutcome(outcome, sim));
      },
      onClutch: (info) => setClutch(info ? { ...info, startedAt: performance.now() } : null),
      onError: (error) => {
        setEngineError(String(error?.message || error));
        setResult(buildFightOutcome({ victory: false, reason: "error" }, sim));
      },
    });
    // Test mode can start an endless run part-way (debugTestEndless).
    if (endless && expedition.pending?.startWave > 1) engine.wavesCleared = expedition.pending.startWave - 1;
    if (wave.event) setEventCard({ wave: engine.wavesCleared + 1, text: wave.event });
    engineRef.current = engine;
    engine.render();

    let remaining = COUNTDOWN_SECONDS;
    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) { clearInterval(interval); engine.start(); }
    }, 1000);
    return () => { clearInterval(interval); clearTimeout(hudTimer.current); engine.stop(); };
    // The engine owns the fight for this mount; party/expedition are fixed per encounter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count the Clutch timer down on screen; the engine decides on timeout.
  useEffect(() => {
    if (!clutch) return undefined;
    const tick = () => setClutchLeft(Math.max(0, clutch.remaining - (performance.now() - clutch.startedAt) / 1000));
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [clutch]);

  // A new wave with an event card brings its card up.
  useEffect(() => {
    if (hud?.event && hud.wave !== eventCard?.wave) setEventCard({ wave: hud.wave, text: hud.event });
  }, [hud?.wave, hud?.event, eventCard?.wave]);
  useEffect(() => {
    if (!eventCard || countdown > 0) return undefined;
    const timer = setTimeout(() => setEventCard((card) => (card === eventCard ? { ...card, text: null } : card)), EVENT_CARD_MS);
    return () => clearTimeout(timer);
  }, [eventCard, countdown]);

  const engine = engineRef.current;
  // The heroes in the fight, in engine order: swaps add to the end, and a hero
  // gone to camp keeps their slot but leaves the tabs.
  const roster = engine?.sim?.heroes || party;
  const onField = roster.map((hero, index) => index).filter((index) => !hud?.heroes?.[index]?.away);
  useEffect(() => {
    if (hud?.heroes?.[shown]?.away && onField.length) setShown(onField[0]);
  }, [hud, shown, onField]);
  const swaps = hud?.swaps || [];
  const called = new Set([...roster.map((hero) => hero.identity.id), ...swaps.map((swap) => swap.inId)]);
  const benchLeft = (bench || []).filter((hero) => !called.has(hero.identity.id));
  const leavingSlots = new Set(swaps.map((swap) => swap.out));
  const sendable = onField.filter((index) => !leavingSlots.has(index));
  const confirmSwap = () => {
    const model = benchLeft.find((hero) => hero.identity.id === campIn);
    const done = engine?.requestSwap(campOut, model);
    if (!done?.ok) { setCampNote(done?.reason === "last_hero" ? "Someone has to stay and fight." : "That swap isn't possible now."); return; }
    setCampNote(null); setCampOut(null); setCampIn(null); setCampOpen(false);
  };
  const toggleSpeed = () => {
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    engine?.setSpeed(next);
  };

  // With move orders armed, a tap on a foe is an attack order and a tap on the
  // ground a move. Otherwise a tap on a foe marks it as the shown hero's spell
  // target (tap it again to clear).
  const onCanvasTap = (event) => {
    if (!engine || result) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const foe = engine.enemyAt(x, y);
    if (selected != null) {
      if (foe) engine.commandHeroAttack(selected, foe);
      else engine.commandHeroMoveTo(selected, x, y);
      return;
    }
    if (foe && shown != null) engine.markHeroTarget(shown, foe);
  };

  const finish = () => onComplete(result);
  // First tap shows a hero's actions; tapping the shown hero again arms (or
  // disarms) field taps as move orders for them.
  const pickHero = (index) => {
    if (logOpen) { setLogOpen(false); setShown(index); return; }
    if (shown !== index) { setShown(index); return; }
    setSelected(selected === index ? null : index);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--bg)]" data-testid="battle">
      <header className="flex items-center justify-between px-3 py-2">
        <div className="font-mono-g text-[11px]">
          <span className="font-bold" style={{ color: region.color }}>{region.name}</span>
          <span className="ml-2 text-slate-400">
            {endless ? `Wave ${hud?.wave ?? 1}` : expedition.pending?.kind === "boss" ? `Boss: ${expedition.pending.label}` : expedition.pending?.label}
            {hud?.waveCount > 1 && ` · Wave ${hud.wave}/${hud.waveCount}`}
            {hud && ` · ${hud.remaining} enemies left`}
          </span>
        </div>
        <div className="flex gap-2">
          {endless && (
            <NeonButton color="#39FF14" disabled={!!result || countdown > 0} onClick={() => engine?.returnHome()} data-testid="return-home">
              Return home
            </NeonButton>
          )}
          <NeonButton color="#00F3FF" onClick={toggleSpeed}>{speed}×</NeonButton>
        </div>
      </header>

      {bench && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 font-mono-g text-[10px]" data-testid="battle-camp">
          <button type="button" disabled={!engine || !!result} onClick={() => setCampOpen((open) => !open)} aria-pressed={campOpen}
            className="rounded border border-pink-400/60 px-2 py-1 text-pink-200 disabled:opacity-40" data-testid="camp-open">Camp</button>
          {swaps.length === 0 && <span className="text-slate-500">Swap a hero between waves.</span>}
          {swaps.map((swap) => (
            <span key={swap.out} className="text-pink-200" data-testid="camp-status">
              {swap.stage === "queued"
                ? `${swap.outName} to camp after this wave · ${swap.inName} the wave after.`
                : `${swap.inName} is on the road: joins next wave.`}
            </span>
          ))}
        </div>
      )}

      {cheats && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1 font-mono-g text-[10px]" data-testid="battle-cheats">
          <span className="font-bold text-orange-300">TEST</span>
          {[["mana", "Mana"], ["cooldowns", "Cooldowns"], ["kill", "Kill all"]].map(([kind, label]) => (
            <button key={kind} type="button" disabled={!engine || !!result} onClick={() => engine?.debugCheat(kind)}
              className="rounded border border-orange-400/60 px-2 py-1 text-orange-200 disabled:opacity-40" data-testid={`cheat-${kind}`}>{label}</button>
          ))}
          <button type="button" disabled={!engine || !!result} onClick={() => setGod(!!engine?.debugCheat("god"))} aria-pressed={god}
            className={`rounded border px-2 py-1 disabled:opacity-40 ${god ? "border-lime-300 bg-lime-300/15 text-lime-200" : "border-orange-400/60 text-orange-200"}`}
            data-testid="cheat-god">God {god ? "on" : "off"}</button>
          {fps != null && <span className={fps >= 50 ? "text-lime-300" : fps >= 30 ? "text-yellow-300" : "text-red-300"} data-testid="cheat-fps">{fps} fps</span>}
        </div>
      )}

      {/* The field always keeps at least half the screen; the dock below scrolls instead of squeezing it. */}
      <div className="relative flex min-h-[50dvh] flex-1 items-center justify-center px-2" data-testid="battle-field">
        <canvas
          ref={canvasRef}
          width={LAYOUT.W}
          height={LAYOUT.H}
          onPointerDown={onCanvasTap}
          className="h-full max-h-full max-w-full rounded border border-white/10"
          style={{ aspectRatio: `${LAYOUT.W} / ${LAYOUT.H}`, touchAction: "none" }}
          data-testid="battle-canvas"
        />
        {countdown > 0 && !result && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="font-display text-6xl font-black text-glow-cyan">{countdown}</span>
          </div>
        )}
        {eventCard?.text && !result && (
          <div className="pointer-events-none absolute inset-x-3 top-3 rounded-lg border border-pink-300/60 bg-black/80 px-3 py-2 text-center" data-testid="event-card">
            <p className="font-display text-[11px] font-bold text-pink-300">WAVE {eventCard.wave}</p>
            <p className="font-mono-g text-[11px] text-slate-100">{eventCard.text}</p>
          </div>
        )}
        {campOpen && !result && (
          <div className="absolute inset-x-2 bottom-4 rounded-lg border border-pink-300/60 bg-black/90 p-3 font-mono-g text-[11px]" data-testid="camp-panel">
            <h2 className="font-display text-base font-black text-pink-300">CAMP</h2>
            <p className="text-slate-400">The hero you send back leaves when this wave ends; the one you call arrives the wave after.</p>
            <p className="mt-2 text-slate-300">Send to camp</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {sendable.map((index) => (
                <button key={index} type="button" onClick={() => setCampOut(index)} aria-pressed={campOut === index}
                  className={`rounded border px-2 py-1 ${campOut === index ? "border-pink-300 bg-pink-300/15 text-pink-100" : "border-white/20 text-slate-200"}`}
                  data-testid={`camp-out-${index}`}>{roster[index].identity.name}</button>
              ))}
            </div>
            <p className="mt-2 text-slate-300">Call from the guild</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {benchLeft.length === 0 && <span className="text-slate-500">Nobody else is ready at the guild.</span>}
              {benchLeft.map((hero) => (
                <button key={hero.identity.id} type="button" onClick={() => setCampIn(hero.identity.id)} aria-pressed={campIn === hero.identity.id}
                  className={`rounded border px-2 py-1 ${campIn === hero.identity.id ? "border-pink-300 bg-pink-300/15 text-pink-100" : "border-white/20 text-slate-200"}`}
                  data-testid={`camp-in-${hero.identity.id}`}>{hero.identity.name} · LV {hero.progression.level}</button>
              ))}
            </div>
            {campNote && <p className="mt-1 text-red-300" data-testid="camp-note">{campNote}</p>}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NeonButton color="#F472B6" disabled={campOut == null || !campIn} onClick={confirmSwap} data-testid="camp-swap">Swap</NeonButton>
              <NeonButton color="#94A3B8" onClick={() => { setCampOpen(false); setCampNote(null); }} data-testid="camp-close">Close</NeonButton>
            </div>
          </div>
        )}
        {clutch && !result && (
          <div className="absolute inset-x-2 bottom-4 rounded-lg border border-yellow-300/60 bg-black/85 p-3 text-center" data-testid="clutch-prompt">
            <h2 className="font-display text-xl font-black text-yellow-300">CLUTCH · {clutchLeft.toFixed(1)}s</h2>
            <p className="font-mono-g text-[11px] text-slate-200">{clutch.name} is one hit from falling.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NeonButton color="#39FF14" onClick={() => engine?.resolveClutch("drink")} data-testid="clutch-drink">
                Drink · {clutch.drink}
              </NeonButton>
              <NeonButton color="#FFE600" onClick={() => engine?.resolveClutch("crit")} data-testid="clutch-crit">
                Ultra Crit · {Math.round(clutch.critChance * 100)}%
              </NeonButton>
            </div>
            <p className="mt-1 font-mono-g text-[10px] text-slate-400">
              Too slow and {clutch.name} {clutch.auto === "crit" ? "goes for the crit" : "drinks"}.
            </p>
          </div>
        )}
        {result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-xs rounded-lg border border-white/15 bg-[#080b12] p-4 text-center">
              <h2 className={`font-display text-2xl font-black ${result.victory ? "text-emerald-300" : "text-red-400"}`}>
                {result.reason === "returned" ? "RETURNING" : result.victory ? "VICTORY" : "ROUTED"}
              </h2>
              {endless && (
                <p className="mt-1 font-mono-g text-[11px] text-cyan-200">{result.wavesCleared} waves cleared</p>
              )}
              <p className="mt-2 font-mono-g text-[11px] text-slate-300">
                {result.killed} slain · +{result.gold}g · {result.items.length} items
              </p>
              {!result.victory && (
                <p className="mt-1 font-mono-g text-[11px] text-red-300">The party retreats home injured and drops half the loot.</p>
              )}
              {engineError && <p className="mt-1 font-mono-g text-[10px] text-red-300">Engine error: {engineError}</p>}
              <NeonButton className="mt-3 w-full" color={result.victory ? "#39FF14" : "#FF2A5F"} onClick={finish} data-testid="battle-continue">
                Continue
              </NeonButton>
            </div>
          </div>
        )}
      </div>

      <LogTicker lines={(engine?.battleLog?.lines || []).slice(0, 2)} />

      <footer className="flex min-h-0 shrink flex-col gap-2 overflow-y-auto px-2 pb-2" data-testid="battle-dock">
        <nav aria-label="Party" className="sticky top-0 z-10 grid gap-1.5 bg-[var(--bg)] pb-0.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, onField.length)}, minmax(0, 1fr)) 3.25rem` }}>
          {onField.map((index) => {
            const hero = roster[index];
            const status = hud?.heroes?.[index];
            const ready = (hud?.heroAbilities?.[index] || []).filter((ability) => ability.available).length;
            const isShown = shown === index && !logOpen;
            return (
              <button
                key={hero.identity.id}
                type="button"
                aria-pressed={isShown}
                onClick={() => pickHero(index)}
                className="flex min-h-14 flex-col gap-1 rounded-md border p-1.5 text-left"
                style={{ borderColor: isShown ? hero.appearance?.identityColor || "#00F3FF" : "rgba(255,255,255,0.12)", background: isShown ? "rgba(255,255,255,0.06)" : "transparent" }}
                data-testid={`battle-hero-tab-${index}`}
              >
                <span className="flex w-full items-center justify-between gap-1">
                  <span className="truncate font-mono-g text-[11px] font-bold" style={{ color: hero.appearance?.identityColor }}>{hero.identity.name}</span>
                  <span
                    className="rounded-full px-1.5 font-mono-g text-[10px] font-bold leading-4 text-[#0a0b10]"
                    style={{ background: ready ? "#FFE600" : "rgba(255,255,255,0.25)" }}
                    aria-label={`${ready} moves ready`}
                  >
                    {ready}
                  </span>
                </span>
                <Bar value={status?.hp ?? hero.combat.hp} max={status?.maxHp ?? hero.combat.maxHp} color={status?.alive === false ? "#FF2A5F" : "#39FF14"} />
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={logOpen}
            onClick={() => setLogOpen((open) => !open)}
            className="flex min-h-14 items-center justify-center rounded-md border font-mono-g text-[11px] font-bold"
            style={{ borderColor: logOpen ? "#C084FC" : "rgba(255,255,255,0.12)", color: logOpen ? "#E9D5FF" : "#94A3B8", background: logOpen ? "rgba(255,255,255,0.06)" : "transparent" }}
            data-testid="battle-log-tab"
          >
            LOG
          </button>
        </nav>
        {logOpen && <LogPanel log={engine?.battleLog} filter={logFilter} setFilter={setLogFilter} />}
        {!logOpen && roster[shown] && (
          <ActionPanel
            hero={roster[shown]}
            index={shown}
            abilities={hud?.heroAbilities?.[shown] || []}
            spells={hud?.heroSpells?.[shown] || []}
            quickSlots={(hud?.heroQuickSlots?.[shown] || []).filter((slot) => !slot.empty)}
            moving={selected === shown}
            locked={!!result}
            engine={engine}
          />
        )}
        <p className="text-center font-mono-g text-[9px] text-slate-500">
          Tap a hero to see their moves; tap a foe to aim their spells. Tap the hero again, then the field, to move them (or tap a foe to attack it). Auto returns them to normal targeting.
        </p>
      </footer>
    </div>
  );
}

// The last two log lines, always under the field.
function LogTicker({ lines }) {
  return (
    <div className="mx-2 mt-1 min-h-[30px] shrink-0 font-mono-g text-[10px] leading-[15px]" aria-live="polite" data-testid="battle-log-ticker">
      {lines.map((line) => (
        <div key={line.id} className="truncate" style={{ color: line.color }}>
          <span className="mr-1 text-slate-500">{formatTime(line.t)}</span>{line.text}
        </div>
      ))}
    </div>
  );
}

const FILTER_LABELS = { all: "All", spells: "Spells", moves: "Moves", deaths: "Deaths", summary: "Summary" };

// The full battle log: filter chips, newest line first, and Copy.
function LogPanel({ log, filter, setFilter }) {
  const [copied, setCopied] = useState(false);
  const lines = log ? log.filtered(filter) : [];
  const copy = async () => {
    try { await navigator.clipboard.writeText(log?.text() || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  };
  return (
    <section aria-label="Battle log" className="flex flex-col gap-2 rounded-lg border border-white/10 bg-[var(--panel)] p-2.5" data-testid="battle-log">
      <div className="flex flex-wrap items-center gap-1.5">
        {Object.keys(LOG_FILTERS).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className="min-h-8 rounded-full border px-2.5 font-mono-g text-[10px]"
            style={{ borderColor: filter === key ? "#C084FC" : "rgba(255,255,255,0.15)", color: filter === key ? "#E9D5FF" : "#94A3B8" }}
            data-testid={`battle-log-filter-${key}`}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
        <button type="button" onClick={copy} className="ml-auto min-h-8 rounded border border-white/15 px-2.5 font-mono-g text-[10px] text-slate-300" data-testid="battle-log-copy">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <ol className="max-h-[38vh] overflow-y-auto font-mono-g text-[10px] leading-4" data-testid="battle-log-lines">
        {lines.length === 0 && <li className="text-slate-500">Nothing yet.</li>}
        {lines.map((line) => (
          <li key={line.id} style={{ color: line.color }}>
            <span className="mr-1 text-slate-500">{formatTime(line.t)}</span>{line.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Icon({ path, size = 28, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="relative">
      <path d={path} />
    </svg>
  );
}

const UNAVAILABLE = {
  unavailable: "Down", no_target: "No target", health_cost: "Low HP", target_health: "Needs a weak foe", no_mana: "Needs spells",
};

// What this hero could unlock next: perk moves (folded away by default) and
// the next spell in each element, so it's clear where more buttons come from.
function UnlockGuide({ hero, index }) {
  const [open, setOpen] = useState(false);
  const moves = lockedMoves(hero);
  const spells = nextSpells(hero);
  return (
    <div className="space-y-1 font-mono-g text-[10px]" data-testid={`battle-unlocks-${index}`}>
      {spells ? spells.filter((line) => !line.done).map((line) => (
        <p key={line.element} className="text-slate-400" data-testid={`battle-next-spell-${index}-${line.element}`}>
          Next <span style={{ color: line.color }}>{line.name}</span> spell: <span className="text-slate-200">{line.spell}</span>
          {line.perk
            ? line.perk === line.spell ? ` · its own perk (Arcana, LV ${line.minLevel})` : ` · perk ${line.perk} (LV ${line.minLevel})`
            : ` · ${line.casts}/${line.needed} ${line.name} casts`}
        </p>
      )) : (
        <p className="text-slate-400" data-testid={`battle-no-spells-${index}`}>Spells: buy the <span className="text-fuchsia-300">Arcane Spark</span> perk (Arcana) to start casting.</p>
      )}
      {moves.length > 0 && (
        <button type="button" onClick={() => setOpen((value) => !value)} className="text-slate-400 underline" data-testid={`battle-locked-toggle-${index}`}>
          🔒 {moves.length} more moves in the perk tree · {open ? "hide" : "show"}
        </button>
      )}
      {open && (
        <ul className="space-y-0.5" data-testid={`battle-locked-${index}`}>
          {moves.map((move) => (
            <li key={move.id} className="text-slate-500">
              <span className="font-bold" style={{ color: branchColor(move.branch) }}>{move.name}</span>
              {` · ${move.branch} · LV ${move.minLevel}, ${move.apCost} AP`}
              {move.needs.length ? ` · after ${move.needs.join(move.anyPrerequisite ? " or " : " and ")}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const HOLD_MS = 450;

// One spell tile. Tap casts if the hero is free, else queues it (tap a queued
// tile to cancel). Holding casts now, skipping the queue, at the strain cost.
function SpellTile({ spell, index, locked, engine }) {
  const hold = useRef({ timer: null, fired: false });
  const short = spell.mana < spell.cost;
  const cooling = spell.cooldown > 0;
  const coolPct = cooling ? Math.min(100, Math.round((spell.cooldown / Math.max(0.01, spell.cooldownTotal || spell.cooldownSeconds)) * 100)) : 0;
  const queuedAt = spell.queue ? spell.queue.indexOf(spell.id) : -1;
  const clear = () => { clearTimeout(hold.current.timer); hold.current.timer = null; };
  const start = () => {
    hold.current.fired = false;
    clear();
    if (!spell.available || locked) return;
    hold.current.timer = setTimeout(() => {
      hold.current.fired = true;
      engine?.castHeroSpell(index, spell.id, null, { announce: true });
    }, HOLD_MS);
  };
  const tap = () => {
    clear();
    if (hold.current.fired) { hold.current.fired = false; return; }
    engine?.queueHeroSpell(index, spell.id);
  };
  const line = queuedAt >= 0 ? `Queued #${queuedAt + 1} · tap to cancel`
    : short ? `Needs ${spell.cost} mana` : cooling ? `Ready in ${Math.ceil(spell.cooldown)}s` : spell.out ? "Already out" : spell.noTarget ? "No one needs it"
      : `${spell.free ? "Free" : `${spell.cost} mana`} · ${Math.round(spell.success * 100)}%${spell.strain > 0 ? ` (now ${Math.round(spell.nowSuccess * 100)}%)` : ""}`;
  return (
    <button
      type="button"
      disabled={(!spell.available && queuedAt < 0) || locked}
      onPointerDown={start}
      onPointerUp={() => { if (!hold.current.fired) clear(); }}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(event) => event.preventDefault()}
      onClick={tap}
      className="relative flex min-h-[52px] select-none items-center gap-2 overflow-hidden rounded-lg border-2 bg-[#0d1017] px-2 py-1.5 text-left"
      style={{ borderColor: spell.color, opacity: (short || spell.noTarget) && queuedAt < 0 ? 0.45 : 1, borderStyle: queuedAt >= 0 ? "dashed" : "solid", WebkitTouchCallout: "none" }}
      title={`${spell.name} · ${spell.cost} mana · ${Math.round(spell.success * 100)}% to land`}
      data-testid={`battle-spell-${index}-${spell.id}`}
    >
      {cooling && <span className="absolute inset-y-0 left-0" style={{ width: `${coolPct}%`, background: "rgba(5,8,10,0.75)" }} />}
      <Icon path={spellIcon(spell)} size={22} color={spell.color} />
      <span className="relative flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-mono-g text-[11px] font-bold" style={{ color: spell.color }}>{spell.name}</span>
        <span className="font-mono-g text-[9px] text-slate-400">{line}</span>
      </span>
    </button>
  );
}

// The selected hero's actions: special moves as big round buttons in their
// perk branch's colour, spells as tiles in their element's colour, then the
// quick-slot items. Moves are manual only; spells also cast on auto.
function ActionPanel({ hero, index, abilities, spells, quickSlots, moving, locked, engine }) {
  const mana = spells[0];
  const weapon = heroWeaponProfile(hero);
  return (
    <section aria-label={`${hero.identity.name}'s actions`} className="flex flex-col gap-2.5 rounded-lg border border-white/10 bg-[var(--panel)] p-2.5" data-testid="battle-actions">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-display text-sm font-extrabold" style={{ color: hero.appearance?.identityColor }}>{hero.identity.name}</span>
        <span className="flex items-center gap-2">
          <span className="truncate font-mono-g text-[10px] text-slate-400" data-testid={`battle-weapon-${index}`}>
            {weapon ? `${weapon.label} · ${weapon.style}` : "Unarmed"}
          </span>
          {moving && (
            <button
              type="button"
              onClick={() => engine?.setHeroManual(index, false)}
              className="min-h-8 rounded border border-cyan-400/40 px-2 font-mono-g text-[10px] text-cyan-200"
            >
              Auto
            </button>
          )}
        </span>
      </div>
      {moving && <p className="font-mono-g text-[10px] text-cyan-200">Tap the field to move {hero.identity.name}.</p>}

      {abilities.length > 0 && (
        <>
          <h3 className="font-mono-g text-[10px] font-bold tracking-[0.12em] text-slate-400">SPECIAL MOVES</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-2">
            {abilities.map((ability) => {
              const color = branchColor(ability.branch);
              const cooling = ability.cooldown > 0;
              const ready = ability.available && !locked;
              const blocked = !ability.available && !cooling;
              const sweep = cooling ? Math.min(360, Math.round((ability.cooldown / Math.max(0.01, ability.cooldownSeconds)) * 360)) : 0;
              return (
                <div key={ability.id} className="flex w-[76px] flex-col items-center gap-1">
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => engine?.useHeroAbility(index, ability.id)}
                    aria-label={`${ability.name}${cooling ? `, ready in ${Math.ceil(ability.cooldown)} seconds` : blocked ? `, ${UNAVAILABLE[ability.reason] || "unavailable"}` : ""}`}
                    title={ability.desc}
                    className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] bg-[#0d1017] p-0 ${ready ? "battle-move-ready" : ""}`}
                    style={{ borderColor: blocked ? "#4b5563" : color, color: blocked ? "#6b7280" : color, "--glow": color, opacity: cooling ? 0.85 : 1 }}
                    data-testid={`battle-move-${index}-${ability.id}`}
                  >
                    {cooling && <span className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(rgba(5,8,10,0.82) ${sweep}deg, transparent 0deg)` }} />}
                    <Icon path={moveIcon(ability.id)} />
                    {cooling && <span className="absolute font-display text-lg font-black text-white">{Math.ceil(ability.cooldown)}</span>}
                  </button>
                  <span className="text-center font-mono-g text-[10px] font-bold leading-3 text-slate-200">{ability.name}</span>
                  <span className="font-mono-g text-[9px]" style={{ color: blocked ? "#94a3b8" : color }}>
                    {blocked ? UNAVAILABLE[ability.reason] || "Unavailable" : ability.active ? "Active" : ability.branch}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {spells.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h3 className="font-mono-g text-[10px] font-bold tracking-[0.12em] text-slate-400">SPELLS</h3>
            <span className="font-mono-g text-[10px] text-violet-300">
              {mana.strain > 0 && <span className="text-amber-400" data-testid={`battle-strained-${index}`}>Strained −{Math.round(mana.strain * 100)}% · </span>}
              {mana.free ? "Next spell free · " : ""}{mana.mana} / {mana.maxMana} mana
            </span>
          </div>
          <Bar value={mana.mana} max={mana.maxMana} color="#A855F7" data-testid={`battle-mana-${index}`} />
          {mana.queue?.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid={`battle-queue-${index}`}>
              <span className="font-mono-g text-[9px] text-slate-400">QUEUED</span>
              {mana.queue.map((id, at) => {
                const spell = spells.find((entry) => entry.id === id);
                if (!spell) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => engine?.unqueueHeroSpell(index, id)}
                    aria-label={`Cancel queued ${spell.name}`}
                    className="flex min-h-8 items-center gap-1 rounded border px-1.5 font-mono-g text-[9px]"
                    style={{ borderColor: spell.color, color: spell.color }}
                    data-testid={`battle-queued-${index}-${id}`}
                  >
                    {at + 1}. <Icon path={spellIcon(spell)} size={14} color={spell.color} /> ✕
                  </button>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {spells.map((spell) => <SpellTile key={spell.id} spell={spell} index={index} locked={locked} engine={engine} />)}
          </div>
          <p className="font-mono-g text-[9px] text-slate-500" data-testid={`battle-spell-target-${index}`}>
            {engine?.heroSpellTarget(index) ? <>Target: <span className="text-slate-200">{engine.heroSpellTarget(index).name}</span> · tap it again to clear</> : "Target: nearest · tap a foe to aim spells"}
          </p>
          <p className="font-mono-g text-[9px] text-slate-500">Tap: cast, or queue if busy · Hold: cast now (strains)</p>
        </>
      )}

      <UnlockGuide hero={hero} index={index} />

      {quickSlots.length > 0 && (
        <div className="flex gap-2">
          {quickSlots.map((slot) => (
            <button
              key={slot.slot}
              type="button"
              disabled={!slot.available || locked}
              onClick={() => engine?.useQuickItem(index, slot.slot)}
              className="min-h-11 min-w-0 flex-1 truncate rounded-md border px-2 font-mono-g text-[11px] font-bold disabled:opacity-35"
              style={{ borderColor: `${slot.color}99`, color: slot.color }}
              title={`${slot.name}: ${slot.desc}`}
              data-testid={`battle-quick-${index}-${slot.slot}`}
            >
              {slot.name} ×{slot.qty}{slot.cooldown > 0 ? ` ${Math.ceil(slot.cooldown)}s` : ""}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
