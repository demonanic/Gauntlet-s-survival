import { HERO_SPRITE_ATLAS } from "../combat/heroSprite";
import { isNeonIdentityColor } from "../combat/heroModel";
import { heroSpriteFilter } from "../combat/heroPalette";

// The frame glows in the hero's color; the sprite inside is tinted with their
// own hue (the filter sits on the inner element so it never recolors the frame).
export default function ClasslessHeroAvatar({ className = "", label = "Classless hero", identityColor, appearance }) {
  const colorStyle = isNeonIdentityColor(identityColor) ? {
    borderColor: identityColor,
    boxShadow: `0 0 7px ${identityColor}66, inset 0 0 5px ${identityColor}22`,
  } : {};
  const filter = heroSpriteFilter(appearance);
  return (
    <span role="img" aria-label={label} className={`inline-block shrink-0 overflow-hidden ${className}`} style={colorStyle}>
      <span
        className="block h-full w-full bg-no-repeat"
        style={{
          backgroundImage: `url(${process.env.PUBLIC_URL || ""}${HERO_SPRITE_ATLAS.path})`,
          backgroundSize: "300% 700%",
          backgroundPosition: "0% 0%",
          ...(filter !== "none" ? { filter } : {}),
        }}
      />
    </span>
  );
}
