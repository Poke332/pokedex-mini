// P4 — /battle Doubles helpers (docs/simulation-dto.md §2 + the P1 service lane).
//
// Pure, node:test-able doubles logic: which move types need an explicit
// target LOCATION, and which visible mons are valid targets (the signed
// target-loc the C2 `move <id> <loc>` choice string ships). No React, no DOM —
// same wiring as battleLog.js / battleFx.js.
//
// Service contract (P1, room.js `_doublesToken` + the pinned
// pokemon-showdown sim):
//   - The caller's sub-choice always lands on active SLOT 0 (the other
//     pending slot is auto-filled), so the acting mon is `actives[0]`.
//   - Target-loc grammar (sim side.ts): ±1..±3 is writable; 0 is "auto" and
//     is NOT a writable suffix. A C2 `move <id>` with no loc lets the service
//     pick a default; an explicit loc passes through UNCHECKED, so the UI
//     must only emit locs that are actually valid.
//   - Coordinate system (sim battle.ts `getAtLoc`/`getLocOf`, activePerHalf=2):
//       foes (p2 active)  foes[i]    -> +（i+1)   (foes[0]=+1, foes[1]=+2)
//       allies (p1 active) actives[i] -> -(i+1)   (actives[0]=-1, actives[1]=-2)
//
// The target types that need a location mirror the sim's CHOOSABLE_TARGETS
// (battle-actions.ts:3) exactly — P1's room.js LOC_TARGETS is the same set.
// Every other target type (self / side / allySide / foeSide / all / allyTeam /
// randomNormal / scripted …) takes NO explicit location; the bare `move <id>`
// token works and the service resolves it.

import { parseCondition } from "./battleLog.js";

// The move target types that take a target LOCATION sub-token. Mirrors the
// sim's CHOOSABLE_TARGETS (battle-actions.ts:3) — keep in lock-step.
export const TARGET_LOC_TYPES = new Set([
    "normal",
    "any",
    "adjacentFoe",
    "adjacentAlly",
    "adjacentAllyOrSelf",
]);

// Which side of the field the target lives on.
const ALLY_TYPES = new Set(["adjacentAlly", "adjacentAllyOrSelf"]);

/**
 * Is this a doubles format (gate for all doubles-only UI surfaces).
 * @param {string} format the party's format id (party.format).
 * @returns {boolean}
 */
export function isDoublesFormat(format) {
    return format === "gen9doublesou";
}

/**
 * Does this move entry need an explicit target LOCATION in doubles?
 * @param {{target?: string}} move a C2 §2.2 MoveEntry (the service ships
 *   `target` = the move's target type id).
 * @returns {boolean}
 */
export function moveNeedsTarget(move) {
    return !!move && TARGET_LOC_TYPES.has(move.target);
}

/**
 * Build the target options for a doubles move that needs a target location.
 *
 * @param {{target?: string, id?: string}} move the chosen move.
 * @param {object[]} actives the caller's actives (envelope `active[]`,
 *   ordered by slot; the acting mon is actives[0]).
 * @param {object[]} foes the opponent's actives (envelope `foes[]`, ordered by
 *   slot).
 * @returns {{
 *   side: "foe" | "ally",
 *   options: Array<{
 *     mon: object,
 *     label: string,
 *     loc: number,          // the signed target-loc to ship (`+1`/`-2`…)
 *     locText: string,     // the C2 suffix token ("+1", "-2", "" = auto)
 *     disabled: boolean,
 *     reason: string,
 *   }>,
 * }}
 *   side — which field the picker renders over (foes[] or own actives[]).
 *   options — the valid target slots; each carries its signed `loc` and the
 *     C2 `locText` suffix ("" = the bare move token, i.e. "auto"). Fainted
 *     slots are disabled (a target cannot be a fainted mon). An ally move
 *     offers only the adjacent ally (+ self for `adjacentAllyOrSelf`) — the
 *     acting mon is actives[0], so its adjacent ally is actives[1].
 */
export function doublesTargetOptions(move, actives, foes) {
    const list = Array.isArray(actives) ? actives : [];
    const foeList = Array.isArray(foes) ? foes : [];
    const ally = ALLY_TYPES.has(move.target);
    const side = ally ? "ally" : "foe";
    const allowSelf = move.target === "adjacentAllyOrSelf";

    if (ally) {
        // Acting mon = actives[0]. Adjacent ally = actives[1]; self = actives[0]
        // (self only for adjacentAllyOrSelf). Negative locs (own field).
        return {
            side,
            options: list.map((mon, i) => {
                const isSelf = i === 0;
                const isAdjacentAlly = i === 1;
                const legal = allowSelf ? (isSelf || isAdjacentAlly) : isAdjacentAlly;
                const fainted = parseCondition(mon?.condition).fainted;
                const disabled = !legal || fainted;
                return {
                    mon,
                    label: mon?.name || "",
                    loc: disabled ? 0 : -(i + 1),
                    locText: disabled ? "" : String(-(i + 1)),
                    disabled,
                    reason: fainted ? "fainted" : (!legal ? "not a legal target" : ""),
                };
            }),
        };
    }

    // Foe-targeting (normal / any / adjacentFoe): the visible p2 actives,
    // positive locs (foes[0]=+1, foes[1]=+2). Fainted foes are disabled.
    return {
        side,
        options: foeList.map((mon, i) => {
            const fainted = parseCondition(mon?.condition).fainted;
            return {
                mon,
                label: mon?.name || "",
                loc: fainted ? 0 : i + 1,
                locText: fainted ? "" : `+${i + 1}`,
                disabled: fainted,
                reason: fainted ? "fainted" : "",
            };
        }),
    };
}

/**
 * The C2 target-loc SUFFIX for a signed loc (the token is `move <id> <suffix>`).
 * 0 => "" (the bare move token = "auto"); +1 => "+1"; -2 => "-2".
 * @param {number} loc
 * @returns {string}
 */
export function targetLocSuffix(loc) {
    if (!loc || loc === 0) return "";
    return loc > 0 ? `+${loc}` : String(loc);
}

/**
 * The default (service-parity) target location for a target-needing doubles
 * move when the caller does NOT pick a target: the first valid option
 * (nearest foe +1 for foe types, adjacent ally -2 / self -1 for ally types).
 * `null` when no legal target is on the field (all fainted) — the caller
 * then ships the bare `move <id>` and the service auto-resolves it.
 *
 * @param {{target?: string}} move
 * @param {object[]} actives
 * @param {object[]} foes
 * @returns {number|null}
 */
export function defaultDoubleTargetLoc(move, actives, foes) {
    const out = doublesTargetOptions(move, actives, foes);
    const first = out.options.find((o) => !o.disabled);
    return first ? first.loc : null;
}

/**
 * The auto-filled 2nd active for a doubles lead pick (P4 "2nd-lead preview").
 *
 * The P1 service commits the lead as the single Showdown token `team <lead+1>`;
 * the sim's `chooseTeam` then auto-fills the remaining `pickedTeamSize` slots
 * in ascending team-index order (side.ts chooseTeam). So the 2nd active slot
 * (positions[1]) is deterministic from the picked lead index:
 *
 *   lead = team index 0  ->  2nd active = team index 1
 *   lead = team index >=1 -> 2nd active = team index 0
 *
 * (For a 2+ member team the auto-fill pushes 0,1,2,… in order, skipping the
 * picked lead; positions[1] is therefore index 1 only when the lead is index
 * 0, else index 0.) This is a PREVIEW of what the sim will field — the caller
 * cannot pick it through the C2 choice string (it ships one lead only).
 *
 * @param {object[]} team the C2 §1 team (index = team position).
 * @param {number} leadIndex the picked lead's team index.
 * @returns {object|null} the 2nd-active team set, or null when the team has
 *   fewer than 2 members or the lead index is out of range.
 */
export function doublesSecondLead(team, leadIndex) {
    if (!Array.isArray(team) || team.length < 2) return null;
    const i = Number(leadIndex);
    if (!Number.isInteger(i) || i < 0 || i >= team.length) return null;
    const secondIdx = i === 0 ? 1 : 0;
    return team[secondIdx] || null;
}
