// Spell visual effects for live battles: a look of its own per element, which
// grows with the caster's proficiency (I–V), and a fizzle. Presentation only:
// the engine creates this only when it draws to a real canvas, and it uses its
// own random numbers, so it never changes a fight or shifts its random rolls.
// No imports, so it can also be rendered on its own (see the PR screenshots).
//
// Each element differs in colour, shape and motion:
//   arcane    stars and glyph rings, orbiting    rank: more rune rings (1–3)
//   fire      round flames and embers, rising    rank: hotter (red → white-hot)
//   ice       angular shards, spinning, cracking rank: bigger shard clusters
//   poison    blobs and bubbles, arcing, dripping rank: thicker trail, more drips
//   electric  zig-zag lines, instant, jittering  rank: more forks (1–4)
//   mind      rings and waves, pulsing           rank: faster pulse
//   restoration soft motes and leaves, drifting up rank: more motes, brighter bloom
//   warding   hexagon shells, snapping into place  rank: more shell layers (1–3)
//   shadow    smoke wisps and afterimages, creeping rank: thicker smoke
//   wild      vines, thorns and leaves, bursting up rank: thicker vines

export const ELEMENT_LOOKS = Object.freeze({
  arcane: { color: "#E879F9", light: "#FCE7FF" },
  fire: { color: "#FF6600", light: "#FFD27A" },
  ice: { color: "#00F3FF", light: "#E6FDFF" },
  poison: { color: "#39FF14", light: "#C8FFB0" },
  electric: { color: "#FFE600", light: "#FFFFFF" },
  mind: { color: "#A855F7", light: "#E9D5FF" },
  restoration: { color: "#A7F3D0", light: "#F0FFF7" },
  warding: { color: "#FFB547", light: "#FFE7B0" },
  shadow: { color: "#8EA3C7", light: "#E2E8F0" },
  wild: { color: "#9BE15D", light: "#E3FFC2" },
});

// Lingering effects the engine can attach to a foe or a hero.
const AURA_KINDS = new Set(["fire", "poison", "ice", "mind", "renewal", "lifeline", "barrier", "empower", "aegis", "veil", "fear", "confuse", "dominate", "root"]);
const AURA_SCHOOL = { renewal: "restoration", lifeline: "restoration", barrier: "warding", empower: "warding", aegis: "warding",
  veil: "shadow", fear: "shadow", confuse: "shadow", dominate: "mind", root: "wild" };

// Below this frame rate (sustained) effects thin out; they come back once it recovers.
export const VFX_QUALITY = Object.freeze({ slowFps: 50, recoverFps: 57, window: 1, steps: [1, 0.7, 0.45, 0.25], maxParticles: 700 });

const TAU = Math.PI * 2;
const clampRank = (rank) => Math.max(1, Math.min(5, Math.round(rank || 1)));

// What each element's proficiency changes. `t` runs 0 (rank I) to 1 (rank V).
export function rankLook(element, rank) {
  const r = clampRank(rank);
  const t = (r - 1) / 4;
  const look = { rank: r, t };
  if (element === "fire") {
    // Dull red at I, orange at III, a white-hot core at V; flames grow.
    look.core = mix("#B3261E", "#FFF6D0", t);
    look.edge = mix("#7A1A12", "#FF7A1A", Math.min(1, t * 1.6));
    look.size = 1 + 0.7 * t;
  } else if (element === "ice") {
    look.shards = [1, 2, 3, 4, 5][r - 1];
    look.size = 1 + 0.5 * t;
  } else if (element === "poison") {
    look.trail = 2 + 4 * t;
    look.drips = Math.round(2 + 6 * t);
  } else if (element === "electric") {
    look.forks = [1, 1, 2, 3, 4][r - 1];
    look.jitter = 7 + 7 * t;
  } else if (element === "mind") {
    look.pulse = 1.6 + 4.4 * t; // waves per second
  } else if (element === "restoration") {
    look.motes = Math.round(6 + 8 * t);
    look.bloom = 0.45 + 0.55 * t;
  } else if (element === "warding") {
    look.layers = r >= 5 ? 3 : r >= 3 ? 2 : 1;
  } else if (element === "shadow") {
    look.smoke = Math.round(4 + 6 * t);
  } else if (element === "wild") {
    look.vine = 1.2 + 1.8 * t;
  } else {
    look.rings = r >= 5 ? 3 : r >= 3 ? 2 : 1;
  }
  return look;
}

// Linear blend of two #rrggbb colours.
export function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function rgba(hex, alpha) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

export class SpellVfx {
  constructor({ seed = 0x5eed } = {}) {
    let a = seed >>> 0;
    // Its own generator: never Math.random, never the fight's rng.
    this.rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    this.particles = [];
    this.beams = [];
    this.auras = [];
    this.time = 0;
    this.quality = 1;
    this._frames = [];
    this._calm = 0;
  }

  // ---- quality ----------------------------------------------------------

  // Feed real frame times (seconds). Sustained slow frames lower quality one
  // step; a second of smooth frames raises it again.
  noteFrame(dt) {
    if (!(dt > 0)) return;
    this._frames.push(dt);
    const total = this._frames.reduce((sum, value) => sum + value, 0);
    if (total < VFX_QUALITY.window) return;
    const fps = this._frames.length / total;
    this._frames = [];
    const steps = VFX_QUALITY.steps;
    const index = steps.indexOf(this.quality);
    if (fps < VFX_QUALITY.slowFps && index < steps.length - 1) {
      this.quality = steps[index + 1];
      this._calm = 0;
    } else if (fps >= VFX_QUALITY.recoverFps && index > 0) {
      this._calm += 1;
      if (this._calm >= 2) { this.quality = steps[index - 1]; this._calm = 0; }
    } else {
      this._calm = 0;
    }
  }

  _count(n) {
    return Math.max(1, Math.round(n * this.quality));
  }

  _add(p) {
    if (this.particles.length >= VFX_QUALITY.maxParticles * this.quality) return;
    p.age = 0;
    this.particles.push(p);
  }

  // ---- what the engine calls ---------------------------------------------

  // The caster gathers power.
  cast(element, x, y, rank = 1) {
    const look = rankLook(element, rank);
    const { color, light } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.arcane;
    const R = this.rand;
    if (element === "arcane") {
      for (let i = 0; i < look.rings; i += 1) {
        this._add({ kind: "glyphRing", x, y: y - 6, r: 16 + i * 7, spin: (i % 2 ? -1 : 1) * (2.2 + i), points: 5 + i, color, life: 0.45 });
      }
    } else if (element === "fire") {
      for (let i = 0; i < this._count(10); i += 1) {
        this._add({ kind: "ember", x: x + (R() - 0.5) * 18, y: y - 4 + (R() - 0.5) * 8, vx: (R() - 0.5) * 20, vy: -40 - R() * 50,
          size: 1.6 + R() * 1.6 * look.size, color: R() < 0.5 ? look.core : look.edge, life: 0.45 + R() * 0.3 });
      }
    } else if (element === "ice") {
      for (let i = 0; i < this._count(7); i += 1) {
        this._add({ kind: "mist", x: x + (R() - 0.5) * 26, y: y - 4 + (R() - 0.5) * 12, vx: (R() - 0.5) * 12, vy: -6 - R() * 8,
          size: 9 + R() * 8, color: "#7FE9FF", life: 0.6 + R() * 0.3 });
      }
      for (let i = 0; i < this._count(5); i += 1) {
        this._add({ kind: "flake", x: x + (R() - 0.5) * 22, y: y - 10 - R() * 10, vx: (R() - 0.5) * 10, vy: -8 - R() * 6, rot: R() * TAU, spin: 3, size: 2 + R() * 1.5, color: light, life: 0.5 + R() * 0.3 });
      }
    } else if (element === "poison") {
      for (let i = 0; i < this._count(8); i += 1) {
        this._add({ kind: "bubble", x: x + (R() - 0.5) * 18, y: y + (R() - 0.5) * 6, vx: (R() - 0.5) * 10, vy: -18 - R() * 22,
          size: 2 + R() * 3, color, life: 0.5 + R() * 0.4 });
      }
    } else if (element === "electric") {
      for (let i = 0; i < this._count(6); i += 1) {
        const a = R() * TAU;
        this._add({ kind: "spark", x: x + Math.cos(a) * 10, y: y - 4 + Math.sin(a) * 10, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
          size: 4 + R() * 5, color: R() < 0.5 ? light : color, life: 0.18 + R() * 0.12 });
      }
    } else if (element === "mind") {
      for (let i = 0; i < 3; i += 1) {
        this._add({ kind: "ripple", x, y: y - 16, r0: 4, r1: 30, delay: i / look.pulse, color, life: 0.5 + i / look.pulse });
      }
    } else if (element === "restoration") {
      // Motes gather in toward the caster's hands.
      for (let i = 0; i < this._count(look.motes); i += 1) {
        const a = R() * TAU;
        const d = 22 + R() * 14;
        this._add({ kind: "mote", x: x + Math.cos(a) * d, y: y - 8 + Math.sin(a) * d * 0.6, vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 1.3,
          size: 3 + R() * 2.5, color: R() < 0.5 ? light : color, life: 0.42 });
      }
    } else if (element === "warding") {
      this._add({ kind: "hex", x, y: y - 8, r: 12, grow: 1.4, color, life: 0.35, width: 2 });
    } else if (element === "shadow") {
      for (let i = 0; i < this._count(look.smoke); i += 1) {
        this._add({ kind: "smoke", x: x + (R() - 0.5) * 20, y: y - R() * 16, vx: (R() - 0.5) * 18, vy: -14 - R() * 12, size: 6 + R() * 6, color: "#3A3F5C", life: 0.7 + R() * 0.3 });
      }
      for (let i = 1; i <= 2; i += 1) this._add({ kind: "ghost", x: x - i * 6, y, color, life: 0.35 + i * 0.1 });
    } else if (element === "wild") {
      for (let i = 0; i < this._count(6); i += 1) {
        const a = (i / 6) * TAU;
        this._add({ kind: "leaf", x: x + Math.cos(a) * 14, y: y - 6 + Math.sin(a) * 8, vx: -Math.sin(a) * 60, vy: Math.cos(a) * 30 - 20, rot: a, spin: 6, size: 3, color, life: 0.5 });
      }
    }
  }

  // A heal or a shield lands on a hero.
  supportBurst(element, target, rank = 1) {
    const look = rankLook(element, rank);
    const { color, light } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.restoration;
    const R = this.rand;
    const x = target.x;
    const y = target.y;
    if (element === "restoration") {
      this._add({ kind: "bloom", x, y: y - 8, r: 18 + 16 * look.bloom, color: light, life: 0.45 });
      for (let i = 0; i < this._count(look.motes); i += 1) {
        this._add({ kind: "mote", x: x + (R() - 0.5) * 22, y: y + 4 - R() * 10, vx: (R() - 0.5) * 14, vy: -30 - R() * 30,
          size: 2.5 + R() * 2.5, color: R() < 0.5 ? light : color, life: 0.7 + R() * 0.4 });
      }
      for (let i = 0; i < this._count(3); i += 1) {
        this._add({ kind: "leaf", x: x + (R() - 0.5) * 20, y: y - 4, vx: (R() - 0.5) * 22, vy: -24 - R() * 16, rot: R() * TAU, spin: (R() - 0.5) * 5,
          size: 3 + R() * 1.5, color: "#5EE6A0", life: 0.9 });
      }
    } else {
      for (let i = 0; i < look.layers; i += 1) {
        this._add({ kind: "hex", x, y: y - 8, r: 30 + i * 6, shrinkTo: 16 + i * 5, color: i % 2 ? light : color, life: 0.3 + i * 0.06, width: 2.2 });
      }
    }
  }

  // Lifeline catches a falling hero: a golden heartbeat.
  lifelineSave(target) {
    for (let i = 0; i < 2; i += 1) {
      this._add({ kind: "ring", x: target.x, y: target.y, r0: 6, r1: 46, color: "#FFD36B", life: 0.55 + i * 0.25, delay: i * 0.22, width: 4 });
    }
    this._add({ kind: "bloom", x: target.x, y: target.y - 8, r: 40, color: "#FFF1C2", life: 0.4 });
  }

  // A single-target bolt from the caster to its target (the damage itself is
  // instant; this only draws its flight).
  bolt(element, from, to, rank = 1) {
    const look = rankLook(element, rank);
    const { color, light } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.arcane;
    const flight = element === "electric" ? 0.2 : element === "poison" ? 0.32 : 0.22;
    if (element === "electric") {
      this.beams.push({ kind: "lightning", from: { x: from.x, y: from.y - 10 }, to: { x: to.x, y: to.y }, forks: look.forks, jitter: look.jitter, color, light, age: 0, life: flight });
    } else if (element === "mind") {
      this.beams.push({ kind: "wave", from: { x: from.x, y: from.y - 14 }, to: { x: to.x, y: to.y }, pulse: look.pulse, color, light, age: 0, life: 0.35 });
    } else {
      this._add({ kind: "missile", element, look, x: from.x, y: from.y - 10, sx: from.x, sy: from.y - 10, tx: to.x, ty: to.y, color, light,
        spin: 0, life: flight, trailAt: 0 });
    }
    // The hit lands as the flight ends.
    this._add({ kind: "delay", fire: () => this.impact(element, to.x, to.y, rank), life: flight });
  }

  // The spell lands at (x, y).
  impact(element, x, y, rank = 1, radius = 0) {
    const look = rankLook(element, rank);
    const { color, light } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.arcane;
    const R = this.rand;
    const spread = radius || 18;
    if (element === "arcane") {
      this._add({ kind: "star", x, y, r: 10 + spread * 0.4, points: 4, color: light, life: 0.25, grow: 1.6 });
      for (let i = 0; i < this._count(8); i += 1) {
        const a = (i / 8) * TAU + R() * 0.3;
        this._add({ kind: "glint", x, y, vx: Math.cos(a) * (80 + R() * 60), vy: Math.sin(a) * (80 + R() * 60), size: 3, color, life: 0.35 });
      }
      for (let i = 0; i < look.rings; i += 1) this._add({ kind: "glyphRing", x, y, r: 10 + i * 8 + spread * 0.5, spin: i % 2 ? -3 : 3, points: 6, color, life: 0.35 });
    } else if (element === "fire") {
      this._add({ kind: "flash", x, y, r: spread * 1.1 + 10, color: look.core, life: 0.16 });
      for (let i = 0; i < this._count(14 + spread * 0.2); i += 1) {
        const a = R() * TAU;
        const s = 30 + R() * 70;
        this._add({ kind: "flame", x: x + Math.cos(a) * R() * spread * 0.6, y: y + Math.sin(a) * R() * spread * 0.4,
          vx: Math.cos(a) * s * 0.6, vy: Math.sin(a) * s * 0.4 - 30, size: (5 + R() * 6) * look.size, core: look.core, edge: look.edge, life: 0.4 + R() * 0.3 });
      }
      for (let i = 0; i < this._count(4); i += 1) {
        this._add({ kind: "smoke", x: x + (R() - 0.5) * spread, y: y - 10 - spread * 0.3, vx: (R() - 0.5) * 12, vy: -24 - R() * 15, size: 8 + R() * 6, color: "#5A463C", life: 0.9 + R() * 0.4, delay: 0.15 });
      }
    } else if (element === "ice") {
      for (let i = 0; i < 6 + look.shards; i += 1) {
        const a = (i / (6 + look.shards)) * TAU + R() * 0.4;
        this._add({ kind: "crack", x, y, a, len: (10 + R() * 12 + spread * 0.5) * look.size, color: light, life: 0.4 });
      }
      for (let i = 0; i < this._count(6 + look.shards * 2); i += 1) {
        const a = R() * TAU;
        const s = 60 + R() * 90;
        this._add({ kind: "shard", x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, rot: R() * TAU, spin: (R() - 0.5) * 14,
          size: (3 + R() * 4) * look.size, color: R() < 0.4 ? light : color, life: 0.45 + R() * 0.2, gravity: 160 });
      }
    } else if (element === "poison") {
      this._add({ kind: "ring", x, y, r0: 4, r1: spread + 14, color, life: 0.3, width: 3 });
      for (let i = 0; i < this._count(10 + look.drips); i += 1) {
        const a = -Math.PI * (0.1 + R() * 0.8);
        const s = 50 + R() * 80;
        this._add({ kind: "blob", x: x + (R() - 0.5) * spread, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, size: 2.5 + R() * 3.5,
          color: R() < 0.3 ? light : color, life: 0.55 + R() * 0.25, gravity: 260 });
      }
    } else if (element === "electric") {
      this._add({ kind: "flash", x, y, r: spread + 14, color: light, life: 0.12 });
      for (let i = 0; i < this._count(8 + look.forks * 2); i += 1) {
        const a = R() * TAU;
        this._add({ kind: "spark", x, y, vx: Math.cos(a) * (120 + R() * 120), vy: Math.sin(a) * (120 + R() * 120), size: 5 + R() * 6, color: R() < 0.5 ? light : color, life: 0.15 + R() * 0.1 });
      }
    } else if (element === "shadow") {
      this._add({ kind: "ring", x, y, r0: 4, r1: spread + 18, color: "#2B3345", life: 0.35, width: 5 });
      for (let i = 0; i < this._count(look.smoke + 2); i += 1) {
        const a = R() * TAU;
        this._add({ kind: "smoke", x: x + Math.cos(a) * spread * 0.5, y: y + Math.sin(a) * spread * 0.3, vx: Math.cos(a) * 30, vy: -10 - R() * 10, size: 7 + R() * 6, color: "#3A3F5C", life: 0.6 + R() * 0.3 });
      }
      this._add({ kind: "ghost", x, y, color: light, life: 0.3 });
    } else if (element === "wild") {
      for (let i = 0; i < this._count(5); i += 1) {
        const a = R() * TAU;
        this._add({ kind: "thorn", x: x + Math.cos(a) * R() * (spread * 0.7 + 6), y: y + 8 + Math.sin(a) * R() * spread * 0.35, h: 8 + R() * 8 * look.vine, w: 2 + look.vine, color, life: 0.5 });
      }
      for (let i = 0; i < this._count(6); i += 1) {
        this._add({ kind: "leaf", x, y, vx: (R() - 0.5) * 90, vy: -40 - R() * 50, rot: R() * TAU, spin: (R() - 0.5) * 8, size: 2.6, color: R() < 0.5 ? color : "#5EE6A0", life: 0.6, gravity: 140 });
      }
    } else if (element === "mind") {
      const waves = Math.max(2, Math.round(look.pulse * 0.8));
      for (let i = 0; i < waves; i += 1) {
        this._add({ kind: "ripple", x, y, r0: 4, r1: spread + 22, delay: i / look.pulse, color, life: 0.4 + i / look.pulse });
      }
    }
  }

  // An area spell: the whole circle erupts at once.
  area(element, x, y, radius, rank = 1) {
    const R = this.rand;
    const { color } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.arcane;
    this._add({ kind: "ring", x, y, r0: radius * 0.2, r1: radius, color, life: 0.35, width: 2 });
    if (element === "electric") {
      // Lightning strikes down across the circle instead of one big flash.
      const look = rankLook("electric", rank);
      const { light } = ELEMENT_LOOKS.electric;
      for (let i = 0; i < 2 + look.forks; i += 1) {
        const a = R() * TAU;
        const d = radius * Math.sqrt(R()) * 0.9;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d * 0.6;
        this._add({ kind: "delay", life: i * 0.04, fire: () => {
          this.beams.push({ kind: "lightning", from: { x: px + (R() - 0.5) * 30, y: py - 130 }, to: { x: px, y: py }, forks: 1, jitter: look.jitter, color, light, age: 0, life: 0.16 });
          this.impact("electric", px, py, rank, 6);
        } });
      }
      return;
    }
    this.impact(element, x, y, rank, radius);
    const extra = this._count(element === "electric" ? 3 : 4);
    for (let i = 0; i < extra; i += 1) {
      const a = R() * TAU;
      const d = radius * (0.35 + R() * 0.55);
      this._add({ kind: "delay", fire: () => this.impact(element, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, rank), life: 0.05 + R() * 0.2 });
    }
  }

  // Meteor's 2 s warning: a target circle on the ground that tightens.
  meteorWarning(x, y, radius, seconds) {
    this._add({ kind: "warning", x, y, r: radius, color: ELEMENT_LOOKS.arcane.color, life: seconds });
  }

  // The meteor itself: a burning rock streaks in, then a crater flash.
  meteorImpact(x, y, radius, rank = 1) {
    const fall = 0.22;
    this._add({ kind: "rock", sx: x + 120, sy: y - 220, tx: x, ty: y, x: x + 120, y: y - 220, life: fall, trailAt: 0 });
    this._add({ kind: "delay", life: fall, fire: () => {
      this._add({ kind: "flash", x, y, r: radius + 20, color: "#FFE3F7", life: 0.2 });
      this._add({ kind: "ring", x, y, r0: radius * 0.3, r1: radius * 1.15, color: "#FF9F43", life: 0.45, width: 4 });
      this.impact("fire", x, y, Math.max(3, rank), radius * 0.8);
      this.impact("arcane", x, y, rank, radius * 0.6);
    } });
  }

  // A lightning arc between two foes (lightning's jump, Chain Spark).
  arc(element, from, to, rank = 1) {
    const look = rankLook("electric", rank);
    const { color, light } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.electric;
    if (element === "electric") {
      this.beams.push({ kind: "lightning", from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, forks: Math.max(1, look.forks - 1), jitter: look.jitter * 0.7, color, light, age: 0, life: 0.18 });
    } else {
      this.bolt(element, from, to, rank);
    }
  }

  // A lingering effect: on a foe, burning, poisoned, frozen (slowed) or dazed
  // (stunned); on a hero, Renewal, Lifeline, Barrier, Empower or Aegis.
  // `keep` (optional) ends it early once it returns false.
  aura(element, target, seconds, rank = 1, keep = null) {
    if (!target || !(seconds > 0) || !AURA_KINDS.has(element)) return;
    const school = AURA_SCHOOL[element] || element;
    const existing = this.auras.find((aura) => aura.target === target && aura.element === element);
    if (existing) { existing.until = Math.max(existing.until, this.time + seconds); existing.rank = Math.max(existing.rank, rank); existing.keep = keep || existing.keep; return; }
    this.auras.push({ element, school, target, until: this.time + seconds, rank, look: rankLook(school, rank), next: 0, spin: this.rand() * TAU, keep, born: this.time });
  }

  // A failed cast: it starts in its element's style, sputters, and puffs out.
  fizzle(element, x, y) {
    const { color } = ELEMENT_LOOKS[element] || ELEMENT_LOOKS.arcane;
    const R = this.rand;
    this._add({ kind: "glyphRing", x, y: y - 6, r: 14, spin: 6, points: 5, color, life: 0.22, sputter: true });
    this._add({ kind: "delay", life: 0.18, fire: () => {
      for (let i = 0; i < this._count(7); i += 1) {
        const a = R() * TAU;
        this._add({ kind: "glint", x: x + Math.cos(a) * 10, y: y - 6 + Math.sin(a) * 10, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50 + 30,
          size: 2.5, color: i % 3 ? "#94A3B8" : color, life: 0.35, gravity: 120 });
      }
      for (let i = 0; i < this._count(5); i += 1) {
        this._add({ kind: "smoke", x: x + (R() - 0.5) * 12, y: y - 8, vx: (R() - 0.5) * 16, vy: -22 - R() * 14, size: 5 + R() * 5, color: "#6B7280", life: 0.7 + R() * 0.3 });
      }
      this._add({ kind: "fizzleText", x, y: y - 30, color: "#CBD5E1", life: 0.85 });
    } });
  }

  // ---- update and draw ------------------------------------------------------

  // Advance by `dt` seconds of battle time.
  update(dt) {
    if (!(dt > 0)) return;
    this.time += dt;
    const fired = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.kind === "delay") { if (p.age >= p.life) fired.push(p.fire); continue; }
      if (p.vx != null) { p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.spin && p.rot != null) p.rot += p.spin * dt;
      if (p.kind === "missile" || p.kind === "rock") this._fly(p, dt);
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const fire of fired) fire();
    for (const beam of this.beams) beam.age += dt;
    this.beams = this.beams.filter((beam) => beam.age < beam.life);
    const ending = this.auras.filter((aura) => !this._auraLasts(aura));
    for (const aura of ending) if (aura.element === "barrier") this._shatter(aura.target, aura.look.layers);
    this.auras = this.auras.filter((aura) => this._auraLasts(aura));
    for (const aura of this.auras) this._tickAura(aura, dt);
  }

  _fly(p, dt) {
    const k = Math.min(1, p.age / p.life);
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k - (p.element === "poison" ? Math.sin(Math.PI * k) * 40 : 0);
    p.spin = (p.spin || 0) + dt * 14;
    p.trailAt -= dt;
    if (p.trailAt > 0) return;
    p.trailAt = 0.02 / this.quality;
    const R = this.rand;
    if (p.kind === "rock") {
      this._add({ kind: "flame", x: p.x, y: p.y, vx: (R() - 0.5) * 20, vy: -10, size: 7 + R() * 5, core: "#FFF1C2", edge: "#FF6A1A", life: 0.3 });
      return;
    }
    if (p.element === "fire") {
      this._add({ kind: "flame", x: p.x + (R() - 0.5) * 4, y: p.y + (R() - 0.5) * 4, vx: (R() - 0.5) * 16, vy: -24, size: (4 + R() * 3) * p.look.size, core: p.look.core, edge: p.look.edge, life: 0.22 });
      if (R() < 0.25) this._add({ kind: "smoke", x: p.x, y: p.y - 4, vx: (R() - 0.5) * 8, vy: -16, size: 5 + R() * 3, color: "#5A463C", life: 0.6 });
    } else if (p.element === "ice") {
      this._add({ kind: "glint", x: p.x + (R() - 0.5) * 6, y: p.y + (R() - 0.5) * 6, vx: 0, vy: 6, size: 2, color: p.light, life: 0.3 });
    } else if (p.element === "poison") {
      this._add({ kind: "blob", x: p.x, y: p.y, vx: (R() - 0.5) * 10, vy: 10, size: p.look.trail * 0.8, color: p.color, life: 0.3, gravity: 220 });
    } else {
      this._add({ kind: "glint", x: p.x + (R() - 0.5) * 8, y: p.y + (R() - 0.5) * 8, vx: (R() - 0.5) * 20, vy: (R() - 0.5) * 20, size: 2.4, color: R() < 0.5 ? p.light : p.color, life: 0.28 });
    }
  }

  _auraLasts(aura) {
    const t = aura.target;
    const standing = t.alive !== undefined ? t.alive : t.hp > 0 && !t._dead;
    return aura.until > this.time && standing && (!aura.keep || aura.keep());
  }

  // A Barrier breaking: its hexagon shell cracks into falling shards.
  _shatter(target, layers = 1) {
    const R = this.rand;
    for (let i = 0; i < this._count(8 + layers * 4); i += 1) {
      const a = R() * TAU;
      this._add({ kind: "shard", x: target.x + Math.cos(a) * 18, y: target.y - 8 + Math.sin(a) * 18, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 10,
        rot: R() * TAU, spin: (R() - 0.5) * 12, size: 2.5 + R() * 2, color: i % 2 ? ELEMENT_LOOKS.warding.light : ELEMENT_LOOKS.warding.color, life: 0.5, gravity: 180 });
    }
  }

  _tickAura(aura, dt) {
    aura.next -= dt;
    aura.spin += dt * (aura.element === "mind" ? aura.look.pulse * 1.2 : 1);
    if (aura.next > 0) return;
    const R = this.rand;
    const t = aura.target;
    const w = (t.boss ? 22 : 10);
    if (aura.element === "fire") {
      aura.next = 0.07 / this.quality;
      this._add({ kind: "flame", x: t.x + (R() - 0.5) * w * 1.4, y: t.y + 4, vx: (R() - 0.5) * 8, vy: -30 - R() * 25, size: (3.5 + R() * 3) * aura.look.size, core: aura.look.core, edge: aura.look.edge, life: 0.35 + R() * 0.2 });
    } else if (aura.element === "poison") {
      aura.next = 0.12 / this.quality;
      this._add({ kind: "bubble", x: t.x + (R() - 0.5) * w * 1.4, y: t.y + 2, vx: (R() - 0.5) * 6, vy: -16 - R() * 12, size: 1.6 + R() * 2.4, color: ELEMENT_LOOKS.poison.color, life: 0.6 });
      if (R() < 0.4) this._add({ kind: "mist", x: t.x + (R() - 0.5) * w, y: t.y + 4, vx: (R() - 0.5) * 6, vy: -4, size: 7 + R() * 5, color: "#2F7D1C", life: 0.7 });
    } else if (aura.element === "ice") {
      aura.next = 0.22 / this.quality;
      this._add({ kind: "flake", x: t.x + (R() - 0.5) * w * 2, y: t.y - 14 - R() * 10, vx: (R() - 0.5) * 6, vy: 10 + R() * 8, rot: R() * TAU, spin: 1.5, size: 2.5 + R() * 1.5, color: ELEMENT_LOOKS.ice.light, life: 0.9 });
    } else if (aura.element === "renewal") {
      aura.next = 0.12 / (this.quality * (0.6 + aura.look.bloom));
      this._add({ kind: "mote", x: t.x + (R() - 0.5) * 22, y: t.y + 4, vx: (R() - 0.5) * 6, vy: -22 - R() * 14, size: 2 + R() * 2, color: R() < 0.5 ? ELEMENT_LOOKS.restoration.light : ELEMENT_LOOKS.restoration.color, life: 0.8 });
      if (R() < 0.25) this._add({ kind: "leaf", x: t.x + (R() - 0.5) * 18, y: t.y, vx: (R() - 0.5) * 12, vy: -18, rot: R() * TAU, spin: 3, size: 2.6, color: "#5EE6A0", life: 0.9 });
    } else if (aura.element === "veil") {
      aura.next = 0.09 / this.quality;
      this._add({ kind: "smoke", x: t.x + (R() - 0.5) * 20, y: t.y - R() * 18, vx: (R() - 0.5) * 10, vy: -12, size: 5 + R() * 4 + aura.look.smoke * 0.4, color: "#3A3F5C", life: 0.6 });
    } else if (aura.element === "empower") {
      // A glint runs along the weapon and gold sparks rise off the hero.
      aura.next = 0.22 / this.quality;
      this._add({ kind: "star", x: t.x + 9 + (R() - 0.5) * 6, y: t.y - 18 + (R() - 0.5) * 6, r: 6, points: 4, color: ELEMENT_LOOKS.warding.light, life: 0.35, grow: 1.1, spin: 6 });
      this._add({ kind: "mote", x: t.x + (R() - 0.5) * 18, y: t.y + 4, vx: (R() - 0.5) * 6, vy: -34 - R() * 16, size: 1.8 + R() * 1.2, color: ELEMENT_LOOKS.warding.color, life: 0.6 });
    } else {
      aura.next = 1e9; // drawn directly each frame, nothing to spawn
    }
  }

  draw(ctx) {
    if (!ctx) return;
    for (const aura of this.auras) this._drawAuraBase(ctx, aura);
    ctx.save();
    for (const p of this.particles) {
      if (p.kind === "delay" || p.age < (p.delay || 0)) continue;
      this._drawParticle(ctx, p);
    }
    for (const beam of this.beams) this._drawBeam(ctx, beam);
    ctx.restore();
    for (const aura of this.auras) {
      if (aura.element === "mind") this._drawDazed(ctx, aura);
      else if (["lifeline", "barrier", "aegis"].includes(aura.element)) this._drawWard(ctx, aura);
      else if (["veil", "fear", "confuse", "dominate", "root"].includes(aura.element)) this._drawControl(ctx, aura);
    }
  }

  // Controls on foes (and Veil on a hero), drawn each frame: Veil's
  // afterimage, Terror's shaking "!", Confusion's circling "?" and red eyes,
  // Dominate's chain halo, roots wrapped around the feet.
  _drawControl(ctx, aura) {
    const t = aura.target;
    const left = aura.until - this.time;
    const fade = Math.min(1, left / 0.3);
    const head = t.y - (t.boss ? 40 : 24);
    ctx.save();
    if (aura.element === "veil") {
      // A dark shroud over the hero, trailed by two afterimages.
      const g = ctx.createRadialGradient(t.x, t.y - 8, 0, t.x, t.y - 8, 20);
      g.addColorStop(0, rgba("#05070C", 0.55 * fade)); g.addColorStop(1, rgba("#05070C", 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y - 8, 20, 0, TAU); ctx.fill();
      for (let i = 1; i <= 2; i += 1) {
        ctx.strokeStyle = rgba(ELEMENT_LOOKS.shadow.light, 0.55 * fade / i); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(t.x - i * 6 * (0.6 + 0.4 * Math.sin(this.time * 3)), t.y - 8, 7, 12, 0, 0, TAU); ctx.stroke();
      }
    } else if (aura.element === "fear") {
      const shake = Math.sin(this.time * 60) * 1.5;
      ctx.font = "900 14px Unbounded, JetBrains Mono, monospace"; ctx.textAlign = "center";
      ctx.fillStyle = rgba("#F8FAFC", fade); ctx.fillText("!", t.x + shake, head);
      ctx.strokeStyle = rgba(ELEMENT_LOOKS.shadow.light, 0.7 * fade); ctx.lineWidth = 1.2;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(t.x + side * 10, head - 8); ctx.lineTo(t.x + side * 14 + shake, head - 4); ctx.lineTo(t.x + side * 10, head);
        ctx.stroke();
      }
    } else if (aura.element === "confuse") {
      ctx.font = "800 11px Unbounded, JetBrains Mono, monospace"; ctx.textAlign = "center";
      for (let i = 0; i < 3; i += 1) {
        const a = this.time * 3 + (i / 3) * TAU;
        ctx.fillStyle = rgba(i ? ELEMENT_LOOKS.shadow.light : "#C4B5FD", fade);
        ctx.fillText("?", t.x + Math.cos(a) * 12, head + Math.sin(a) * 4);
      }
      ctx.fillStyle = rgba("#FF2A5F", fade);
      ctx.beginPath(); ctx.arc(t.x - 3, t.y - 6, 1.6, 0, TAU); ctx.arc(t.x + 3, t.y - 6, 1.6, 0, TAU); ctx.fill();
    } else if (aura.element === "dominate") {
      const { color, light } = ELEMENT_LOOKS.mind;
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = rgba(light, 0.9 * fade); ctx.lineWidth = 1.3;
      for (let i = 0; i < 10; i += 1) {
        const a = this.time * 1.5 + (i / 10) * TAU;
        ctx.beginPath(); ctx.ellipse(t.x + Math.cos(a) * 13, head - 2 + Math.sin(a) * 4, 2.6, 1.6, a, 0, TAU); ctx.stroke();
      }
      ctx.strokeStyle = rgba(color, 0.8 * fade); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(t.x, t.y + 8, t.boss ? 26 : 14, t.boss ? 9 : 5, 0, 0, TAU); ctx.stroke();
    } else if (aura.element === "root") {
      const { color } = ELEMENT_LOOKS.wild;
      const w = t.boss ? 22 : 12;
      ctx.strokeStyle = rgba(color, 0.9 * fade); ctx.lineWidth = aura.look.vine || 1.6; ctx.lineCap = "round";
      for (let i = 0; i < 4; i += 1) {
        const x0 = t.x - w + (i / 3) * w * 2;
        const curl = Math.sin(this.time * 2 + i) * 2;
        ctx.beginPath(); ctx.moveTo(x0, t.y + 10);
        ctx.quadraticCurveTo(x0 + (i % 2 ? -8 : 8) + curl, t.y + 2, t.x + (i - 1.5) * 3, t.y - 2 + (i % 2) * 4);
        ctx.stroke();
      }
      ctx.fillStyle = rgba("#5EE6A0", 0.8 * fade);
      ctx.beginPath(); ctx.ellipse(t.x - w * 0.6, t.y + 2, 2.4, 1.2, 0.6, 0, TAU); ctx.ellipse(t.x + w * 0.5, t.y - 1, 2.4, 1.2, -0.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // A spirit beast appears in a swirl of leaves; it leaves the same way.
  beastSpawn(pet, rank = 1) {
    const R = this.rand;
    const { color } = ELEMENT_LOOKS.wild;
    this._add({ kind: "bloom", x: pet.x, y: pet.y - 4, r: 22 + rank * 3, color, life: 0.5 });
    for (let i = 0; i < this._count(10); i += 1) {
      const a = (i / 10) * TAU;
      this._add({ kind: "leaf", x: pet.x + Math.cos(a) * 18, y: pet.y + Math.sin(a) * 8, vx: -Math.sin(a) * 70 - Math.cos(a) * 20, vy: Math.cos(a) * 30 - 30, rot: a, spin: 7, size: 3, color: R() < 0.5 ? color : "#5EE6A0", life: 0.6 });
    }
  }

  beastFade(pet) {
    const R = this.rand;
    for (let i = 0; i < this._count(8); i += 1) {
      this._add({ kind: "leaf", x: pet.x + (R() - 0.5) * 16, y: pet.y - 4, vx: (R() - 0.5) * 50, vy: -30 - R() * 30, rot: R() * TAU, spin: 5, size: 2.6, color: ELEMENT_LOOKS.wild.color, life: 0.7, gravity: 60 });
    }
    this._add({ kind: "mote", x: pet.x, y: pet.y - 4, vx: 0, vy: -20, size: 6, color: ELEMENT_LOOKS.wild.light, life: 0.5 });
  }

  // A dragon's breath: a cone of fire from the beast toward its target.
  breath(pet, target, range) {
    const R = this.rand;
    const a = Math.atan2(target.y - pet.y, target.x - pet.x);
    for (let i = 0; i < this._count(16); i += 1) {
      const spread = (R() - 0.5) * 1.1;
      const s = range * (1.6 + R() * 1.4);
      this._add({ kind: "flame", x: pet.x, y: pet.y - 6, vx: Math.cos(a + spread) * s, vy: Math.sin(a + spread) * s, size: 5 + R() * 5, core: "#FFF1C2", edge: "#FF6A1A", life: 0.35 + R() * 0.15 });
    }
  }

  // Hero effects drawn each frame: Lifeline's golden ring, Barrier's hexagon
  // shell (1–3 layers), Aegis's dome.
  _drawWard(ctx, aura) {
    const t = aura.target;
    const left = aura.until - this.time;
    const fadeOut = Math.min(1, left / 0.4);
    const snap = Math.min(1, (this.time - aura.born) / 0.15);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    if (aura.element === "lifeline") {
      const beat = (Math.sin(this.time * 7) + 1) / 2;
      ctx.strokeStyle = rgba("#FFD36B", (0.45 + 0.35 * beat) * fadeOut); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(t.x, t.y + 8, 15 + beat * 2, 6 + beat, 0, 0, TAU); ctx.stroke();
    } else if (aura.element === "barrier") {
      const { color, light } = ELEMENT_LOOKS.warding;
      for (let i = 0; i < aura.look.layers; i += 1) {
        const r = (21 + i * 5) * (0.6 + 0.4 * snap);
        const flicker = 0.8 + 0.2 * Math.sin(this.time * 9 + i * 2);
        ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.strokeStyle = rgba(i % 2 ? light : color, 0.95 * flicker * fadeOut); ctx.lineWidth = 2.2;
        ctx.fillStyle = rgba(color, (i === 0 ? 0.1 : 0.04) * fadeOut);
        ctx.beginPath();
        for (let k = 0; k <= 6; k += 1) {
          const a = (k / 6) * TAU + aura.spin * 0.3 + i * 0.5 + this.time * (i % 2 ? -0.6 : 0.6);
          const px = t.x + Math.cos(a) * r;
          const py = t.y - 6 + Math.sin(a) * r;
          if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.fill(); ctx.stroke();
      }
    } else if (aura.element === "aegis") {
      const { color, light } = ELEMENT_LOOKS.warding;
      const r = 24 * (0.5 + 0.5 * snap);
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      g.addColorStop(0, rgba(color, 0)); g.addColorStop(1, rgba(color, 0.22 * fadeOut));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(t.x, t.y + 6, r, r * 1.25, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(light, 0.7 * fadeOut); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(t.x, t.y + 6, r, r * 1.25, 0, Math.PI, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  _drawParticle(ctx, p) {
    const life = Math.max(0.0001, p.life - (p.delay || 0));
    const k = Math.min(1, (p.age - (p.delay || 0)) / life);
    const fade = 1 - k;
    ctx.globalCompositeOperation = ["smoke", "mist", "fizzleText", "warning", "ghost"].includes(p.kind) ? "source-over" : "lighter";
    switch (p.kind) {
      case "ember": case "glint": {
        ctx.fillStyle = rgba(p.color, fade);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * fade), 0, TAU); ctx.fill();
        break;
      }
      case "flame": {
        const r = p.size * (0.5 + 0.7 * fade);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, rgba(p.core, 0.95 * fade));
        g.addColorStop(0.45, rgba(p.edge, 0.7 * fade));
        g.addColorStop(1, rgba(p.edge, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 0.8, r * 1.25, 0, 0, TAU); ctx.fill();
        break;
      }
      case "ghost": {
        ctx.strokeStyle = rgba(p.color, 0.5 * fade); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 8, 7, 12, 0, 0, TAU); ctx.stroke();
        break;
      }
      case "thorn": {
        const h = p.h * Math.min(1, k * 4);
        ctx.fillStyle = rgba(p.color, fade);
        ctx.beginPath(); ctx.moveTo(p.x - p.w, p.y); ctx.lineTo(p.x, p.y - h); ctx.lineTo(p.x + p.w, p.y); ctx.closePath(); ctx.fill();
        break;
      }
      case "mote": {
        const r = p.size * (0.7 + 0.5 * fade);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
        g.addColorStop(0, rgba(p.color, fade)); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, TAU); ctx.fill();
        break;
      }
      case "leaf": {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillStyle = rgba(p.color, 0.85 * fade);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.7, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = rgba("#E8FFF2", 0.6 * fade); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-p.size * 1.4, 0); ctx.lineTo(p.size * 1.4, 0); ctx.stroke();
        ctx.restore();
        break;
      }
      case "bloom": {
        const r = p.r * (0.6 + 0.6 * Math.sqrt(k));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, rgba("#FFFFFF", 0.55 * fade)); g.addColorStop(0.5, rgba(p.color, 0.35 * fade)); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        break;
      }
      case "hex": {
        const r = p.shrinkTo != null ? p.r + (p.shrinkTo - p.r) * Math.min(1, k * 2) : p.r * (1 + (p.grow || 0) * k);
        ctx.strokeStyle = rgba(p.color, fade); ctx.lineWidth = p.width || 2;
        ctx.beginPath();
        for (let i = 0; i <= 6; i += 1) {
          const a = (i / 6) * TAU + Math.PI / 6;
          const px = p.x + Math.cos(a) * r;
          const py = p.y + Math.sin(a) * r;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
        break;
      }
      case "smoke": case "mist": {
        // Soft-edged puffs: dense in the middle, gone at the rim.
        const r = p.size * (0.8 + 0.8 * k);
        const alpha = (p.kind === "mist" ? 0.16 : 0.2) * fade * Math.min(1, k * 5);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, rgba(p.color, alpha));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
        break;
      }
      case "bubble": {
        ctx.strokeStyle = rgba(p.color, fade); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba("#FFFFFF", 0.6 * fade);
        ctx.beginPath(); ctx.arc(p.x - p.size * 0.35, p.y - p.size * 0.35, p.size * 0.25, 0, TAU); ctx.fill();
        break;
      }
      case "blob": {
        ctx.fillStyle = rgba(p.color, 0.9 * fade);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size, p.size * (1 + Math.min(0.8, Math.abs(p.vy || 0) / 300)), 0, 0, TAU); ctx.fill();
        break;
      }
      case "shard": case "flake": {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        if (p.kind === "shard") {
          ctx.fillStyle = rgba(p.color, fade);
          ctx.beginPath(); ctx.moveTo(0, -p.size * 1.6); ctx.lineTo(p.size * 0.6, 0); ctx.lineTo(0, p.size * 1.6); ctx.lineTo(-p.size * 0.6, 0); ctx.closePath(); ctx.fill();
        } else {
          ctx.strokeStyle = rgba(p.color, fade); ctx.lineWidth = 1;
          for (let i = 0; i < 3; i += 1) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-p.size, 0); ctx.lineTo(p.size, 0); ctx.stroke(); }
        }
        ctx.restore();
        break;
      }
      case "crack": {
        const len = p.len * Math.min(1, k * 4);
        ctx.strokeStyle = rgba(p.color, fade); ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        const mx = p.x + Math.cos(p.a + 0.25) * len * 0.5;
        const my = p.y + Math.sin(p.a + 0.25) * len * 0.5;
        ctx.lineTo(mx, my); ctx.lineTo(p.x + Math.cos(p.a) * len, p.y + Math.sin(p.a) * len); ctx.stroke();
        break;
      }
      case "spark": {
        const len = p.size;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        ctx.strokeStyle = rgba(p.color, fade); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * len + (this.rand() - 0.5) * 3, p.y - (p.vy / sp) * len + (this.rand() - 0.5) * 3); ctx.stroke();
        break;
      }
      case "ring": {
        const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k);
        ctx.strokeStyle = rgba(p.color, fade); ctx.lineWidth = (p.width || 2) * fade + 0.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.6, 0, 0, TAU); ctx.stroke();
        break;
      }
      case "ripple": {
        const r = p.r0 + (p.r1 - p.r0) * k;
        ctx.strokeStyle = rgba(p.color, fade * 0.9); ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 40; i += 1) {
          const a = (i / 40) * TAU;
          const wobble = 1 + 0.08 * Math.sin(a * 6 + this.time * 10);
          const px = p.x + Math.cos(a) * r * wobble;
          const py = p.y + Math.sin(a) * r * wobble * 0.8;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
        break;
      }
      case "flash": {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, rgba("#FFFFFF", 0.9 * fade));
        g.addColorStop(0.4, rgba(p.color, 0.6 * fade));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        break;
      }
      case "star": case "glyphRing": {
        const sputter = p.sputter ? (Math.sin(p.age * 70) > 0 ? 1 : 0.25) : 1;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * (p.spin || 2));
        const r = p.kind === "star" ? p.r * (1 + (p.grow || 0) * k) : p.r;
        ctx.strokeStyle = rgba(p.color, fade * sputter); ctx.lineWidth = p.kind === "star" ? 2.4 : 1.6;
        ctx.beginPath();
        const n = p.points || 5;
        for (let i = 0; i <= n * 2; i += 1) {
          const a = (i / (n * 2)) * TAU;
          const rr = i % 2 ? r * (p.kind === "star" ? 0.35 : 0.78) : r;
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr * (p.kind === "glyphRing" ? 0.55 : 1);
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
        if (p.kind === "glyphRing") { ctx.beginPath(); ctx.ellipse(0, 0, r * 1.12, r * 0.62, 0, 0, TAU); ctx.stroke(); }
        ctx.restore();
        break;
      }
      case "missile": {
        const { element, look } = p;
        if (element === "fire") {
          const r = 7 * look.size;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.6);
          g.addColorStop(0, rgba(look.core, 1)); g.addColorStop(0.5, rgba(look.edge, 0.8)); g.addColorStop(1, rgba(look.edge, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.6, 0, TAU); ctx.fill();
        } else if (element === "ice") {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.ty - p.sy, p.tx - p.sx) + p.spin * 0.15);
          for (let i = 0; i < look.shards; i += 1) {
            const off = (i - (look.shards - 1) / 2) * 5;
            const s = (i === Math.floor(look.shards / 2) ? 9 : 6) * look.size;
            ctx.fillStyle = rgba(i % 2 ? p.light : p.color, 1);
            ctx.beginPath(); ctx.moveTo(s, off); ctx.lineTo(0, off - 2.5); ctx.lineTo(-s * 0.7, off); ctx.lineTo(0, off + 2.5); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        } else if (element === "poison") {
          ctx.fillStyle = rgba(p.color, 0.95);
          ctx.beginPath(); ctx.arc(p.x, p.y, 3 + look.trail, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(p.light, 0.8);
          ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1.5, 1.6, 0, TAU); ctx.fill();
        } else {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin);
          ctx.fillStyle = rgba(p.light, 1);
          ctx.beginPath();
          for (let i = 0; i <= 8; i += 1) {
            const a = (i / 8) * TAU;
            const rr = i % 2 ? 2.4 : 8;
            if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "rock": {
        ctx.fillStyle = "#5B3A2E";
        ctx.beginPath(); ctx.arc(p.x, p.y, 9, 0, TAU); ctx.fill();
        ctx.strokeStyle = "#FFB066"; ctx.lineWidth = 2; ctx.stroke();
        break;
      }
      case "warning": {
        const pulse = 0.5 + 0.5 * Math.sin(p.age * 10);
        ctx.strokeStyle = rgba(p.color, 0.5 + 0.4 * pulse); ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]); ctx.lineDashOffset = -p.age * 30;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        const inner = p.r * (1 - k);
        ctx.strokeStyle = rgba("#FFB066", 0.8); ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(2, inner), Math.max(1, inner * 0.6), 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = rgba(p.color, 0.08 + 0.1 * k);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.6, 0, 0, TAU); ctx.fill();
        break;
      }
      case "fizzleText": {
        ctx.save(); ctx.translate(p.x, p.y - k * 10); ctx.rotate(Math.sin(p.age * 28) * 0.16 * fade);
        ctx.font = "800 12px Unbounded, JetBrains Mono, monospace";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = rgba("#0B0F16", 0.7 * fade); ctx.fillText("FIZZLE", 1, 1);
        ctx.fillStyle = rgba(p.color, fade); ctx.fillText("FIZZLE", 0, 0);
        ctx.restore();
        break;
      }
      default: break;
    }
  }

  _drawBeam(ctx, beam) {
    const fade = 1 - beam.age / beam.life;
    ctx.globalCompositeOperation = "lighter";
    if (beam.kind === "lightning") {
      // Re-drawn with fresh jitter every frame, so it crackles.
      const paths = [];
      for (let f = 0; f < beam.forks; f += 1) {
        const pts = [beam.from];
        const steps = 7;
        for (let i = 1; i < steps; i += 1) {
          const t = i / steps;
          const nx = -(beam.to.y - beam.from.y);
          const ny = beam.to.x - beam.from.x;
          const len = Math.hypot(nx, ny) || 1;
          const off = (this.rand() - 0.5) * 2 * beam.jitter * (f ? 1.6 : 1);
          pts.push({ x: beam.from.x + (beam.to.x - beam.from.x) * t + (nx / len) * off, y: beam.from.y + (beam.to.y - beam.from.y) * t + (ny / len) * off });
        }
        pts.push(beam.to);
        paths.push(pts);
      }
      for (const [width, color, alpha] of [[6, beam.color, 0.35], [2.2, beam.light, 1]]) {
        ctx.strokeStyle = rgba(color, alpha * fade); ctx.lineWidth = width; ctx.lineJoin = "miter";
        for (const pts of paths) {
          ctx.beginPath();
          pts.forEach((pt, i) => (i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)));
          ctx.stroke();
        }
      }
    } else if (beam.kind === "wave") {
      const dx = beam.to.x - beam.from.x;
      const dy = beam.to.y - beam.from.y;
      const len = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, (beam.age / beam.life) * 2.2);
      for (const [width, color, alpha] of [[5, beam.color, 0.35], [1.8, beam.light, 0.95]]) {
        ctx.strokeStyle = rgba(color, alpha * fade); ctx.lineWidth = width;
        ctx.beginPath();
        for (let i = 0; i <= 48; i += 1) {
          const t = (i / 48) * reach;
          const wave = Math.sin(t * len * 0.09 - beam.age * beam.pulse * TAU) * 7;
          const px = beam.from.x + dx * t + (-dy / len) * wave;
          const py = beam.from.y + dy * t + (dx / len) * wave;
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
      }
    }
  }

  _drawAuraBase(ctx, aura) {
    if (aura.element === "poison" || aura.element === "fire") {
      // A sickly green (poison) or ember-red (burning) glow on the foe.
      const t = aura.target;
      const r = t.boss ? 34 : 18;
      const color = aura.element === "poison" ? ELEMENT_LOOKS.poison.color : aura.look.edge;
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 6 + aura.spin);
      const g = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, r);
      g.addColorStop(0, rgba(color, 0.22 * pulse));
      g.addColorStop(1, rgba(color, 0));
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    if (aura.element !== "ice") return;
    // Frozen: a pale crust of crystals around the foe's feet.
    const t = aura.target;
    const w = t.boss ? 26 : 13;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const n = 7;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU + aura.spin * 0.2;
      const x = t.x + Math.cos(a) * w;
      const y = t.y + 8 + Math.sin(a) * w * 0.35;
      ctx.fillStyle = rgba(i % 2 ? ELEMENT_LOOKS.ice.light : ELEMENT_LOOKS.ice.color, 0.75);
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 2.5, y); ctx.lineTo(x, y + 2); ctx.lineTo(x - 2.5, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  _drawDazed(ctx, aura) {
    // Stunned: little stars and a spiral circling the head, faster with rank.
    const t = aura.target;
    const head = t.y - (t.boss ? 40 : 22);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3; i += 1) {
      const a = aura.spin * 2 + (i / 3) * TAU;
      const x = t.x + Math.cos(a) * 12;
      const y = head + Math.sin(a) * 4;
      ctx.fillStyle = rgba(i === 0 ? "#FFE600" : ELEMENT_LOOKS.mind.light, 0.95);
      ctx.beginPath();
      for (let k = 0; k <= 8; k += 1) {
        const b = (k / 8) * TAU;
        const rr = k % 2 ? 1.2 : 3.4;
        if (k) ctx.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); else ctx.moveTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr);
      }
      ctx.fill();
    }
    ctx.strokeStyle = rgba(ELEMENT_LOOKS.mind.color, 0.8); ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let k = 0; k <= 30; k += 1) {
      const b = (k / 30) * TAU * 2 - aura.spin * 3;
      const rr = (k / 30) * 7;
      const x = t.x + Math.cos(b) * rr;
      const y = head - 8 + Math.sin(b) * rr * 0.5;
      if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}
