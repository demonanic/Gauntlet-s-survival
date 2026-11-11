// The battle scene (Phase 8A): reads the engine's state and draws it; decides
// nothing and changes nothing in the fight. Sprites: heroSprites.js,
// enemySprites.js, familiarSprites.js.
import { combatVfxAssetId, drawCombatVfx, getCombatVfxImage } from "../combatVfx";
import { drawFamiliar } from "../familiarSprites";
import { drawEnemySprite } from "./enemySprites";
import { drawHeroSprite } from "./heroSprites";
import { FLOOR_Y, H, W } from "../arena";
import { CAPTIVE_REACH, EXIT_Y } from "../goals";

const combatVfxImages = new Map();
function getCombatEffectImage(assetId) {
  return getCombatVfxImage(assetId, combatVfxImages);
}

// ---------------- rendering ----------------
export function renderBattle(engine) {
  const ctx = engine.ctx;
  ctx.clearRect(0, 0, W, H);
  // field
  ctx.fillStyle = "#12131A"; ctx.fillRect(0, 0, W, H);
  // subtle grid
  ctx.strokeStyle = "rgba(255,255,255,0.03)"; ctx.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 42) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
  for (let gy = 0; gy <= H; gy += 42) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

  // arena boundary
  neonLine(engine, 0, 6, W, 6, "#A855F7", 2);
  neonLine(engine, 0, FLOOR_Y, W, FLOOR_Y, "#A855F7", 2);

  drawGoalGround(ctx, engine.goal, engine);

  const targetHighlights = new Set(
    engine.targetingHero == null
      ? []
      : (engine.getRangedTargetStatus(engine.targetingHero)?.targets || []).map((target) => target.enemy)
  );

  // enemies — top-down sprites face DOWN toward the party.
  for (const e of engine.active) {
    const r = e.boss ? 25 : e.tier === "elite" ? 16 : 11;
    drawEnemySprite(engine, e);
    bar(engine, e.x - r, e.y - r - 7, r * 2, 3, e.hp / e.maxHp, e.color);
    // The Ritualist's ritual: how close it is to done.
    if (e.channelUntil != null && e.channelStart != null) {
      const done = Math.min(1, (engine.time - e.channelStart) / (e.channelUntil - e.channelStart));
      bar(engine, e.x - r, e.y + r + 6, r * 2, 4, done, "#FDE68A");
    }
    // Free Roam's Warded twist: a pale ring while its leaders' ward holds (no glow: cheap).
    if (e.warded && engine._foeWardCut(e) < 1) {
      ctx.save();
      ctx.strokeStyle = "rgba(56,189,248,0.7)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // (The exit and the captive are drawn once, below the enemies loop.)
    // Story goals (goals.js): the foe to kill before it flees, the raiders
    // going for the wagon, and the objects to break.
    const goalMark = e.quarry ? ["TARGET", "#FF2A5F"] : e.goalObject ? ["BREAK", "#FDE68A"]
      : e.thief && engine.goal?.kind === "hold" ? ["RAIDER", "#FBBF24"] : null;
    if (goalMark && e.hp > 0) {
      ctx.save();
      ctx.strokeStyle = goalMark[1]; ctx.fillStyle = goalMark[1]; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center"; ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.fillText(goalMark[0], e.x, e.y - r - 12);
      ctx.restore();
    }
    if (e.nemesisId && e.hp > 0) {
      ctx.save();
      ctx.textAlign = "center"; ctx.font = "bold 10px JetBrains Mono, monospace";
      ctx.fillStyle = "#F59E0B"; ctx.strokeStyle = "#F59E0B"; ctx.shadowBlur = 8; ctx.shadowColor = "#F59E0B";
      // A gold ring marks it; its name stays on screen even at the arena's edge.
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, Math.PI * 2); ctx.stroke();
      const label = `${e.name} · LV ${e.nemesisLevel}`;
      const half = ctx.measureText(label).width / 2 + 4;
      ctx.fillText(label, Math.min(W - half, Math.max(half, e.x)), e.y - r - 12);
      ctx.restore();
    }
    if (targetHighlights.has(e)) {
      ctx.save();
      ctx.strokeStyle = "#39FF14";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#39FF14";
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (e.type === "reaper" && e.hp > 0) {
      ctx.save();
      ctx.strokeStyle = "#A855F7";
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#A855F7";
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 4 + 2 * Math.sin(engine.time * 6), 0, 7);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "darkElf" && e.hp > 0) {
      ctx.save(); ctx.strokeStyle = "#F43F5E"; ctx.lineWidth = 1.4; ctx.shadowBlur = 10; ctx.shadowColor = "#F43F5E";
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 5 + 2 * Math.sin(engine.time * 8), 0, 7); ctx.stroke();
      // Sniper aim: a thin line to the target that brightens before the shot.
      if (e.aimUntil != null && e.aimTarget) {
        ctx.globalAlpha = 0.35 + 0.65 * Math.max(0, 1 - (e.aimUntil - engine.time) / 0.9);
        ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.aimTarget.x, e.aimTarget.y); ctx.stroke();
      }
      ctx.restore();
    } else if (e.bomber && e.fuseAt != null && e.hp > 0) {
      // Lit fuse: a fast-blinking blast radius.
      ctx.save(); ctx.strokeStyle = "#FB923C"; ctx.lineWidth = 2; ctx.shadowBlur = 14; ctx.shadowColor = "#FB923C";
      ctx.globalAlpha = Math.sin(engine.time * 40) > 0 ? 0.9 : 0.3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 72, 0, 7); ctx.stroke(); ctx.restore();
    } else if (e.blitzUntil > engine.time && e.hp > 0) {
      ctx.save(); ctx.strokeStyle = e.color; ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = e.color; ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, 7); ctx.stroke(); ctx.restore();
    } else if (e.raisingUntil != null && e.hp > 0) {
      ctx.save(); ctx.strokeStyle = e.color; ctx.lineWidth = 1.5; ctx.shadowBlur = 12; ctx.shadowColor = e.color; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 8 + 3 * Math.sin(engine.time * 10), 0, 7); ctx.stroke(); ctx.restore();
    } else if (e.type === "warlock" && e.hp > 0) {
      ctx.save(); ctx.strokeStyle = "#C026D3"; ctx.lineWidth = 1.4; ctx.shadowBlur = 10; ctx.shadowColor = "#C026D3"; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(e.x, e.y, r + 6, 0, 7); ctx.stroke(); ctx.restore();
    } else if (e.type === "lieutenant" && e.hp > 0) {
      ctx.save();
      ctx.strokeStyle = "#00F3FF";
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(e.x, e.y, 105, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
    if (engine.heroes.some((h) => h.manual && h.manualTarget === e)) {
      ctx.save();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(e.x, e.y, r + 7, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  // heroes — top-down sprites face UP toward incoming enemies.
  for (const h of engine.heroes) {
    if (h.away) continue; // gone to camp (a Free Roam swap)
    if (h.i === engine.selectedHero && h.alive) {
      ctx.save();
      ctx.strokeStyle = h.manual ? "#F0ABFC" : h.d.color;
      ctx.lineWidth = h.manual ? 2 : 1.5;
      ctx.shadowBlur = 12;
      ctx.shadowColor = h.manual ? "#D946EF" : h.d.color;
      ctx.beginPath();
      ctx.arc(h.x, h.y + 2, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drawHeroSprite(engine, h);
    bar(engine, h.x - 18, h.y + 20, 36, 4, Math.max(0, h.ref.hp) / h.d.maxHp, h.d.color);
    // Story bosses: a hero caught in the Chronomancer's field, or confused by the Ancient Evil.
    if (h.alive && (h.timeSlowUntil > engine.time || h.confusedUntil > engine.time)) {
      ctx.save();
      ctx.textAlign = "center"; ctx.font = "bold 11px JetBrains Mono, monospace";
      ctx.fillStyle = h.confusedUntil > engine.time ? "#E879F9" : "#38BDF8";
      ctx.fillText(h.confusedUntil > engine.time ? "?" : "⧗", h.x, h.y - 26);
      ctx.restore();
    }
  }
  for (const pet of engine.pets) drawPet(engine, pet);

  // Manual command markers make every battlefield command visually verifiable.
  for (const h of engine.heroes) {
    if (h.away) continue; // gone to camp (a Free Roam swap)
    if (!h.manual || !h.alive) continue;
    if (h.manualPoint) {
      ctx.save();
      ctx.strokeStyle = "#00F3FF";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#00F3FF";
      ctx.beginPath();
      ctx.arc(h.manualPoint.x, h.manualPoint.y, 9 + 2 * Math.sin(engine.time * 8), 0, Math.PI * 2);
      ctx.moveTo(h.manualPoint.x - 14, h.manualPoint.y); ctx.lineTo(h.manualPoint.x + 14, h.manualPoint.y);
      ctx.moveTo(h.manualPoint.x, h.manualPoint.y - 14); ctx.lineTo(h.manualPoint.x, h.manualPoint.y + 14);
      ctx.stroke();
      ctx.restore();
    }
    if (h.manualTarget && h.manualTarget.hp > 0) {
      ctx.save();
      ctx.strokeStyle = "#FFE600";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 12;
      ctx.shadowColor = "#FFE600";
      ctx.beginPath();
      ctx.arc(h.manualTarget.x, h.manualTarget.y, 18 + 2 * Math.sin(engine.time * 9), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Spell marks: a reticle in the hero's colour on the foe they cast at.
  for (const h of engine.heroes) {
    if (h.away) continue; // gone to camp (a Free Roam swap)
    const foe = h.alive && h.spellTarget;
    if (!foe || foe.hp <= 0) continue;
    const r = (foe.boss ? 30 : foe.tier === "elite" ? 21 : 16) + 1.5 * Math.sin(engine.time * 6 + h.i);
    ctx.save();
    ctx.strokeStyle = h.d.color;
    ctx.lineWidth = 1.8;
    ctx.shadowBlur = 10;
    ctx.shadowColor = h.d.color;
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(foe.x, foe.y, r, a - 0.45, a + 0.45);
      ctx.stroke();
    }
    ctx.restore();
  }

  // projectiles
  for (const p of engine.projectiles) {
    ctx.save();
    if (p.vfxAssetId) {
      const image = getCombatEffectImage(p.vfxAssetId);
      if (drawCombatVfx(ctx, image, { kind: "projectile", x: p.x, y: p.y,
        rotation: Math.atan2(p.ty - p.y, p.tx - p.x), life: 1, vfxSize: 50 }, 0.96)) {
        ctx.restore();
        continue;
      }
    }
    if (p.kind === "napalm") {
      // Where it will land.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#FF6600";
      ctx.lineWidth = 1.5;
      ctx.setLineDash?.([4, 4]);
      ctx.beginPath(); ctx.arc(p.tx, p.ty, p.splash || 68, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.shadowBlur = 18; ctx.shadowColor = "#FF6600";
      ctx.fillStyle = "#FF6600";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#FFE600";
      ctx.beginPath();
      ctx.arc(p.x - 2, p.y - 2, 2.5, 0, 7);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,102,0,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 12, p.y + 5);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else if (p.magic) {
      // Arcane shots are diamonds so they remain visually distinct from arrows.
      ctx.shadowBlur = 14; ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5); ctx.lineTo(p.x + 5, p.y);
      ctx.lineTo(p.x, p.y + 5); ctx.lineTo(p.x - 5, p.y); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 0.8; ctx.stroke();
    } else {
      // Physical shots get a short directional streak.
      ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5;
      const dx = p.tx - p.x, dy = p.ty - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(p.x - ux * 7, p.y - uy * 7);
      ctx.lineTo(p.x + ux * 3, p.y + uy * 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  // effects
  for (const fx of engine.effects) {
    const alpha = Math.max(0, Math.min(1, fx.life * 2.2));
    ctx.save();
    const vfxAsset = combatVfxAssetId(fx);
    if (vfxAsset && drawCombatVfx(ctx, getCombatEffectImage(vfxAsset), fx, alpha)) {
      ctx.restore();
      continue;
    }

    if (fx.kind === "shared_strike") {
      const radius = fx.r + (1 - fx.life) * 26;
      ctx.globalAlpha = alpha;
      ctx.lineCap = "round";
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#22D3EE";
      ctx.strokeStyle = "#22D3EE";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, -2.2, 0.55); ctx.stroke();
      ctx.shadowColor = "#F02DCA";
      ctx.strokeStyle = "#F02DCA";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, radius - 5, -2.05, 0.35); ctx.stroke();
    } else if (fx.kind === "weapon_swing") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 2.2;
      ctx.shadowBlur = 13; ctx.shadowColor = fx.color;
      const radius = fx.r + (1 - fx.life) * 9;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, -2.4, -0.2); ctx.stroke();
    } else if (fx.kind === "trail") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 4;
      ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
      ctx.beginPath(); ctx.moveTo(fx.x, fx.y); ctx.quadraticCurveTo((fx.x + fx.toX) / 2 - 8, (fx.y + fx.toY) / 2, fx.toX, fx.toY); ctx.stroke();
    } else if (fx.kind === "smoke") {
      ctx.globalAlpha = alpha * 0.75;
      ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
      for (let i = 0; i < 3; i += 1) {
        ctx.strokeStyle = i % 2 ? "#F02DCA" : fx.color;
        ctx.lineWidth = 3 - i * 0.5;
        ctx.beginPath(); ctx.arc(fx.x + (i - 1) * 4, fx.y - i * 3, fx.r * (0.45 + i * 0.16) + (1 - fx.life) * 9, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (fx.kind === "echo_mark" || fx.kind === "echo_hit" || fx.kind === "opening") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color; ctx.lineWidth = fx.kind === "opening" ? 2.8 : 2;
      ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
      const radius = fx.r + (1 - fx.life) * 15;
      ctx.beginPath();
      if (fx.kind === "opening") {
        for (let i = 0; i < 6; i += 1) {
          const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
          const x = fx.x + Math.cos(a) * radius, y = fx.y + Math.sin(a) * radius;
          if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
      } else ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (fx.kind === "guard" || fx.kind === "covenant" || fx.kind === "blood_price") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color; ctx.lineWidth = fx.kind === "blood_price" ? 3 : 2.5;
      ctx.shadowBlur = 16; ctx.shadowColor = fx.color;
      const radius = fx.r + (1 - fx.life) * 12;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, radius, fx.kind === "blood_price" ? -2.4 : 0, fx.kind === "blood_price" ? 0.5 : Math.PI * 2); ctx.stroke();
      if (fx.kind === "covenant") {
        ctx.strokeStyle = "#F9A8D4"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fx.x, fx.y, radius - 5, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (fx.kind === "death") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 2;
      ctx.shadowBlur = 14; ctx.shadowColor = fx.color;
      for (let i = 0; i < 5; i += 1) {
        const a = i * (Math.PI * 2 / 5);
        const r1 = 4 + (1 - fx.life) * 7, r2 = 13 + (1 - fx.life) * 23;
        ctx.beginPath(); ctx.moveTo(fx.x + Math.cos(a) * r1, fx.y + Math.sin(a) * r1);
        ctx.lineTo(fx.x + Math.cos(a) * r2, fx.y + Math.sin(a) * r2); ctx.stroke();
      }
    } else if (fx.kind === "fire") {
      const pulse = 1 + 0.12 * Math.sin(engine.time * 24 + fx.x);
      const base = 13 * pulse;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 22; ctx.shadowColor = "#FF6600";
      ctx.fillStyle = "#FF6600";
      ctx.beginPath(); ctx.arc(fx.x, fx.y, base, 0, 7); ctx.fill();
      ctx.fillStyle = "#FFE600";
      ctx.beginPath(); ctx.arc(fx.x - 2, fx.y - 4, base * 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.arc(fx.x - 3, fx.y - 6, base * 0.2, 0, 7); ctx.fill();
      // small rising flame tongues
      for (let i = 0; i < 3; i++) {
        const ox = (i - 1) * 7;
        const rise = 7 + ((engine.time * 22 + i * 9) % 12);
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = i === 1 ? "#FFE600" : "#FF6600";
        ctx.beginPath();
        ctx.arc(fx.x + ox, fx.y - rise, 4 - i * 0.5, 0, 7);
        ctx.fill();
      }
    } else if (fx.kind === "napalm") {
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 28; ctx.shadowColor = "#FF6600";
      ctx.strokeStyle = "#FF6600"; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r + (1 - fx.life) * 54, 0, 7); ctx.stroke();
      ctx.fillStyle = "#FF6600";
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 10 + (1 - fx.life) * 18, 0, 7); ctx.fill();
      ctx.fillStyle = "#FFE600";
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 4 + (1 - fx.life) * 9, 0, 7); ctx.fill();
    } else if (fx.kind === "charge") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "#FF6600"; ctx.lineWidth = 3;
      ctx.shadowBlur = 20; ctx.shadowColor = "#FF6600";
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r + (1 - fx.life) * 18, 0, 7); ctx.stroke();
      ctx.strokeStyle = "#FFE600";
      ctx.beginPath(); ctx.arc(fx.x, fx.y, 8 + (1 - fx.life) * 10, 0, 7); ctx.stroke();
    } else if (fx.kind === "hit") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = fx.crit ? 2.5 : 1.8;
      ctx.shadowBlur = 14; ctx.shadowColor = fx.color;
      const radius = fx.r + (1 - fx.life) * (fx.crit ? 12 : 8);
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, 7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(fx.x - radius * 0.8, fx.y);
      ctx.lineTo(fx.x + radius * 0.8, fx.y);
      ctx.moveTo(fx.x, fx.y - radius * 0.8);
      ctx.lineTo(fx.x, fx.y + radius * 0.8);
      ctx.stroke();
    } else if (fx.kind === "immune") {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 14; ctx.shadowColor = fx.color;
      const radius = fx.r + (1 - fx.life) * 10;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, radius, 0, 7);
      ctx.moveTo(fx.x - radius, fx.y);
      ctx.lineTo(fx.x + radius, fx.y);
      ctx.moveTo(fx.x, fx.y - radius);
      ctx.lineTo(fx.x, fx.y + radius);
      ctx.stroke();
    } else {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 2; ctx.shadowBlur = 12; ctx.shadowColor = fx.color;
      ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (1 - fx.life), 0, 7); ctx.stroke();
    }
    ctx.restore();
  }
  // spell effects (live battles)
  engine.vfx?.draw(ctx);
  // floaters
  ctx.textAlign = "center"; ctx.font = "bold 11px JetBrains Mono, monospace";
  for (const f of engine.floaters) {
    ctx.save(); ctx.globalAlpha = Math.max(0, f.life * 1.4);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); ctx.restore();
  }
  drawCallouts(engine, ctx);
}

function drawCallouts(engine, ctx) {
  for (const callout of engine.callouts) {
    const { hero, text, color, age, life } = callout;
    const grow = Math.min(1, age / 0.12);
    const scale = age < 0.12 ? 0.6 + 0.55 * grow : age < 0.2 ? 1.15 - (age - 0.12) * 1.9 : 1;
    const alpha = age > life - 0.3 ? Math.max(0, (life - age) / 0.3) : 1;
    ctx.save();
    ctx.font = "900 13px Unbounded, sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const width = ctx.measureText(text).width + 16;
    const x = Math.max(width / 2 + 2, Math.min(W - width / 2 - 2, hero.x));
    const y = Math.max(16, hero.y - 48 - age * 10);
    ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(5,8,10,0.9)"; ctx.strokeStyle = color; ctx.lineWidth = 2;
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.rect(-width / 2, -11, width, 22); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 6; ctx.fillStyle = color; ctx.fillText(text, 0, 1);
    ctx.restore();
  }
}

// A small neon familiar, shaped by species, outlined in its partner's color.
// A Mirror Self is drawn as its caster, see-through.
function drawPet(engine, pet) {
  if (pet.stats?.species === "mirror") { drawMirror(engine, pet); return; }
  drawFamiliar(engine.ctx, pet, engine.time);
}

// The caster's look at the mirror's place. The stand-in objects are kept
// here, not on the pet, so drawing changes nothing in the fight.
const mirrorViews = new WeakMap();
function drawMirror(engine, pet) {
  const h = pet.owner;
  let view = mirrorViews.get(pet);
  if (!view) { view = { home: { x: pet.x, y: pet.y } }; mirrorViews.set(pet, view); }
  Object.assign(view, {
    x: pet.x, y: pet.y, model: h.model, d: h.d, alive: !pet.down, protect: 1, hitUntil: pet.hurtAt + 0.2,
    facingTarget: pet.target, manualTarget: null, currentTarget: null, retreating: false, manualPoint: null,
    visualActionKind: "attack", visualActionStartedAt: pet.strikeAt, visualActionUntil: pet.strikeAt + 0.3,
  });
  drawHeroSprite(engine, view);
  if (!pet.down && pet.hp < pet.maxHp) bar(engine, pet.x - 14, pet.y + 20, 28, 3, pet.hp / pet.maxHp, pet.stats.color);
}

function neonLine(engine, x1, y1, x2, y2, color, w) {
  const ctx = engine.ctx;
  ctx.save(); ctx.shadowBlur = 14; ctx.shadowColor = color;
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}

function bar(engine, x, y, w, h, frac, color) {
  const ctx = engine.ctx;
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

// A story goal's ground marks (goals.js): the escape exit and the captive.
function drawGoalGround(ctx, goal, engine) {
  if (!goal) return;
  if (goal.kind === "escape" && goal.state === "active") {
    ctx.save();
    ctx.fillStyle = "rgba(57,255,20,0.07)"; ctx.fillRect(0, 6, W, EXIT_Y - 6);
    ctx.strokeStyle = "#39FF14"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, EXIT_Y); ctx.lineTo(W, EXIT_Y); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = "#39FF14"; ctx.textAlign = "center";
    ctx.font = "bold 10px JetBrains Mono, monospace";
    ctx.fillText(engine.time < goal.opensAfter ? `EXIT OPENS IN ${Math.ceil(goal.opensAfter - engine.time)}s` : "EXIT OPEN: GET EVERYONE HERE", W / 2, EXIT_Y - 8);
    ctx.restore();
  }
  if (goal.kind === "rescue" && goal.state !== "failed") {
    const { x, y } = goal.captive;
    const freed = goal.state === "done";
    ctx.save();
    ctx.strokeStyle = freed ? "#39FF14" : "#7DD3FC"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(x, y, CAPTIVE_REACH, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = freed ? "#39FF14" : "#7DD3FC";
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    if (!freed && goal.progress > 0) {
      ctx.strokeStyle = "#39FF14"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, goal.progress / goal.freeAfter)); ctx.stroke();
    }
    ctx.textAlign = "center"; ctx.font = "bold 9px JetBrains Mono, monospace";
    ctx.fillText(freed ? "FREED" : "CAPTIVE", x, y - 18);
    ctx.restore();
  }
}
