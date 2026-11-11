import { useState } from "react";
import HeroRow from "../components/HeroRow";
import { NeonButton, Panel } from "../components/ui";
import { heroStatus } from "../game/guild";
import { CAMPAIGNS, STORY, campaignBattles, currentBattle, nextCampaignId, storyLineup, storyState, storyTimeLeft } from "../game/story";

// "1:05:09" or "43:20".
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const REASONS = {
  sign_in: "Sign in (Cloud save, top right) to start a campaign.",
  level_required: `A campaign needs a hero of level ${STORY.minLevel} or more.`,
  expedition_active: "A party is out on a trip. Story battles start once it's back.",
  no_heroes: "Nobody in the line-up is ready: wait for the injured to recover, or swap someone in.",
  out_of_time: "Time has run out.",
  coming_soon: "Chapter 5 arrives in the next update.",
  last_hero: "Someone has to stay in the line-up.",
  not_available: "That hero can't be called now.",
};

// Story mode: start a campaign, then fight it battle by battle against the countdown.
// `now` is the game's clock (gameNow), so the countdown matches the server.
export default function Story({ guild, now, signedIn, onStart, onFight, onSwap, onLoss }) {
  const story = storyState(guild);
  const run = story.run;
  const [party, setParty] = useState([]);
  const [note, setNote] = useState(null);
  const [swapOut, setSwapOut] = useState(null);
  const [swapIn, setSwapIn] = useState(null);
  const tell = (result) => setNote(result?.ok ? null : REASONS[result?.reason] || "That can't be done now.");

  if (!run) {
    const campaign = CAMPAIGNS[nextCampaignId(story, () => 0)];
    const ready = guild.heroes.filter((hero) => heroStatus(guild, hero, Date.now()) === "ready" && hero.combat.hp > 0);
    const selected = party.filter((id) => ready.some((hero) => hero.identity.id === id));
    const toggle = (id) => setParty((current) => current.includes(id) ? current.filter((entry) => entry !== id) : current.length < 4 ? [...current, id] : current);
    return (
      <div className="space-y-3" data-testid="story">
        {story.lastResult && (
          <Panel data-testid="story-last">
            <p className={`font-mono-g text-[11px] ${story.lastResult.outcome === "won" ? "text-emerald-300" : "text-red-300"}`}>
              {story.lastResult.outcome === "won"
                ? `${CAMPAIGNS[story.lastResult.campaignId]?.title}: won! The bounty is in your stash.`
                : `${CAMPAIGNS[story.lastResult.campaignId]?.title}: time ran out. The breach stays open, for now.`}
            </p>
          </Panel>
        )}
        <Panel>
          <p className="font-mono-g text-[10px] uppercase text-amber-300">Story mode · by {campaign.author}</p>
          <h2 className="font-display text-lg font-black text-amber-200">{campaign.title}</h2>
          <p className="mt-1 font-mono-g text-[11px] text-slate-300">{campaign.synopsis}</p>
          <ul className="mt-2 space-y-0.5 font-mono-g text-[10px] text-slate-400">
            <li>· {campaign.chapters.length} chapters, {campaignBattles(campaign).length} battles. Every battle is fought by you: nothing here plays itself.</li>
            <li>· A countdown of {campaign.timerMinutes} minutes starts now and keeps running while you're signed in, even with the game closed. Signing out freezes it for up to 24 hours.</li>
            <li>· Every battle: survive to move on. Most add a second goal: done pays a bonus, missed costs gold and minutes, and a ★ goal missed sends you back to the chapter's start.</li>
            <li>· If the whole party falls, the campaign starts again from battle 1, unless you Redo the chapter (once a chapter).</li>
            <li>· Win, and a legendary bounty is yours.</li>
          </ul>
        </Panel>
        <Panel>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-cyan-200">LINE-UP · {selected.length}/4</h3>
            <NeonButton color="#FBBF24" disabled={!selected.length} onClick={() => { const result = onStart(selected); tell(result); if (result?.ok) setParty([]); }} data-testid="story-start">
              Start campaign
            </NeonButton>
          </div>
          {!signedIn && <p className="mb-2 font-mono-g text-[11px] text-red-300" data-testid="story-sign-in">{REASONS.sign_in}</p>}
          {note && <p className="mb-2 font-mono-g text-[11px] text-red-300" data-testid="story-note">{note}</p>}
          <div className="space-y-2">
            {ready.map((hero) => (
              <HeroRow key={hero.identity.id} hero={hero} guild={guild} now={Date.now()} status="ready"
                selected={selected.includes(hero.identity.id)} onSelect={() => toggle(hero.identity.id)} />
            ))}
          </div>
        </Panel>
      </div>
    );
  }

  const campaign = CAMPAIGNS[run.campaignId];
  const battle = currentBattle(run);
  const chapter = campaign.chapters[battle.chapter];
  const firstOfChapter = run.battle % STORY.battlesPerChapter === 0;
  const left = storyTimeLeft(run, now);
  const lineup = storyLineup(run);
  const coming = run.joining.filter((entry) => entry.from > run.battle);
  const others = guild.heroes.filter((hero) => !lineup.includes(hero.identity.id) && !coming.some((entry) => entry.id === hero.identity.id));
  const name = (id) => guild.heroes.find((hero) => hero.identity.id === id)?.identity.name || "?";
  const fighting = guild.expedition?.pending?.kind === "campaign";

  return (
    <div className="space-y-3" data-testid="story">
      <Panel>
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-black text-amber-200">{campaign.title}</h2>
          <span className={`font-mono-g text-lg font-bold ${run.pausedAt != null ? "text-slate-400" : left < 5 * 60_000 ? "text-red-400" : "text-amber-300"}`} data-testid="story-timer">
            {run.pausedAt != null ? "PAUSED " : ""}{formatCountdown(left)}
          </span>
        </div>
        <p className="font-mono-g text-[10px] text-slate-400">
          Chapter {battle.chapter + 1}: {chapter.title} · battle {battle.number} of {campaignBattles(campaign).length}
          {run.pausedAt != null && " · signed out: the countdown waits (24 h at most)"}
        </p>
      </Panel>

      {firstOfChapter && battle.chapter > 0 && (
        <Panel data-testid="story-outro">
          <p className="font-mono-g text-[11px] italic text-slate-300">{campaign.chapters[battle.chapter - 1].outro}</p>
        </Panel>
      )}
      {firstOfChapter && (
        <Panel data-testid="story-intro">
          <h3 className="font-display text-sm font-bold text-amber-200">Chapter {battle.chapter + 1}: {chapter.title}</h3>
          <p className="mt-1 font-mono-g text-[11px] text-slate-300">{chapter.intro}</p>
        </Panel>
      )}

      <Panel data-testid="story-battle">
        <h3 className="font-display text-sm font-bold text-cyan-200">Battle {battle.number}: {battle.title}</h3>
        <p className="mt-1 font-mono-g text-[11px] text-slate-300">{battle.text}</p>
        {battle.goal && !run.failed && (
          <p className="mt-1 font-mono-g text-[11px] text-amber-200" data-testid="story-goal">
            {battle.goal.critical ? "★ " : ""}Goal: {battle.goal.text}
          </p>
        )}
        {run.lastGoal && !run.failed && (
          <p className={`mt-1 font-mono-g text-[10px] ${run.lastGoal.done ? "text-emerald-300" : "text-red-300"}`} data-testid="story-last-goal">
            Battle {run.lastGoal.battle}: {run.lastGoal.done ? `goal complete, +${run.lastGoal.bonus} gold.`
              : run.lastGoal.critical ? "goal missed. It mattered, so the chapter starts again."
                : `goal missed: +${run.lastGoal.bonus} gold, and ${run.lastGoal.penaltyMs / 60_000} minutes lost.`}
          </p>
        )}
        {run.failed ? (
          <div className="mt-2 space-y-2" data-testid="story-failed">
            <p className="font-mono-g text-[11px] text-red-300">The whole party has fallen.</p>
            <div className="grid grid-cols-2 gap-2">
              <NeonButton color="#FBBF24" onClick={() => onLoss("redo")} data-testid="story-redo">Redo chapter {(run.failed.chapter ?? battle.chapter) + 1} (watch an ad)</NeonButton>
              <NeonButton color="#94A3B8" onClick={() => onLoss("accept")} data-testid="story-accept">
                Start the campaign again
              </NeonButton>
            </div>
            <p className="font-mono-g text-[10px] text-slate-500">Redo replays the chapter from its first battle: swap heroes, change gear or restock at the market first. Free for now; it will play a short ad once ads are in. One Redo a chapter. The countdown keeps running.</p>
          </div>
        ) : battle.comingSoon ? (
          <p className="mt-2 font-mono-g text-[11px] text-amber-300" data-testid="story-soon">{REASONS.coming_soon}</p>
        ) : (
          battle.goal?.kind === "smallBand" ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <NeonButton color="#FF2A5F" disabled={fighting} onClick={() => tell(onFight({ band: true }))} data-testid="story-fight-band">
                Send {battle.goal.max}: {lineup.slice(0, battle.goal.max).map(name).join(", ")}
              </NeonButton>
              <NeonButton color="#94A3B8" disabled={fighting} onClick={() => tell(onFight())} data-testid="story-fight">
                Send everyone (goal missed)
              </NeonButton>
            </div>
          ) : (
            <NeonButton className="mt-2 w-full" color="#FF2A5F" disabled={fighting} onClick={() => tell(onFight())} data-testid="story-fight">
              Fight
            </NeonButton>
          )
        )}
        {note && <p className="mt-1 font-mono-g text-[11px] text-red-300" data-testid="story-note">{note}</p>}
      </Panel>

      <Panel data-testid="story-lineup">
        <h3 className="mb-1 font-display text-sm font-bold text-cyan-200">LINE-UP</h3>
        <p className="font-mono-g text-[11px] text-slate-300">{lineup.map(name).join(", ")}</p>
        {coming.map((entry) => (
          <p key={entry.id} className="font-mono-g text-[10px] text-pink-200">{name(entry.id)} is on the way: joins for the battle after this one.</p>
        ))}
        <p className="mt-2 font-mono-g text-[10px] text-slate-400">Swap: the hero sent back leaves now, so the next battle is fought one short; the one called joins for the battle after.</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {lineup.map((id) => (
            <button key={id} type="button" onClick={() => setSwapOut(id)} aria-pressed={swapOut === id}
              className={`rounded border px-2 py-1 font-mono-g text-[11px] ${swapOut === id ? "border-pink-300 bg-pink-300/15 text-pink-100" : "border-white/20 text-slate-200"}`}
              data-testid={`story-out-${id}`}>{name(id)}</button>
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {others.map((hero) => (
            <button key={hero.identity.id} type="button" onClick={() => setSwapIn(hero.identity.id)} aria-pressed={swapIn === hero.identity.id}
              className={`rounded border px-2 py-1 font-mono-g text-[11px] ${swapIn === hero.identity.id ? "border-pink-300 bg-pink-300/15 text-pink-100" : "border-white/20 text-slate-200"}`}
              data-testid={`story-in-${hero.identity.id}`}>{hero.identity.name} · LV {hero.progression.level}</button>
          ))}
          {!others.length && <span className="font-mono-g text-[10px] text-slate-500">Nobody else at the guild.</span>}
        </div>
        <NeonButton className="mt-2 w-full" color="#F472B6" disabled={!swapOut || !swapIn || fighting || !!run.failed}
          onClick={() => { const result = onSwap(swapOut, swapIn); tell(result); if (result?.ok) { setSwapOut(null); setSwapIn(null); } }} data-testid="story-swap">
          Swap
        </NeonButton>
      </Panel>
    </div>
  );
}
