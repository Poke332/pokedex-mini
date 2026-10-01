// The 25 in-game natures and their stat effects (P2 party-editor UX).
//
// One static table, verified against the canonical nature list (PokeAPI
// /v2/nature detail endpoints) and cross-checked 1:1 against the 25 ALL_NATURES
// ids served by the Showdown lane (showdownData.js). Five natures are neutral
// (bashful, docile, hardy, quirky, serious); every other nature raises exactly
// one stat and lowers one. Stat keys match the C2 §1 StatsTable
// (hp/atk/def/spa/spd/spe), the same dialect the EV/IV inputs use.
//
// Each entry is `{ raises?: StatKey, lowers?: StatKey }` — a neutral nature is
// an empty object. The table is the single source of truth the SetEditor and
// its tests read; it is NOT fetched at runtime.
export const NATURES = {
    adamant: { raises: "atk", lowers: "spa" },
    bashful: {},
    bold: { raises: "def", lowers: "atk" },
    brave: { raises: "atk", lowers: "spe" },
    calm: { raises: "spd", lowers: "atk" },
    careful: { raises: "spd", lowers: "spa" },
    docile: {},
    gentle: { raises: "spd", lowers: "def" },
    hardy: {},
    hasty: { raises: "spe", lowers: "def" },
    impish: { raises: "def", lowers: "spa" },
    jolly: { raises: "spe", lowers: "spa" },
    lax: { raises: "def", lowers: "spd" },
    lonely: { raises: "atk", lowers: "def" },
    mild: { raises: "spa", lowers: "def" },
    modest: { raises: "spa", lowers: "atk" },
    naive: { raises: "spe", lowers: "spd" },
    naughty: { raises: "atk", lowers: "spd" },
    quiet: { raises: "spa", lowers: "spe" },
    quirky: {},
    rash: { raises: "spa", lowers: "spd" },
    relaxed: { raises: "def", lowers: "spe" },
    sassy: { raises: "spd", lowers: "spe" },
    serious: {},
    timid: { raises: "spe", lowers: "atk" },
};

// Short display names for the six stat keys (the option/hint text).
const STAT_LABELS = {
    hp: "HP",
    atk: "Atk",
    def: "Def",
    spa: "SpA",
    spd: "SpD",
    spe: "Spe",
};

const cap = (id) => (id ? id.charAt(0).toUpperCase() + id.slice(1) : "");

// Is this one of the five neutral natures (no stat change)?
export const isNeutralNature = (id) => {
    const n = NATURES[id];
    return !!n && !n.raises && !n.lowers;
};

// The stat effect of a nature, name omitted: "neutral" | "+ Spe, − Atk" |
// "+ Atk" | "− SpD" | "". Empty string when the id is not in the table
// (never a wrong effect — the caller hides the hint on "").
export const natureEffectLabel = (id) => {
    const n = NATURES[id];
    if (!n) return "";
    if (!n.raises && !n.lowers) return "neutral";
    const plus = n.raises ? `+ ${STAT_LABELS[n.raises]}` : "";
    const minus = n.lowers ? `− ${STAT_LABELS[n.lowers]}` : "";
    return [plus, minus].filter(Boolean).join(", ");
};

// Full option text: "Timid (+ Spe, − Atk)" / "Hardy (neutral)".
export const natureLabel = (id) => {
    const effect = natureEffectLabel(id);
    return effect ? `${cap(id)} (${effect})` : cap(id);
};
