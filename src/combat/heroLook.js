// Equipped gear shown on the hero sprite: a few plain shapes per slot, drawn
// over the shared body art and coloured by the item's rarity (or its set's
// colour). Shapes are in the 64 x 64 sprite frame, which is seen from above
// with the hero facing up: head around (32, 20), shoulders across y 34-46,
// hands at the far left and right, feet below. Used by the battle canvas
// and the roster portraits (as SVG).
import { GEAR_SETS } from "./gear";

export const GEAR_RARITY_COLORS = Object.freeze({
  common: "#94A3B8", uncommon: "#39FF14", rare: "#00F3FF", epic: "#A855F7", legendary: "#FF9F1C",
});

export function gearColor(item) {
  return GEAR_SETS[item?.set]?.color || GEAR_RARITY_COLORS[item?.rarity] || GEAR_RARITY_COLORS.common;
}

const SECONDARY_SHAPES = {
  shield: [{ kind: "circle", cx: 10, cy: 42, r: 6.5, width: 2.5 }],
  dagger: [{ kind: "line", x1: 10, y1: 44, x2: 10, y2: 32, width: 2.5 }],
  orb: [{ kind: "circle", cx: 10, cy: 40, r: 3, fill: true }],
  quiver: [{ kind: "rect", x: 38, y: 47, w: 5, h: 10, fill: true, rotate: 20 }],
};

// The shapes for every equipped piece of armor, in draw order.
export function heroGearMarks(equipment = {}) {
  const marks = [];
  const add = (item, shapes) => {
    if (!item) return;
    const color = gearColor(item);
    for (const shape of shapes) marks.push({ ...shape, color, slot: item.slot });
  };
  // Helm: a band over the crown of the head; better helms get a crest.
  add(equipment.head, [
    { kind: "arc", cx: 32, cy: 21, r: 13.5, start: Math.PI * 1.08, end: Math.PI * 1.92, width: 3.5 },
    ...(["rare", "epic", "legendary"].includes(equipment.head?.rarity) ? [{ kind: "line", x1: 32, y1: 7, x2: 32, y2: 15, width: 2.5 }] : []),
  ]);
  // Chest: a plate across the shoulders, just below the head.
  add(equipment.chest, [
    { kind: "rect", x: 19, y: 34, w: 26, h: 6, fill: true, round: 2 },
    { kind: "circle", cx: 15, cy: 39, r: 3.5, fill: true },
    { kind: "circle", cx: 49, cy: 39, r: 3.5, fill: true },
  ]);
  // Arms: bracers at both hands.
  add(equipment.arms, [
    { kind: "rect", x: 7, y: 44, w: 6, h: 4, fill: true, round: 1 },
    { kind: "rect", x: 44, y: 44, w: 6, h: 4, fill: true, round: 1 },
  ]);
  // Legs: boots showing below the body.
  add(equipment.legs, [
    { kind: "rect", x: 25, y: 53, w: 5, h: 4, fill: true, round: 1 },
    { kind: "rect", x: 34, y: 53, w: 5, h: 4, fill: true, round: 1 },
  ]);
  add(equipment.secondary, SECONDARY_SHAPES[equipment.secondary?.variant] || []);
  // Trinket: an amulet at the collar, or a ring glinting on the free hand.
  add(equipment.trinket, equipment.trinket?.variant === "ring"
    ? [{ kind: "circle", cx: 47, cy: 50, r: 1.8, fill: true }]
    : [{ kind: "diamond", cx: 32, cy: 41, r: 2.6, fill: true }]);
  return marks;
}

// Draw the marks on a canvas already placed at the frame's top-left corner,
// in frame units.
export function drawGearMarks(ctx, marks) {
  for (const mark of marks) {
    ctx.save();
    ctx.fillStyle = mark.color;
    ctx.strokeStyle = mark.color;
    ctx.lineWidth = mark.width || 2;
    ctx.lineCap = "round";
    ctx.shadowBlur = 4;
    ctx.shadowColor = mark.color;
    ctx.beginPath();
    if (mark.kind === "arc") ctx.arc(mark.cx, mark.cy, mark.r, mark.start, mark.end);
    else if (mark.kind === "circle") ctx.arc(mark.cx, mark.cy, mark.r, 0, Math.PI * 2);
    else if (mark.kind === "line") { ctx.moveTo(mark.x1, mark.y1); ctx.lineTo(mark.x2, mark.y2); }
    else if (mark.kind === "diamond") {
      ctx.moveTo(mark.cx, mark.cy - mark.r); ctx.lineTo(mark.cx + mark.r, mark.cy);
      ctx.lineTo(mark.cx, mark.cy + mark.r); ctx.lineTo(mark.cx - mark.r, mark.cy); ctx.closePath();
    } else if (mark.kind === "rect") {
      if (mark.rotate) {
        ctx.translate(mark.x + mark.w / 2, mark.y + mark.h / 2);
        ctx.rotate((mark.rotate * Math.PI) / 180);
        ctx.rect(-mark.w / 2, -mark.h / 2, mark.w, mark.h);
      } else ctx.rect(mark.x, mark.y, mark.w, mark.h);
    }
    if (mark.fill) ctx.fill(); else ctx.stroke();
    ctx.restore();
  }
}
