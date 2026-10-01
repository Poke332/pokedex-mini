import { toProperCase } from "./api";

export function itemLabel(item) {
    return toProperCase(item.name);
}

export function itemCategoryLabel(item) {
    const c = item?.category?.name;
    return c ? toProperCase(c) : null;
}

export function itemAttributes(item) {
    return (item?.attributes || []).map((a) => toProperCase(a.name));
}

// Effect text is the reliable source on current item data (flavor entries are
// often empty here). Prefer the English entry, then any entry with text.
export function itemEffectText(item) {
    const effects = item?.effect_entries || [];
    const en = effects.find((e) => e.language?.name === "en" && e.effect?.trim());
    if (en) return en.effect;
    const any = effects.find((e) => e.effect?.trim());
    if (any) return any.effect;
    const flavor = (item?.flavor_text_entries || []).find(
        (e) => e.language?.name === "en" && e.flavor_text?.trim()
    );
    return flavor?.flavor_text || null;
}

// PokeAPI holds these as [{ pokemon: {...}, version_details: [...] }], so
// unwrap to the bare pokemon resources for linking/labeling.
export function itemHeldBy(item) {
    return (item?.held_by_pokemon || [])
        .map((e) => e?.pokemon)
        .filter(Boolean);
}

export function itemSpriteUrl(item) {
    return item?.sprites?.default || null;
}

// PokeAPI item lookups use the hyphenated slug ("sitrus-berry"), so map a
// free-form search ("Sitrus Berry", "SITRUS BERRY") onto that shape.
// The API is case-insensitive, only the spacing matters.
export function itemQuery(input) {
    const q = (input || "").trim().toLowerCase();
    return q.replace(/\s+/g, "-");
}
