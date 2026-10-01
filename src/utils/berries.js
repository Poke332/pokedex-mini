import { toProperCase } from "./api";

const SPRITES_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

// Berry item sprite URL. The PokeAPI berry resource references its item;
// the sprite is derivable from the item name (berry slug + "-berry").
export function getBerrySpriteUrl(berry) {
    const itemSlug = berry?.item?.name;
    if (!itemSlug) return null;
    return `${SPRITES_BASE}/${itemSlug}.png`;
}

// The dominant berry flavor (highest potency, first of the five if tied).
export function dominantFlavor(berry) {
    const flavors = berry?.flavors;
    if (!flavors?.length) return null;
    return flavors.reduce((best, f) => (f.potency > best.potency ? f : best)).flavor.name;
}

// A berry's flavor potencies as [name, potency] pairs, non-zero first.
export function flavorProfile(berry) {
    return (berry?.flavors || [])
        .filter((f) => f.potency > 0)
        .map((f) => [f.flavor.name, f.potency]);
}

export function berryLabel(berry) {
    return toProperCase(berry.name);
}

// Berry flavor fills: one muted color per flavor so the five profile bars
// read as distinct data series (same role as the stat bar colors).
const FLAVOR_COLORS = {
    spicy: "bg-red-500",
    dry: "bg-amber-500",
    sweet: "bg-pink-500",
    bitter: "bg-emerald-600",
    sour: "bg-lime-500",
};

export function flavorColorClass(name) {
    return FLAVOR_COLORS[name] ?? "bg-blue-800";
}

export function flavorLabel(name) {
    return toProperCase(name);
}
