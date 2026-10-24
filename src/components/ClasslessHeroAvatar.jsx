import { HERO_SPRITE_ATLAS } from "../combat/heroSprite";
import { isNeonIdentityColor } from "../combat/heroModel";

export default function ClasslessHeroAvatar({ className = "", label = "Classless hero", identityColor }) {
  const colorStyle = isNeonIdentityColor(identityColor) ? {
    borderColor: identityColor,
    boxShadow: `0 0 7px ${identityColor}66, inset 0 0 5px ${identityColor}22`,
  } : {};
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block shrink-0 bg-no-repeat ${className}`}
      style={{
        ...colorStyle,
        backgroundImage: `url(${process.env.PUBLIC_URL || ""}${HERO_SPRITE_ATLAS.path})`,
        backgroundSize: "300% 700%",
        backgroundPosition: "0% 0%",
      }}
    />
  );
}
