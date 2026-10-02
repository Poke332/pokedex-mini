// C5 — /party page-level helpers.

/**
 * Count the unresolved problems on a set against its C2 §4 record:
 *  - each empty move slot
 *  - each filled slot whose move id is not in the record's legal pool
 * A null record (data lane not loaded) reports 0 — the chip is advisory only;
 * the service validator (§3.4) is the final authority.
 * @param {object} set a draft/stored set (C2 §1 fields).
 * @param {object|null} record the C2 §4 record for this species+format.
 * @returns {number} number of unresolved slots.
 */
export function unresolvedMoves(set, record) {
    if (!record) return 0;
    const legal = new Set((record.moves || []).map((m) => m.id));
    return (set.moves || []).filter((id) => {
        if (!id) return true;
        return !legal.has(id);
    }).length;
}

/**
 * The format options for the /party header selector. `gen9ou` is the default
 * (IMPLEMENTATION.md §1). G2 (multi-gen): the full cross-gen set the C4 sim
 * service validates (G1's multigen.test.js proves each id live against the
 * installed sim — gen4/letsgo/natdex are OUT: sim 0.11.11 rejects them, so
 * they are deliberately not offered). `group` is the optgroup label for the
 * header select; ids are the wire values sent to the service and data lane.
 * @returns {Array<{id:string,label:string,group:string}>}
 */
export const PARTY_FORMATS = [
    { id: "gen9ou", label: "Gen 9 OU", group: "Gen 9" },
    { id: "gen9ubers", label: "Gen 9 Ubers", group: "Gen 9" },
    { id: "gen9uu", label: "Gen 9 UU", group: "Gen 9" },
    { id: "gen9doublesou", label: "Gen 9 Doubles OU", group: "Gen 9" },
    { id: "gen9monotype", label: "Gen 9 Monotype", group: "Gen 9" },
    { id: "gen8ou", label: "Gen 8 OU", group: "Gen 8" },
    { id: "gen8ubers", label: "Gen 8 Ubers", group: "Gen 8" },
    { id: "gen8uu", label: "Gen 8 UU", group: "Gen 8" },
    { id: "gen8doublesou", label: "Gen 8 Doubles OU", group: "Gen 8" },
    { id: "gen8monotype", label: "Gen 8 Monotype", group: "Gen 8" },
    { id: "gen7ou", label: "Gen 7 OU", group: "Gen 7" },
    { id: "gen6ou", label: "Gen 6 OU", group: "Gen 6" },
    { id: "gen5ou", label: "Gen 5 OU", group: "Gen 5" },
];

// G2 (multi-gen picker filter) + G4 (single-gen window): the end-of-gen
// National-Dex table lives in the data lane (showdownData.js owns the pokedex
// dump shape). party.js imports it so the table is defined exactly once;
// setFormatIssues below and the /party picker both consume it. G4 extended it
// with the gen-4 floor entry (4:493) so the Gen 5 window has a strict lower
// bound. Re-exported for convenience.
import { GEN_DEX_END } from "./showdownData.js";
export { GEN_DEX_END };

/**
 * G2 (multi-gen) format-switch re-gate, tightened to the G4 single-gen window.
 * When the user switches the format to a generation whose dex window
 * (GEN_DEX_END[G-1], GEN_DEX_END[G]] does NOT contain a stored team member's
 * species, that species is no longer available (the picker hides it) — but the
 * team is NOT silently dropped. Each slot whose species carries a national-dex
 * `dexNum` outside the picked gen's window reports one problem:
 * "Name (#num) is not available in Gen G". A record with no `dexNum` (or a
 * record that is still loading) reports nothing — the service validator stays
 * the final authority, this is advisory only (like unresolvedMoves).
 * @param {object} set a draft/stored set (C2 §1 fields; `species` required).
 * @param {object|null} record the C2 §4 record for this species+format.
 * @param {number} gen the generation of the newly-picked format.
 * @returns {string|null} the one-line problem, or null when the set is fine.
 */
export function setFormatIssues(set, record, gen) {
    if (!set || !record) return null;
    const { dexNum, species } = record;
    const hi = GEN_DEX_END[gen];
    if (typeof dexNum !== "number" || typeof hi !== "number") return null;
    const lo = GEN_DEX_END[gen - 1] || 0;
    if (dexNum > lo && dexNum <= hi) return null; // inside that gen's window
    const name = species || String(set.species || "");
    return `${name} (#${dexNum}) is not available in Gen ${gen}`;
}
