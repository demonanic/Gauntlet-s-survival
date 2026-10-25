import { NeonButton, Panel } from "./ui";

// The Guild Hall's "Next up" panel: what needs attention, and a button to go there.
export default function GuildHints({ hints, onAct, onDismiss }) {
  if (!hints.length) return null;
  return (
    <Panel className="border-yellow-300/40" data-testid="guild-hints">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-sm font-bold text-yellow-200">NEXT UP</h2>
        <button type="button" className="font-mono-g text-[10px] text-slate-500 underline" onClick={onDismiss} data-testid="hints-dismiss">
          hide
        </button>
      </div>
      <ul className="space-y-1.5">
        {hints.map((hint) => (
          <li key={hint.id} className="flex items-center justify-between gap-2 font-mono-g text-[11px] text-slate-200" data-testid="guild-hint">
            <span className="min-w-0">{hint.text}</span>
            <NeonButton color="#FDE047" onClick={() => onAct(hint.action)}>{hint.action.label}</NeonButton>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
