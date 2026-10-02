// Showdown data lane — indexes the pokemon-showdown dataset so the party
// builder (C5) can show tier-legal moves / abilities / items / natures per
// species + format, in Showdown's own id dialect.
//
// NEW data model alongside the existing PokeAPI pipeline (IMPLEMENTATION.md §3
// "Data lane"). Fetches from play.pokemonshowdown.com/data/ and is
// deliberately NOT reconciled with the PokeAPI helpers in api.js. The
// module-wide fetch-cache idiom follows api.js (bulkMovesPromise).
//
// The per-species+format record shape is pinned by the C2 contract
// (docs/simulation-dto.md §4):
//   record = { species, dexNum, types[], abilities[], moves[], items[],
//              levelRange, natures[] }
// `id` fields are lowercase Showdown ids; `name` fields are display strings.
//
// The module is browser-runnable (it lives beside api.js and is consumed by the
// React SPA). No Node built-ins: the items.js CommonJS dump is evaluated in an
// isolated (module, exports) scope via the Function constructor, which works in
// both the browser and Node.

const DATA_BASE = "https://play.pokemonshowdown.com/data";

// The five live-served source files. pokedex/moves/learnsets are plain JSON;
// items + abilities are CommonJS object-literal dumps (exports.X = {...};).
// NOTE: per-gen override files under data/mods/<gen>/* are NOT served by the
// live host (all 404). Per-generation legality is instead encoded inline in
// learnsets.json as generation-prefixed tokens ("9M", "8L30", ...), so a
// single master fetch covers every generation.
const DATA_SOURCES = {
    pokedex: `${DATA_BASE}/pokedex.json`,
    moves: `${DATA_BASE}/moves.json`,
    learnsets: `${DATA_BASE}/learnsets.json`,
    items: `${DATA_BASE}/items.js`,
    // P2 (fix 2): ability effect text. The data host DOES publish
    // data/abilities.js (exports.BattleAbilities — each entry carries
    // shortDesc/desc); natures.ts 404s so the nature +/- table is the static
    // in-repo natures.js instead.
    abilities: `${DATA_BASE}/abilities.js`,
};

// The 25 in-game natures (Showdown `data/natures.ts`). Natures are not
// species- or generation-gated, so every species+format exposes the same full
// authoritative set; C2 §4 says "empty = any of the 25" and the UI filters to
// its own useful subset — we emit the full 25 rather than leaving that to a
// hardcoded constant in the UI.
const ALL_NATURES = [
    "adamant", "bashful", "bold", "brave", "calm", "careful", "docile", "gentle", "hardy",
    "hasty", "impish", "jolly", "lax", "lonely", "mild", "modest", "naive", "naughty",
    "quiet", "quirky", "rash", "relaxed", "sassy", "serious", "timid",
];

// C2 §4 pins the level input bounds (C1: default 100, range 5–100).
const LEVEL_RANGE = { min: 5, max: 100 };

// Showdown id convention: lowercase, strip all non-alphanumerics
// ("Solar Power" -> "solarpower").
const toID = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const CURRENT_GEN = 9;

// Extract the generation digit from a format id ("gen9ou" -> 9, "gen8uu" -> 8).
// Falls back to the current gen when the format carries no gen prefix.
export const genFromFormat = (formatId) => {
    const m = /^gen(\d+)/.exec(String(formatId || ""));
    return m ? Number(m[1]) : CURRENT_GEN;
};

// Evaluate a CommonJS object-literal dump (e.g. "exports.BattleItems = {...};")
// without Node's vm module, so the same code runs in the browser. Fast path
// tries plain JSON first (in case a source is ever served as .json).
export const parseCommonJSDump = (text) => {
    const trimmed = String(text || "").trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        // fall through to the eval path
    }
    const mod = { exports: {} };
    // The items dump is a plain object literal assigned to exports — safe to
    // evaluate in an isolated scope (no imports, no Node globals).
    new Function("module", "exports", trimmed)(mod, mod.exports);
    return mod.exports;
};

// Fetch all five sources in parallel and normalize them into a raw index.
// `fetchFn` is injectable for tests; defaults to the global fetch.
// The four core sources (pokedex/moves/learnsets/items) are REQUIRED — the lane
// cannot build legal sets without them. The fifth (abilities) is ENRICHMENT
// (per-ability effect text): its fetch is tolerated, so a failed/absent
// abilities.js degrades to an empty dump and the record still renders.
export const fetchShowdownData = async (fetchFn = globalThis.fetch) => {
    const [pokedex, moves, learnsets, itemsText, abilitiesText] = await Promise.all([
        fetchFn(DATA_SOURCES.pokedex).then((r) => r.json()),
        fetchFn(DATA_SOURCES.moves).then((r) => r.json()),
        fetchFn(DATA_SOURCES.learnsets).then((r) => r.json()),
        fetchFn(DATA_SOURCES.items).then((r) => r.text()),
        fetchFn(DATA_SOURCES.abilities)
            .then((r) => r.text())
            .catch(() => ""), // additive: failure degrades to no descriptions
    ]);
    const itemsExport = parseCommonJSDump(itemsText);
    const items = itemsExport && itemsExport.BattleItems ? itemsExport.BattleItems : itemsExport;
    let abilities = {};
    if (abilitiesText) {
        try {
            const abilitiesExport = parseCommonJSDump(abilitiesText);
            abilities = abilitiesExport && abilitiesExport.BattleAbilities
                ? abilitiesExport.BattleAbilities
                : abilitiesExport || {};
        } catch {
            abilities = {}; // a malformed/non-dump body must not break the lane
        }
    }
    return { pokedex, moves, learnsets, items, abilities };
};

// ---------------------------------------------------------------------------
// Pure index builders (unit-testable with synthetic in-memory data).
// ---------------------------------------------------------------------------

// Build the C2 §4 record for one species + format, or null if the species is
// not in the pokedex. A learnset gap (forme not listed in learnsets.json) falls
// back to the base species' learnset via pokedex `baseSpecies`.
export const buildSpeciesRecord = (data, speciesId, formatId) => {
    const { pokedex, moves, learnsets, items, abilities: abilityDump } = data;
    const spKey = toID(speciesId);
    const species = pokedex[spKey];
    if (!species) return null;

    const baseKey = species.baseSpecies ? toID(species.baseSpecies) : spKey;
    const learnRec = learnsets[spKey] || (species.baseSpecies ? learnsets[baseKey] : null);

    const gen = genFromFormat(formatId);
    const genPrefix = String(gen);

    // Abilities: pokedex abilities are keyed "0" (default), "1", "H" (hidden),
    // each value being a display name. Derive the id, keep order, flag default.
    const abilities = ["0", "1", "H"]
        .filter((slot) => species.abilities && species.abilities[slot])
        .map((slot) => ({
            id: toID(species.abilities[slot]),
            name: species.abilities[slot],
            default: slot === "0",
        }));

    // Legal moves for this species + generation: a learnset token starting with
    // the gen digit means "learnable in that gen". Only emit moves present in
    // moves.json (with their type/category/power for the picker's badges).
    const movesList = [];
    if (learnRec && learnRec.learnset) {
        for (const [moveId, tokens] of Object.entries(learnRec.learnset)) {
            const arr = Array.isArray(tokens) ? tokens : [tokens];
            const learnableInGen = arr.some(
                (t) => typeof t === "string" && t.startsWith(genPrefix),
            );
            if (!learnableInGen) continue;
            const mv = moves[moveId];
            if (!mv) continue; // move dropped from the pool — not legal
            movesList.push({
                id: moveId,
                name: mv.name,
                type: mv.type ? String(mv.type).toLowerCase() : null,
                category: mv.category,
                // power only carries meaning for damaging moves; Status moves
                // report 0 in the dump — normalize to null so a "—" badge reads
                // as "no power", not "0".
                power: mv.category === "Status" ? null : mv.basePower ?? null,
                // accuracy: numeric (Flamethrower 100), true (Swords Dance
                // always hits), or null when the dump omits it.
                accuracy: mv.accuracy ?? null,
            });
        }
        movesList.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Item pool for the generation: standard items (not Past/Future/CAP/Custom)
    // whose availability generation is <= the target gen. "" = "No item".
    const itemIds = Object.keys(items)
        .filter((id) => {
            const it = items[id];
            return it && !it.isNonstandard && it.gen != null && it.gen <= gen;
        })
        .sort((a, b) => (items[a].name || a).localeCompare(items[b].name || b));
    const itemPool = ["", ...itemIds];

    // D1 (fix 4): form-gating fields. A pokedex `forme` that REQUIRES a held
    // item (Mega stone, Z-Crystal, Primal orb, drive, memory, mask …) only
    // exists in battle while that item is held — the party builder stores such
    // a species as its BASE form and gates the transform on the item. Gmax
    // formes (Gigantamax) also run their base form in v1: the dump carries no
    // equippable Gmax item, so the gate has item "" (unreachable, not offered).
    // All 126 `requiredItem` names in the live dump resolve to an item id via
    // toID(name); this is re-checked per record so a dump gap degrades to
    // "no gate" (validator stays the authority) instead of a broken option.
    const isMega = /mega/i.test(String(species.forme || ""));
    const isGmax = species.forme === "Gmax";
    const gateItemName = species.requiredItem || null;
    const gateItemId = gateItemName
        ? (items[toID(gateItemName)] ? toID(gateItemName) : "")
        : (isGmax ? "" : null);
    const formGate = species.baseSpecies && (gateItemName || isGmax)
        ? {
            form: spKey,
            base: baseKey,
            item: gateItemId, // "" = no equippable item (Gmax in v1)
            itemName: gateItemName || "",
            formName: species.name,
            baseName: species.baseSpecies,
          }
        : null;

    // The BASE record's inverse of formGate: every gated sibling forme of
    // this species (Mega/Z-Crystal/Primal … — any forme carrying a
    // `requiredItem`, plus Gmax which is gated with item "" in v1). The
    // party builder + SetEditor use this to surface the item GATE on a
    // base-form set.
    let gatedForms = null;
    if (!species.forme) {
        const found = [];
        for (const sp of Object.values(pokedex)) {
            if (sp.forme === "Gmax") {
                if (toID(String(sp.name || "").split("-")[0]) === spKey) {
                    found.push({ form: toID(sp.name), item: "", itemName: "", formName: sp.name });
                }
            } else if (sp.requiredItem && toID(sp.name.split("-")[0]) === spKey) {
                const itemId = items[toID(sp.requiredItem)] ? toID(sp.requiredItem) : "";
                found.push({ form: toID(sp.name), item: itemId, itemName: sp.requiredItem, formName: sp.name });
            }
        }
        gatedForms = found.length ? found : null;
    }

    // P2 (fix 1): item display names + effect text, keyed by item id. Built over
    // the standard pool (itemPool). The wire value stays the Showdown id; only
    // display changes. `name` comes from the items dump (fallback: the id with
    // its first letter raised). `effect` prefers the dump's shortDesc, then desc.
    const itemNames = {};
    const itemEffects = {};
    for (const id of itemPool) {
        if (!id) { itemNames[""] = ""; itemEffects[""] = ""; continue; }
        const it = items[id] || {};
        itemNames[id] = it.name || id.charAt(0).toUpperCase() + id.slice(1);
        itemEffects[id] = it.shortDesc || it.desc || "";
    }

    // P2 (fix 2): ability effect text for this species' ability pool, keyed by
    // ability id. The lane pokedex dump has no ability description, so this is
    // enriched from the same-host abilities.js dump (BattleAbilities). Unknown /
    // dump-absent abilities map to "" (the editor hides the line, never a wrong
    // one). Additive: the record still renders without this source.
    const abilityDescriptions = {};
    for (const ab of abilities) {
        const entry = abilityDump ? abilityDump[ab.id] : null;
        abilityDescriptions[ab.id] = entry ? entry.shortDesc || entry.desc || "" : "";
    }

    return {
        species: species.name,
        dexNum: species.num ?? null,
        types: (species.types || []).map((t) => String(t).toLowerCase()),
        abilities,
        abilityDescriptions,
        moves: movesList,
        items: itemPool,
        itemNames,
        itemEffects,
        levelRange: LEVEL_RANGE,
        natures: ALL_NATURES.slice(),
        isMega,
        isGmax,
        formGate,
        gatedForms,
    };
};

// All species ids present in the pokedex (for the search-to-add list).
export const buildSpeciesList = (data) => Object.keys(data.pokedex).sort();

// G2 (multi-gen picker filter): end-of-gen National-Dex numbers. The pokedex
// dump carries no per-generation field, so `num` is the availability
// discriminator: a base species is available in generation G iff
// num <= GEN_DEX_END[G]. G1 grounding verified against the live dump (max
// num 1025; charizard #6 every gen, arceus #493 / victini #494 gen 5+,
// ogerpon #1017 & palafin #964 gen 9 only). Only the gen 5–9 formats are
// offered (gen4/Let's-Go are out of scope per G1), so these are the only
// cutoffs that apply.
export const GEN_DEX_END = { 5: 649, 6: 721, 7: 809, 8: 905, 9: 1025 };

// The picker's species pool for generation G: pokedex ids that CARRY a `num`
// at or below the gen's dex end. Forme sub-ids without a `num` (37 of them:
// burmysandy, gastrodoneast, shelloseast …) are dropped — the picker lists
// base species (the D1 form-gate handles formes via their base record), so a
// null num is a filter-out, never a crash. A gen outside the map applies no
// cutoff (nothing is hidden) rather than erroring.
export const buildSpeciesListForGen = (data, gen) => {
    const cutoff = GEN_DEX_END[gen];
    return Object.keys(data.pokedex).filter((id) => {
        const num = data.pokedex[id].num;
        return typeof num === "number" && (cutoff === undefined || num <= cutoff);
    }).sort();
};

// The pinned C2 §4 nested shape for one species across several formats:
// { [formatId]: record|null }
export const buildSpeciesRecordsForFormats = (data, speciesId, formatIds) => {
    const out = {};
    for (const f of formatIds) out[f] = buildSpeciesRecord(data, speciesId, f);
    return out;
};

// The exact C2 §4 top-level shape: { [speciesId]: { [formatId]: record|null } }.
// This is what the party builder queries: pass the species it wants to show and
// the formats in its selector, get back per-format legal sets.
export const buildRecordsForSpecies = (data, speciesIds, formatIds) => {
    const out = {};
    for (const sp of speciesIds) out[sp] = buildSpeciesRecordsForFormats(data, sp, formatIds);
    return out;
};

// ---------------------------------------------------------------------------
// Module-wide fetch cache (same idea as api.js bulkMovesPromise).
// ---------------------------------------------------------------------------

let indexPromise = null;

// Ensure the raw index is fetched (once) and return it.
export const loadShowdownIndex = (fetchFn = globalThis.fetch) => {
    if (!indexPromise) {
        indexPromise = fetchShowdownData(fetchFn).then((data) => {
            if (!data || !data.pokedex || !data.moves || !data.learnsets || !data.items) {
                throw new Error("showdown index: incomplete fetch");
            }
            // `abilities` is additive enrichment — an empty {} is fine.
            if (!data.abilities) data.abilities = {};
            return data;
        }).catch((err) => {
            indexPromise = null; // allow retry after a failure
            throw err;
        });
    }
    return indexPromise;
};

// --- high-level async accessors (resolve the cache, then build records) -----
export const getSpeciesRecord = async (speciesId, formatId, fetchFn) => {
    const data = await loadShowdownIndex(fetchFn);
    return buildSpeciesRecord(data, speciesId, formatId);
};

// { [formatId]: record|null } for a species across the given formats.
export const getSpeciesRecordsForFormats = async (speciesId, formatIds, fetchFn) => {
    const data = await loadShowdownIndex(fetchFn);
    return buildSpeciesRecordsForFormats(data, speciesId, formatIds);
};

// All species ids.
export const getSpeciesList = async (fetchFn) => {
    const data = await loadShowdownIndex(fetchFn);
    return buildSpeciesList(data);
};

// G2 (multi-gen picker filter): the base-species pool for generation G —
// `getSpeciesList` results with ids whose dex `num` exceeds the gen's cutoff
// (or carry no `num` at all) removed. Back-compat: `getSpeciesList` is
// unchanged; this is the additive helper the /party picker uses.
export const getSpeciesListForGen = async (gen, fetchFn) => {
    const data = await loadShowdownIndex(fetchFn);
    return buildSpeciesListForGen(data, gen);
};

// Exact C2 §4 top-level shape: { [speciesId]: { [formatId]: record|null } }.
export const getRecordsForSpecies = async (speciesIds, formatIds, fetchFn) => {
    const data = await loadShowdownIndex(fetchFn);
    return buildRecordsForSpecies(data, speciesIds, formatIds);
};
