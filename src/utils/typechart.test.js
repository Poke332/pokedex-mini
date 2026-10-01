// D1 (fix 3) — unit tests for the move-tooltip type-effectiveness helpers
// (the combined move->foe multiplier + the human label used by MoveTooltip).
//
// Run with `npm test` (node:test, same wiring as the C3/C5/C6 suites).
import test from "node:test";
import assert from "node:assert/strict";

import {
    multiplierFor,
    cellMeta,
    effectivenessFor,
    effectivenessLabel,
} from "./typechart.js";

// A minimal damage_relations slice: enough to exercise super/weak/immune.
// The real map is PokeAPI's per-type list ({ name } entries); these synthesize
// the shapes multiplierFor reads (contains-by-name).
const rel = {
    fire: {
        double_damage_to: [{ name: "grass" }, { name: "ice" }, { name: "bug" }],
        half_damage_to: [{ name: "fire" }, { name: "water" }, { name: "grass" }],
        no_damage_to: [{ name: "steel" }],
    },
    water: {
        double_damage_to: [{ name: "fire" }, { name: "rock" }, { name: "ground" }],
        half_damage_to: [{ name: "water" }, { name: "grass" }],
    },
    normal: {
        half_damage_to: [{ name: "rock" }, { name: "steel" }],
        no_damage_to: [],
    },
};

test("multiplierFor: the single-type matrix semantics", () => {
    assert.equal(multiplierFor("fire", "grass", rel), 2, "super effective");
    assert.equal(multiplierFor("fire", "water", rel), 0.5, "not very effective");
    assert.equal(multiplierFor("fire", "steel", rel), 0, "no effect");
    assert.equal(multiplierFor("fire", "fire", rel), 0.5, "halved by same type");
    assert.equal(multiplierFor("normal", "rock", rel), 0.5);
    assert.equal(multiplierFor("ghost", "normal", rel), 1, "unknown atk type -> neutral");
});

test("effectivenessFor: composed across the foe's type list", () => {
    // fire on a grass/bug foe: 2 * 2 = 4
    assert.equal(effectivenessFor("fire", ["grass", "bug"], rel), 4);
    // fire on a fire/steel foe: short-circuits at the steel 0
    assert.equal(effectivenessFor("fire", ["fire", "steel"], rel), 0);
    // water on a fire/ground foe: 2 * 2 = 4
    assert.equal(effectivenessFor("water", ["fire", "ground"], rel), 4);
    // water on a water/grass foe: 0.5 * 0.5 = 0.25
    assert.equal(effectivenessFor("water", ["water", "grass"], rel), 0.25);
    // normal on a rock/steel foe: 0.5 * 0.5 = 0.25
    assert.equal(effectivenessFor("normal", ["rock", "steel"], rel), 0.25);
    // neutral single type
    assert.equal(effectivenessFor("fire", ["fire"], rel), 0.5);
});

test("effectivenessFor: uncomputable inputs return null (never a wrong number)", () => {
    assert.equal(effectivenessFor(null, ["fire"], rel), null, "no atk type");
    assert.equal(effectivenessFor("fire", [], rel), null, "no foe types");
    assert.equal(effectivenessFor("fire", undefined, rel), null, "foe types missing");
    assert.equal(effectivenessFor("fire", ["fire"], null), null, "no relations loaded");
});

test("cellMeta: the existing single-cell labels are untouched", () => {
    assert.deepEqual(cellMeta(2), { text: "2×", tone: "super" });
    assert.deepEqual(cellMeta(0.5), { text: "½", tone: "weak" });
    assert.deepEqual(cellMeta(0), { text: "×", tone: "immune" });
    assert.deepEqual(cellMeta(1), { text: "", tone: "neutral" });
});

test("effectivenessLabel: the tooltip copy + tone", () => {
    assert.deepEqual(effectivenessLabel(2), { text: "Super effective (2×)", tone: "super" });
    assert.deepEqual(effectivenessLabel(4), { text: "Highly effective (4×)", tone: "super" });
    assert.deepEqual(effectivenessLabel(0.5), { text: "Not very effective (½×)", tone: "weak" });
    assert.deepEqual(effectivenessLabel(0.25), { text: "Very weak (¼×)", tone: "weak" });
    assert.deepEqual(effectivenessLabel(0), { text: "No effect", tone: "immune" });
    assert.deepEqual(effectivenessLabel(1), { text: "Neutral", tone: "neutral" });
    assert.deepEqual(effectivenessLabel(null), { text: "—", tone: "neutral" });
    assert.deepEqual(effectivenessLabel(undefined), { text: "—", tone: "neutral" });
});
