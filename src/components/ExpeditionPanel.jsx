import { classlessMaxHp } from "../combat/classlessCombatEffects";
import { FAMILY_LABELS } from "../combat/config";
import { ADVENTURE, STORIES, WEATHER, moraleLabel } from "../game/adventure";
import { RARITIES, formatGearStats } from "../game/items";
import { getEnvironment } from "../game/environment";
import { getRegion } from "../game/regions";
import { Bar, NeonButton, Panel, formatSeconds } from "./ui";

const TONE_CLASS = {
  flavor: "text-slate-300",
  story: "text-sky-200",
  loot: "text-yellow-300",
  good: "text-emerald-300",
  danger: "text-red-300",
};
const FEED_LINES = 8;

function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// The prompt for whatever the party is waiting on: a fight, a sneak, a story choice.
function PendingPrompt({ pending, now, gold, onAttack, onChoose }) {
  const decideIn = ADVENTURE.autoDecideMs - (now - pending.promptAt);
  // What the squad does, so the choice is about which enemies, not how many.
  const threats = [...new Set((pending.wave?.enemies || []).flatMap((enemy) => enemy.families || []))].map((family) => FAMILY_LABELS[family]).filter(Boolean);
  const button = (label, color, onClick, testId) => (
    <NeonButton key={testId} color={color} onClick={onClick} data-testid={testId}>{label}</NeonButton>
  );
  let title;
  let actions;
  if (pending.kind === "sighting") {
    title = `Enemies spotted: ${pending.label}`;
    actions = [
      button("Attack", "#FF2A5F", onAttack, "prompt-attack"),
      button(`Sneak by · ${Math.round(pending.sneakChance * 100)}%`, "#A855F7", () => onChoose("sneak"), "prompt-sneak"),
    ];
  } else if (pending.kind === "ambush") {
    title = `Ambush! ${pending.label}`;
    actions = [button("Fight!", "#FF2A5F", onAttack, "prompt-attack")];
  } else if (pending.kind === "boss") {
    title = `Boss: ${pending.label}`;
    actions = [
      button("Attack", "#FF0055", onAttack, "prompt-attack"),
      button("Head home", "#94A3B8", () => onChoose("leave"), "prompt-leave"),
    ];
  } else if (pending.kind === "rift") {
    title = "The Rift is open";
    actions = [
      button("Enter the Rift", "#00F3FF", onAttack, "prompt-attack"),
      button("Head home", "#94A3B8", () => onChoose("leave"), "prompt-leave"),
    ];
  } else if (pending.kind === "merchant") {
    title = pending.text;
    actions = [
      <NeonButton key="buy" color="#FFE600" disabled={gold < pending.price} onClick={() => onChoose("buy")} data-testid="prompt-buy">
        Buy · {pending.price}g
      </NeonButton>,
      button("Pass", "#94A3B8", () => onChoose("decline"), "prompt-decline"),
    ];
  } else {
    const story = STORIES[pending.story];
    title = pending.text || story.prompt;
    actions = story.options.map((option) => button(option.label, "#38BDF8", () => onChoose(option.id), `prompt-${option.id}`));
  }
  return (
    <div className="mt-2 rounded border border-yellow-300/50 bg-yellow-300/5 p-2" data-testid="expedition-prompt">
      <p className="font-mono-g text-[11px] font-bold text-yellow-200">{title}</p>
      {threats.length > 0 && (
        <p className="font-mono-g text-[10px] text-slate-400" data-testid="prompt-threats">Threats: {threats.join(", ")}</p>
      )}
      {pending.kind === "merchant" && (
        <p className="font-mono-g text-[10px]">
          <span style={{ color: (RARITIES[pending.item.rarity] || RARITIES.common).color }}>{pending.item.name}</span>
          <span className="ml-2 text-slate-400">{formatGearStats(pending.item.stats)} · T{pending.item.tier} · you have {gold}g</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">{actions}</div>
      {pending.engagedAt == null && (
        <p className="mt-1 font-mono-g text-[10px] text-slate-500">
          {pending.kind === "merchant" ? "The merchant moves on" : "The party decides on their own"} in {formatSeconds(decideIn)}.
        </p>
      )}
    </div>
  );
}

// Live view of the party out on an expedition: timer, morale, HP, prompt and feed.
export default function ExpeditionPanel({ guild, now, onAttack, onChoose, onRecall }) {
  const run = guild.expedition;
  const region = getRegion(run.regionId);
  const pending = run.pending;
  const pausedAt = pending ? pending.at : now;
  const remaining = run.endsAt == null ? null : run.endsAt - pausedAt;
  const party = run.heroIds.map((id) => guild.heroes.find((hero) => hero.identity.id === id)).filter(Boolean);
  const feed = run.feed.slice(-FEED_LINES).reverse();

  return (
    <Panel className="border-cyan-400/40" data-testid="expedition-panel">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-bold" style={{ color: region.color }}>{region.name}</h2>
        <span className="font-mono-g text-[11px] text-slate-300" data-testid="expedition-timer">
          {remaining == null ? "Endless" : pending ? `Paused · ${clock(remaining)} left` : `${clock(remaining)} left`}
        </span>
      </div>
      {run.durationMs && <Bar value={Math.max(0, run.durationMs - remaining)} max={run.durationMs} color={region.color} className="my-1.5" />}
      {run.weather && (
        <p className="mb-1 font-mono-g text-[10px] text-slate-400" data-testid="expedition-conditions">
          {run.night ? "Night" : "Day"} · {WEATHER[run.weather]?.name}{getEnvironment(region) ? ` · ${getEnvironment(region).name}` : ""}
          {run.packed?.length ? ` (${run.packed.length} warded)` : ""}{run.scouted ? " · Scouted ahead" : ""}{run.treasureAt != null ? " · Following a treasure map" : ""}
        </p>
      )}

      <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 font-mono-g text-[10px]">
        <span className="text-slate-400">Morale</span>
        <div className="flex items-center gap-2">
          <Bar value={run.morale} max={100} color="#E879F9" />
          <span className="shrink-0 text-fuchsia-200">{moraleLabel(run.morale)}</span>
        </div>
        {party.map((hero) => (
          <div key={hero.identity.id} className="contents">
            <span className="truncate" style={{ color: hero.appearance?.identityColor }}>{hero.identity.name}</span>
            <Bar value={Math.max(0, hero.combat.hp)} max={classlessMaxHp(hero)} color={hero.combat.hp > 0 ? "#39FF14" : "#FF2A5F"} />
          </div>
        ))}
      </div>

      {pending && <PendingPrompt pending={pending} now={now} gold={guild.gold} onAttack={onAttack} onChoose={onChoose} />}

      <ul className="mt-2 space-y-0.5 font-mono-g text-[10px]" data-testid="adventure-feed">
        {feed.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className={`${TONE_CLASS[entry.tone] || TONE_CLASS.flavor} ${index > 0 ? "opacity-70" : ""}`}>
            <span className="mr-1.5 text-slate-600">{clock(entry.at - run.startedAt)}</span>{entry.text}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono-g text-[10px] text-yellow-300">{run.loot.gold}g · {run.loot.items.length} items so far</span>
        <NeonButton color="#94A3B8" disabled={pending?.engagedAt != null} onClick={onRecall} data-testid="recall">Recall</NeonButton>
      </div>
    </Panel>
  );
}
