// C5 — versioned localStorage for the simulation party.
//
// IMPLEMENTATION.md §5: the client keeps the party/team in localStorage;
// battles are ephemeral per session (NOT stored here). A version stamp means
// a stale schema is discarded on read instead of misread. resetParty() is the
// escape hatch (clears the key entirely).
//
// Storage is injectable so the pure logic is testable under node (where no
// localStorage exists); the browser calls the default, no-arg forms.

const KEY = "pokedex.simulation.party";
const VERSION = 1;

// Exported for the store's unit tests (write a stale-version blob and assert
// loadParty discards it).
export const PARTY_STORAGE_KEY = KEY;
export const PARTY_STORAGE_VERSION = VERSION;

// The default format (IMPLEMENTATION.md §1). Kept here so the store and the
// page agree without a second source.
const DEFAULT_FORMAT = "gen9ou";

// The browser localStorage, or null where it does not exist (node tests).
const browserStorage = () =>
    typeof localStorage !== "undefined" ? localStorage : null;

const defaultParty = () => ({ version: VERSION, format: DEFAULT_FORMAT, team: [] });

/**
 * Read + normalize the stored party. Any parse failure, missing version, or
 * version mismatch resets to the default silently (design §2.3: "restore
 * silently"). The team is capped at 6 sets and entries without a species are
 * dropped.
 * @param {{getItem: (string) => string|null}} [storage] the storage backend.
 * @returns {{version:number, format:string, team:object[]}}
 */
export function loadParty(storage = browserStorage()) {
    try {
        const raw = storage ? storage.getItem(KEY) : null;
        if (!raw) return defaultParty();
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION) return defaultParty();
        const team = Array.isArray(parsed.team)
            ? parsed.team.filter((s) => s && s.species).slice(0, 6)
            : [];
        return { version: VERSION, format: String(parsed.format || DEFAULT_FORMAT), team };
    } catch {
        return defaultParty();
    }
}

/**
 * Persist a party ({ format, team }). Truncates to 6 sets and stamps the
 * current version. Failures (quota, private mode) are swallowed — persistence
 * is a convenience, not a correctness gate.
 * @param {{format:string, team:object[]}} party
 * @param {{setItem: (string, string) => void}} [storage] the storage backend.
 */
export function saveParty(party, storage = browserStorage()) {
    if (!storage) return;
    try {
        const team = (party.team || []).slice(0, 6);
        storage.setItem(KEY, JSON.stringify({
            version: VERSION,
            format: party.format || DEFAULT_FORMAT,
            team,
        }));
    } catch {
        /* no-op */
    }
}

/**
 * Escape hatch — forget the stored party (and any format). The next load
 * returns the empty default. Battle state was never stored, so nothing else
 * is affected.
 * @param {{removeItem: (string) => void}} [storage] the storage backend.
 */
export function resetParty(storage = browserStorage()) {
    if (!storage) return;
    try {
        storage.removeItem(KEY);
    } catch {
        /* no-op */
    }
}
