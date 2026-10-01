// C6 — unit tests for the /battle display helpers.
//
// battleLog.js: the C2 §2.4 condition grammar, the OD-5 HP thresholds, the
// move/switch disabled-reason copy, and the C2 §2.6 raw-protocol -> display
// log parsing (the UI renders exactly these shapes).
// battleSprites.js: the dex-number -> sprite URL mapping (fallback when the
// data lane has not loaded).
//
// Run with `npm test` (node:test, same wiring as the C3/C5 suites).
import test from "node:test";
import assert from "node:assert/strict";

import {
    parseCondition,
    statusLabel,
    hpBarClass,
    moveDisabledReason,
    switchDisabledReason,
    parseLogLine,
    isDisplayLogLine,
    reconcileLog,
    dedupeConsecutiveRows,
} from "./battleLog.js";
import { spriteUrlFor } from "./battleSprites.js";

// ------------------------------------------------------------------ condition

test("parseCondition: full HP reads 1.0, no status", () => {
    assert.deepEqual(parseCondition("100/100"), { fraction: 1, status: "", fainted: false });
});

test("parseCondition: partial HP + status", () => {
    const r = parseCondition("73/100 par");
    assert.equal(r.status, "par");
    assert.equal(r.fainted, false);
    assert.ok(Math.abs(r.fraction - 0.73) < 0.001);
});

test("parseCondition: fainted (0 hp)", () => {
    const r = parseCondition("0/100 fnt");
    assert.equal(r.fainted, true);
    assert.equal(r.status, "fainted");
    assert.equal(r.fraction, 0);
});

test("parseCondition: garbage falls back to fainted/0, never NaN", () => {
    assert.deepEqual(parseCondition(""), { fraction: 0, status: "", fainted: true });
    assert.deepEqual(parseCondition(undefined), { fraction: 0, status: "", fainted: true });
    assert.deepEqual(parseCondition("??"), { fraction: 0, status: "", fainted: true });
});

test("statusLabel maps the C2 §2.1 status ids", () => {
    assert.equal(statusLabel("par"), "Paralyzed");
    assert.equal(statusLabel("brk"), "Burned");
    assert.equal(statusLabel("fainted"), "Fainted");
    assert.equal(statusLabel(""), "");
});

test("hpBarClass thresholds (C1 §3.2 / OD-5)", () => {
    assert.match(hpBarClass(1), /green/);
    assert.match(hpBarClass(0.5), /green/);
    assert.match(hpBarClass(0.49), /amber/);
    assert.match(hpBarClass(0.2), /amber/);
    assert.match(hpBarClass(0.19), /red/);
    assert.match(hpBarClass(0), /red/);
});

// ----------------------------------------------------------- disabled reasons

test("moveDisabledReason: the C1 §3.2 tooltip copy", () => {
    assert.equal(moveDisabledReason({ disabled: false, disabledReason: "" }), "");
    assert.equal(moveDisabledReason({ disabled: true, disabledReason: "0pp" }), "No PP remaining");
    assert.equal(
        moveDisabledReason({ disabled: true, disabledReason: "locked" }),
        "Locked into this move",
    );
    assert.equal(moveDisabledReason(null), "");
});

test("switchDisabledReason: reason text from the choiceRequest", () => {
    assert.equal(switchDisabledReason({ canSwitch: true, reason: "" }), "");
    assert.equal(switchDisabledReason({ canSwitch: false, reason: "trapped" }), "Your Pokémon is trapped");
    assert.equal(
        switchDisabledReason({ canSwitch: false, reason: "allbenchfainted" }),
        "All bench Pokémon have fainted",
    );
    assert.equal(switchDisabledReason(null), "");
});

// --------------------------------------------------------------- log parsing

test("isDisplayLogLine drops protocol-internal lines", () => {
    assert.equal(isDisplayLogLine("|split|p1"), false);
    assert.equal(isDisplayLogLine("|t:|1790857715"), false);
    assert.equal(isDisplayLogLine("|upkeep"), false);
    assert.equal(isDisplayLogLine("|gametype|singles"), false);
    assert.equal(isDisplayLogLine("|player|p1|P1||"), false);
    assert.equal(isDisplayLogLine("|teamsize|p1|6"), false);
    assert.equal(isDisplayLogLine("|win|P1"), false);
    assert.equal(isDisplayLogLine("|"), false);
    assert.equal(isDisplayLogLine(""), false);
});

// D1 (fix 2): the display gate is the C1 §3.2 HUMAN event set, and only it.
// Anything parseLogLine's switch does not recognize is hidden — never an
// "info" line. Protocol noise and unlisted events drop; every recognized
// human event keeps.
test("isDisplayLogLine: only the C1 §3.2 human events render", () => {
    // the full human set (positive)
    for (const line of [
        "|turn|1",
        "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
        "|switch|p1a: Charizard|Charizard",
        "|-switch|p2a: Garchomp|",
        "|status|p2a: Corviknight|par",
        "|-status|p1a: Garchomp|psn",
        "|clearstatus|p1a: Garchomp|psn",
        "|-clearstatus|p2a: Corviknight|psn",
        "|-damage|p1a: Garchomp|62/100",
        "|-heal|p2a: Corviknight|329/400",
        "|immune|p2a: Garchomp|Earthquake|",
        "|-immune|p1a: Corviknight|Flamethrower",
        "|-boost|p1a: Garchomp|atk",
        "|-unboost|p2a: Corviknight|def",
        "|-ability|p1a: Garchomp|Sand Veil",
        "|weather|Rain Dance",
        "|-weather|Rain Dance",
        "|faint|p1a: Garchomp|42/357",
    ]) assert.equal(isDisplayLogLine(line), true, `should show: ${line}`);

    // request lines + timestamps + stat-block chunks + unlisted events
    // (hidden — the "console-only" lines that used to leak as info).
    for (const line of [
        '|request|{"rqid":"1","active":[{"moves":[]}]}',
        "|t:|1790857715000",
        "|upkeep|p1a: Garchomp|",
        "|split|p1",
        "|start|gen9ou",
        "|res|329/400",
        "|name|P1",
        "|side|p1",
        "|msg|hello",
    ]) assert.equal(isDisplayLogLine(line), false, `should hide: ${line}`);
});

// ------------------------------------------------------------- D1 (fix 1)
// reconcileLog — idempotent log accumulation. The notYourTurn resync path
// re-ships the room's LAST slice, which overlaps the already-accumulated
// tail; appending blindly would double the display rows.
test("reconcileLog: disjoint slice appends cleanly", () => {
    const prev = ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight"];
    const slice = ["|turn|2", "|move|p2a: Corviknight|Peck|p1a: Garchomp"];
    assert.deepEqual(reconcileLog(prev, slice), [
        "|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
        "|turn|2", "|move|p2a: Corviknight|Peck|p1a: Garchomp",
    ]);
});

test("reconcileLog: fully-overlapping resync slice is a no-op", () => {
    const prev = ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|turn|2"];
    // the room's lastEnvelope re-ships its own slice — every line already
    // accumulated. Nothing new, no duplicates.
    assert.deepEqual(reconcileLog(prev, ["|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|turn|2"]), prev);
    // and the whole-slice overlap (exact same array) collapses to identity.
    assert.deepEqual(reconcileLog(prev, prev), prev);
});

test("reconcileLog: partial overlap (move -> notYourTurn resync) dedupes the tail", () => {
    // Normal advance shipped [move, -damage]. Then a race: the notYourTurn
    // resync returns the room's LAST slice, which started at the -damage
    // line (overlapping the tail) plus the two genuinely-new lines.
    const prev = ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|-damage|p2a: Corviknight|8/340"];
    const resync = ["|-damage|p2a: Corviknight|8/340", "|turn|2", "|move|p2a: Corviknight|Peck|p1a: Garchomp"];
    const out = reconcileLog(prev, resync);
    assert.deepEqual(out, [
        "|turn|1",
        "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
        "|-damage|p2a: Corviknight|8/340",
        "|turn|2",
        "|move|p2a: Corviknight|Peck|p1a: Garchomp",
    ]);
    // no duplicate display rows: every displayable line appears exactly once
    const display = out.filter(isDisplayLogLine);
    const rendered = display.map(parseLogLine).map((r) => r.kind + ":" + r.text);
    assert.equal(new Set(rendered).size, rendered.length, "no duplicate display rows");
});

test("reconcileLog: collapses exact consecutive duplicates (resync safety net)", () => {
    const prev = ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight"];
    // same line shipped twice in a row (pathological resync): one row, not two.
    const out = reconcileLog(prev, ["|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|turn|2"]);
    assert.deepEqual(out, ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|turn|2"]);
});

test("reconcileLog: empty/null slices are no-ops", () => {
    const prev = ["|turn|1"];
    assert.deepEqual(reconcileLog(prev, []), prev);
    assert.deepEqual(reconcileLog(prev, null), prev);
    assert.deepEqual(reconcileLog(null, ["|turn|1"]), ["|turn|1"]);
});

// D1 (fix 1, display level): dedupeConsecutiveRows collapses two DIFFERENT
// raw events that render the identical display row back-to-back — the classic
// |switch| + |-switch| pair ("X went on the field!") or |weather| +
// |-weather| ("The weather became X").
test("dedupeConsecutiveRows: collapses the |switch| + |-switch| duplicate pair", () => {
    const rows = [
        "|switch|p1a: Charizard|Charizard",
        "|-switch|p1a: Charizard|Charizard|Lv. 100",
    ].filter(isDisplayLogLine).map(parseLogLine);
    assert.deepEqual(
        dedupeConsecutiveRows(rows),
        [{ kind: "info", text: "Charizard went on the field!" }],
    );
});

test("dedupeConsecutiveRows: non-consecutive repeats are kept", () => {
    const rows = [
        "|turn|1",
        "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
        "|turn|2",
        "|move|p1a: Garchomp|Earthquake|p2a: Corviknight",
    ].map(parseLogLine);
    assert.equal(dedupeConsecutiveRows(rows).length, 4, "same move on two turns is not a duplicate");
});

test("dedupeConsecutiveRows: empty input", () => {
    assert.deepEqual(dedupeConsecutiveRows([]), []);
    assert.deepEqual(dedupeConsecutiveRows(null), []);
});

test("isDisplayLogLine keeps human lines + turn dividers", () => {
    assert.equal(isDisplayLogLine("|turn|1"), true);
    assert.equal(isDisplayLogLine("|move|p1a: Garchomp|Earthquake|p2a: Corviknight"), true);
    assert.equal(isDisplayLogLine("|faint|p1a: Garchomp|42/357"), true);
});

test("parseLogLine: move line -> 'used' prose with the target", () => {
    const row = parseLogLine("|move|p1a: Garchomp|Earthquake|p2a: Corviknight");
    assert.equal(row.kind, "info");
    assert.equal(row.text, "Garchomp used Earthquake against Corviknight");
});

test("parseLogLine: move on the active's own move (no target shown)", () => {
    const row = parseLogLine("|move|p1a: Garchomp|Swords Dance|");
    assert.equal(row.kind, "info");
    assert.equal(row.text, "Garchomp used Swords Dance");
});

test("parseLogLine: faint -> semibold red row ('X fainted')", () => {
    const row = parseLogLine("|faint|p1a: Garchomp|42/357");
    assert.equal(row.kind, "faint");
    assert.equal(row.text, "Garchomp fainted");
});

test("parseLogLine: turn boundary -> divider row", () => {
    const row = parseLogLine("|turn|4");
    assert.equal(row.kind, "turn");
    assert.equal(row.text, "Turn 4");
});

test("parseLogLine: status + damage + heal prose", () => {
    assert.equal(parseLogLine("|status|p2a: Corviknight|par").text, "Corviknight paralyzed");
    assert.equal(parseLogLine("|-damage|p1a: Garchomp|62/100").text, "Garchomp took damage (62/100)");
    assert.equal(parseLogLine("|-heal|p2a: Corviknight|329/400|[from] item: Leftovers").text,
        "Corviknight recovered (329/400)");
});

test("parseLogLine: switch prose", () => {
    assert.equal(parseLogLine("|switch|p1a: Charizard|Charizard").text, "Charizard went on the field!");
});

// ------------------------------------------------------------ sprite mapping

test("spriteUrlFor: uses the dex map when present, falls back when not", () => {
    const map = { garchomp: 445 };
    assert.ok(spriteUrlFor("garchomp", map).includes("/445.png"));
    assert.ok(spriteUrlFor("charizard", map).includes("/235.png")); // fallback
    assert.ok(spriteUrlFor("charizard", {}).includes("/235.png"));
    assert.ok(spriteUrlFor("charizard", null).includes("/235.png"));
});
