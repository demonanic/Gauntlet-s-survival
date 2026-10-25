import { HERO_SPRITE_ATLAS } from "../combat/heroSprite";
import { isNeonIdentityColor } from "../combat/heroModel";
import { heroSpriteFilter } from "../combat/heroPalette";
import { heroGearMarks } from "../combat/heroLook";

function GearMark({ mark }) {
  const paint = mark.fill ? { fill: mark.color } : { fill: "none", stroke: mark.color, strokeWidth: mark.width || 2, strokeLinecap: "round" };
  if (mark.kind === "circle") return <circle cx={mark.cx} cy={mark.cy} r={mark.r} {...paint} />;
  if (mark.kind === "line") return <line x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} {...paint} />;
  if (mark.kind === "diamond") {
    const { cx, cy, r } = mark;
    return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} {...paint} />;
  }
  if (mark.kind === "arc") {
    const at = (angle) => `${mark.cx + mark.r * Math.cos(angle)},${mark.cy + mark.r * Math.sin(angle)}`;
    return <path d={`M ${at(mark.start)} A ${mark.r} ${mark.r} 0 0 1 ${at(mark.end)}`} {...paint} />;
  }
  const transform = mark.rotate ? `rotate(${mark.rotate} ${mark.x + mark.w / 2} ${mark.y + mark.h / 2})` : undefined;
  return <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} rx={mark.round || 0} transform={transform} {...paint} />;
}

// The frame glows in the hero's color; the sprite inside is tinted with their
// own hue (the filter sits on the inner element so it never recolors the frame).
export default function ClasslessHeroAvatar({ className = "", label = "Classless hero", identityColor, appearance, equipment }) {
  const colorStyle = isNeonIdentityColor(identityColor) ? {
    borderColor: identityColor,
    boxShadow: `0 0 7px ${identityColor}66, inset 0 0 5px ${identityColor}22`,
  } : {};
  const filter = heroSpriteFilter(appearance);
  return (
    <span role="img" aria-label={label} className={`relative inline-block shrink-0 overflow-hidden ${className}`} style={colorStyle}>
      <span
        className="block h-full w-full bg-no-repeat"
        style={{
          backgroundImage: `url(${process.env.PUBLIC_URL || ""}${HERO_SPRITE_ATLAS.path})`,
          backgroundSize: "300% 700%",
          backgroundPosition: "0% 0%",
          ...(filter !== "none" ? { filter } : {}),
        }}
      />
      {equipment && (
        <svg viewBox="0 0 64 64" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" data-testid="gear-marks">
          {heroGearMarks(equipment).map((mark, index) => <GearMark key={index} mark={mark} />)}
        </svg>
      )}
    </span>
  );
}
