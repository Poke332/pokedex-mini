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
 * (IMPLEMENTATION.md §1); the rest are common Showdown tier ids the C4
 * validator accepts. The id is the wire value sent to the service and the
 * data lane.
 * @returns {Array<{id:string,label:string}>}
 */
export const PARTY_FORMATS = [
    { id: "gen9ou", label: "Gen 9 OU" },
    { id: "gen9ubers", label: "Gen 9 Ubers" },
    { id: "gen9uu", label: "Gen 9 UU" },
    { id: "gen9doublesou", label: "Gen 9 Doubles OU" },
];
