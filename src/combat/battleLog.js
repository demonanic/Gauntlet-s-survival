// The battle log (owner-approved, Nov 2026): what happened in a fight, in a
// few readable lines, so the player can see which combat styles work. It only
// records: nothing here changes a fight (no random numbers, no game state).
//
// Lines, newest first, the last LOG_CAP kept:
//   spell    a spell landed (with its target), fizzled or was strained
//   move     a special move fired
//   control  a control spell or hex took hold, or a foe resisted
//   death    a hero down, an elite or boss slain, a Clutch moment
//   boss     a boss or champion did something big (enrage, summons, wards)
//   summary  every SUMMARY_EVERY seconds, one line per hero who did anything
//   end      at the end, one line per hero for the whole fight

export const LOG_CAP = 60;
export const SUMMARY_EVERY = 10;

export const LOG_COLORS = Object.freeze({
  spell: "#C084FC",
  fizzle: "#94A3B8",
  move: "#FBBF24",
  control: "#38BDF8",
  death: "#FF3366",
  boss: "#FB923C",
  summary: "#CBD5E1",
  end: "#39FF14",
  swap: "#F472B6",
});

// Which kinds each filter chip shows.
export const LOG_FILTERS = Object.freeze({
  all: null,
  spells: ["spell", "fizzle", "control"],
  moves: ["move"],
  deaths: ["death", "boss"],
  summary: ["summary", "end", "swap"],
});

const blank = () => ({ hits: 0, misses: 0, crits: 0, dodges: 0, dealt: 0, taken: 0, spells: 0, fizzles: 0 });
const active = (s) => s.hits + s.misses + s.dodges + s.spells + s.fizzles > 0 || s.dealt > 0 || s.taken > 0;

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function statsText(s, { whole = false } = {}) {
  const parts = [];
  if (s.hits || s.misses) parts.push(`${s.hits} hit${s.hits === 1 ? "" : "s"}`);
  if (s.misses) parts.push(`${s.misses} miss${s.misses === 1 ? "" : "es"}`);
  if (s.crits) parts.push(`${s.crits} crit${s.crits === 1 ? "" : "s"}`);
  if (s.dodges) parts.push(`${s.dodges} dodge${s.dodges === 1 ? "" : "s"}`);
  if (s.spells || s.fizzles) parts.push(`${s.spells} spell${s.spells === 1 ? "" : "s"}${s.fizzles ? ` (${s.fizzles} fizzled)` : ""}`);
  parts.push(`${Math.round(s.dealt)} dmg`);
  if (whole || s.taken) parts.push(`took ${Math.round(s.taken)}`);
  return parts.join(", ");
}

export class BattleLog {
  constructor(names = []) {
    this.names = names;
    this.lines = [];
    this.seq = 0;
    this.window = names.map(blank);
    this.totals = names.map(blank);
    this.nextSummary = SUMMARY_EVERY;
    this.finished = false;
  }

  // A hero who joins part-way (a Free Roam swap) gets their own tallies.
  addHero(name) {
    this.names.push(name);
    this.window.push(blank());
    this.totals.push(blank());
  }

  add(time, kind, text) {
    this.seq += 1;
    this.lines.unshift({ id: this.seq, t: time, kind, text, color: LOG_COLORS[kind] || LOG_COLORS.summary });
    if (this.lines.length > LOG_CAP) this.lines.length = LOG_CAP;
  }

  count(heroIndex, key, amount = 1) {
    if (!(amount > 0) || !this.window[heroIndex]) return;
    this.window[heroIndex][key] += amount;
    this.totals[heroIndex][key] += amount;
  }

  // Every SUMMARY_EVERY seconds, a line per hero who did anything since the last one.
  tick(time) {
    if (this.finished || time < this.nextSummary) return;
    this.window.forEach((s, i) => {
      if (active(s)) this.add(time, "summary", `${this.names[i]} · ${statsText(s)}`);
    });
    this.window = this.names.map(blank);
    while (this.nextSummary <= time) this.nextSummary += SUMMARY_EVERY;
  }

  finish(time, outcome) {
    if (this.finished) return;
    this.finished = true;
    this.add(time, "end", outcome);
    this.totals.forEach((s, i) => this.add(time, "end", `${this.names[i]} (whole fight) · ${statsText(s, { whole: true })}`));
  }

  filtered(filter = "all") {
    const kinds = LOG_FILTERS[filter];
    return kinds ? this.lines.filter((line) => kinds.includes(line.kind)) : this.lines;
  }

  // Plain text for the Copy button, oldest first.
  text() {
    return [...this.lines].reverse().map((line) => `${formatTime(line.t)} ${line.text}`).join("\n");
  }
}
