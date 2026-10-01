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
