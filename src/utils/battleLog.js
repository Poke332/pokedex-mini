// C6 — /battle display helpers.
//
// Pure string/shape helpers over the C2 §2 envelope (docs/simulation-dto.md):
// the condition grammar (§2.4: "73/100 par"), the raw protocol log lines the
// service ships per turn (§2.6: display strings, pipe-delimited), and the
// switch-disabled reason (§2.5). No React, no DOM — node:test-able.

/**
 * Parse the C2 §2.4 condition grammar ("100/100", "73/100 par", "0/100 fnt").
 * @param {string} condition the mon's `condition` field.
 * @returns {{fraction:number, status:string, fainted:boolean}}
 *   fraction — hp/maxhp in [0,1]; clamped, 0 on garbage input.
 *   status   — the status id ("" | par | brk | psn | sleep | frz | toxic), or
 *     "fainted" when the fraction is 0.
 *   fainted  — true when the mon is at 0 hp.
 */
export function parseCondition(condition) {
    const m = /^(\d+)\/(\d+)(?:\s+([a-z]+))?$/.exec(String(condition || "").trim());
    if (!m) return { fraction: 0, status: "", fainted: true };
    const hp = Number(m[1]);
    const max = Number(m[2]);
    const fraction = max > 0 ? Math.min(1, hp / max) : 0;
    const fainted = fraction <= 0;
    const status = fainted ? "fainted" : (m[3] || "");
    return { fraction, status, fainted };
}

// Status id -> UI copy + a11y label (C1 §3.2 status icon row).
const STATUS_LABELS = {
    par: "Paralyzed",
    brk: "Burned",
    psn: "Poisoned",
    sleep: "Asleep",
    frz: "Frozen",
    toxic: "Badly poisoned",
    fainted: "Fainted",
};

/**
 * Human label for a status id from parseCondition().status.
 * @param {string} status id ("", par, brk, …, "fainted").
 * @returns {string} "" when there is no status.
 */
export function statusLabel(status) {
    return STATUS_LABELS[status] || "";
}

// C1 §3.2 HP bar thresholds (OD-5): green ≥ 50%, amber 20–49%, red < 20%.
const HP_GREEN = "bg-green-500";
const HP_AMBER = "bg-amber-400";
const HP_RED = "bg-red-600";

/**
 * Tailwind class for the HP bar fill at a given fraction (C1 §3.2, OD-5).
 * @param {number} fraction hp/maxhp in [0,1] (from parseCondition).
 * @returns {string} the fill color class.
 */
export function hpBarClass(fraction) {
    if (fraction >= 0.5) return HP_GREEN;
    if (fraction >= 0.2) return HP_AMBER;
    return HP_RED;
}

/**
 * Tooltip text for a disabled move button (C1 §3.2 "No PP remaining" etc.),
 * from a C2 §2.2 MoveEntry.
 * @param {{id:string, move:string, disabledReason?:string}} entry
 * @returns {string} "" when the move is not disabled.
 */
export function moveDisabledReason(entry) {
    if (!entry || !entry.disabled) return "";
    switch (entry.disabledReason) {
        case "0pp": return "No PP remaining";
        case "locked": return "Locked into this move";
        case "taunt": return "Taunted — Status moves are blocked";
        case "healblock": return "Heal Block — no healing moves";
        default: return "Cannot be used";
    }
}

/**
 * Tooltip text for a disabled SWITCH button (C1 §3.2 "Cannot switch — …"),
 * from a C2 §2.5 choiceRequest.
 * @param {{canSwitch:boolean, trapped:boolean, reason:string}} choiceRequest
 * @returns {string} "" when switching is allowed.
 */
export function switchDisabledReason(choiceRequest) {
    if (!choiceRequest || choiceRequest.canSwitch) return "";
    switch (choiceRequest.reason) {
        case "trapped": return "Your Pokémon is trapped";
        case "allbenchfainted": return "All bench Pokémon have fainted";
        case "busy": return "Your Pokémon is busy";
        default: return "";
    }
}

// ---------------------------------------------------------------------------
// Log line parsing. The service ships C2 §2.6 display strings — the raw
// protocol lines for that turn, pipe-delimited: "|move|p1a: X|Move|p2a: Y".
// The UI turns each line into Showdown-style prose; faints + turn boundaries
// get their C1 §3.2 rendering (semibold red species / divider row).
// ---------------------------------------------------------------------------

const RE_FAINT = /^\|faint\|/;
const RE_TURN = /^\|turn\|(\d+)$/;
const RE_EMPTY = /^\|\s*$/;

// The C1 §3.2 human events, and only those. Anything parseLogLine's switch
// does NOT recognize (|request|{...}, |t:| timestamps, stat-block chunks,
// |upkeep|, |gametype| variants, …) is protocol noise: it is hidden from the
// log, never rendered as an "info" line.
const DISPLAY_EVENTS = new Set([
    "turn", "faint",
    "move", "switch", "-switch",
    "status", "-status", "clearstatus", "-clearstatus",
    "-damage", "-heal",
    "immune", "-immune",
    "-boost", "-unboost", "-ability",
    "weather", "-weather",
]);

// Status ids -> the word Showdown's display code uses for the condition.
const STATUS_WORDS = {
    par: "paralyzed", brk: "burned", psn: "poisoned",
    sleep: "fell asleep", frz: "was frozen", toxic: "badly poisoned",
    flinch: "flinched",
};

/**
 * One rendered log row: { kind: "turn"|"faint"|"info", text, turn? }.
 * @param {string} raw a C2 §2.6 log line.
 * @returns {{kind:string, text:string, turn?:number}}
 *   kind "turn" — a "|turn|N" boundary (divider row, label "Turn N").
 *   kind "faint" — a "|faint|…" line (font-semibold, red species, C1 §3.2).
 *   kind "info" — prose for every other human line.
 */
export function parseLogLine(raw) {
    const line = String(raw || "");
    if (RE_TURN.test(line)) {
        return { kind: "turn", text: `Turn ${RE_TURN.exec(line)[1]}` };
    }
    if (RE_FAINT.test(line)) {
        // "|faint|p1a: Garchomp|42/357" -> "Garchomp fainted".
        // The ident is chunk 0 ("p1a: Garchomp"); the name is after the side.
        const who = (line.split("|")[2] || "").split(" ")[1] || "";
        return { kind: "faint", text: who ? `${who} fainted` : "A Pokémon fainted" };
    }
    const m = line.match(/^\|([a-z-]+)\|(.*)$/);
    if (!m) return { kind: "info", text: line };
    const [, ev, payload] = m;
    const parts = payload.split("|");
    // The ident is "p1a: Garchomp" — the display name is the part AFTER the
    // "side:" prefix (first whitespace-separated chunk is the side id).
    const who = (parts[0] || "").split(" ")[1] || "";
    switch (ev) {
        case "move": {
            // |move|p1a: Garchomp|Earthquake|p2a: Corviknight
            const used = parts[1] || "";
            const target = (parts[2] || "").split(" ")[1] || ""; // name, not "p2a:"
            return { kind: "info", text: target
                ? `${who} used ${used} against ${target}`
                : `${who} used ${used}` };
        }
        case "switch":
        case "-switch":
            return { kind: "info", text: who ? `${who} went on the field!` : "A Pokémon went on the field!" };
        case "status":
        case "-status": {
            const word = STATUS_WORDS[parts[1]] || parts[1];
            return { kind: "info", text: who ? `${who} ${word}` : word };
        }
        case "clearstatus":
        case "-clearstatus":
            return { kind: "info", text: who ? `${who}'s ${parts[1]} was removed` : "The status was removed" };
        case "-damage": {
            const hp = parts[1] ? ` (${parts[1]})` : "";
            return { kind: "info", text: who ? `${who} took damage${hp}` : "A Pokémon took damage" };
        }
        case "-heal":
            return { kind: "info", text: who ? `${who} recovered (${parts[1] || ""})` : "A Pokémon recovered" };
        case "immune":
        case "-immune":
            return { kind: "info", text: parts[1] ? `${who} is immune to ${parts[1]}` : "It had no effect" };
        case "-boost":
            return { kind: "info", text: who ? `${who}'s ${parts[1]} rose!` : "A stat rose!" };
        case "-unboost":
            return { kind: "info", text: who ? `${who}'s ${parts[1]} fell!` : "A stat fell!" };
        case "-ability":
            return { kind: "info", text: who ? `${who}'s ${parts[1]} activated` : "An ability activated" };
        case "-weather":
        case "weather":
            return { kind: "info", text: `The weather became ${parts[0]}` };
        default:
            // Unrecognized token: the display gate (isDisplayLogLine) hides it,
            // so this fallback is unreachable from the log UI — kept readable
            // for direct parseLogLine callers.
            return { kind: "info", text: [who, ev.startsWith("-") ? ev.slice(1) : ev, parts.slice(1).join(" ")].filter(Boolean).join(" ") };
    }
}

/**
 * Whether a raw log line should be shown at all: only the C1 §3.2 human
 * events (DISPLAY_EVENTS) render. Every other protocol line (|request|,
 * |t:, |upkeep|, |gametype|, stat blocks, …) is dropped — the win banner
 * (§3.2 end state) is the result's display surface, not the log.
 * @param {string} raw
 * @returns {boolean}
 */
export function isDisplayLogLine(raw) {
    const line = String(raw || "");
    if (!line || RE_EMPTY.test(line)) return false;
    const m = line.match(/^\|([a-z-]+)\|/);
    if (!m) return false; // non-protocol line (or |t: timestamp): hidden
    return DISPLAY_EVENTS.has(m[1]);
}

/**
 * D1 (fix 1): collapse consecutive identical DISPLAY rows. Two different
 * raw events can render the same sentence back-to-back — the classic case
 * is a `|switch|` announcement immediately followed by its `|-switch|`
 * stat-block twin (both read "X went on the field!"), or `|weather|` +
 * `|-weather|` ("The weather became X"). A reader scanning the log reads
 * that as a duplicate row. Repeats that are NOT consecutive are kept.
 *
 * @param {{kind:string, text:string}[]} rows parsed display rows.
 * @returns {Array<{kind:string, text:string}>} the rows with consecutive
 *   identical (kind + text) repeats collapsed to one.
 */
export function dedupeConsecutiveRows(rows) {
    const out = [];
    for (const row of rows || []) {
        const prev = out[out.length - 1];
        if (prev && prev.kind === row.kind && prev.text === row.text) continue;
        out.push(row);
    }
    return out;
}

/**
 * Idempotent log accumulation for the /battle page (D1 fix 1).
 *
 * The service ships only NEW lines per envelope (room.js slices at
 * lastEnvLogLen), so a normal advance never overlaps. The resync path
 * (notYourTurn -> GET /battle/:id, whose state() is the room's lastEnvelope)
 * re-ships the LAST slice, which can already be in the accumulated log —
 * blindly appending would double the rows. reconcileLog finds the longest
 * suffix of `prev` that matches the head of `slice` and appends only the
 * new tail, then collapses exact consecutive duplicates as a resync safety
 * net. startNewBattle's setLog(res.envelope.log) stays the only reset.
 *
 * @param {string[]} prev the accumulated raw log lines.
 * @param {string[]} slice the envelope's log slice (may overlap the tail).
 * @returns {string[]} the reconciled accumulated log.
 */
export function reconcileLog(prev, slice) {
    const p = Array.isArray(prev) ? prev : [];
    const s = Array.isArray(slice) ? slice : [];
    if (!s.length) return p;
    let overlap = 0;
    const cap = Math.min(p.length, s.length);
    for (let n = cap; n >= 1; n -= 1) {
        let matches = true;
        for (let i = 0; i < n; i += 1) {
            if (p[p.length - n + i] !== s[i]) { matches = false; break; }
        }
        if (matches) { overlap = n; break; }
    }
    const merged = [...p, ...s.slice(overlap)];
    const out = [];
    for (const line of merged) {
        if (out.length && out[out.length - 1] === line) continue;
        out.push(line);
    }
    return out;
}
