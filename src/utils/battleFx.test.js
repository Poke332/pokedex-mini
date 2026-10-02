// D3 — unit tests for the battle-scene FX diff (docs/battle-scene-spec.md §2).
// fxEvents is pure: previous envelope + new envelope + this envelope's NEW
// log lines in -> the scheduled FX queue out.
//
// Run with `npm test` (node:test, same wiring as the other suites).
import test from "node:test";
import assert from "node:assert/strict";

import { fxEvents, fxClass, BS_DURATIONS } from "./battleFx.js";

const MON = (name, species, condition = "100/100") => ({
    ident: `p1a: ${name}`,
    species,
    name,
    condition,
});

const ENV = (o = {}) => ({
    active: [MON("Garchomp", "garchomp")],
    bench: [],
    foe: MON("Corviknight", "corviknight"),
    log: [],
    choiceRequest: { state: "move" },
    battleOver: false,
    ...o,
});

test("fxClass: event kind -> the bs-* class name", () => {
    assert.equal(fxClass("turnPulse"), "bs-turn-pulse");
    assert.equal(fxClass("attack"), "bs-attack");
    assert.equal(fxClass("hit"), "bs-hit");
    assert.equal(fxClass("switchIn"), "bs-switch-in");
    assert.equal(fxClass("faint"), "bs-faint");
    assert.equal(fxClass("status"), "bs-status");
});

test("fxEvents: empty/first envelope -> no events", () => {
    // prev = null (page first applyEnvelope after the teampreview
    // envelope): nothing new, nothing fired.
    assert.deepEqual(fxEvents(null, ENV(), []), []);
    assert.deepEqual(fxEvents(null, ENV(), null), []);
    // An identical re-apply (a resync with zero new lines) is a no-op too.
    assert.deepEqual(fxEvents(ENV(), ENV(), []), []);
});

test("fxEvents: a |turn| line opens the window with the pulse only", () => {
    const out = fxEvents(ENV(), ENV(), ["|turn|1"]);
    assert.deepEqual(out, [{ kind: "turnPulse", offset: 0 }]);
});

test("fxEvents: a move pair schedules attack + hit on the right sides", () => {
    const out = fxEvents(
        ENV(),
        ENV(),
        ["|move|p1a: Garchomp|Earthquake|p2a: Corviknight"],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
    ]);
});

test("fxEvents: a foe move (p2a attacker) targets the caller's plate", () => {
    const out = fxEvents(
        ENV(),
        ENV(),
        ["|move|p2a: Corviknight|Peck|p1a: Garchomp"],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "foe", offset: 0 },
        { kind: "hit", side: "yours", offset: 150 },
    ]);
});

test("fxEvents: two move lines stagger the second pair by 200ms", () => {
    const out = fxEvents(
        ENV(),
        ENV(),
        [
            "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
            "|move|p2a: Corviknight|Peck|p1a: Garchomp",
        ],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
        { kind: "attack", side: "foe", offset: 200 },
        { kind: "hit", side: "yours", offset: 350 },
    ]);
});

test("fxEvents: a status move with no target schedules the lunge only", () => {
    const out = fxEvents(ENV(), ENV(), ["|move|p1a: Garchomp|Swords Dance|"]);
    assert.deepEqual(out, [{ kind: "attack", side: "yours", offset: 0 }]);
});

test("fxEvents: side-ident fallback names the side when the name is unknown", () => {
    // Same-species reshow (e.g. a re-rendered identical envelope) with a
    // move line whose actor name is not in either envelope's name pools:
    // the p1a/p2a side idents decide (spec §2.2 fallback).
    const prev = ENV();
    const next = ENV(); // same Garchomp/Corviknight — no switch-in
    const out = fxEvents(
        prev,
        next,
        ["|move|p1a: UnknownMega|Earthquake|p2a: UnknownFoe"],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
    ]);
});

test("fxEvents: a species change on the active fires a switch-in alongside the moves", () => {
    // A real forme swap (garchomp -> garchomp-mega) changes the species
    // key, so the incoming plate animates in AND its move line still
    // resolves by name.
    const out = fxEvents(
        ENV(),
        ENV({ active: [MON("Garchomp-Mega", "garchomp-mega")] }),
        ["|move|p1a: Garchomp-Mega|Earthquake|p2a: Corviknight"],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
        { kind: "switchIn", side: "yours", offset: 0 },
    ]);
});

test("fxEvents: a switch-in fires when the active species changes", () => {
    const out = fxEvents(
        ENV(),
        ENV({ active: [MON("Charizard", "charizard")] }),
        ["|switch|p1a: Charizard|Charizard"],
    );
    assert.deepEqual(out, [{ kind: "switchIn", side: "yours", offset: 0 }]);
});

test("fxEvents: an absent->present foe is a foe switch-in (battle start)", () => {
    const out = fxEvents(
        ENV({ foe: null }),
        ENV(),
        ["|-switch|p2a: Corviknight|"],
    );
    assert.deepEqual(out, [{ kind: "switchIn", side: "foe", offset: 0 }]);
});

test("fxEvents: a switch line alone (no species change) still fires the FX", () => {
    // e.g. a same-species swap — the species key is equal, the line proves it.
    const out = fxEvents(ENV(), ENV(), ["|switch|p1a: Garchomp|Garchomp"]);
    assert.deepEqual(out, [{ kind: "switchIn", side: "yours", offset: 0 }]);
});

test("fxEvents: one switch-in event per side, never double-fired", () => {
    const out = fxEvents(
        ENV(),
        ENV({
            active: [MON("Charizard", "charizard")],
            foe: MON("Pikachu", "pikachu"),
        }),
        [
            "|switch|p1a: Charizard|Charizard",
            "|-switch|p1a: Charizard|Charizard|Lv. 100",
            "|-switch|p2a: Pikachu|Pikachu|Lv. 100",
        ],
    );
    assert.deepEqual(
        out,
        [
            { kind: "switchIn", side: "yours", offset: 0 },
            { kind: "switchIn", side: "foe", offset: 0 },
        ],
    );
});

test("fxEvents: a new status token on a side fires bs-status", () => {
    const out = fxEvents(
        ENV(),
        ENV({ foe: MON("Corviknight", "corviknight", "80/100 par") }),
        ["|status|p2a: Corviknight|par"],
    );
    assert.deepEqual(out, [{ kind: "status", side: "foe", offset: 0 }]);
});

test("fxEvents: a status REMOVAL fires nothing (the chip just unmounts)", () => {
    const out = fxEvents(
        ENV({ active: [MON("Garchomp", "garchomp", "80/100 par")] }),
        ENV(),
        ["|clearstatus|p1a: Garchomp|par"],
    );
    assert.deepEqual(out, []);
});

test("fxEvents: a persistent status (unchanged) fires nothing", () => {
    const out = fxEvents(
        ENV({ foe: MON("Corviknight", "corviknight", "80/100 par") }),
        ENV({ foe: MON("Corviknight", "corviknight", "60/100 par") }),
        ["|-damage|p2a: Corviknight|60/100"],
    );
    assert.deepEqual(out, []);
});

test("fxEvents: a faint fires LAST, timed after the last hit of the window", () => {
    const out = fxEvents(
        ENV(),
        ENV({ foe: null }),
        [
            "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
            "|faint|p2a: Corviknight|0/255",
        ],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
        { kind: "faint", side: "foe", offset: 150 },
    ]);
});

test("fxEvents: a double faint (both sides) fires both, last in the queue", () => {
    const out = fxEvents(
        ENV(),
        ENV({ active: [MON("Garchomp", "garchomp", "0/100 fnt")], foe: null }),
        [
            "|move|p2a: Corviknight|Peck|p1a: Garchomp",
            "|faint|p1a: Garchomp|0/357",
            "|faint|p2a: Corviknight|0/255",
        ],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "foe", offset: 0 },
        { kind: "hit", side: "yours", offset: 150 },
        { kind: "faint", side: "yours", offset: 150 },
        { kind: "faint", side: "foe", offset: 150 },
    ]);
});

test("fxEvents: a full envelope (turn + move + faint) in one diff", () => {
    const out = fxEvents(
        ENV(),
        ENV({ foe: null }),
        [
            "|turn|2",
            "|move|p2a: Corviknight|Peck|p1a: Garchomp",
            "|faint|p1a: Garchomp|0/357",
        ],
    );
    assert.deepEqual(out, [
        { kind: "turnPulse", offset: 0 },
        { kind: "attack", side: "foe", offset: 0 },
        { kind: "hit", side: "yours", offset: 150 },
        { kind: "faint", side: "yours", offset: 150 },
    ]);
});

test("fxEvents: resync slice (lines already played) fires nothing new", () => {
    // D1's dedup path: the notYourTurn resync re-ships the LAST slice;
    // the caller passes only NEW lines, so an overlapping slice produces
    // an empty queue — no re-fired FX.
    const out = fxEvents(
        ENV({ foe: MON("Corviknight", "corviknight", "80/100") }),
        ENV({ foe: MON("Corviknight", "corviknight", "80/100") }),
        [],
    );
    assert.deepEqual(out, []);
});

test("fxEvents: a faint + foe auto-switch in one envelope keeps the switch-in, drops the faint", () => {
    // The classic auto-response: foe KO'd, service immediately switches the
    // next foe mon. The key-swap unmounts the fainted plate in the same
    // commit, so a faint FX would re-target the incoming plate (which
    // shows full HP) — the switch-in already covers it. The lone
    // auto-switch line |-switch|p2a corroborates the side.
    const out = fxEvents(
        ENV(),
        ENV({
            foe: MON("Registeel", "registeel"),
        }),
        [
            "|move|p2a: Gurdurr|Play Rough|p1a: Gengar",
            "|faint|p2a: Gurdurr|0/357",
            "|-switch|p2a: Registeel|Registeel|Lv. 100",
        ],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "foe", offset: 0 },
        { kind: "hit", side: "yours", offset: 150 },
        { kind: "switchIn", side: "foe", offset: 0 },
        // no faint: the fainted plate is unmounted by the key-swap
    ]);
});

test("fxEvents: a lone faint (forced-switch state, plate still mounted) still fires", () => {
    // C2 §2: when the caller's active faints and a forced switch is
    // pending, `active` holds the fainted mon until the switch choice is
    // committed — the plate stays mounted (same species key), so the
    // faint FX plays and settles into the grayscale rest style.
    const out = fxEvents(
        ENV(),
        ENV({
            active: [MON("Garchomp", "garchomp", "0/357 fnt")],
        }),
        [
            "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
            "|faint|p1a: Garchomp|0/357",
        ],
    );
    assert.deepEqual(out, [
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
        { kind: "faint", side: "yours", offset: 150 },
    ]);
});

test("BS_DURATIONS: the spec §2.1 timings", () => {
    assert.equal(BS_DURATIONS.attack, 200);
    assert.equal(BS_DURATIONS.hit, 150);
    assert.equal(BS_DURATIONS["switch-in"], 300);
    assert.equal(BS_DURATIONS.faint, 300);
    assert.equal(BS_DURATIONS["turn-pulse"], 200);
    assert.equal(BS_DURATIONS.status, 300);
});
