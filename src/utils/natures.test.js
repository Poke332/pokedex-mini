// P2 (fix 3) — unit tests for the static 25-nature table (natures.js).
//
// The table was verified against the canonical nature list (PokeAPI
// /v2/nature detail endpoints: increased_stat / decreased_stat per nature)
// and cross-checked 1:1 against the 25 ALL_NATURES ids served by the Showdown
// lane. These tests pin that: all 25 ids present, exactly 5 neutrals, 20
// raise/ lower, and each entry's raises/lowers matching the verified table.
import test from "node:test";
import assert from "node:assert/strict";
import { NATURES, isNeutralNature, natureLabel, natureEffectLabel } from "./natures.js";

// The 25 canonical nature ids — same set the Showdown lane serves (ALL_NATURES).
const CANONICAL = [
    "adamant", "bashful", "bold", "brave", "calm", "careful", "docile", "gentle", "hardy",
    "hasty", "impish", "jolly", "lax", "lonely", "mild", "modest", "naive", "naughty",
    "quiet", "quirky", "rash", "relaxed", "sassy", "serious", "timid",
];

// The verified raises/lowers for all 25 (5 neutral + 20 raise/lower). Neutral
// entries are {} (no keys). Verified from PokeAPI, not memory.
const EXPECTED = {
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

const norm = (v) => (v ? { raises: v.raises ?? null, lowers: v.lowers ?? null } : {});

test("NATURES covers exactly the 25 canonical natures", () => {
    assert.equal(Object.keys(NATURES).length, 25, "25 entries");
    const tableIds = Object.keys(NATURES).sort();
    const canon = CANONICAL.slice().sort();
    assert.deepEqual(tableIds, canon, "ids match the lane's 25 natures 1:1");
});

test("NATURES: every nature's raises/lowers matches the verified table", () => {
    for (const id of CANONICAL) {
        assert.deepEqual(norm(NATURES[id]), norm(EXPECTED[id]), `${id} effect`);
    }
});

test("NATURES: exactly 5 neutrals and 20 raise/lower", () => {
    const neutrals = CANONICAL.filter((id) => isNeutralNature(id));
    const non = CANONICAL.filter((id) => !isNeutralNature(id));
    assert.deepEqual(
        neutrals.sort(),
        ["bashful", "docile", "hardy", "quirky", "serious"],
        "the five neutral natures",
    );
    assert.equal(non.length, 20, "20 raise/lower natures");
    // every non-neutral raises exactly one stat and lowers one
    for (const id of non) {
        const n = NATURES[id];
        assert.ok(n.raises, `${id} raises a stat`);
        assert.ok(n.lowers, `${id} lowers a stat`);
    }
});

test("NATURES: a neutral nature has no raises/lowers keys with truthy values", () => {
    for (const id of ["bashful", "docile", "hardy", "quirky", "serious"]) {
        const n = NATURES[id];
        assert.ok(!n.raises && !n.lowers, `${id} is neutral`);
    }
});

test("natureLabel: neutral -> \"Name (neutral)\"; raise/lower -> \"Name (+ Stat, − Stat)\"", () => {
    assert.equal(natureLabel("hardy"), "Hardy (neutral)");
    assert.equal(natureLabel("bashful"), "Bashful (neutral)");
    assert.equal(natureLabel("timid"), "Timid (+ Spe, − Atk)");
    assert.equal(natureLabel("adamant"), "Adamant (+ Atk, − SpA)");
    // out-of-table id: no label helper crashes, just the plain capitalized id.
    assert.equal(natureLabel("unknownnature"), "Unknownnature", "out-of-table id -> capitalized, no effect");
    assert.equal(natureEffectLabel("unknownnature"), "", "out-of-table id -> \"\" effect");
});

test("natureEffectLabel: neutral -> \"neutral\", unknown -> \"\"", () => {
    assert.equal(natureEffectLabel("hardy"), "neutral");
    assert.equal(natureEffectLabel("docile"), "neutral");
    assert.equal(natureEffectLabel("modest"), "+ SpA, − Atk");
    assert.equal(natureEffectLabel("sassy"), "+ SpD, − Spe");
    assert.equal(natureEffectLabel(""), "");
});
