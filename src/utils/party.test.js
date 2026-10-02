// C5 — unit tests for the /party team helpers.
//
// pokemonSets.js: the C2 §1 wire-shape builder (normalizeSet / buildTeam /
// blankSet) — the only shape C4 consumes, so it is pinned here.
// partyStore.js:  versioned localStorage round-trip + the reset escape hatch.
// party.js:       the advisory unresolved-move counter + the format list.
import test from "node:test";
import assert from "node:assert/strict";

import {
    blankSet,
    normalizeSet,
    buildTeam,
    emptyEvs,
    fullIvs,
    MAX_EV,
    EV_TOTAL_CAP,
    TYPE_IDS,
    resolveSpeciesForFormGate,
} from "./pokemonSets.js";
import { loadParty, saveParty, resetParty, PARTY_STORAGE_KEY } from "./partyStore.js";
import { unresolvedMoves, PARTY_FORMATS, GEN_DEX_END, setFormatIssues } from "./party.js";

// A minimal C2 §4 record (charizard @ gen9ou, C2 §4 example fields).
const record = {
    species: "Charizard",
    dexNum: 6,
    types: ["fire", "flying"],
    abilities: [
        { id: "blaze", name: "Blaze", default: true },
        { id: "drought", name: "Drought", default: false },
    ],
    moves: [
        { id: "flamethrower", name: "Flamethrower", type: "fire", category: "Special", power: 90 },
        { id: "dragonpulse", name: "Dragon Pulse", type: "dragon", category: "Special", power: 85 },
        { id: "roost", name: "Roost", type: "flying", category: "Status", power: null },
        { id: "swordsdance", name: "Swords Dance", type: "normal", category: "Status", power: null },
    ],
    items: ["", "choicescarf", "lifeorb"],
    levelRange: { min: 5, max: 100 },
    natures: ["hardy", "timid", "jolly"],
};

test("blankSet defaults: 4 empty move slots, default ability, C1 default table", () => {
    const s = blankSet("charizard", record);
    assert.equal(s.species, "charizard");
    assert.deepEqual(s.moves, ["", "", "", ""]);
    assert.equal(s.ability, "blaze", "defaults to the default-listed ability");
    assert.equal(s.item, "");
    assert.equal(s.level, 100);
    assert.deepEqual(s.evs, emptyEvs());
    assert.deepEqual(s.ivs, fullIvs());
    assert.equal(s.nature, "hardy");
    assert.equal(s.hpType, "");
    assert.equal(s.teraType, "");
});

test("blankSet without a record leaves the ability empty", () => {
    const s = blankSet("charizard", null);
    assert.equal(s.ability, "");
});

test("normalizeSet completes a partial stored set to the full C2 §1 shape", () => {
    const s = normalizeSet({ species: "charizard", moves: ["flamethrower"] });
    assert.equal(s.species, "charizard");
    assert.deepEqual(s.moves, ["flamethrower", "", "", ""], "slots pad to 4");
    assert.equal(s.level, 100, "default level");
    assert.equal(s.ability, "");
    assert.equal(s.item, "");
    assert.deepEqual(s.evs, emptyEvs());
    assert.deepEqual(s.ivs, fullIvs());
    assert.equal(s.nature, "hardy");
    assert.ok(!("hpType" in s), "empty type metadata is omitted");
    assert.ok(!("teraType" in s), "empty type metadata is omitted");
});

test("normalizeSet clamps level/IVs/EVs into their C2 §1 ranges", () => {
    const s = normalizeSet({
        species: "garchomp",
        level: 9999,
        ivs: { hp: 64, atk: -1, def: 15, spa: 15, spd: 15, spe: 15 },
        evs: { hp: 300, atk: 10, def: 0, spa: 0, spd: 0, spe: 0 },
    });
    assert.equal(s.level, 100, "level clamps to max 100");
    assert.equal(s.ivs.hp, 31, "IV clamps to max 31");
    assert.equal(s.ivs.atk, 0, "IV clamps to min 0");
    assert.equal(s.evs.hp, 255, "EV raw value clamps into the 0-255 sim range");
});

test("normalizeSet keeps non-empty type metadata", () => {
    const s = normalizeSet({ species: "charizard", hpType: "fire", teraType: "dragon" });
    assert.equal(s.hpType, "fire");
    assert.equal(s.teraType, "dragon");
});

test("buildTeam drops empty slots and normalizes the rest", () => {
    const team = buildTeam([
        { species: "charizard", moves: ["flamethrower", "dragonpulse", "roost", "swordsdance"] },
        null,
        { species: "" },
        { species: "garchomp" },
    ]);
    assert.equal(team.length, 2);
    assert.deepEqual(team.map((s) => s.species), ["charizard", "garchomp"]);
    assert.equal(team[0].moves.length, 4);
});

test("invariants: EV caps and the 18-type metadata list", () => {
    assert.equal(MAX_EV, 252, "per-stat clamp stays 252");
    assert.equal(EV_TOTAL_CAP, 510, "in-game total cap is 510 (not 252)");
    assert.equal(TYPE_IDS.length, 18);
    assert.ok(TYPE_IDS.includes("fairy"));
    assert.ok(!TYPE_IDS.includes("steelx"));
});

// --- D1 (fix 4): form-gated transforms ------------------------------------
// A FORM that requires a held item (Mega stone / Z-Crystal / Primal orb / …)
// must NOT auto-expand: the builder defaults to the BASE form and only
// resolves to the transformed form while the gate item is held. The
// PokemonSet wire shape is unchanged (species is still a single string).
const megaxRecord = {
    species: "Charizard-Mega-X",
    formGate: {
        form: "charizardmegax",
        base: "charizard",
        item: "charizarditex",
        itemName: "Charizardite X",
        formName: "Charizard-Mega-X",
        baseName: "Charizard",
    },
    abilities: [{ id: "toughclaws", name: "Tough Claws", default: true }],
};
const baseRecord = {
    species: "Charizard",
    gatedForms: [
        { form: "charizardmegax", item: "charizarditex", itemName: "Charizardite X", formName: "Charizard-Mega-X" },
        { form: "charizardgmax", item: "", itemName: "", formName: "Charizard-Gmax" },
    ],
    abilities: [{ id: "blaze", name: "Blaze", default: true }],
};

test("blankSet: a FORM-gated species defaults to its BASE form", () => {
    // Adding Charizard-Mega-X to the party starts on Charizard (base) with
    // item "" — the SetEditor surfaces the Charizardite X gate; the set only
    // becomes the Mega form when the user equips the item.
    const s = blankSet("charizardmegax", megaxRecord);
    assert.equal(s.species, "charizard", "builder default = base form");
    assert.equal(s.item, "");
});

test("blankSet: a Gmax gate (no v1 item) also defaults to the base form", () => {
    // Gmax formes carry formGate.item === "" (no equippable v1 item); the
    // builder still holds the requirement — no silent auto-transform.
    const gmaxRecord = {
        species: "Charizard-Gmax",
        formGate: {
            form: "charizardgmax",
            base: "charizard",
            item: "",
            itemName: "",
            formName: "Charizard-Gmax",
            baseName: "Charizard",
        },
    };
    const s = blankSet("charizardgmax", gmaxRecord);
    assert.equal(s.species, "charizard", "Gmax default = base form (no item to hold)");
});

test("blankSet: a form WITHOUT an item requirement keeps its own species", () => {
    // e.g. Charizard-Alola has no requiredItem — it is its own legal species.
    const s = blankSet("charizardalola", { species: "Charizard-Alola" });
    assert.equal(s.species, "charizardalola");
});

test("resolveSpeciesForFormGate: stored form + gate item = the form; without it = the base", () => {
    // A set stored as the form only exists while its item is held.
    assert.equal(resolveSpeciesForFormGate("charizardmegax", megaxRecord, "charizarditex"), "charizardmegax");
    assert.equal(resolveSpeciesForFormGate("charizardmegax", megaxRecord, ""), "charizard", "item-less form -> base");
    assert.equal(resolveSpeciesForFormGate("charizardmegax", megaxRecord, "choicescarf"), "charizard", "wrong item -> base");
});

test("resolveSpeciesForFormGate: base + gate item = the transformed form (gated transform on equip)", () => {
    assert.equal(resolveSpeciesForFormGate("charizard", baseRecord, "charizarditex"), "charizardmegax");
    assert.equal(resolveSpeciesForFormGate("charizard", baseRecord, ""), "charizard", "no item: base form default");
    assert.equal(resolveSpeciesForFormGate("charizard", baseRecord, "choicescarf"), "charizard", "non-gate item: base");
    // Gmax gate (item "") can never match — the base stays the base.
    assert.equal(resolveSpeciesForFormGate("charizard", baseRecord, "dynamaxband"), "charizard");
});

test("normalizeSet: form-gated species resolves with the record (wire shape unchanged)", () => {
    // Stored form, gate item held -> normalized set ships the form id.
    const withItem = normalizeSet(
        { species: "charizardmegax", item: "charizarditex" },
        megaxRecord,
    );
    assert.equal(withItem.species, "charizardmegax");
    assert.equal(withItem.item, "charizarditex");

    // Stored form WITHOUT the gate item -> the base form, item kept as-is.
    const noItem = normalizeSet({ species: "charizardmegax", item: "" }, megaxRecord);
    assert.equal(noItem.species, "charizard", "item-less forme reverts to base");

    // No record (lane not loaded): the stored species passes through —
    // the service validator remains the final authority.
    assert.equal(normalizeSet({ species: "charizardmegax", item: "" }).species, "charizardmegax");
});

test("buildTeam: per-species record map resolves gated forms at team build", () => {
    const team = buildTeam(
        [
            { species: "charizard", item: "charizarditex" },
            { species: "charizard" },
        ],
        { charizard: baseRecord },
    );
    assert.equal(team.length, 2);
    assert.equal(team[0].species, "charizardmegax", "gate item held -> transformed form");
    assert.equal(team[1].species, "charizard", "no item -> base form default");
    // wire shape is still the plain C2 §1 PokemonSet — no extra fields leak.
    assert.deepEqual(
        Object.keys(team[0]).filter((k) => !["evs", "ivs"].includes(k)).sort(),
        ["ability", "item", "level", "moves", "nature", "species"],
    );
});

// --- partyStore ---------------------------------------------------------------
// A Map-backed fake implementing the localStorage surface the store uses.
const fakeStorage = () => {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
    };
};

test("loadParty on empty storage returns the empty default", () => {
    const p = loadParty(fakeStorage());
    assert.equal(p.format, "gen9ou");
    assert.deepEqual(p.team, []);
    assert.equal(p.version, 1);
});

test("save/load round-trip preserves format + team", () => {
    const store = fakeStorage();
    saveParty({ format: "gen9ou", team: [{ species: "charizard", moves: ["flamethrower"] }] }, store);
    const p = loadParty(store);
    assert.equal(p.format, "gen9ou");
    assert.equal(p.team.length, 1);
    assert.equal(p.team[0].species, "charizard");
});

test("saveParty truncates to 6 sets and drops slotless entries", () => {
    const store = fakeStorage();
    const team = Array.from({ length: 8 }, (_, i) => ({ species: `sp${i}` }));
    team[3] = null;
    saveParty({ format: "gen9ou", team }, store);
    const p = loadParty(store);
    assert.equal(p.team.length, 5, "7 species sets after the null drop + 6-cap");
    assert.ok(!p.team.some((s) => s === null));
});

test("loadParty discards a stale-version blob silently", () => {
    const store = fakeStorage();
    store.setItem(PARTY_STORAGE_KEY, JSON.stringify({ version: 99, format: "gen9ou", team: [{ species: "x" }] }));
    const p = loadParty(store);
    assert.deepEqual(p.team, []);
});

test("loadParty discards corrupt JSON silently", () => {
    const store = fakeStorage();
    store.setItem(PARTY_STORAGE_KEY, "{not json");
    assert.deepEqual(loadParty(store).team, []);
});

test("resetParty clears the key (the escape hatch)", () => {
    const store = fakeStorage();
    saveParty({ format: "gen9ou", team: [{ species: "charizard" }] }, store);
    assert.equal(loadParty(store).team.length, 1);
    resetParty(store);
    assert.equal(store.getItem(PARTY_STORAGE_KEY), null, "the key is gone (null = absent)");
    assert.deepEqual(loadParty(store).team, []);
});

test("store survives a missing storage backend (node) without throwing", () => {
    assert.deepEqual(loadParty(null).team, []);
    saveParty({ format: "gen9ou", team: [] }, null);
    resetParty(null);
});

// --- party.js ------------------------------------------------------------------
test("unresolvedMoves counts empty + out-of-pool slots, 0 when no record", () => {
    const set = {
        species: "charizard",
        moves: ["flamethrower", "", "ghostbolt", "roost"],
    };
    assert.equal(unresolvedMoves(set, null), 0, "advisory chip off until the record lands");
    assert.equal(unresolvedMoves(set, record), 2, "empty slot + a move not in the pool");
    assert.equal(
        unresolvedMoves({ species: "charizard", moves: ["flamethrower", "roost", "dragonpulse", "swordsdance"] }, record),
        0,
    );
});

test("PARTY_FORMATS defaults to gen9ou and carries wire ids", () => {
    assert.equal(PARTY_FORMATS[0].id, "gen9ou", "default format (IMPLEMENTATION §1)");
    for (const f of PARTY_FORMATS) {
        assert.match(f.id, /^[a-z0-9]+$/, "ids are Showdown wire values");
        assert.ok(f.label.length > 0);
        assert.ok(f.group.length > 0, "every format carries an optgroup label");
    }
});

// --- G2 (multi-gen) ----------------------------------------------------------------
// The full cross-gen set the C4 sim service validates (G1). gen4/letsgo/natdex are
// NOT offered — sim 0.11.11 rejects them, so they must never appear here.
test("PARTY_FORMATS is the cross-gen set: 13 formats, gen9 tiers first, no rejected gens", () => {
    const ids = PARTY_FORMATS.map((f) => f.id);
    // the original 4 gen9 tiers stay first (back-compat — a stored party.format
    // like "gen9doublesou" still resolves to a real option).
    assert.deepEqual(
        ids.slice(0, 4),
        ["gen9ou", "gen9ubers", "gen9uu", "gen9doublesou"],
        "existing 4 keep their order (back-compat)",
    );
    // the new tiers are all offered.
    for (const id of [
        "gen9monotype",
        "gen8ou", "gen8ubers", "gen8uu", "gen8doublesou", "gen8monotype",
        "gen7ou", "gen6ou", "gen5ou",
    ]) {
        assert.ok(ids.includes(id), `format ${id} is offered`);
    }
    assert.equal(ids.length, 13, "13 total (5 gen9 + 5 gen8 + 1 gen7 + 1 gen6 + 1 gen5)");
    // the sim-rejected gens are deliberately absent.
    for (const bad of ["gen4ou", "letsgo", "natdexou"]) {
        assert.ok(!ids.includes(bad), `${bad} is NOT offered (sim rejects it)`);
    }
});

test("an old stored format still loads: loadParty keeps a format id even when the team is empty", () => {
    // A party stored under a cross-gen format (gen5ou) round-trips intact — no
    // migration, the format id is preserved as-is.
    const store = fakeStorage();
    saveParty({ format: "gen5ou", team: [] }, store);
    const p = loadParty(store);
    assert.equal(p.format, "gen5ou", "stored cross-gen format is preserved on load");
});

test("setFormatIssues: a set outside the picked gen's single-gen window is flagged, inside is not", () => {
    // G4 window rule: dexNum must fall in (GEN_DEX_END[G-1], GEN_DEX_END[G]].
    // A record whose dexNum is above the picked format's gen window end -> problem.
    const ogerponRec = { species: "Ogerpon", dexNum: 1017 };
    assert.equal(setFormatIssues({ species: "ogerpon" }, ogerponRec, 5), "Ogerpon (#1017) is not available in Gen 5");
    // The same record at its own gen (9) is fine (1017 in (905,1025]).
    assert.equal(setFormatIssues({ species: "ogerpon" }, ogerponRec, 9), null, "gen9 window (905,1025] covers #1017");
    // G4 tightening: a mon BELOW the picked gen's window floor is also flagged —
    // Garchomp #445 in a Gen 9 team (floor 905) is not available, even though
    // the old cumulative rule (445 <= 1025) would have let it through.
    const garchompRec = { species: "Garchomp", dexNum: 445 };
    assert.equal(setFormatIssues({ species: "garchomp" }, garchompRec, 9), "Garchomp (#445) is not available in Gen 9");
    // A record with no dexNum (or a still-loading null record) reports nothing —
    // the service validator stays the final authority.
    assert.equal(setFormatIssues({ species: "x" }, { species: "X" }, 5), null, "no dexNum -> no advisory");
    assert.equal(setFormatIssues({ species: "x" }, null, 5), null, "null record -> no advisory");
    // An un-offered gen that IS in the table (4) still has a window —
    // (0,493] here — so Ogerpon #1017 is outside it and flagged. (Party
    // formats never select gen 4; this just proves the window math applies
    // whenever the gen is in the table.)
    assert.equal(setFormatIssues({ species: "x" }, ogerponRec, 4), "Ogerpon (#1017) is not available in Gen 4");
    // A gen with NO table entry (10) has no window -> no advisory.
    assert.equal(setFormatIssues({ species: "x" }, ogerponRec, 10), null, "unknown gen -> no window -> no advisory");
});

test("GEN_DEX_END is the shared G4 window table (floor + ends, gen 4–9)", () => {
    assert.deepEqual(GEN_DEX_END, { 4: 493, 5: 649, 6: 721, 7: 809, 8: 905, 9: 1025 });
});
