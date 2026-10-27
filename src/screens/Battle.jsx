import { useEffect, useRef, useState } from "react";
import { Engine, LAYOUT } from "../combat/engine";
import { Bar, NeonButton } from "../components/ui";
import { heroWeaponProfile } from "../combat/gear";
import { createEncounterSim, endlessWaveSource } from "../game/encounters";
import { getRegion } from "../game/regions";

const COUNTDOWN_SECONDS = 3;
const HUD_THROTTLE_MS = 90;

// One live encounter: the trimmed Demonanic engine on a canvas, plus a light
// tactical HUD (abilities, move orders, speed). Hands the result back up.
export default function Battle({ expedition, party, createWave, onComplete, speeds = [1, 2] }) {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const simRef = useRef(null);
  const hudThrottle = useRef(0);
  const [hud, setHud] = useState(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [selected, setSelected] = useState(null);
  const [speed, setSpeed] = useState(1);
  const [result, setResult] = useState(null);
  const region = getRegion(expedition.regionId);
  const endless = !!region.endless;

  useEffect(() => {
    const wave = createWave();
    const sim = createEncounterSim(party, region.tier, wave);
    simRef.current = sim;
    const engine = new Engine(canvasRef.current, sim, wave, {
      ...(endless ? { nextWave: endlessWaveSource(sim) } : {}),
      onHud: (next) => {
        const t = performance.now();
        if (t - hudThrottle.current > HUD_THROTTLE_MS) { hudThrottle.current = t; setHud(next); }
      },
      onEnd: (outcome) => setResult({ ...outcome, gold: sim.gold, items: [...sim.vault] }),
      onError: (error) => setResult({ victory: false, reason: "error", error: String(error?.message || error), gold: 0, items: [] }),
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

  const finish = () => onComplete({
    victory: !!result.victory,
    party: simRef.current.heroes,
    xpGains: result.xpGains?.heroes || {},
    gold: result.gold,
    items: result.items,
    wavesCleared: result.wavesCleared || 0,
  });

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
        {result && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-xs rounded-lg border border-white/15 bg-[#080b12] p-4 text-center">
              <h2 className={`font-display text-2xl font-black ${result.victory ? "text-emerald-300" : "text-red-400"}`}>
                {result.reason === "returned" ? "RETURNING" : result.victory ? "VICTORY" : "ROUTED"}
              </h2>
              {endless && (
                <p className="mt-1 font-mono-g text-[11px] text-cyan-200">{result.wavesCleared || 0} waves cleared</p>
              )}
              <p className="mt-2 font-mono-g text-[11px] text-slate-300">
                {result.killed ?? 0} slain · +{result.gold}g · {result.items.length} items
              </p>
              {!result.victory && (
                <p className="mt-1 font-mono-g text-[11px] text-red-300">The party retreats home injured and drops half the loot.</p>
              )}
              {result.error && <p className="mt-1 font-mono-g text-[10px] text-red-300">Engine error: {result.error}</p>}
              <NeonButton className="mt-3 w-full" color={result.victory ? "#39FF14" : "#FF2A5F"} onClick={finish} data-testid="battle-continue">
                Continue
              </NeonButton>
            </div>
          </div>
        )}
      </div>

      <footer className="grid gap-2 p-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, party.length)}, minmax(0, 1fr))` }}>
        {party.map((hero, index) => {
          const status = hud?.heroes?.[index];
          const abilities = hud?.heroAbilities?.[index] || [];
          const quickSlots = (hud?.heroQuickSlots?.[index] || []).filter((slot) => !slot.empty);
          const isSelected = selected === index;
          return (
            <div
              key={hero.identity.id}
              className={`rounded border p-1.5 ${isSelected ? "border-cyan-300 bg-cyan-400/10" : "border-white/10"}`}
              onClick={() => setSelected(isSelected ? null : index)}
            >
              <div className="truncate font-mono-g text-[10px] font-bold" style={{ color: hero.appearance?.identityColor }}>
                {hero.identity.name}
              </div>
              <div className="truncate font-mono-g text-[9px] text-slate-400" data-testid={`battle-weapon-${index}`}>
                {heroWeaponProfile(hero) ? `${heroWeaponProfile(hero).label} · ${heroWeaponProfile(hero).style}` : "Unarmed"}
              </div>
              <Bar value={status?.hp ?? hero.combat.hp} max={status?.maxHp ?? hero.combat.maxHp} color={status?.alive === false ? "#FF2A5F" : "#39FF14"} />
              <div className="mt-1 flex flex-col gap-1">
                {abilities.map((ability) => (
                  <button
                    key={ability.id}
                    type="button"
                    disabled={!ability.available || !!result}
                    onClick={(event) => { event.stopPropagation(); engine?.useHeroAbility(index, ability.id); }}
                    className="truncate rounded border border-white/15 px-1 py-1 font-mono-g text-[9px] disabled:opacity-35"
                    title={ability.desc}
                  >
                    {ability.name}{ability.cooldown > 0 ? ` ${Math.ceil(ability.cooldown)}s` : ""}
                  </button>
                ))}
                {quickSlots.length > 0 && (
                  <div className="flex gap-1">
                    {quickSlots.map((slot) => (
                      <button
                        key={slot.slot}
                        type="button"
                        disabled={!slot.available || !!result}
                        onClick={(event) => { event.stopPropagation(); engine?.useQuickItem(index, slot.slot); }}
                        className="min-w-0 flex-1 truncate rounded border px-1 py-1 font-mono-g text-[9px] disabled:opacity-35"
                        style={{ borderColor: `${slot.color}66`, color: slot.color }}
                        title={`${slot.name}: ${slot.desc}`}
                        data-testid={`battle-quick-${index}-${slot.slot}`}
                      >
                        {slot.short} ×{slot.qty}{slot.cooldown > 0 ? ` ${Math.ceil(slot.cooldown)}s` : ""}
                      </button>
                    ))}
                  </div>
                )}
                {isSelected && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); engine?.setHeroManual(index, false); }}
                    className="rounded border border-cyan-400/30 px-1 py-1 font-mono-g text-[9px] text-cyan-200"
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </footer>
      <p className="pb-2 text-center font-mono-g text-[9px] text-slate-500">
        Tap a hero card, then tap the field to move them. Auto returns them to normal targeting. Heroes use quick-slot supplies on their own when needed.
      </p>
    </div>
  );
}
