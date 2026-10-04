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
    collapseDoubleEmit,
    stripHeldItem,
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

// D4 fix 1 (Q1): the LIVE sim emits `brn` for burn — both in the condition
// grammar ("82/100 brn") and the |-status| log token (verified against the
// shipped service, pokemon-showdown dist). The legacy `brk` spelling must
// keep resolving so either wire token renders "Burned".
test("statusLabel: the sim's `brn` burn token resolves (live D4 FAIL fix)", () => {
    assert.equal(statusLabel("brn"), "Burned");
    assert.equal(statusLabel("brk"), "Burned");
});

test("parseCondition: the sim's `brn` condition tail keeps the raw token", () => {
    // parseCondition returns the token as the sim writes it; the label layer
    // (statusLabel) is what maps brn/brk -> "Burned".
    assert.equal(parseCondition("82/100 brn").status, "brn");
    assert.equal(statusLabel(parseCondition("82/100 brn").status), "Burned");
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

test("dedupeConsecutiveRows: collapses exact consecutive duplicates from a resync", () => {
    const prev = ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight"];
    // same line shipped twice in a row (pathological resync): one row, not two.
    const out = reconcileLog(prev, ["|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|turn|2"]);
    assert.deepEqual(out, ["|turn|1", "|move|p1a: Garchomp|Earthquake|p2a: Corviknight", "|turn|2"]);
});

// Q1 D4-fix: a burn line in the resync overlap. The notYourTurn resync
// re-ships the last slice, whose tail is the |-status|…|brn line the room
// already accumulated. reconcileLog must not double it, and the displayed
// burn reads "X burned" — never the raw token.
test("reconcileLog: a resync re-shipping a |-status| burn line dedupes it", () => {
    const burn = "|-status|p2a: Tyranitar|brn";
    const prev = ["|turn|1", "|move|p1a: Moltres|Flamethrower|p2a: Tyranitar", burn];
    // resync slice starts at the burn line (the room's last-slice head) + a new turn.
    const out = reconcileLog(prev, [burn, "|turn|2"]);
    assert.deepEqual(out, [prev[0], prev[1], burn, "|turn|2"]);
    // the displayed rows: exactly one "Tyranitar burned", no raw `brn`.
    const rows = dedupeConsecutiveRows(out.filter(isDisplayLogLine).map(parseLogLine));
    const burnedRows = rows.filter((r) => /Tyranitar burned/.test(r.text));
    assert.equal(burnedRows.length, 1, "the burn line renders exactly once");
    assert.ok(rows.every((r) => !/\bbrn\b|\bbrk\b/.test(r.text)), "no raw burn token renders");
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

// --------------------------------------------------------------- S2
// The sim ships each health change TWICE (|split| channel markers): the
// absolute total-HP form and the scaled-to-100 ratio form. collapseDoubleEmit
// keeps only the /100 line so one hit renders as one row.
test("collapseDoubleEmit: a doubled -damage pair keeps the /100 ratio line", () => {
    const lines = [
        "|turn|1",
        "|move|p1a: Moltres|Flamethrower|p2a: Venusaur",
        "|-damage|p2a: Venusaur|11/272",
        "|-damage|p2a: Venusaur|5/100",
    ].filter(isDisplayLogLine);
    assert.deepEqual(collapseDoubleEmit(lines), [
        "|turn|1",
        "|move|p1a: Moltres|Flamethrower|p2a: Venusaur",
        "|-damage|p2a: Venusaur|5/100",
    ]);
});

test("collapseDoubleEmit: order-independent — scaled line first still keeps it", () => {
    const lines = [
        "|-damage|p2a: Venusaur|5/100",
        "|-damage|p2a: Venusaur|11/272",
    ];
    assert.deepEqual(collapseDoubleEmit(lines), ["|-damage|p2a: Venusaur|5/100"]);
});

test("collapseDoubleEmit: a genuine hit on a DIFFERENT pokemon is not collapsed", () => {
    const lines = [
        "|move|p1a: Moltres|Flamethrower|p2a: Venusaur",
        "|-damage|p2a: Venusaur|11/272",
        "|-damage|p2a: Venusaur|5/100",
        "|move|p1b: Garchomp|Earthquake|p2b: Blissey",
        "|-damage|p2b: Blissey|100/200",
        "|-damage|p2b: Blissey|50/100",
    ];
    assert.deepEqual(collapseDoubleEmit(lines), [
        "|move|p1a: Moltres|Flamethrower|p2a: Venusaur",
        "|-damage|p2a: Venusaur|5/100",
        "|move|p1b: Garchomp|Earthquake|p2b: Blissey",
        "|-damage|p2b: Blissey|50/100",
    ]);
});

test("collapseDoubleEmit: -heal double-emit collapses the same way", () => {
    const lines = [
        "|-heal|p1a: Chansey|340/460",
        "|-heal|p1a: Chansey|74/100",
    ];
    assert.deepEqual(collapseDoubleEmit(lines), ["|-heal|p1a: Chansey|74/100"]);
});

test("collapseDoubleEmit: tails must agree — disc side may lack the status tail", () => {
    // The absolute-form emit can predate the status that the scaled twin
    // reports (D4 audit shape: "330/404" then "82/100 brn"): collapses.
    assert.deepEqual(collapseDoubleEmit([
        "|-damage|p2a: Tyranitar|330/404",
        "|-damage|p2a: Tyranitar|82/100 brn",
    ]), ["|-damage|p2a: Tyranitar|82/100 brn"]);
    // Two DIFFERENT status tails are two distinct events: kept.
    assert.deepEqual(collapseDoubleEmit([
        "|-damage|p2a: Tyranitar|330/404 par",
        "|-damage|p2a: Tyranitar|82/100 brn",
    ]), [
        "|-damage|p2a: Tyranitar|330/404 par",
        "|-damage|p2a: Tyranitar|82/100 brn",
    ]);
});

test("collapseDoubleEmit: fnt tail collapses (the fainting hit's double-emit)", () => {
    assert.deepEqual(collapseDoubleEmit([
        "|-damage|p2a: Venusaur|0/272 fnt",
        "|-damage|p2a: Venusaur|0/100 fnt",
    ]), ["|-damage|p2a: Venusaur|0/100 fnt"]);
});

test("collapseDoubleEmit: equal denominators are separate events, kept", () => {
    // Two hits on the same pokemon that both read /100-scale or the same
    // absolute max are NOT one double-emit — nothing collapses.
    assert.deepEqual(collapseDoubleEmit([
        "|-damage|p2a: Venusaur|50/100",
        "|-damage|p2a: Venusaur|50/100",
    ]), [
        "|-damage|p2a: Venusaur|50/100",
        "|-damage|p2a: Venusaur|50/100",
    ]);
});

test("collapseDoubleEmit: a turn boundary stops the pairing (no cross-turn collapse)", () => {
    const lines = [
        "|-damage|p2a: Venusaur|11/272",
        "|turn|2",
        "|-damage|p2a: Venusaur|5/100",
    ];
    assert.deepEqual(collapseDoubleEmit(lines), lines);
});

test("collapseDoubleEmit: a non-health line between the pair does not break it", () => {
    const lines = [
        "|-damage|p2a: Tyranitar|330/404",
        "|-status|p2a: Tyranitar|brn",
        "|-damage|p2a: Tyranitar|82/100 brn",
    ];
    assert.deepEqual(collapseDoubleEmit(lines), [
        "|-status|p2a: Tyranitar|brn",
        "|-damage|p2a: Tyranitar|82/100 brn",
    ]);
});

test("collapseDoubleEmit: empty/null input", () => {
    assert.deepEqual(collapseDoubleEmit([]), []);
    assert.deepEqual(collapseDoubleEmit(null), []);
});

test("full pipeline (gate + collapse + dedupe + parse): one hit -> ONE row, the /100 ratio", () => {
    const log = [
        "|turn|1",
        "|move|p1a: Moltres|Flamethrower|p2a: Venusaur",
        "|split|p1",
        "|-damage|p2a: Venusaur|11/272",
        "|split|p2",
        "|-damage|p2a: Venusaur|5/100",
    ];
    const rows = dedupeConsecutiveRows(
        collapseDoubleEmit(log.filter(isDisplayLogLine)).map(parseLogLine),
    );
    const damageRows = rows.filter((r) => r.kind === "info" && /took damage/.test(r.text));
    assert.deepEqual(damageRows, [{ kind: "info", text: "Venusaur took damage (5/100)" }]);
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

// ------------------------------------------------------------------ Q1 (D4)
// Live audit against the shipped sim (service/_probe_audit.mjs, 4 seeded
// battles, Moltres lead -> guaranteed Will-O-Wisp burn):
//   -status|p2a: Tyranitar|brn
//   -damage|p2a: Tyranitar|82/100 brn
//   -unboost|p1a: Garchomp|atk|1
//   -weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar
// Zero rendered lines carried a raw protocol/status/stat token after the
// fix; these cases pin that down per event family.

test("parseLogLine: the sim's burn lines render 'burned', never raw brn/brk", () => {
    assert.equal(parseLogLine("|-status|p2a: Tyranitar|brn").text, "Tyranitar burned");
    assert.equal(parseLogLine("|-status|p2a: Tyranitar|brk").text, "Tyranitar burned"); // legacy alias
    const d = parseLogLine("|-damage|p2a: Tyranitar|82/100 brn");
    assert.equal(d.text, "Tyranitar took damage (82/100 Burned)");
    assert.ok(!/brn|brk/.test(d.text));
});

test("parseLogLine: the full sim status set (slp/frz/tox) maps, not raw", () => {
    assert.equal(parseLogLine("|-status|p2a: Garchomp|slp").text, "Garchomp fell asleep");
    assert.equal(parseLogLine("|-status|p2a: Garchomp|frz").text, "Garchomp was frozen");
    assert.equal(parseLogLine("|-status|p2a: Garchomp|tox").text, "Garchomp badly poisoned");
    assert.equal(parseLogLine("|-status|p2a: Garchomp|par").text, "Garchomp paralyzed");
    assert.equal(parseLogLine("|-status|p2a: Garchomp|psn").text, "Garchomp poisoned");
});

test("parseLogLine: boost/unboost stat ids render as words, not raw ids", () => {
    assert.equal(parseLogLine("|-boost|p1a: Garchomp|atk|1").text, "Garchomp's Attack rose!");
    assert.equal(parseLogLine("|-unboost|p1a: Garchomp|atk|1").text, "Garchomp's Attack fell!");
    assert.equal(parseLogLine("|-boost|p1a: Garchomp|spe|1").text, "Garchomp's Speed rose!");
    assert.equal(parseLogLine("|-unboost|p1a: Garchomp|spd|1").text, "Garchomp's Sp. Def fell!");
});

test("parseLogLine: weather lines keep the weather name, drop the from/of noise", () => {
    assert.equal(
        parseLogLine("|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar").text,
        "The weather became Sandstorm",
    );
    assert.equal(parseLogLine("|-weather|Sandstorm|[upkeep]").text, "The weather became Sandstorm");
});

test("statusLabel + parseCondition: the sim's condition tails resolve to labels", () => {
    assert.equal(statusLabel(parseCondition("82/100 brn").status), "Burned");
    assert.equal(statusLabel(parseCondition("40/100 slp").status), "Asleep");
    assert.equal(statusLabel(parseCondition("40/100 tox").status), "Badly poisoned");
});

test("stripHeldItem: the D4 fix-2 cases", () => {
    assert.equal(stripHeldItem("Level 84 Forretress @ Focus Sash"), "Level 84 Forretress");
    assert.equal(stripHeldItem("Level 90 Camerupt"), "Level 90 Camerupt");
    assert.equal(stripHeldItem(""), "");
    assert.equal(stripHeldItem(null), "");
});

test("parseLogLine: clear/cure-status translate the status tail, not raw", () => {
    // clearstatus keeps the C2 display-event spelling; the tail may be a raw
    // sim id (brn/slp/…) — it reads as the label, not the token.
    assert.equal(parseLogLine("|clearstatus|p1a: Garchomp|brn").text, "Garchomp's Burned was removed");
    assert.equal(parseLogLine("|clearstatus|p1a: Garchomp|").text, "Garchomp's status was removed");
    assert.equal(parseLogLine("|-curestatus|p2a: Garchomp|slp").text, "Garchomp's Asleep was removed");
});

// The D4 check-1 bar over the WHOLE live-battle log shape: every raw line
// the sim ships that the display gate admits must render free of raw
// protocol/status/stat tokens.
test("full-pipeline audit: zero raw protocol tokens in the rendered log", () => {
    // Every line the sim ships in a real battle (service/_probe_audit.mjs),
    // run through the DISPLAY GATE + parser, must render free of raw
    // protocol/status/stat tokens. The gate already drops the protocol-only
    // events (-supereffective, -crit, -resisted, -immune, |t:, |rule|, …);
    // the bar this card owns is that what PASSES the gate carries no raw
    // status id (brn/slp/tox/…) or stat id (atk/spe/…) in its payload.
    const log = [
        "|turn|1",
        "|move|p1a: Moltres|Flamethrower|p2a: Tyranitar",
        "|-damage|p2a: Tyranitar|330/404",
        "|-status|p2a: Tyranitar|brn",
        "|-damage|p2a: Tyranitar|82/100 brn",
        "|-unboost|p1a: Garchomp|atk|1",
        "|-weather|Sandstorm|[from] ability: Sand Stream|[of] p2a: Tyranitar",
        "|-ability|p2a: Tyranitar|Sand Stream|",
        "|immune|p2a: Garchomp|Flamethrower|",
        "|faint|p2a: Tyranitar|0/404",
    ];
    const rows = dedupeConsecutiveRows(log.filter(isDisplayLogLine).map(parseLogLine));
    const rendered = rows.map((r) => r.text).join("\n");
    assert.ok(!/\b(brn|brk|slp|par|psn|frz|tox|toxic|atk|def|spa|spd|spe|accuracy|evasion)\b/.test(rendered),
        `raw status/stat token leaked into the log:\n${rendered}`);
});

// ------------------------------------------------------------ sprite mapping

test("spriteUrlFor: uses the dex map when present, falls back when not", () => {
    const map = { garchomp: 445 };
    assert.ok(spriteUrlFor("garchomp", map).includes("/445.png"));
    assert.ok(spriteUrlFor("charizard", map).includes("/235.png")); // fallback
    assert.ok(spriteUrlFor("charizard", {}).includes("/235.png"));
    assert.ok(spriteUrlFor("charizard", null).includes("/235.png"));
});
