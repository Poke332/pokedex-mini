import { getSpriteUrl } from "./api";

const SHOWDOWN_VARIANTS = [
    ["front_default", "Animated"],
    ["back_default", "Back"],
    ["front_shiny", "Shiny"],
    ["back_shiny", "Back · Shiny"],
    ["front_female", "Female"],
    ["back_female", "Back · Female"],
    ["front_shiny_female", "Shiny · Female"],
    ["back_shiny_female", "Back · Shiny · Female"],
];

export function buildShowdownTiles(sprites, id) {
    const showdown = sprites?.other?.showdown || {};
    const fallback = getSpriteUrl(id);
    const tiles = SHOWDOWN_VARIANTS
        .filter(([key]) => typeof showdown[key] === "string")
        .map(([key, label]) => ({ label, url: showdown[key] }));
    if (!tiles.length) {
        tiles.push({ label: "Front", url: fallback });
    }
    return tiles;
}
