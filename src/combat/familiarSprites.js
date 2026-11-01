// Animated familiars on the battle canvas, drawn from shapes (no images):
// the wolf runs on four legs, the hawk flaps, the imp flickers, the sprite
// glows and flutters, the tortoise stomps. Summoned spirit beasts (tiger, wolf,
// hawk, bat, rat, wasp, spider, dragon) glow green and half see-through.
// Each has walk (or hover), attack,
// hurt and downed poses, faces where it's going, and glows brighter with its
// level. Drawing only; no imports, so it can also be rendered on its own.

const TAU = Math.PI * 2;

// `pet`: { stats: { species, color }, x, y, face, moving, strikeAt, hurtAt,
// down, hp, maxHp, level, owner: { i, d: { color } } }.
export function drawFamiliar(ctx, pet, time) {
  if (!ctx) return;
  const species = pet.stats?.species;
  const color = pet.stats?.color || "#CBD5E1";
  const level = Math.max(1, Math.min(10, pet.level || 1));
  const seed = (pet.owner?.i || 0) * 1.7;
  const striking = time - (pet.strikeAt ?? -99) < 0.22;
  const strikeK = striking ? 1 - (time - pet.strikeAt) / 0.22 : 0;
  const hurt = time - (pet.hurtAt ?? -99) < 0.25;
  ctx.save();
  ctx.translate(pet.x, pet.y);
  if (pet.down) {
    // Downed: lies on its side, grey and dim, until the fight is over.
    ctx.globalAlpha = 0.55;
    ctx.rotate(Math.PI / 2.4 * (pet.face || 1));
  }
  ctx.scale((pet.face || 1) * 1.4, 1.4);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const line = pet.down ? "#64748B" : hurt ? "#FF5A7A" : color;
  ctx.strokeStyle = line;
  ctx.fillStyle = "#0B1018";
  ctx.lineWidth = 1.4;
  ctx.shadowBlur = pet.down ? 0 : 5 + level * 1.1;
  ctx.shadowColor = pet.owner?.d?.color || color;
  if (pet.summoned) {
    // A spirit: see-through, with a green glow that pulses.
    ctx.globalAlpha *= 0.82;
    ctx.shadowColor = "#9BE15D";
    ctx.shadowBlur = 10 + Math.sin(time * 6) * 3;
    if (species === "dragon") ctx.scale(1.5, 1.5);
  }
  const draw = DRAW[species] || DRAW.wolf;
  draw(ctx, { time: time + seed, moving: pet.moving && !pet.down, strikeK, line, color, level, down: pet.down });
  ctx.restore();
  if (!pet.down && pet.maxHp && pet.hp < pet.maxHp) drawBar(ctx, pet);
}

function drawBar(ctx, pet) {
  const w = 22;
  const k = Math.max(0, pet.hp / pet.maxHp);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(pet.x - w / 2, pet.y - 22, w, 3);
  ctx.fillStyle = k > 0.5 ? "#39FF14" : k > 0.25 ? "#FFE600" : "#FF2A5F";
  ctx.fillRect(pet.x - w / 2, pet.y - 22, w * k, 3);
  ctx.restore();
}

// Each species, drawn facing right around (0, 0); about 20 × 14 before scaling.
const DRAW = {
  wolf(ctx, { time, moving, strikeK }) {
    const run = moving ? Math.sin(time * 16) : 0;
    const lunge = strikeK * 5;
    ctx.translate(lunge, moving ? Math.abs(Math.sin(time * 16)) * -1.2 : 0);
    // legs: two pairs swinging opposite
    ctx.beginPath();
    for (const [x, phase] of [[-5, 1], [-3, -1], [3, -1], [5, 1]]) {
      const swing = run * 3 * phase;
      ctx.moveTo(x, 2); ctx.lineTo(x + swing, 7);
    }
    ctx.stroke();
    // body and tail
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.6, 0, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -1); ctx.quadraticCurveTo(-11, -4 + run, -12, -1 + run); ctx.stroke();
    // head with ears and snout (jaw opens on a bite)
    ctx.beginPath();
    ctx.moveTo(5, -2); ctx.lineTo(8, -6); ctx.lineTo(9, -3); ctx.lineTo(11, -7); ctx.lineTo(11.5, -3);
    ctx.lineTo(15, -2); ctx.lineTo(11, 0 + strikeK * 2); ctx.lineTo(6, 1); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(11, -3.5, 0.9, 0, TAU); ctx.fill();
  },
  hawk(ctx, { time, strikeK }) {
    const flap = Math.sin(time * 13);
    ctx.translate(strikeK * 6, Math.sin(time * 3) * 2 + strikeK * 4);
    // wings
    ctx.beginPath();
    ctx.moveTo(-1, 0); ctx.quadraticCurveTo(-6, -4 - flap * 5, -12, -2 - flap * 7);
    ctx.quadraticCurveTo(-6, 1, -1, 1.5);
    ctx.moveTo(1, 0); ctx.quadraticCurveTo(4, -4 - flap * 5, 9, -3 - flap * 6);
    ctx.quadraticCurveTo(4, 1, 1, 1.5);
    ctx.fill(); ctx.stroke();
    // body, tail, hooked beak
    ctx.beginPath();
    ctx.ellipse(1, 1, 5, 2.4, -0.1, 0, TAU);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 1); ctx.lineTo(-8, 3); ctx.lineTo(-4, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5.5, 0); ctx.lineTo(8.5, 0.5); ctx.lineTo(6.5, 2); ctx.stroke();
    ctx.fillStyle = "#FFE600"; ctx.beginPath(); ctx.arc(5, -0.2, 0.8, 0, TAU); ctx.fill();
  },
  imp(ctx, { time, moving, strikeK, level }) {
    const flicker = 0.85 + 0.15 * Math.sin(time * 23) * Math.sin(time * 7);
    ctx.translate(0, moving ? Math.sin(time * 14) * 1.2 : Math.sin(time * 4) * 0.8);
    // body, horns, tail
    ctx.beginPath();
    ctx.moveTo(-4, 5); ctx.lineTo(-5, -1); ctx.lineTo(-6, -6); ctx.lineTo(-2, -3); ctx.lineTo(2, -3);
    ctx.lineTo(6, -6); ctx.lineTo(5, -1); ctx.lineTo(4, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 4); ctx.quadraticCurveTo(-9, 6, -9, 1); ctx.lineTo(-10, -1); ctx.stroke();
    ctx.fillStyle = "#FFE600"; ctx.beginPath(); ctx.arc(-1.6, -0.8, 0.8, 0, TAU); ctx.arc(1.8, -0.8, 0.8, 0, TAU); ctx.fill();
    // the spark in its hand, flaring when it throws
    const r = (1.8 + strikeK * 3 + level * 0.12) * flicker;
    const g = ctx.createRadialGradient(7, 0, 0, 7, 0, r * 2.2);
    g.addColorStop(0, "rgba(255,240,200,0.95)"); g.addColorStop(0.5, "rgba(255,120,40,0.8)"); g.addColorStop(1, "rgba(255,80,20,0)");
    ctx.shadowBlur = 0;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(7, 0, r * 2.2, 0, TAU); ctx.fill();
  },
  sprite(ctx, { time, level }) {
    const flutter = Math.sin(time * 18);
    ctx.translate(0, Math.sin(time * 3.2) * 2.5);
    const glow = 6 + level * 0.6 + Math.sin(time * 5) * 1.5;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, glow);
    g.addColorStop(0, "rgba(240,255,247,0.95)"); g.addColorStop(0.45, "rgba(167,243,208,0.5)"); g.addColorStop(1, "rgba(167,243,208,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, glow, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0B1018";
    ctx.beginPath();
    ctx.moveTo(-1, -1); ctx.quadraticCurveTo(-8, -7 - flutter * 3, -7, 1);
    ctx.moveTo(1, -1); ctx.quadraticCurveTo(8, -7 - flutter * 3, 7, 1);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, TAU); ctx.fill(); ctx.stroke();
  },
  tiger(ctx, args) {
    DRAW.wolf(ctx, args);
    // stripes over the wolf-like frame, and a heavier jaw
    ctx.strokeStyle = "#FF8A00"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const x of [-4, -1, 2]) { ctx.moveTo(x, -3); ctx.lineTo(x + 1, 1); }
    ctx.stroke();
  },
  bat(ctx, { time, strikeK }) {
    const flap = Math.sin(time * 16);
    ctx.translate(strikeK * 5, Math.sin(time * 4) * 2);
    ctx.beginPath();
    for (const side of [-1, 1]) {
      ctx.moveTo(0, 0);
      ctx.lineTo(side * 5, -3 - flap * 4); ctx.lineTo(side * 9, -1 - flap * 5); ctx.lineTo(side * 11, 2 - flap * 3);
      ctx.lineTo(side * 8, 1); ctx.lineTo(side * 6, 3); ctx.lineTo(side * 3, 1.5); ctx.closePath();
    }
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0.5, 2.6, 3.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1.6, -2.2); ctx.lineTo(-2.2, -4.6); ctx.moveTo(1.6, -2.2); ctx.lineTo(2.2, -4.6); ctx.stroke();
  },
  rat(ctx, { time, moving, strikeK }) {
    const run = moving ? Math.sin(time * 20) : 0;
    ctx.translate(strikeK * 3, 0);
    ctx.beginPath(); ctx.ellipse(0, 1, 5, 2.8, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(8, 1); ctx.lineTo(4, 2.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(3.6, -1.6, 1.3, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, 1); ctx.quadraticCurveTo(-10, -2 + run * 2, -12, 2); ctx.stroke();
  },
  wasp(ctx, { time, strikeK }) {
    const buzz = Math.sin(time * 40);
    ctx.translate(strikeK * 6, Math.sin(time * 5) * 2);
    ctx.globalAlpha *= 0.7;
    ctx.beginPath(); ctx.ellipse(-1, -4, 4, 2 + buzz, -0.3, 0, TAU); ctx.ellipse(2, -4, 4, 2 - buzz, 0.3, 0, TAU); ctx.stroke();
    ctx.globalAlpha /= 0.7;
    ctx.beginPath(); ctx.ellipse(-3, 1, 4.5, 2.6, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#0B1018"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-4, -1.4); ctx.lineTo(-4, 3.4); ctx.moveTo(-2, -1.6); ctx.lineTo(-2, 3.6); ctx.stroke();
    ctx.strokeStyle = "#FDE047"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(3, 0, 2.2, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7.5, 1); ctx.lineTo(-10 - strikeK * 2, 1.5); ctx.stroke();
  },
  spider(ctx, { time, moving, strikeK }) {
    const walk = moving ? Math.sin(time * 18) : 0;
    ctx.translate(strikeK * 3, 0);
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const x = -3 + i * 2;
      const lift = (i % 2 ? 1 : -1) * walk * 1.5;
      ctx.moveTo(x, 0); ctx.lineTo(x - 4, -4 + lift); ctx.lineTo(x - 6, 3);
      ctx.moveTo(x, 0); ctx.lineTo(x + 4, -4 - lift); ctx.lineTo(x + 6, 3);
    }
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-2, 0, 4, 3.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(3, 0, 2.2, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#FF2A5F"; ctx.beginPath(); ctx.arc(4, -0.6, 0.6, 0, TAU); ctx.arc(4, 0.8, 0.6, 0, TAU); ctx.fill();
  },
  dragon(ctx, { time, strikeK }) {
    const flap = Math.sin(time * 7);
    ctx.translate(0, Math.sin(time * 2.5) * 2);
    // wings
    ctx.beginPath();
    ctx.moveTo(-2, -1); ctx.lineTo(-7, -9 - flap * 4); ctx.lineTo(-4, -5); ctx.lineTo(-1, -9 - flap * 3); ctx.lineTo(2, -2);
    ctx.fill(); ctx.stroke();
    // body, tail, neck and horned head (jaw open when it breathes)
    ctx.beginPath(); ctx.ellipse(-1, 1, 6, 3.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, 1); ctx.quadraticCurveTo(-11, 4, -13, 0); ctx.lineTo(-11, -0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -1); ctx.quadraticCurveTo(6, -4, 8, -4);
    ctx.lineTo(11, -3); ctx.lineTo(8, -1.5 + strikeK * 2.5); ctx.lineTo(5, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(7, -7); ctx.stroke();
    ctx.fillStyle = "#FFE600"; ctx.beginPath(); ctx.arc(9, -3, 0.7, 0, TAU); ctx.fill();
  },
  tortoise(ctx, { time, moving, strikeK }) {
    const stomp = moving ? Math.sin(time * 7) : 0;
    ctx.translate(strikeK * 2, 0);
    // legs
    ctx.beginPath();
    for (const [x, phase] of [[-5, 1], [5, -1]]) {
      ctx.moveTo(x, 3); ctx.lineTo(x + stomp * phase * 1.5, 6.5 - Math.max(0, stomp * phase) * 1.5);
    }
    ctx.lineWidth = 2.2; ctx.stroke(); ctx.lineWidth = 1.4;
    // head
    ctx.beginPath(); ctx.ellipse(9.5 + strikeK * 1.5, 0.5, 2.6, 2, 0, 0, TAU); ctx.fill(); ctx.stroke();
    // domed shell with a hex pattern
    ctx.beginPath();
    ctx.moveTo(-9, 3); ctx.quadraticCurveTo(-8, -8, 0, -8); ctx.quadraticCurveTo(8, -8, 9, 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 6; i += 1) {
      const a = (i / 6) * TAU + Math.PI / 6;
      const px = Math.cos(a) * 3.2;
      const py = -2.5 + Math.sin(a) * 2.4;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.moveTo(-3.2, -1.3); ctx.lineTo(-7, 0); ctx.moveTo(3.2, -1.3); ctx.lineTo(7, 0); ctx.moveTo(0, -4.9); ctx.lineTo(0, -7.6);
    ctx.stroke();
  },
};
