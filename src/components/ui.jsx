export function NeonButton({ children, color = "#00F3FF", className = "", ...props }) {
  return (
    <button
      type="button"
      className={`min-h-10 rounded border px-3 font-mono-g text-xs font-bold uppercase tracking-wide transition
        disabled:cursor-not-allowed disabled:opacity-35 enabled:hover:brightness-125 ${className}`}
      style={{ borderColor: color, color, boxShadow: `0 0 8px ${color}33` }}
      {...props}
    >
      {children}
    </button>
  );
}

export function Bar({ value, max, color = "#39FF14", className = "" }) {
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded bg-white/10 ${className}`}>
      <div className="h-full rounded" style={{ width: `${fraction * 100}%`, background: color }} />
    </div>
  );
}

export function Panel({ children, className = "", ...props }) {
  return (
    <section className={`rounded-lg border border-white/10 bg-[var(--panel)] p-3 ${className}`} {...props}>
      {children}
    </section>
  );
}

export function formatSeconds(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}
