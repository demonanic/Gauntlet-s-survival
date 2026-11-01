import { useEffect, useRef, useState } from "react";
import { Engine, LAYOUT } from "../combat/engine";
import { Bar, NeonButton } from "../components/ui";
import { branchColor, moveIcon, spellIcon } from "../combat/abilityLook";
import { heroWeaponProfile } from "../combat/gear";
import { createEncounterSim, endlessWaveSource } from "../game/encounters";
import { buildFightOutcome } from "../game/fightOutcome";
import { getRegion } from "../game/regions";

const COUNTDOWN_SECONDS = 3;
const HUD_THROTTLE_MS = 90;

// One live encounter: the trimmed Demonanic engine on a canvas, plus a light
// tactical HUD (abilities, move orders, speed). Hands the result back up.
export default function Battle({ expedition, party, createWave, onComplete, speeds = [1, 2] }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const hudThrottle = useRef(0);
  const [hud, setHud] = useState(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  // `selected`: the hero who takes move orders on a field tap (as before).
  // `shown`: the hero whose moves and spells the action panel shows.
  const [selected, setSelected] = useState(null);
  const [shown, setShown] = useState(0);
  const [speed, setSpeed] = useState(1);
  // The canonical fight result (game/fightOutcome.js), once the fight ends.
  const [result, setResult] = useState(null);
  const [engineError, setEngineError] = useState(null);
  // A Clutch moment (Fortune perk): which hero, the odds, and when it started.
  const [clutch, setClutch] = useState(null);
  const [clutchLeft, setClutchLeft] = useState(0);
  const region = getRegion(expedition.regionId);
  const endless = !!region.endless;

  useEffect(() => {
    const wave = createWave();
    const sim = createEncounterSim(party, region.tier, wave);
    const engine = new Engine(canvasRef.current, sim, wave, {
      ...(endless ? { nextWave: endlessWaveSource(sim) } : {}),
      onHud: (next) => {
        const t = performance.now();
        if (t - hudThrottle.current > HUD_THROTTLE_MS) { hudThrottle.current = t; setHud(next); }
      },
      onEnd: (outcome) => setResult(buildFightOutcome(outcome, sim)),
      onClutch: (info) => setClutch(info ? { ...info, startedAt: performance.now() } : null),
      onError: (error) => {
        setEngineError(String(error?.message || error));
        setResult(buildFightOutcome({ victory: false, reason: "error" }, sim));
      },
    });
    engineRef.current = engine;
    engine.render();

    let remaining = COUNTDOWN_SECONDS;
    const interval = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) { clearInterval(interval); engine.start(); }
    }, 1000);
    return () => { clearInterval(interval); engine.stop(); };
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

  const engine = engineRef.current;
  const toggleSpeed = () => {
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
    setSpeed(next);
    engine?.setSpeed(next);
  };

  const onCanvasTap = (event) => {
    if (selected == null || !engine || result) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    engine.commandHeroMoveTo(selected, x, y);
  };

  const finish = () => onComplete(result);
  // First tap shows a hero's actions; tapping the shown hero again arms (or
  // disarms) field taps as move orders for them.
  const pickHero = (index) => {
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
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

      <footer className="flex flex-col gap-2 px-2 pb-2" data-testid="battle-dock">
        <nav aria-label="Party" className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.max(1, party.length)}, minmax(0, 1fr))` }}>
          {party.map((hero, index) => {
            const status = hud?.heroes?.[index];
            const ready = (hud?.heroAbilities?.[index] || []).filter((ability) => ability.available).length;
            const isShown = shown === index;
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
        </nav>
        {party[shown] && (
          <ActionPanel
            hero={party[shown]}
            index={shown}
            abilities={hud?.heroAbilities?.[shown] || []}
            spells={hud?.heroSpells?.[shown] || []}
            quickSlots={(hud?.heroQuickSlots?.[shown] || []).filter((slot) => !slot.empty)}
            moving={selected === shown}
            locked={!!result}
            engine={engine}
          />
        )}
      </footer>
      <p className="pb-2 text-center font-mono-g text-[9px] text-slate-500">
        Tap a hero to see their moves; tap them again, then the field, to move them. Auto returns them to normal targeting.
      </p>
    </div>
  );
}

function Icon({ path, size = 28, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="relative">
      <path d={path} />
    </svg>
  );
}

const UNAVAILABLE = { unavailable: "Down", no_target: "No target", health_cost: "Low HP", target_health: "Needs a weak foe" };

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
            <span className="font-mono-g text-[10px] text-violet-300">{mana.mana} / {mana.maxMana} mana</span>
          </div>
          <Bar value={mana.mana} max={mana.maxMana} color="#A855F7" data-testid={`battle-mana-${index}`} />
          <div className="grid grid-cols-2 gap-2">
            {spells.map((spell) => {
              const short = spell.mana < spell.cost;
              const cooling = spell.cooldown > 0;
              const coolPct = cooling ? Math.min(100, Math.round((spell.cooldown / Math.max(0.01, spell.cooldownTotal || spell.cooldownSeconds)) * 100)) : 0;
              return (
                <button
                  key={spell.id}
                  type="button"
                  disabled={!spell.available || locked}
                  onClick={() => engine?.castHeroSpell(index, spell.id, null, { announce: true })}
                  className="relative flex min-h-[52px] items-center gap-2 overflow-hidden rounded-lg border-2 bg-[#0d1017] px-2 py-1.5 text-left"
                  style={{ borderColor: spell.color, opacity: short || spell.noTarget ? 0.45 : 1 }}
                  title={`${spell.name} · ${spell.cost} mana · ${Math.round(spell.success * 100)}% to land`}
                  data-testid={`battle-spell-${index}-${spell.id}`}
                >
                  {cooling && <span className="absolute inset-y-0 left-0" style={{ width: `${coolPct}%`, background: "rgba(5,8,10,0.75)" }} />}
                  <Icon path={spellIcon(spell)} size={22} color={spell.color} />
                  <span className="relative flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-mono-g text-[11px] font-bold" style={{ color: spell.color }}>{spell.name}</span>
                    <span className="font-mono-g text-[9px] text-slate-400">
                      {short ? `Needs ${spell.cost} mana` : cooling ? `Ready in ${Math.ceil(spell.cooldown)}s` : spell.noTarget ? "No one needs it" : `${spell.cost} mana · ${Math.round(spell.success * 100)}%`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

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
