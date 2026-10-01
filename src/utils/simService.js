// C5 — SPA client for the C4 sim service (docs/simulation-dto.md §3).
//
// The SPA "only fetches the service" (IMPLEMENTATION.md §2). In dev the
// service runs on its own port (service/ `npm start`, default 4040) and vite
// proxies same-origin `/sim/*` to it (see vite.config.js), so a relative URL
// is the only cross-origin request the browser ever makes. A build can
// override the base with `VITE_SIM_SERVICE` (e.g. the deployed service root).

const SIM_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_SIM_SERVICE) || "/sim";

// Normalized result for the start-battle gate:
//   valid: boolean | null (null = service unreachable)
//   problems: string[] (the validator's human strings; [] when valid)
//   reachable: boolean
export async function validateTeam(team, format) {
    let res;
    try {
        res = await fetch(`${SIM_BASE}/team/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format, team }),
        });
    } catch {
        return { valid: null, problems: [], reachable: false };
    }
    if (!res.ok) {
        // 400 malformed / 5xx: the service saw a problem we cannot interpret
        // as "team is fine" — treat as not-startable, keep the raw message.
        let msg = `Service responded ${res.status}`;
        try {
            const body = await res.json();
            if (body.error) msg = body.error;
            if (Array.isArray(body.problems)) msg = body.problems.join(" ");
        } catch {
            /* keep default */
        }
        return { valid: false, problems: [msg], reachable: true };
    }
    const body = await res.json().catch(() => ({}));
    return {
        valid: body.valid === true,
        problems: Array.isArray(body.problems) ? body.problems : [],
        reachable: true,
    };
}

// ---------------------------------------------------------------------------
// C6 — battle drive (docs/simulation-dto.md §3.1–§3.3).
//
// Every call returns a normalized result, never a thrown fetch error:
//   { ok: true, envelope } — the C2 §2 envelope (create adds battleId/format/turn)
//   { ok: false, error, problems[], kind }
//     kind: "unreachable" — the service could not be reached at all (C1 §3.2
//       service-offline banner, OD-8 retry)
//           "battleGone"  — 404 room expired/unknown (C1 §3.4 leaving the
//       page mid-battle; resync or restart)
//           "notYourTurn" — 409 (a choice landed while the state was over/wait;
//       safe to resync via getBattleState)
//           "invalidTeam" — 422 validator problems on create
//           "service"     — any other 5xx
// ---------------------------------------------------------------------------

// POST /battle — create a room and get its first envelope (state "teampreview").
/**
 * Create a battle room on the C4 service.
 * @param {{format:string, p1Team:object[], p2Team?:object[], seed?:string}} opts
 *   p1Team — the caller's team (C2 §1, via buildTeam). p2Team/seed are
 *   optional; the service defaults p2 to a generated team.
 * @returns {Promise<{ok:boolean, envelope?:object, error?:string, problems?:string[], kind?:string}>}
 */
export async function startBattle({ format, p1Team, p2Team, seed }) {
    let res;
    try {
        res = await fetch(`${SIM_BASE}/battle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ format, p1Team, p2Team, seed }),
        });
    } catch {
        return { ok: false, error: "Battle service unreachable", kind: "unreachable" };
    }
    if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        return {
            ok: false,
            error: body.error || "Invalid team",
            problems: Array.isArray(body.problems) ? body.problems : [],
            kind: "invalidTeam",
        };
    }
    if (!res.ok) {
        return { ok: false, error: `Service responded ${res.status}`, kind: "service" };
    }
    const envelope = await res.json().catch(() => ({}));
    return { ok: true, envelope };
}

// POST /battle/:id/choice — advance exactly one turn (C2 §3.2).
/**
 * Send one caller choice and receive that turn's envelope.
 * @param {string} battleId
 * @param {string} choice the C2 §3.2 choice string
 *   ("teampreview <i>" | "move <id>" | "switch <i>").
 * @returns {Promise<{ok:boolean, envelope?:object, error?:string, kind?:string}>}
 */
export async function sendChoice(battleId, choice) {
    let res;
    try {
        res = await fetch(`${SIM_BASE}/battle/${encodeURIComponent(battleId)}/choice`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ choice }),
        });
    } catch {
        return { ok: false, error: "Battle service unreachable", kind: "unreachable" };
    }
    if (res.status === 404) {
        return { ok: false, error: "Battle not found", kind: "battleGone" };
    }
    if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return { ok: false, error: body.error || "Not your turn", kind: "notYourTurn" };
    }
    if (!res.ok) {
        return { ok: false, error: `Service responded ${res.status}`, kind: "service" };
    }
    const envelope = await res.json().catch(() => ({}));
    return { ok: true, envelope };
}

// GET /battle/:id — resync to the most-recent envelope (C2 §3.3).
/**
 * Resync to the battle's most-recent envelope (after a reload or a
 * not-your-turn race).
 * @param {string} battleId
 * @returns {Promise<{ok:boolean, envelope?:object, error?:string, kind?:string}>}
 */
export async function getBattleState(battleId) {
    let res;
    try {
        res = await fetch(`${SIM_BASE}/battle/${encodeURIComponent(battleId)}`, {
            method: "GET",
        });
    } catch {
        return { ok: false, error: "Battle service unreachable", kind: "unreachable" };
    }
    if (res.status === 404) {
        return { ok: false, error: "Battle not found", kind: "battleGone" };
    }
    if (!res.ok) {
        return { ok: false, error: `Service responded ${res.status}`, kind: "service" };
    }
    const envelope = await res.json().catch(() => ({}));
    return { ok: true, envelope };
}
