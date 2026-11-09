// Enemy sprites (Phase 8A): one body shape per enemy type, plus hit flashes,
// status rings and boss trims. Reads the engine's state only.

export function drawEnemySprite(engine, e) {
  const ctx = engine.ctx;
  const color = e.color;
  const boss = !!e.boss;
  const elite = e.tier === "elite";
  const s = boss ? 1.85 : elite ? 1.35 : 1;

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(s, s);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = boss ? 18 : elite ? 13 : 9;
  ctx.shadowColor = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;

  const outline = () => { ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke(); };
  const neon = (width = 2) => { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.shadowBlur = 8; ctx.shadowColor = color; };
  const eye = (x, y, r = 2) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };

  if (e.type === "ghost") {
    // Floating sheet silhouette with a clear face and trailing tail.
    ctx.fillStyle = "#10131D";
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.bezierCurveTo(-10, -12, -12, -3, -10, 6);
    ctx.lineTo(-7, 12); ctx.lineTo(-3, 7); ctx.lineTo(0, 13);
    ctx.lineTo(4, 7); ctx.lineTo(8, 12); ctx.lineTo(10, 5);
    ctx.bezierCurveTo(12, -5, 9, -12, 0, -14);
    ctx.closePath(); ctx.fill(); outline();
    eye(-3, 0, 2.2); eye(3, 0, 2.2);
    neon(1.4); ctx.beginPath(); ctx.moveTo(-3, 7); ctx.lineTo(0, 9); ctx.lineTo(3, 7); ctx.stroke();
  } else if (e.type === "slime") {
    // Low, translucent-looking toxic blob with crown-like drips.
    ctx.fillStyle = "#102016";
    ctx.beginPath();
    ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-12, -5, -7, -9);
    ctx.quadraticCurveTo(0, -14, 7, -9); ctx.quadraticCurveTo(12, -5, 13, 8);
    ctx.lineTo(8, 11); ctx.lineTo(4, 8); ctx.lineTo(0, 13);
    ctx.lineTo(-4, 8); ctx.lineTo(-9, 11); ctx.closePath();
    ctx.fill(); outline();
    eye(-4, 0, 2); eye(4, 0, 2);
    neon(1.4); ctx.beginPath(); ctx.moveTo(-6, 5); ctx.quadraticCurveTo(0, 8, 6, 5); ctx.stroke();
  } else if (e.type === "goblin") {
    // Small angular raider: ears, brow, torso and a short blade.
    ctx.fillStyle = "#152016";
    ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(-8, -7); ctx.lineTo(0, -11);
    ctx.lineTo(8, -7); ctx.lineTo(7, 1); ctx.lineTo(5, 8); ctx.lineTo(-5, 8); ctx.closePath();
    ctx.fill(); outline();
    ctx.fillStyle = "#17261A";
    ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(-16, -11); ctx.lineTo(-10, 1); ctx.closePath();
    ctx.moveTo(7, -5); ctx.lineTo(16, -11); ctx.lineTo(10, 1); ctx.closePath(); ctx.fill(); outline();
    eye(-3, 0, 1.8); eye(3, 0, 1.8);
    neon(2.3); ctx.beginPath(); ctx.moveTo(8, 7); ctx.lineTo(16, -5); ctx.stroke();
  } else if (e.type === "bulwark") {
    // Broad armored figure behind a tall tower shield; a faint tether shows
    // which ally it is guarding.
    if (e.guarding?.hp > 0) {
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.setLineDash?.([3, 4]);
      neon(1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.guarding.x - e.x, e.guarding.y - e.y); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "#0E1622";
    ctx.beginPath(); ctx.arc(0, -7, 10, 0, Math.PI * 2); ctx.fill(); outline();
    eye(-3, -10, 1.6); eye(3, -10, 1.6);
    ctx.fillStyle = "#132033";
    ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(14, -2); ctx.lineTo(14, 9); ctx.lineTo(0, 18); ctx.lineTo(-14, 9); ctx.closePath(); ctx.fill();
    neon(2.4); ctx.stroke();
    neon(1.2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 15); ctx.moveTo(-11, 5); ctx.lineTo(11, 5); ctx.stroke();
  } else if (e.type === "gnome") {
    // Same family as goblin, but with the distinctive tall neon cap.
    ctx.fillStyle = "#172019";
    ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill(); outline();
    ctx.fillStyle = "#10171D";
    ctx.beginPath(); ctx.moveTo(-8, -5); ctx.lineTo(0, -20); ctx.lineTo(9, -5); ctx.closePath(); ctx.fill(); outline();
    neon(1.2); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(0, -6); ctx.stroke();
    eye(-3, 3, 1.8); eye(3, 3, 1.8);
    neon(2); ctx.beginPath(); ctx.moveTo(7, 7); ctx.lineTo(14, -3); ctx.stroke();
  } else if (e.type === "bandit") {
    // Hooded raider with a face mask and twin knives.
    ctx.fillStyle = "#1A1508";
    ctx.beginPath(); ctx.moveTo(-8, 10); ctx.lineTo(-8, -4); ctx.lineTo(0, -13); ctx.lineTo(8, -4); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = "#0A0904"; ctx.fillRect(-6, -4, 12, 5);
    eye(-3, -6, 1.6); eye(3, -6, 1.6);
    neon(2.2); ctx.beginPath(); ctx.moveTo(-8, 6); ctx.lineTo(-15, -2); ctx.moveTo(8, 6); ctx.lineTo(15, -2); ctx.stroke();
  } else if (e.type === "lesserNecromancer") {
    // Robed caster with a skull-topped staff.
    ctx.fillStyle = "#120B1F";
    ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-8, -4); ctx.lineTo(0, -14); ctx.lineTo(8, -4); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = "#05030A"; ctx.beginPath(); ctx.arc(0, -4, 5.5, 0, Math.PI * 2); ctx.fill();
    eye(-2.5, -4, 1.6); eye(2.5, -4, 1.6);
    neon(1.8); ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-13, -14); ctx.stroke();
    ctx.beginPath(); ctx.arc(-13, -17, 3.5, 0, Math.PI * 2); ctx.stroke();
  } else if (e.type === "harrier" || e.type === "stalker") {
    // Low four-legged hunters: a lean body, pointed ears and a long tail.
    const big = e.type === "stalker" ? 1.25 : 1;
    ctx.scale(big, big);
    ctx.fillStyle = "#14100A";
    ctx.beginPath(); ctx.moveTo(-12, 4); ctx.lineTo(-6, -4); ctx.lineTo(6, -5); ctx.lineTo(12, -11); ctx.lineTo(14, -3);
    ctx.lineTo(9, 3); ctx.lineTo(8, 10); ctx.lineTo(4, 4); ctx.lineTo(-6, 5); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); outline();
    neon(1.4); ctx.beginPath(); ctx.moveTo(-12, 4); ctx.quadraticCurveTo(-18, -2, -16, -9); ctx.stroke();
    eye(11, -6, 1.6);
  } else if (e.type === "carrionPriest") {
    // Hunched, beaked figure with a hooked staff.
    ctx.fillStyle = "#170C10";
    ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-9, -2); ctx.lineTo(-2, -12); ctx.lineTo(6, -9); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(1, -7); ctx.lineTo(11, -4); ctx.lineTo(2, -3); ctx.fill();
    eye(-1, -7, 1.5);
    neon(1.8); ctx.beginPath(); ctx.moveTo(-11, 12); ctx.lineTo(-13, -12); ctx.quadraticCurveTo(-8, -18, -6, -12); ctx.stroke();
  } else if (e.type === "watcher") {
    // A floating eye in a ring of spines.
    ctx.fillStyle = "#0C1418";
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); outline();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#05080A"; ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
    neon(1.2);
    for (let k = 0; k < 8; k += 1) {
      const a = (k / 8) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11); ctx.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); ctx.stroke();
    }
  } else if (e.type === "zombie") {
    // A hunched shambler: lolling head, arms reaching out in front, a ragged
    // body that sways as it drags itself along.
    const sway = Math.sin(engine.time * 3 + (e.x || 0) * 0.05) * 0.12;
    ctx.rotate(sway);
    ctx.fillStyle = "#141C14";
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-7, 12); ctx.lineTo(-2, 10); ctx.lineTo(0, 13); ctx.lineTo(3, 10); ctx.lineTo(7, 12); ctx.lineTo(6, 0); ctx.closePath();
    ctx.fill(); outline();
    ctx.beginPath(); ctx.arc(-2, -6, 6.5, 0, Math.PI * 2); ctx.fill(); outline();
    eye(-4.5, -7, 1.6); eye(0.5, -6, 1.2);
    neon(1.4); ctx.beginPath(); ctx.moveTo(-5, -2); ctx.lineTo(0, -1); ctx.stroke();
    neon(2.2);
    const reach = Math.sin(engine.time * 3 + (e.y || 0) * 0.05) * 1.5;
    ctx.beginPath(); ctx.moveTo(5, 2); ctx.lineTo(15, 0 + reach); ctx.moveTo(4, 5); ctx.lineTo(14, 5 - reach); ctx.stroke();
  } else if (e.type === "skeleton") {
    // Minimal skull/ribcage silhouette — intentionally readable at small size.
    ctx.fillStyle = "#111922";
    ctx.beginPath(); ctx.arc(0, -5, 8.5, 0, Math.PI * 2); ctx.fill(); outline();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-3, -5, 2, 0, Math.PI * 2); ctx.arc(3, -5, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111922";
    ctx.beginPath(); ctx.moveTo(-7, 3); ctx.lineTo(7, 3); ctx.lineTo(6, 12); ctx.lineTo(0, 15); ctx.lineTo(-6, 12); ctx.closePath(); ctx.fill();
    neon(1.4);
    for (let y = 5; y <= 11; y += 3) { ctx.beginPath(); ctx.moveTo(-5, y); ctx.lineTo(5, y); ctx.stroke(); }
    neon(2); ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(15, -8); ctx.stroke();
  } else if (e.type === "orc") {
    // Broad armored brute with tusks and a heavy axe.
    ctx.fillStyle = "#101A16";
    ctx.beginPath(); ctx.moveTo(-11, -3); ctx.lineTo(-8, -11); ctx.lineTo(0, -14);
    ctx.lineTo(8, -11); ctx.lineTo(11, -3); ctx.lineTo(9, 10); ctx.lineTo(-9, 10); ctx.closePath();
    ctx.fill(); outline();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-5, 5); ctx.lineTo(-9, 11); ctx.lineTo(-2, 9);
    ctx.moveTo(5, 5); ctx.lineTo(9, 11); ctx.lineTo(2, 9); ctx.fill();
    eye(-3, -1, 2); eye(3, -1, 2);
    neon(2.8); ctx.beginPath(); ctx.moveTo(9, 7); ctx.lineTo(16, -10); ctx.stroke();
    neon(2); ctx.beginPath(); ctx.moveTo(13, -14); ctx.lineTo(20, -10); ctx.stroke();
  } else if (e.type === "darkElf") {
    ctx.fillStyle = "#160A16";
    ctx.beginPath(); ctx.moveTo(-9, 11); ctx.lineTo(-8, -6); ctx.lineTo(0, -14); ctx.lineTo(8, -6); ctx.lineTo(9, 11); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = "#05050A"; ctx.beginPath(); ctx.arc(0, -3, 6, 0, Math.PI * 2); ctx.fill();
    eye(-3, -3, 2); eye(3, -3, 2);
    neon(2.3); ctx.beginPath(); ctx.moveTo(-7, 7); ctx.lineTo(-16, -7); ctx.moveTo(7, 7); ctx.lineTo(16, -7); ctx.stroke();
    neon(1.4); ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-15, -13); ctx.moveTo(8, -7); ctx.lineTo(15, -13); ctx.stroke();
  } else if (e.type === "warlock") {
    ctx.fillStyle = "#16091A";
    ctx.beginPath(); ctx.moveTo(-10, 12); ctx.lineTo(-9, -4); ctx.lineTo(0, -15); ctx.lineTo(9, -4); ctx.lineTo(10, 12); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = "#05030A"; ctx.beginPath(); ctx.arc(0, -5, 6, 0, Math.PI * 2); ctx.fill();
    eye(-3, -5, 1.8); eye(3, -5, 1.8);
    neon(2); ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(13, -15); ctx.stroke();
    ctx.fillStyle = color; ctx.shadowBlur = 14; ctx.shadowColor = color;
    ctx.beginPath(); ctx.arc(14, -18, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-9, 7, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === "reaper") {
    // Hooded elite with scythe — deliberately different from the lieutenant.
    ctx.fillStyle = "#12081B";
    ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(-9, -6); ctx.lineTo(0, -16);
    ctx.lineTo(9, -6); ctx.lineTo(10, 10); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = "#05050A";
    ctx.beginPath(); ctx.arc(0, -3, 6, 0, Math.PI * 2); ctx.fill();
    eye(-3, -2, 1.8); eye(3, -2, 1.8);
    neon(2.4); ctx.beginPath(); ctx.moveTo(7, 9); ctx.lineTo(17, -14); ctx.stroke();
    ctx.beginPath(); ctx.arc(19, -14, 7, Math.PI * 0.9, Math.PI * 1.8); ctx.stroke();
  } else if (e.type === "lieutenant") {
    // Armored elite commander with a ringed shoulder and spear.
    ctx.fillStyle = "#101923";
    ctx.beginPath(); ctx.moveTo(-11, 10); ctx.lineTo(-9, -7); ctx.lineTo(0, -15);
    ctx.lineTo(9, -7); ctx.lineTo(11, 10); ctx.closePath(); ctx.fill(); outline();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-3, -2, 1.8, 0, Math.PI * 2); ctx.arc(3, -2, 1.8, 0, Math.PI * 2); ctx.fill();
    neon(2.2); ctx.beginPath(); ctx.moveTo(8, 9); ctx.lineTo(14, -17); ctx.stroke();
    neon(1.6); ctx.beginPath(); ctx.arc(-12, 7, 6, 0, Math.PI * 2); ctx.stroke();
  } else if (e.type === "portal") {
    // The Gatewarden's portal (story mode): a slowly turning ring of light.
    const turn = (engine.time || 0) * 2;
    ctx.fillStyle = "#12051A";
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 17, 0, 0, Math.PI * 2); ctx.fill(); outline();
    neon(1.6);
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath(); ctx.ellipse(0, 0, 9 - k * 2.5, 13 - k * 3.5, 0, turn + k, turn + k + Math.PI * 1.2); ctx.stroke();
    }
  } else {
    // Boss silhouettes keep a common Demonanic frame but have unique crowns.
    ctx.fillStyle = "#170A14";
    ctx.beginPath();
    ctx.moveTo(-21, 12); ctx.lineTo(-19, -5); ctx.lineTo(-30, -14);
    ctx.lineTo(-13, -12); ctx.lineTo(0, -20); ctx.lineTo(13, -12);
    ctx.lineTo(30, -14); ctx.lineTo(19, -5); ctx.lineTo(21, 12);
    ctx.lineTo(0, 20); ctx.closePath(); ctx.fill(); outline();
    eye(-9, 2, 2.8); eye(9, 2, 2.8);

    if (e.type === "demon") {
      neon(2.7);
      ctx.beginPath(); ctx.moveTo(-12, -10); ctx.lineTo(-23, -25);
      ctx.moveTo(12, -10); ctx.lineTo(23, -25); ctx.stroke();
      ctx.fillStyle = "#080309"; ctx.beginPath(); ctx.arc(0, 2, 5, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "imperialNecromancer") {
      neon(1.7);
      ctx.beginPath(); ctx.arc(0, -7, 6, 0, Math.PI * 2);
      ctx.moveTo(-20, 3); ctx.lineTo(-13, -4); ctx.moveTo(20, 3); ctx.lineTo(13, -4); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -7, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "banditWarlord") {
      neon(2.2);
      ctx.beginPath(); ctx.moveTo(-14, -12); ctx.lineTo(-8, -22); ctx.lineTo(0, -14); ctx.lineTo(8, -22); ctx.lineTo(14, -12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-24, 8); ctx.lineTo(-34, -6); ctx.moveTo(24, 8); ctx.lineTo(34, -6); ctx.stroke();
    } else if (e.type === "bogLich") {
      ctx.fillStyle = "#0B1A08";
      ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2); ctx.fill();
      neon(1.8);
      ctx.beginPath(); ctx.arc(0, -6, 8, 0, Math.PI * 2);
      ctx.moveTo(-18, 14); ctx.quadraticCurveTo(-26, 22, -20, 28); ctx.moveTo(18, 14); ctx.quadraticCurveTo(26, 22, 20, 28); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(-3, -6, 1.8, 0, Math.PI * 2); ctx.arc(3, -6, 1.8, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "gatewarden") {
      // A doorway for a crown.
      neon(2);
      ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(-9, -26); ctx.lineTo(9, -26); ctx.lineTo(9, -10); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -18, 4, 6, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === "chronomancer") {
      // An hourglass crown.
      neon(2);
      ctx.beginPath(); ctx.moveTo(-8, -26); ctx.lineTo(8, -26); ctx.lineTo(-8, -12); ctx.lineTo(8, -12); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, -19, 1.8, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === "ritualist") {
      // A ring of ritual sparks, brighter while she channels.
      neon(e.channelUntil != null ? 2.6 : 1.6);
      ctx.beginPath(); ctx.arc(0, -16, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = color;
      for (let k = 0; k < 5; k += 1) {
        const a = k * (Math.PI * 2 / 5) + (engine.time || 0);
        ctx.beginPath(); ctx.arc(Math.cos(a) * 10, -16 + Math.sin(a) * 10, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    } else if (e.type === "ancientEvil") {
      // Great curled horns and a third eye.
      neon(3);
      ctx.beginPath(); ctx.moveTo(-12, -12); ctx.quadraticCurveTo(-34, -22, -24, -36);
      ctx.moveTo(12, -12); ctx.quadraticCurveTo(34, -22, 24, -36); ctx.stroke();
      eye(0, -6, 2.6);
    } else if (e.type === "nuclearBehemoth") {
      ctx.fillStyle = "#0A1710";
      ctx.beginPath(); ctx.arc(-11, 5, 6, 0, Math.PI * 2); ctx.arc(11, 5, 6, 0, Math.PI * 2); ctx.fill();
      neon(2.4);
      ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-22, -20); ctx.moveTo(14, -10); ctx.lineTo(22, -20); ctx.stroke();
    }
  }

  if (e.hitUntil > engine.time) {
    ctx.globalAlpha = Math.min(0.45, (e.hitUntil - engine.time) * 2.2);
    ctx.fillStyle = "#F8F7FF";
    ctx.strokeStyle = "#22D3EE";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 14;
    ctx.shadowColor = "#F02DCA";
    ctx.beginPath(); ctx.arc(0, 0, boss ? 24 : elite ? 17 : 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}
