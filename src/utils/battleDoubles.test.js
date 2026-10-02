// P4 — unit tests for the /battle doubles helpers (src/utils/battleDoubles.js).
//
// Run with `npm test` (node:test, same wiring as the other suites).
import test from "node:test";
import assert from "node:assert/strict";

import {
    isDoublesFormat,
    moveNeedsTarget,
    doublesTargetOptions,
    targetLocSuffix,
    defaultDoubleTargetLoc,
    doublesSecondLead,
} from "./battleDoubles.js";

const MON = (name, species, condition = "100/100", position = 0) => ({
    ident: `p1a: ${name}`,
    species,
    name,
    condition,
    position,
});

test("isDoublesFormat gates on gen9doublesou only", () => {
    assert.equal(isDoublesFormat("gen9doublesou"), true);
    assert.equal(isDoublesFormat("gen9ou"), false);
    assert.equal(isDoublesFormat("gen9ubers"), false);
    assert.equal(isDoublesFormat(undefined), false);
});

test("moveNeedsTarget: only the sim's CHOOSABLE target types", () => {
    assert.equal(moveNeedsTarget({ target: "normal" }), true);
    assert.equal(moveNeedsTarget({ target: "any" }), true);
    assert.equal(moveNeedsTarget({ target: "adjacentFoe" }), true);
    assert.equal(moveNeedsTarget({ target: "adjacentAlly" }), true);
    assert.equal(moveNeedsTarget({ target: "adjacentAllyOrSelf" }), true);
    // side / all / self-typed moves take no location.
    assert.equal(moveNeedsTarget({ target: "self" }), false);
    assert.equal(moveNeedsTarget({ target: "foeSide" }), false);
    assert.equal(moveNeedsTarget({ target: "all" }), false);
    assert.equal(moveNeedsTarget({ target: "allyTeam" }), false);
    assert.equal(moveNeedsTarget({ target: "randomNormal" }), false);
    assert.equal(moveNeedsTarget({ target: "allAdjacent" }), false);
    assert.equal(moveNeedsTarget({}), false);
    assert.equal(moveNeedsTarget(null), false);
});

test("doublesTargetOptions: a foe-targeting move offers the two foes, +loc", () => {
    const foes = [MON("Corviknight", "corviknight", "80/100", 0), MON("Gyarados", "gyarados", "60/100", 1)];
    const actives = [MON("Garchomp", "garchomp", "100/100", 0), MON("Charizard", "charizard", "100/100", 1)];
    const out = doublesTargetOptions({ target: "normal" }, actives, foes);
    assert.equal(out.side, "foe");
    assert.equal(out.options.length, 2);
    assert.deepEqual(out.options.map((o) => o.loc), [1, 2]);
    assert.deepEqual(out.options.map((o) => o.locText), ["+1", "+2"]);
    assert.deepEqual(out.options.map((o) => o.label), ["Corviknight", "Gyarados"]);
    assert.equal(out.options.every((o) => !o.disabled), true);
});

test("doublesTargetOptions: a fainted foe is disabled (no loc)", () => {
    const foes = [
        MON("Corviknight", "corviknight", "0/100 fnt", 0),
        MON("Gyarados", "gyarados", "60/100", 1),
    ];
    const actives = [MON("Garchomp", "garchomp", "100/100", 0)];
    const out = doublesTargetOptions({ target: "normal" }, actives, foes);
    assert.deepEqual(out.options.map((o) => o.disabled), [true, false]);
    assert.equal(out.options[0].loc, 0);
    assert.equal(out.options[0].locText, "");
    assert.equal(out.options[0].reason, "fainted");
    // the surviving foe still gets +2.
    assert.equal(out.options[1].loc, 2);
    assert.equal(out.options[1].locText, "+2");
});

test("doublesTargetOptions: adjacentFoe offers the visible foe field (+loc)", () => {
    const foes = [MON("Corviknight", "corviknight", "80/100", 0), MON("Gyarados", "gyarados", "60/100", 1)];
    // adjacentFoe takes a location like normal; the full visible foe list is
    // offered and the service auto-resolves a slot that turns out unavailable.
    const out = doublesTargetOptions({ target: "adjacentFoe" }, [MON("Garchomp", "garchomp")], foes);
    assert.equal(out.side, "foe");
    assert.deepEqual(out.options.map((o) => o.loc), [1, 2]);
});

test("doublesTargetOptions: an ally move targets the own field (negative loc)", () => {
    const actives = [
        MON("Garchomp", "garchomp", "100/100", 0),
        MON("Charizard", "charizard", "80/100", 1),
    ];
    const out = doublesTargetOptions({ target: "adjacentAlly" }, actives, [MON("Corviknight", "corviknight")]);
    assert.equal(out.side, "ally");
    // adjacentAlly: only the adjacent ally (actives[1]) is legal; the acting
    // mon (actives[0]) itself is NOT.
    assert.deepEqual(out.options.map((o) => o.disabled), [true, false]);
    assert.deepEqual(out.options.map((o) => o.loc), [0, -2]);
    assert.deepEqual(out.options.map((o) => o.locText), ["", "-2"]);
});

test("doublesTargetOptions: adjacentAllyOrSelf allows the acting mon too", () => {
    const actives = [
        MON("Garchomp", "garchomp", "100/100", 0),
        MON("Charizard", "charizard", "80/100", 1),
    ];
    const out = doublesTargetOptions({ target: "adjacentAllyOrSelf" }, actives, [MON("Corviknight", "corviknight")]);
    // both own actives are legal (self + adjacent ally).
    assert.deepEqual(out.options.map((o) => o.disabled), [false, false]);
    assert.deepEqual(out.options.map((o) => o.loc), [-1, -2]);
    assert.deepEqual(out.options.map((o) => o.locText), ["-1", "-2"]);
});

test("targetLocSuffix: the C2 move-token suffix grammar", () => {
    assert.equal(targetLocSuffix(0), "");
    assert.equal(targetLocSuffix(1), "+1");
    assert.equal(targetLocSuffix(2), "+2");
    assert.equal(targetLocSuffix(-1), "-1");
    assert.equal(targetLocSuffix(-2), "-2");
    assert.equal(targetLocSuffix(undefined), "");
});

test("defaultDoubleTargetLoc: foe types default to the first valid foe (+1)", () => {
    const foes = [MON("Corviknight", "corviknight", "80/100"), MON("Gyarados", "gyarados", "60/100")];
    assert.equal(defaultDoubleTargetLoc({ target: "normal" }, [MON("Garchomp", "garchomp")], foes), 1);
});

test("defaultDoubleTargetLoc: a fainted first foe defaults to +2", () => {
    const foes = [MON("Corviknight", "corviknight", "0/100 fnt"), MON("Gyarados", "gyarados", "60/100")];
    assert.equal(defaultDoubleTargetLoc({ target: "normal" }, [MON("Garchomp", "garchomp")], foes), 2);
});

test("defaultDoubleTargetLoc: no valid target -> null (ship the bare move)", () => {
    const foes = [MON("Corviknight", "corviknight", "0/100 fnt")];
    assert.equal(defaultDoubleTargetLoc({ target: "normal" }, [MON("Garchomp", "garchomp")], foes), null);
});

test("defaultDoubleTargetLoc: ally types default to the adjacent ally (-2)", () => {
    const actives = [MON("Garchomp", "garchomp"), MON("Charizard", "charizard")];
    assert.equal(defaultDoubleTargetLoc({ target: "adjacentAlly" }, actives, [MON("Corviknight", "corviknight")]), -2);
});

test("doublesSecondLead: lead 0 -> the 2nd active is team index 1", () => {
    const team = [{ species: "garchomp" }, { species: "charizard" }, { species: "tyranitar" }];
    assert.deepEqual(doublesSecondLead(team, 0), { species: "charizard" });
});

test("doublesSecondLead: a non-zero lead -> the 2nd active is team index 0", () => {
    const team = [{ species: "garchomp" }, { species: "charizard" }, { species: "tyranitar" }];
    // lead = tyranitar (index 2) -> the sim fields garchomp (index 0) as slot 2.
    assert.deepEqual(doublesSecondLead(team, 2), { species: "garchomp" });
    assert.deepEqual(doublesSecondLead(team, 1), { species: "garchomp" });
});

test("doublesSecondLead: a 1-member team / out-of-range lead -> null", () => {
    const team = [{ species: "garchomp" }];
    assert.equal(doublesSecondLead(team, 0), null);
    const team2 = [{ species: "garchomp" }, { species: "charizard" }];
    assert.equal(doublesSecondLead(team2, 7), null);
    assert.equal(doublesSecondLead(null, 0), null);
});
