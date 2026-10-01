// Party-builder team helpers (C5).
//
// Builds `PokemonSet[]` for the C2 wire contract (docs/simulation-dto.md §1)
// from editor drafts, and provides the default table used when a stored or
// fresh set omits optional fields. The service validator is the final
// authority on legality (§3.4); these helpers only guarantee the wire shape
// is complete and the omitted optionals collapse to their sim defaults.

// The 18 in-game types — the options for the two C2 §1 optional type-metadata
// fields `hpType` (Hidden Power) and `teraType` (Gen 9 Tera). A "none" entry
// (empty string) omits the field from the emitted set.
export const TYPE_IDS = [
    "normal", "fighting", "flying", "poison", "ground", "rock", "bug",
    "ghost", "steel", "fire", "water", "grass", "electric", "psychic",
    "ice", "dragon", "dark", "fairy",
];

/**
 * All-zero StatsTable for the omitted-EVs default (C2 §1).
 * @returns {{hp:number,atk:number,def:number,spa:number,spd:number,spe:number}}
 */
export const emptyEvs = () => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });

/**
 * All-31 StatsTable for the omitted-IVs default (C2 §1).
 * @returns {{hp:number,atk:number,def:number,spa:number,spd:number,spe:number}}
 */
export const fullIvs = () => ({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });

/**
 * Max EVs permitted on a single stat (sim accepts 0–255; C2 §1 says 0–252).
 */
export const MAX_EV = 252;

/**
 * The C1 soft cap on the total EV budget (advisory hint only — OD-3: the
 * service validator is the authority; the UI never hard-blocks at this total).
 */
export const EV_TOTAL_CAP = 252;

/**
 * A fresh editor draft for one team slot.
 * @param {string} speciesId Showdown species id (e.g. "charizard").
 * @param {{species?:string, abilities?:Array<{id:string,default?:boolean}>,
 *         formGate?:object}} [record]
 *   the C2 §4 record for this species+format, when already fetched (defaults
 *   the ability to the species' default-listed ability; a FORM-gated species —
 *   Mega/Gmax/Z-Crystal … — starts on its BASE form, D1 fix 4).
 * @returns {object} a draft set; `species` is the wire id, `moves` holds the
 *   4 slot ids (empty string = not yet chosen), type metadata empty.
 */
export const blankSet = (speciesId, record) => {
    const ability = record?.abilities?.find((a) => a.default)?.id
        ?? record?.abilities?.[0]?.id
        ?? "";
    // D1 (fix 4): a FORM that carries the lane's formGate — item-gated
    // (Mega stone, Z-Crystal, Primal orb …) or Gmax (no equippable v1 item) —
    // starts on its BASE form; the SetEditor surfaces the required item as an
    // explicit gate. Forms without a gate (Cosplay, Origin, …) are kept as
    // their own species.
    const gate = record?.formGate;
    const species = gate && speciesId === gate.form ? gate.base : speciesId;
    return {
        species,
        moves: ["", "", "", ""],
        ability,
        item: "",
        level: 100,
        ivs: fullIvs(),
        evs: emptyEvs(),
        nature: "hardy",
        hpType: "",
        teraType: "",
    };
};

// Clamp helper — undefined/null/NaN fall through to the default.
const num = (v, d, min, max) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return d;
    return Math.min(max, Math.max(min, Math.round(n)));
};

// Rebuild a StatsTable from possibly-partial stored data.
const statsFrom = (obj, defaults, min, max) => {
    const out = {};
    for (const k of Object.keys(defaults)) {
        out[k] = num(obj?.[k], defaults[k], min, max);
    }
    return out;
};

// D1 (fix 4): form-gating helpers. The data lane (showdownData.js) records on
// each C2 §4 record which transformed FORMS need a held item to exist
// (`formGate` on a form species; `gatedForms` on its base) plus `isMega`/
// `isGmax` flags. Storing or sending a forme without its gate item would
// reach the service validator and be rejected, so:
//   - the BUILDER DEFAULTS to the base form (blankSet keeps `formGate.base`);
//   - the set RESOLVES to the transformed form only while the gate item is
//     held (resolveSpeciesForFormGate at team-build time).
// The PokemonSet wire shape is unchanged — `species` is still a single string
// field; only which string the builder emits changes.
//
// @param {string} species the stored species id (base or form).
// @param {object|null} record the C2 §4 record for that species.
// @param {string} [item] the held item id.
// @returns {string} the species id the team/battle should carry.
export const resolveSpeciesForFormGate = (species, record, item = "") => {
    const sp = String(species || "");
    const held = String(item || "");
    // Stored as a FORM: only valid while its gate item is equipped.
    const gate = record?.formGate;
    if (gate) {
        if (sp === gate.form) {
            return gate.item && held === gate.item ? sp : gate.base;
        }
        // Gate on another form of this species (e.g. stored base while the
        // record is a form's): keep the stored value.
        return sp;
    }
    // Stored as the BASE form: transform when the user equipped one of its
    // gated forms' items. Gmax gates carry item "" (no v1 item) — never match.
    const forms = record?.gatedForms;
    if (forms?.length && held) {
        const match = forms.find((f) => f.item && f.item === held);
        if (match) return match.form;
    }
    return sp;
};

/**
 * Coerce any stored / draft set into the complete C2 §1 wire shape
 * (`PokemonSet`). Omitted optionals collapse to their sim defaults:
 * level 100, ivs 31s, evs 0s, nature "hardy", item "". Empty type-metadata
 * fields are omitted entirely (never sent as "").
 * @param {object} draft the stored set (partial ok).
 * @param {object} [record] optional C2 §4 record used to resolve form-gated
 *   species (Mega/Gmax/Primal …) to their base form when the gate item is
 *   not held — see resolveSpeciesForFormGate.
 * @returns {object} a clean PokemonSet carrying exactly the fields a team needs.
 */
export const normalizeSet = (draft, record) => {
    const d = draft || {};
    const moves = (Array.isArray(d.moves) ? d.moves : ["", "", "", ""])
        .slice(0, 4)
        .map((m) => String(m ?? "").trim());
    while (moves.length < 4) moves.push("");
    const item = String(d.item ?? "");
    const set = {
        species: resolveSpeciesForFormGate(d.species, record, item),
        moves,
        level: num(d.level, 100, 5, 100),
        ability: String(d.ability ?? ""),
        item,
        evs: statsFrom(d.evs, emptyEvs(), 0, 255),
        ivs: statsFrom(d.ivs, fullIvs(), 0, 31),
        nature: String(d.nature ?? "hardy") || "hardy",
    };
    if (d.hpType) set.hpType = String(d.hpType);
    if (d.teraType) set.teraType = String(d.teraType);
    return set;
};

/**
 * The team payload for `POST /team/validate` / `POST /battle` p1Team:
 * normalized, with fully-empty sets dropped (a 1–6 array, C2 §1).
 * @param {object[]} sets draft or stored sets.
 * @param {object} [records] optional speciesId -> C2 §4 record map (the
 *   current format's lane records, per-species) used to resolve form-gated
 *   species (base form + gate item → the transformed form; forme without the
 *   item → the base form) before the team ships to the service.
 * @returns {object[]} PokemonSet[].
 */
export const buildTeam = (sets, records) =>
    (sets || [])
        .filter((s) => s && String(s.species || "").trim())
        .map((s) => normalizeSet(s, records?.[s.species]));
