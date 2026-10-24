export const HERO_WEAPON_ASSETS = Object.freeze({
  sword: "/sprites/weapons/sword.svg",
  bow: "/sprites/weapons/bow.svg",
  staff: "/sprites/weapons/staff.svg",
});

export const HERO_WEAPON_TYPES = Object.freeze(Object.keys(HERO_WEAPON_ASSETS));

function knownWeaponType(value) {
  const type = typeof value === "string" ? value.trim().toLowerCase() : "";
  return HERO_WEAPON_TYPES.includes(type) ? type : null;
}

function weaponTypeFromItem(item, slot) {
  if (!item || typeof item !== "object") return null;
  const explicit = knownWeaponType(item.weaponType);
  if (explicit) return explicit;

  const label = `${item.name || ""} ${item.secondaryType || ""}`.toLowerCase();
  if (/\b(bow|archer)\b/.test(label)) return "bow";
  if (/\b(staff|wand)\b/.test(label)) return "staff";
  if (/\b(sword|blade|dagger)\b/.test(label)) return "sword";

  // Older PrimaryWeapon records have no visual subtype. Their slot proves a
  // weapon is equipped; the historical neutral fallback is a sword.
  if (slot === "PrimaryWeapon") return "sword";
  if (slot === "SecondaryWeapon" && item.secondaryType === "SecondDagger") return "sword";
  return null;
}

// Resolve from saved equipment only. No hero class or display title is read.
export function getEquippedHeroWeaponType(hero) {
  const equipment = hero?.equipment && typeof hero.equipment === "object" ? hero.equipment : {};
  const primary = weaponTypeFromItem(equipment.PrimaryWeapon, "PrimaryWeapon");
  return primary || weaponTypeFromItem(equipment.SecondaryWeapon, "SecondaryWeapon");
}

export function getEquippedHeroWeaponAsset(hero) {
  const type = getEquippedHeroWeaponType(hero);
  return type ? HERO_WEAPON_ASSETS[type] : null;
}
