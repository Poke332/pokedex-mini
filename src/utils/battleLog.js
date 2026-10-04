// C6 — /battle display helpers.
//
// Pure string/shape helpers over the C2 §2 envelope (docs/simulation-dto.md):
// the condition grammar (§2.4: "73/100 par"), the raw protocol log lines the
// service ships per turn (§2.6: display strings, pipe-delimited), and the
// switch-disabled reason (§2.5). No React, no DOM — node:test-able.

/**
 * Parse the C2 §2.4 condition grammar ("100/100", "73/100 par", "0/100 fnt").
 * The live sim writes status tails as brn/par/slp/frz/psn/tox
 * (verified against the shipped service); the legacy C2 doc spellings
 * (brk/sleep/toxic) still parse — the label layer maps both.
 * @param {string} condition the mon's `condition` field.
 * @returns {{fraction:number, status:string, fainted:boolean}}
 *   fraction — hp/maxhp in [0,1]; clamped, 0 on garbage input.
 *   status   — the status id ("" | brn | par | slp | frz | psn | tox), or
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

// Status ids -> UI copy + a11y label (C1 §3.2 status icon row).
// The live sim (pokemon-showdown dist/data/conditions.js) uses these ids —
// verified against the shipped service, never memory: brn/par/slp/frz/psn/tox.
// The C2 doc spelled them brk/sleep/toxic; the legacy spellings stay mapped
// too, so either wire token resolves.
const STATUS_LABELS = {
    par: "Paralyzed",
    brk: "Burned",
    brn: "Burned",
    psn: "Poisoned",
    sleep: "Asleep",
    slp: "Asleep",
    frz: "Frozen",
    toxic: "Badly poisoned",
    tox: "Badly poisoned",
    fainted: "Fainted",
};

/**
 * Human label for a status id from parseCondition().status.
 * @param {string} status id ("" or par, brk/brn, psn, sleep, frz, toxic, fainted).
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
// The live sim emits brn/par/slp/frz/psn/tox (verified against the shipped
// service + pokemon-showdown dist/data/conditions.js); the legacy C2
// spellings (brk/sleep/toxic) map too, so either wire token resolves.
const STATUS_WORDS = {
    par: "paralyzed",
    brk: "burned", brn: "burned",
    psn: "poisoned",
    sleep: "fell asleep", slp: "fell asleep",
    frz: "was frozen",
    toxic: "badly poisoned", tox: "badly poisoned",
    flinch: "flinched",
};

// Stat ids -> the word Showdown's display code uses. The live sim ships raw
// stat ids in -boost/-unboost (pokemon.js boosts keys:
// atk/def/spa/spd/spe/accuracy/evasion); D4 check 1 is ZERO raw tokens, so
// each maps to its display word. `acc`/`eva` are the C2 doc spellings.
const STAT_WORDS = {
    atk: "Attack", def: "Defense",
    spa: "Sp. Atk", spd: "Sp. Def", spe: "Speed",
    accuracy: "Accuracy", acc: "Accuracy",
    evasion: "Evasion", eva: "Evasion",
};

function statWord(id) {
    const w = STAT_WORDS[String(id || "")];
    return w !== undefined ? w : String(id || "");
}

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
        case "-curestatus": {
            // Sim's status tail may be a raw id (brn/slp/…) — translate it the
            // same way as the -damage tail. Faints read "Fainted".
            const clearLabel = parts[1] ? (parts[1] === "fnt" ? "Fainted" : statusLabel(parts[1])) : "";
            return { kind: "info", text: who ? `${who}'s ${clearLabel || "status"} was removed` : "The status was removed" };
        }
        case "-damage": {
            // Live-sim payload is the full condition grammar — "82/100 brn"
            // (hp/maxhp + a status tail). D4 check 1: the status tail must
            // not render raw. Keep the established " (62/100)" hp read;
            // translate the tail through statusLabel. No tail -> unchanged.
            const cond = String(parts[1] || "");
            const mhp = /^(\S+)(?:\s+([a-z]+))?$/.exec(cond);
            const hp = mhp ? mhp[1] : cond;
            const label = mhp?.[2] ? (mhp[2] === "fnt" ? "Fainted" : statusLabel(mhp[2])) : "";
            const tail = cond ? ` (${hp}${label ? ` ${label}` : ""})` : "";
            return { kind: "info", text: who ? `${who} took damage${tail}` : "A Pokémon took damage" };
        }
        case "-heal": {
            // Same condition-grammar payload as -damage; keep the hp read,
            // translate any status tail.
            const cond = String(parts[1] || "");
            const mhp = /^(\S+)(?:\s+([a-z]+))?$/.exec(cond);
            const hp = mhp ? mhp[1] : cond;
            const label = mhp?.[2] ? (mhp[2] === "fnt" ? "Fainted" : statusLabel(mhp[2])) : "";
            const tail = cond ? ` (${hp}${label ? ` ${label}` : ""})` : "";
            return { kind: "info", text: who ? `${who} recovered${tail}` : "A Pokémon recovered" };
        }
        case "immune":
        case "-immune":
            return { kind: "info", text: parts[1] ? `${who} is immune to ${parts[1]}` : "It had no effect" };
        case "-boost":
            return { kind: "info", text: who ? `${who}'s ${statWord(parts[1])} rose!` : "A stat rose!" };
        case "-unboost":
            return { kind: "info", text: who ? `${who}'s ${statWord(parts[1])} fell!` : "A stat fell!" };
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

// ---------------------------------------------------------------------------
// S2 — health-change double-emit collapse. The sim ships each -damage/-heal
// TWICE within one turn, split by `|split|` channel markers: once in the
// absolute total-HP form ("|-damage|p2a: Venusaur|11/272") and once in the
// scaled-to-100 form ("|-damage|p2a: Venusaur|5/100"). The display wants
// only the ratio line, so the pair collapses to the scaled one.
// ---------------------------------------------------------------------------

/**
 * Facts for a -damage/-heal display line, or null for any other line.
 * @param {string} line a display-filtered raw log line.
 * @returns {{family:string, who:string, hp:number, max:number, tail:string}|null}
 *   family — "damage" | "heal"; who — the ident ("p2a: Venusaur");
 *   hp/max — the condition numerator/denominator; tail — the status word
 *   ("" when absent).
 */
function healthLineFacts(line) {
    // " |-damage|p2a: Venusaur|11/272 brn": leading pipe, event, ident, payload.
    const m = /^\|(-damage|-heal)\|([^|]*)\|([^|]*)/.exec(line);
    if (!m) return null;
    const who = m[2].trim();
    const pieces = m[3].split(/\s+/);
    const hpm = pieces[0] ? /^(\d+)\/(\d+)$/.exec(pieces[0]) : null;
    if (!hpm || !who) return null;
    return {
        family: m[1],
        who,
        hp: Number(hpm[1]),
        max: Number(hpm[2]),
        tail: pieces.slice(1).join(" ") || "",
    };
}

/**
 * S2: collapse the sim's double-emitted health-change pair so only the
 * scaled-to-100 ratio line survives. Pure; operates on the display-filtered
 * raw lines (after isDisplayLogLine, before parseLogLine).
 *
 * Rule: within a single turn, a -damage (resp. -heal) line L pairs with the
 * next same-family, same-Pokémon health line L' (non-health lines between
 * them — e.g. a |-status| twin — don't break the pairing; a turn boundary
 * does, since a double-emit never crosses one). Exactly one of the pair
 * carries the scaled denominator (max === 100): keep the /100 line, drop
 * the max-HP twin. Tails must agree: the discarded line may carry no tail
 * (its emit predates a status the scaled twin reports) or the same one;
 * two distinct tails never collapse. EQUAL denominators (or a pair where
 * neither side is 100 — two separate events) are NOT collapsed. Consumed
 * lines can't re-pair, so a stacked hit + residual tick on one Pokémon
 * collapses pair-by-pair, not crosswise.
 *
 * @param {string[]|null} displayLines display-filtered raw log lines.
 * @returns {string[]} the same lines with each paired max-HP form removed.
 */
export function collapseDoubleEmit(displayLines) {
    const lines = Array.isArray(displayLines) ? displayLines.map(String) : [];
    const facts = lines.map(healthLineFacts);
    const drop = new Set();
    const consumed = new Set();
    for (let i = 0; i < lines.length; i += 1) {
        if (consumed.has(i) || !facts[i]) continue;
        // Next same-family, same-Pokémon health line, without a turn
        // boundary between — a double-emit never crosses a turn.
        let j = -1;
        for (let k = i + 1; k < lines.length; k += 1) {
            if (/^\|turn\|/.test(lines[k])) break;
            if (consumed.has(k)) continue;
            if (facts[k] && facts[k].family === facts[i].family && facts[k].who === facts[i].who) {
                j = k;
                break;
            }
        }
        if (j === -1) continue;
        const a = facts[i];
        const b = facts[j];
        if (a.max === b.max) continue; // no scaled form in the pair
        let keep;
        let disc;
        if (a.max === 100) { keep = i; disc = j; }
        else if (b.max === 100) { keep = j; disc = i; }
        else continue; // neither is the scaled form — separate events
        const keepTail = facts[keep].tail;
        const discTail = facts[disc].tail;
        if (discTail !== keepTail && !(discTail === "" && keepTail !== "")) continue;
        drop.add(disc);
        consumed.add(i);
        consumed.add(j);
    }
    return lines.filter((_, idx) => !drop.has(idx));
}

/**
 * D4 fix 2 (fair-play / clutter): hide held items on the arena plates.
 *
 * The sim's `details` field is the wire contract — "Level 84 Forretress @
 * Focus Sash" — and is NOT stripped at the source (envelope.js owns that
 * shape). Held items are opponent intel: the player's plate and the foe's
 * plate both render them, which leaks information in both directions. The
 * display layer strips the "@ Item" clause and shows "Level 84 Forretress".
 *
 * The " @ " clause is Showdown's details format (level + species + item);
 * species and item names never contain the " @ " separator, so splitting on
 * it is safe. No item (or no match) returns the input unchanged.
 *
 * @param {string} details the C2 §2.4 `details` value.
 * @returns {string} the details with any "@ <Item>" clause removed.
 */
export function stripHeldItem(details) {
    const s = String(details || "");
    const i = s.indexOf(" @ ");
    if (i === -1) return s;
    return s.slice(0, i);
}
