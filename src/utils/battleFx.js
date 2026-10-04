// D3 — Let's-Go-style battle scene FX (docs/battle-scene-spec.md §2).
//
// Pure envelope-diff logic: given the previous envelope, the new envelope,
// and the truly-NEW log lines of this envelope (see reconcileLog), it
// returns the queue of scene FX events the page schedules as one-shot
// CSS classes (spec §2.3 trigger points, §2.1 choreography).
//
// No React, no DOM — node:test-able, same wiring as battleLog.js.
// The DOM side (class add/remove + supersede timers) lives in
// BattlePage's scheduler (the hook recommended by the D2 open question).

import { parseCondition } from "./battleLog.js";

// Spec §2.1 durations, keyed by the event kind's class suffix. The HP
// drain is NOT an FX here — it is the existing 500ms width transition
// on HpBar's fill, which fires on its own when the new width renders.
export const BS_DURATIONS = {
    attack: 200,
    "attack-foe": 260,
    hit: 150,
    "hit-red": 150,
    "switch-in": 300,
    faint: 300,
    "turn-pulse": 200,
    status: 300,
};

// Event kind -> the `bs-*` class suffix (the page adds `bs-<suffix>`).
// The enemy's side-variant states (bs-attack-foe / bs-hit-red) are NOT
// separate kinds — the diff still emits kind "attack"/"hit" + `side`, and the
// page picks the variant class by side (playEvent). fxClass maps the base.
const FX_CLASS = {
    turnPulse: "turn-pulse",
    attack: "attack",
    hit: "hit",
    switchIn: "switch-in",
    faint: "faint",
    status: "status",
};

/**
 * @param {string} kind an fxEvents event kind.
 * @returns {string} the `bs-*` class name to toggle.
 */
export function fxClass(kind) {
    return `bs-${FX_CLASS[kind] || kind}`;
}

/**
 * S3: the one-shot class the page ACTUALLY adds for an event — the enemy
 * reads distinct from your own side:
 *   - the FOE's attack lunge is `bs-attack-foe` (deeper travel + red flash,
 *     longer beat) instead of the base `bs-attack`,
 *   - YOUR plate taking the hit is `bs-hit-red` (red-50 flicker + knockback)
 *     instead of the base `bs-hit` (blue-50 flicker on the foe's plate).
 * Everything else mounts the base class.
 *
 * @param {string} kind an fxEvents event kind.
 * @param {string} [side] "yours" | "foe" (the plate that mounts the class).
 * @returns {string} the `bs-*` class name to toggle.
 */
export function fxClassFor(kind, side) {
    if (kind === "attack" && side === "foe") return "bs-attack-foe";
    if (kind === "hit" && side === "yours") return "bs-hit-red";
    return fxClass(kind);
}

/**
 * The CSS duration (ms) of an event's one-shot class (spec §2.1 table).
 * @param {string} kind an fxEvents event kind.
 * @returns {number} ms until the class may be removed.
 */
export function fxDuration(kind) {
    const key = kind === "switchIn" ? "switch-in" : kind === "turnPulse" ? "turn-pulse" : kind;
    return BS_DURATIONS[key] ?? 300;
}

// ---------------------------------------------------------------------------
// S3 — the FX resolve window (docs/battle-scene-spec.md §2.1 choreography).
//
// The page's one-shot classes are plain CSS animations driven by keyframe
// declarations in index.css (the bs-* block); the page-side scheduler needs
// the EFFECTIVE duration without waiting for animations to finish, so this
// table mirrors the index.css `animation:` shorthands that carry each keyframe
// (including the S3-extended bs-attack-foe). battleFx.test.js asserts every
// entry against the index.css source, so a CSS retiming fails CI instead of
// silently desyncing the input gate.
export const CSS_CLASS_DURATIONS = {
    "bs-attack": 200,
    "bs-attack-foe": 260,
    "bs-hit": 150,
    "bs-hit-red": 150,
    "bs-switch-in": 300,
    "bs-faint": 300,
    "bs-turn-pulse": 200,
    "bs-turn-pulse-plate": 200,
    "bs-status": 300,
};

// S3: settle after the last FX lands before input re-arms (spec §2.1 window
// + a short tail so the final hit drain + faint read as finished).
export const FX_SETTLE_MS = 300;

// S3: hard cap on the resolve window (the choreography sum + settle, see
// fxWindow) — a stuck timer must never wedge the controls.
export const MAX_FX_WINDOW_MS = 1500;

const uniq = (xs) => [...new Set(xs)];

// "p1a: Garchomp" -> "Garchomp" (the display name after the side id).
function nameOf(ident) {
    const s = String(ident || "");
    const i = s.indexOf(" ");
    return i > -1 ? s.slice(i + 1) : "";
}

// Side-ident fallback (spec §2.2): p1* = the caller, p2* = the foe.
function identSide(ident) {
    const s = String(ident || "");
    if (s.startsWith("p1")) return "yours";
    if (s.startsWith("p2")) return "foe";
    return "";
}

// ---------------------------------------------------------------------------

/**
 * Diff two consecutive envelopes into the FX queue (spec §2.3, order
 * pulse -> move pairs -> switch-in -> status -> faints LAST).
 *
 * @param {object|null} prev the previous envelope (null on the first
 *   commit of a battle — the teampreview envelope has no actives yet).
 * @param {object} env the new envelope (C2 §2 shape).
 * @param {string[]} newLines ONLY the log lines this envelope added to
 *   the accumulated log (reconcileLog's tail, not the raw `env.log`
 *   slice — a notYourTurn resync re-ships its last slice and must not
 *   re-fire FX for lines already played).
 * @returns {Array<{kind:string, side?:string, offset:number}>}
 *   events; `side` is "yours"|"foe" (the plate to mount on); `offset`
 *   is ms after the envelope commit (spec §2.1 choreography: the hit
 *   lands ~150ms into each 200ms-staggered move pair).
 */
export function fxEvents(prev, env, newLines) {
    const lines = Array.isArray(newLines) ? newLines : [];
    const pActive = prev?.active?.[0] || null;
    const aActive = env?.active?.[0] || null;
    const pFoe = prev?.foe || null;
    const aFoe = env?.foe || null;

    // Name resolution pools (spec §2.2): match against BOTH envelopes'
    // names — a mid-turn switch means the acting mon may be the new one.
    const yoursNames = uniq([aActive?.name, pActive?.name].filter(Boolean));
    const foeNames = uniq([aFoe?.name, pFoe?.name].filter(Boolean));
    const sideForName = (n) =>
        yoursNames.includes(n) ? "yours" : foeNames.includes(n) ? "foe" : "";

    const events = [];

    // 1. a new |turn| boundary opens the window: the pill + arena pulse.
    if (lines.some((l) => /^\|turn\|/.test(String(l || "")))) {
        events.push({ kind: "turnPulse", offset: 0 });
    }

    // 2. |move| lines in log order: attacker lunge + target hit (a
    //    status move ships no target part -> lunge only), staggered
    //    200ms per pair; the hit lands ~150ms into its own lunge.
    let pair = 0;
    for (const line of lines) {
        const parts = String(line || "").split("|");
        if (parts[1] !== "move") continue;
        const atkSide = sideForName(nameOf(parts[2])) || identSide(parts[2]);
        if (atkSide) events.push({ kind: "attack", side: atkSide, offset: pair * 200 });
        const tgtName = nameOf(parts[4]);
        if (tgtName) {
            const tgtSide = sideForName(tgtName) || identSide(parts[4]);
            if (tgtSide) events.push({ kind: "hit", side: tgtSide, offset: pair * 200 + 150 });
        }
        pair += 1;
    }

    // 3. switch-in on the incoming plate: an active/foe species change
    //    (absent -> present counts) or a new |switch|/|-switch| line
    //    naming that side. One event per side per envelope. A null
    //    prev (the page's first applyEnvelope, the teampreview env)
    //    fires nothing: the plates are their initial mount.
    const speciesChanged = (pMon, aMon) =>
        !!prev && !!aMon?.species && pMon?.species !== aMon.species;
    const sideHasSwitchLine = (side) => lines.some((line) => {
        const parts = String(line || "").split("|");
        return (parts[1] === "switch" || parts[1] === "-switch")
            && String(parts[2] || "").startsWith(side);
    });
    if (speciesChanged(pActive, aActive) || sideHasSwitchLine("p1")) {
        events.push({ kind: "switchIn", side: "yours", offset: 0 });
    }
    if (speciesChanged(pFoe, aFoe) || sideHasSwitchLine("p2")) {
        events.push({ kind: "switchIn", side: "foe", offset: 0 });
    }

    // 4. status: a non-fainted token appearing on either side vs the
    //    previous envelope (spec §2.2; removals are silent unmounts).
    const statusOf = (mon) => parseCondition(mon?.condition).status;
    const yourStatus = statusOf(aActive);
    const prevYourStatus = statusOf(pActive);
    if (yourStatus && yourStatus !== "fainted" && yourStatus !== prevYourStatus) {
        events.push({ kind: "status", side: "yours", offset: 0 });
    }
    const foeStatus = statusOf(aFoe);
    const prevFoeStatus = statusOf(pFoe);
    if (foeStatus && foeStatus !== "fainted" && foeStatus !== prevFoeStatus) {
        events.push({ kind: "status", side: "foe", offset: 0 });
    }

    // 5. faints run LAST, timed just after the last hit of the window. A
    //    side that ALSO switches in this envelope has its fainted plate
    //    unmounted by the key-swap in the same commit (spec §2.2: the
    //    outgoing plate is not separately animated — the switch-in covers
    //    it), so the faint would re-target the incoming plate; drop it.
    //    A lone faint (the plate stays mounted, e.g. a forced-switch state
    //    where the fainted active is held until the next choice) still plays.
    const switchedSides = new Set(
        events.filter((e) => e.kind === "switchIn").map((e) => e.side),
    );
    const faintOffset = pair > 0 ? (pair - 1) * 200 + 150 : 0;
    for (const line of lines) {
        const parts = String(line || "").split("|");
        if (parts[1] !== "faint") continue;
        const side = sideForName(nameOf(parts[2])) || identSide(parts[2]);
        if (side && !switchedSides.has(side)) events.push({ kind: "faint", side, offset: faintOffset });
    }

    return events;
}

/**
 * The input-gate resolve window for a scheduled FX queue (S3): the moment
 * `busy` may release, the controls hold for this many ms so the enemy-side
 * choreography (lunge, hit, faint) visibly plays out before the next turn
 * re-arms — the spec §2.1 window measured from the commit (the rAF hop of a
 * frame is absorbed by the settle tail).
 *
 * `events` shape: the fxEvents() queue ({kind, side?, offset}). A foe
 * attack pair is the longest beat (attack 200ms @200 -> hit 150ms @350);
 * the settle tail covers the final hit's HP drain tail + the faint read.
 *
 * @param {Array<{kind:string, side?:string, offset:number}>|null|undefined} events
 * @returns {number} ms to hold input (0 = nothing scheduled, re-arm now);
 *   always <= MAX_FX_WINDOW_MS (a stuck timer can never wedge the UI).
 */
export function fxWindow(events) {
    const list = Array.isArray(events) ? events.filter((ev) => ev && ev.kind) : [];
    if (list.length === 0) return 0;
    // The effective CSS duration of the event's one-shot class (CSS_CLASS_DURATIONS
    // mirrors the index.css `animation:` shorthands; fxDuration is the JS-only
    // fallback when a class is unknown). Side-aware so the enemy's longer
    // attack-foe beat is counted, not the base 200ms.
    const durOf = (ev) =>
        CSS_CLASS_DURATIONS[fxClassFor(ev.kind, ev.side)] ?? fxDuration(ev.kind);
    let end = 0;
    for (const ev of list) {
        end = Math.max(end, ev.offset + durOf(ev));
    }
    return Math.min(MAX_FX_WINDOW_MS, end + FX_SETTLE_MS);
}
