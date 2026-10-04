// D3 — unit tests for the battle-scene FX diff (docs/battle-scene-spec.md §2).
// fxEvents is pure: previous envelope + new envelope + this envelope's NEW
// log lines in -> the scheduled FX queue out.
//
// Run with `npm test` (node:test, same wiring as the other suites).
import test from "node:test";
import assert from "node:assert/strict";

import {
    fxEvents, fxClass, fxClassFor, BS_DURATIONS,
    CSS_CLASS_DURATIONS, FX_SETTLE_MS, MAX_FX_WINDOW_MS, fxWindow,
} from "./battleFx.js";
import { readFileSync } from "node:fs";

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
    assert.equal(BS_DURATIONS["attack-foe"], 260);
    assert.equal(BS_DURATIONS.hit, 150);
    assert.equal(BS_DURATIONS["hit-red"], 150);
    assert.equal(BS_DURATIONS["switch-in"], 300);
    assert.equal(BS_DURATIONS.faint, 300);
    assert.equal(BS_DURATIONS["turn-pulse"], 200);
    assert.equal(BS_DURATIONS.status, 300);
});

// ---------------------------------------------------------------------------
// S3 — the enemy-side class + the input-gate resolve window.
// ---------------------------------------------------------------------------

test("fxClassFor: the enemy's attack + your hit mount the side-variant states", () => {
    // The foe's attack lunge is bs-attack-foe (deeper, longer beat).
    assert.equal(fxClassFor("attack", "foe"), "bs-attack-foe");
    // YOUR plate taking the hit is bs-hit-red (red-50 flicker + knockback).
    assert.equal(fxClassFor("hit", "yours"), "bs-hit-red");
    // Your own attack + the foe's hit stay on the base classes.
    assert.equal(fxClassFor("attack", "yours"), "bs-attack");
    assert.equal(fxClassFor("hit", "foe"), "bs-hit");
    // A side-agnostic kind maps to its base class regardless of side.
    assert.equal(fxClassFor("faint", "foe"), "bs-faint");
    assert.equal(fxClassFor("faint", "yours"), "bs-faint");
});

test("CSS_CLASS_DURATIONS: mirrors the index.css `animation:` shorthands", () => {
    // Read the CSS source and assert every entry is the declared duration —
    // a CSS retiming that skips this table would desync the input gate, so
    // the parity is pinned in CI.
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const cssAnimMs = (cls) => {
        const lines = css.split("\n");
        // Whole-token boundary on both sides: `.` or start/`>`/`,` before,
        // end/`>`/`,`/space/`{` after — so `.bs-hit` does NOT match the
        // `.bs-hit-red` block, and the child rule `.bs-hit > .bs-sprite-box {`
        // is not the plate root's declaration.
        const token = `(?<![\\w-])${cls.replace(/[-.]/g, "\\$&")}(?![\\w-])`;
        for (let i = 0; i < lines.length; i += 1) {
            if (!new RegExp(`(^|[.\\s>])${token}(\\s*\\{|$)`).test(lines[i])) continue;
            for (let j = i; j < Math.min(i + 6, lines.length); j += 1) {
                const m = lines[j].match(/animation:\s*[\w-]+\s+(\d+)ms/);
                if (m) return Number(m[1]);
                if (lines[j].includes("}")) break;
            }
        }
        return null;
    };
    for (const [cls, ms] of Object.entries(CSS_CLASS_DURATIONS)) {
        const inCss = cssAnimMs(cls);
        assert.equal(inCss, ms, `${cls} must be ${ms}ms in both the table and index.css`);
    }
    // The two S3 side-variants are longer/different from the base states.
    assert.notEqual(CSS_CLASS_DURATIONS["bs-attack-foe"], CSS_CLASS_DURATIONS["bs-attack"]);
    assert.equal(CSS_CLASS_DURATIONS["bs-hit-red"], 150);
});

test("fxWindow: an empty queue re-arms input immediately", () => {
    assert.equal(fxWindow([]), 0);
    assert.equal(fxWindow(null), 0);
    assert.equal(fxWindow(undefined), 0);
});

test("fxWindow: a full move-turn measures the choreography + settle tail", () => {
    // The spec §2.1 full beat: pulse(0) -> your attack(0-200) -> foe hit@150
    // -> foe attack@200 (the longer 260ms beat, ends 460) -> your hit@350
    // (hit-red, ends 500). Last completion is 500; +300 settle = 800ms gate.
    const events = [
        { kind: "turnPulse", offset: 0 },
        { kind: "attack", side: "yours", offset: 0 },
        { kind: "hit", side: "foe", offset: 150 },
        { kind: "attack", side: "foe", offset: 200 },
        { kind: "hit", side: "yours", offset: 350 },
    ];
    assert.equal(fxWindow(events), 500 + FX_SETTLE_MS);
});

test("fxWindow: the enemy beat counts its longer 260ms class", () => {
    // A lone foe status-move (attack, no target) gates on the side-variant
    // bs-attack-foe 260ms beat, not the base 200ms — the window is 20ms
    // longer than it would be with the plain bs-attack class.
    const variant = [{ kind: "attack", side: "foe", offset: 200 }];
    assert.equal(fxWindow(variant), 200 + 260 + FX_SETTLE_MS);
    // The equivalent base-side attack would have gated on 200, not 260.
    const base = [{ kind: "attack", side: "yours", offset: 200 }];
    assert.equal(fxWindow(base), 200 + 200 + FX_SETTLE_MS);
    assert.ok(fxWindow(variant) > fxWindow(base));
});

test("fxWindow: a lone faint is capped by the hard max", () => {
    // A pathological offset that would push the sum past MAX must clamp.
    const events = [{ kind: "faint", side: "foe", offset: 9000 }];
    assert.equal(fxWindow(events), MAX_FX_WINDOW_MS);
});

test("fxWindow: the cap holds even for many staggered pairs", () => {
    const events = [];
    for (let i = 0; i < 20; i += 1) {
        events.push({ kind: "attack", side: "yours", offset: i * 200 });
        events.push({ kind: "hit", side: "foe", offset: i * 200 + 150 });
    }
    assert.equal(fxWindow(events), MAX_FX_WINDOW_MS);
});

test("FX constants: the settle tail + hard cap are positive and sane", () => {
    assert.equal(FX_SETTLE_MS, 300);
    assert.ok(MAX_FX_WINDOW_MS > FX_SETTLE_MS, "the cap must exceed the settle");
    assert.ok(MAX_FX_WINDOW_MS <= 2000, "the cap is a bounded window, not a stall");
});
