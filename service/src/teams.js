// C4 sim service — team helpers.
//
// Owns team packing + validation in Showdown's own dialect (IMPLEMENTATION.md §2:
// "Service also owns team packing + validation"). The frontend never packs; it
// emits PokemonSet[] (docs/simulation-dto.md §1) and we do the pack/validate here.
//
// `Teams.generate` for the default opponent team: bare OU tiers (`gen9ou`) have no
// random-battle generator and throw "Custom bans not supported", so a generated
// p2 team must come from the tier's `randombattle` variant (confirmed by probing
// the shipped dist). The *sim* itself does not validate teams, so a generated
// random-battle team still runs under the chosen format.

import crypto from 'node:crypto';
import showdown from 'pokemon-showdown';
import { httpError } from './errors.js';

const { Teams, TeamValidator, toID } = showdown;

export { toID };

// A valid Showdown PRNG seed is either a `sodium,<hex>` string, a `gen5,...`
// string, or a comma list of numbers. User-supplied seeds are coerced into the
// number form (a 4x16-bit sha256-derived list) so arbitrary strings stay valid.
export function hashSeed(seedStr) {
    const h = crypto.createHash('sha256').update(String(seedStr ?? '')).digest();
    return [h.readUInt16LE(0), h.readUInt16LE(2), h.readUInt16LE(4), h.readUInt16LE(6)].join(',');
}

// Normalize a user seed into a valid PRNG string, or undefined when none given.
export function normalizeSeed(seed) {
    if (seed === undefined || seed === null || seed === '') return undefined;
    const s = String(seed);
    // already a plain comma-list of numbers (e.g. "12,34,56,78") or a single int
    if (/^\d+(,\d+)*$/.test(s)) return s;
    // sodium / gen5 prefixes pass through
    if (s.startsWith('sodium,') || s.startsWith('gen5,')) return s;
    return hashSeed(s);
}

// The random-battle format id used to generate a default p2 team for `format`.
// A format id that already ends in `randombattle` is used as-is; otherwise we
// fall back to the same-generation `randombattle` tier.
export function randomBattleFormatFor(format, gen = 9) {
    const f = toID(format);
    if (f.endsWith('randombattle')) return f;
    return `gen${gen}randombattle`;
}

// Generation digit from a format id ("gen9ou" -> 9). Default 9 when absent.
export function genFromFormat(format) {
    const m = /^gen(\d+)/.exec(String(format || ''));
    return m ? Number(m[1]) : 9;
}

// Teams.pack(team) -> packed string the sim is fed. Throws on an unpackable team.
export function packTeam(team) {
    return Teams.pack(team);
}

// Generate a legal default team for the tier (used when the caller supplies no p2).
// Cross-gen fallback: if the TARGET gen's randombattle generator throws,
// propagate a 4xx with the exact format id in `problems` — NEVER silently
// substitute a different generation (the old catch hardcoded gen9randombattle,
// which is how a gen6 battle could end up with a gen9 default opponent).
export function generateTeam(format, seed, size = 6) {
    const gen = genFromFormat(format);
    const randFmt = randomBattleFormatFor(format, gen);
    const seedStr = normalizeSeed(seed);
    const opts = seedStr ? { seed: seedStr } : {};
    try {
        return Teams.generate(randFmt, Object.assign({ teamSize: size }, opts));
    } catch {
        throw httpError(422, 'invalid team', {
            problems: [`could not generate a default team for format ${toID(format)}`],
        });
    }
}

// Run TeamValidator('<format>').validateTeam(team) -> { valid, problems[] }.
// problems is the validator's flat list of human strings (docs/simulation-dto.md
// §3.4); valid = problems.length === 0.
export function validateTeam(team, format) {
    try {
        const problems = new TeamValidator(toID(format)).validateTeam(team) || [];
        return { valid: problems.length === 0, problems: problems.slice() };
    } catch (e) {
        return { valid: false, problems: [String(e && e.message ? e.message : e)] };
    }
}
