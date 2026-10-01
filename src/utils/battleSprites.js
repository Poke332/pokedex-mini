// C6 — /battle sprite resolution.
//
// Sprites come from the established PokeAPI URL convention (utils/api.js
// getSpriteUrl), keyed by national dex number. The dex numbers themselves come
// from the SHOWDOWN data lane (C2 §4 record `dexNum`) so a species and its
// sprite always agree. Records are fetched once per species list + format pair
// and cached module-wide (same idea as api.js's moveByURLCache).
//
// A null dex (lane not loaded, species missing) falls back to a generic
// "mon" silhouette so a plate never renders an empty box.

import { getSpriteUrl } from "./api.js";
import { getRecordsForSpecies } from "./showdownData.js";

// A neutral silhouette in the same sprite host's assets.
const FALLBACK_SPRITE =
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/235.png";

// Module cache: the dex-number map per species list (keyed by joined ids).
const dexMapCache = new Map();

/**
 * Build the species-id -> national-dex map from the data lane for the given
 * format. Cached module-wide; the species set is part of the cache key, so a
 * different team re-resolves instead of reusing a stale map.
 * @param {string[]} speciesIds C2 §4 species ids (lowercase).
 * @param {string} format the format id the records were requested for.
 * @returns {Promise<Record<string, number|null>>}
 */
export async function loadDexMap(speciesIds, format) {
    const ids = [...new Set((speciesIds || []).filter(Boolean))];
    if (!ids.length) return {};
    const key = ids.join(",") + "@" + (format || "");
    const hit = dexMapCache.get(key);
    if (hit) return hit;
    let map = {};
    try {
        const records = await getRecordsForSpecies(ids, [format || "gen9ou"]);
        for (const id of ids) {
            const rec = records?.[id]?.[format || "gen9ou"];
            map[id] = rec?.dexNum ?? null;
        }
    } catch {
        map = Object.fromEntries(ids.map((id) => [id, null]));
    }
    dexMapCache.set(key, map);
    return map;
}

/**
 * The sprite URL for a species id given a dex map.
 * @param {string} speciesId
 * @param {Record<string, number|null>} dexMap species -> dex number.
 * @returns {string} a PokeAPI sprite URL, or the generic silhouette.
 */
export function spriteUrlFor(speciesId, dexMap) {
    const dex = dexMap && dexMap[speciesId];
    if (dex) return getSpriteUrl(dex);
    return FALLBACK_SPRITE;
}
