// G1 — multi-gen service lane: cross-gen default-team generation must follow
// the TARGET format's generation, and every gen in the supported range must
// work end-to-end (POST /battle + 2 deterministic advances).
//
// Background: `generateTeam`'s catch used to silently fall back to
// 'gen9randombattle', so an older-gen format whose generation failed
// hand-shipped the user a GEN-9 default opponent. The fix: propagate a 4xx
// with the exact format id in `problems` — never substitute a different gen.
//
// All seeds below are verified LIVE against the installed sim
// (pokemon-showdown@0.11.11): P1_SEED[format] generates a team that passes
// that tier's own TeamValidator with 0 problems; P2_SEED[format] does the
// same for the default opponent; battle seed '1' normalizes to itself, so
// the service's default p2 team is directly comparable to the target-gen
// generator's output (a silently gen9-substituted team would differ and fail).

import test from 'node:test';
import assert from 'node:assert';

import showdown from 'pokemon-showdown';
import { handle, rooms } from '../src/router.js';
import { generateTeam, normalizeSeed } from '../src/teams.js';

// Verified live: each generated team passes its tier's own validator (0 problems).
const P1_SEED = {
    gen5ou: '2,5,9,13',
    gen6ou: '3,6,10,14',
    gen7ou: '5,8,12,16',
    gen8ou: '1,4,8,12',
    gen8ubers: '1,4,8,12',
    gen9ubers: '1,4,8,12',
    gen9uu: '23,26,30,34',
};
const P2_SEED = {
    gen5ou: '507,510,514,518',
    gen6ou: '301,304,308,312',
    gen7ou: '302,305,309,313',
    gen8ou: '510,513,517,521',
    gen8ubers: '500,503,507,511',
    gen9ubers: '500,503,507,511',
    gen9uu: '300,303,307,311',
};
const MULTI_GEN = Object.keys(P1_SEED);
// '1' is a plain comma-list, so normalizeSeed passes it through unchanged —
// the default-p2 comparison below is an exact target-gen generator check.
const BATTLE_SEED = '1';

function randFmtFor(format) {
    const gen = /^gen(\d+)/.exec(format)[1];
    return `gen${gen}randombattle`;
}

// Deterministic next p1 choice from the most-recent envelope — the same
// driver the gen9 E2E suite uses (legal move id, else a legal switch).
function nextChoice(env) {
    const cr = env.choiceRequest;
    if (cr.state === 'teampreview') return 'teampreview 0';
    if (cr.state === 'over' || cr.state === 'wait') return null;
    const legalMove = cr.legalMoves.find((m) => !m.disabled);
    if (legalMove) return `move ${legalMove.id}`;
    const sw = cr.legalSwitches[0];
    if (sw !== undefined) return `switch ${sw}`;
    return 'default';
}

// Explicit-pair battle: create + 2 deterministic advances; return a snapshot
// of the sim state (log length + every pokemon's health) for determinism.
function twoTurns(format) {
    const p1 = showdown.Teams.generate(randFmtFor(format), { seed: P1_SEED[format], teamSize: 6 });
    const p2 = showdown.Teams.generate(randFmtFor(format), { seed: P2_SEED[format], teamSize: 6 });
    const c = handle('POST', '/battle', { format, p1Team: p1, p2Team: p2, seed: BATTLE_SEED });
    assert.strictEqual(c.status, 200, `${format}: /battle create ok`);
    const id = c.body.battleId;
    const room = rooms.get(id);
    let env = handle('POST', `/battle/${id}/choice`, { choice: 'teampreview 0' });
    for (let i = 0; i < 2; i++) {
        const choice = nextChoice(env.body);
        assert.ok(choice !== null, `${format}: choice ${i} available (state ${env.body.choiceRequest.state})`);
        env = handle('POST', `/battle/${id}/choice`, { choice });
        assert.strictEqual(env.status, 200, `${format}: advance ${i + 1} resolved`);
    }
    const b = room.battle;
    return {
        turn: b.turn,
        logLen: b.log.length,
        p1: b.sides[0].pokemon.map((p) => `${p.position}:${p.getHealth().shared}`).join(','),
        p2: b.sides[1].pokemon.map((p) => `${p.position}:${p.getHealth().shared}`).join(','),
    };
}

// ---------------------------------------------------------------- fallback
// g1: cross-gen fallback must propagate, not silently substitute gen9.
test('generateTeam propagates a 4xx (not a silent gen9 fallback) when the target-gen randombattle generator throws', () => {
    const Teams = showdown.Teams;
    const orig = Teams.generate;
    const calls = [];
    Teams.generate = function mocked(fmt) {
        calls.push(fmt);
        throw new Error('GEN-THROW-SENTINEL');
    };
    try {
        assert.throws(
            () => generateTeam('gen6ou', P2_SEED.gen6ou),
            (e) => {
                assert.strictEqual(e.status, 422, '4xx (422) propagated');
                assert.strictEqual(e.error, 'invalid team');
                assert.ok(
                    e.extra && Array.isArray(e.extra.problems)
                        && e.extra.problems.join(' ').includes('gen6ou'),
                    `problems carry the exact format id (got ${JSON.stringify(e.extra)})`,
                );
                return true;
            },
        );
        // No gen9randombattle was ever attempted: silent substitution is the bug.
        assert.ok(!calls.includes('gen9randombattle'),
            `gen9randombattle must never be called for a gen6 target (calls: ${JSON.stringify(calls)})`);
    } finally {
        Teams.generate = orig;
    }
});

// g1 happy path: target-gen generation still works when the generator is fine.
test('generateTeam returns the target-gen team when generation succeeds', () => {
    const team = generateTeam('gen6ou', P2_SEED.gen6ou);
    const expected = showdown.Teams.generate(randFmtFor('gen6ou'), { seed: P2_SEED.gen6ou, teamSize: 6 });
    const sp = (t) => t.map((p) => p.species).join(',');
    assert.strictEqual(sp(team), sp(expected), 'same species as the target-gen generator');
});

// --------------------------------------------------------------- per-gen
for (const format of MULTI_GEN) {
    test(`${format}: a generated p1 team validates cleanly under its own tier`, () => {
        const team = showdown.Teams.generate(randFmtFor(format), { seed: P1_SEED[format], teamSize: 6 });
        const probs = new showdown.TeamValidator(format).validateTeam(team) || [];
        assert.strictEqual(probs.length, 0,
            `${format} p1 seed ${P1_SEED[format]} team must be tier-legal: ${JSON.stringify(probs)}`);
    });

    test(`${format}: generateTeam() output validates under its OWN tier (the right generation)`, () => {
        const p2Seed = P2_SEED[format];
        const team = generateTeam(format, p2Seed);
        const expected = showdown.Teams.generate(randFmtFor(format), { seed: p2Seed, teamSize: 6 });
        const sp = (t) => t.map((p) => p.species).join(',');
        assert.strictEqual(sp(team), sp(expected), `generateTeam uses ${format}'s own generation`);
        const probs = new showdown.TeamValidator(format).validateTeam(team) || [];
        assert.strictEqual(probs.length, 0,
            `${format} default team (seed ${p2Seed}) is tier-legal: ${JSON.stringify(probs)}`);
    });

    test(`${format}: POST /battle (no p2Team) generates the default p2 under the TARGET gen`, () => {
        const p1 = showdown.Teams.generate(randFmtFor(format), { seed: P1_SEED[format], teamSize: 6 });
        // p2 omitted: the service must generate it from the target tier's own
        // randombattle format under the normalized seed — never gen9randombattle.
        const out = handle('POST', '/battle', { format, p1Team: p1, seed: BATTLE_SEED });
        assert.strictEqual(out.status, 200, `${format}: /battle 200`);
        assert.strictEqual(out.body.format, format);
        assert.strictEqual(out.body.choiceRequest.state, 'teampreview');
        const p2 = rooms.get(out.body.battleId).p2Team;
        const expectedP2 = showdown.Teams.generate(randFmtFor(format), { seed: normalizeSeed(BATTLE_SEED), teamSize: 6 });
        const sp = (t) => t.map((x) => x.species).join(',');
        assert.strictEqual(sp(p2), sp(expectedP2),
            `default p2 team was generated under ${format}'s own generation`);
    });

    test(`${format}: two advances with a fixed seed advance the battle deterministically`, () => {
        const a = twoTurns(format);
        const b = twoTurns(format);
        assert.ok(a.logLen > 0 && a.turn >= 2, `${format}: 2 advances advanced the battle (turn ${a.turn}, log ${a.logLen} lines)`);
        assert.deepStrictEqual(a, b, `${format}: same seed + teams => identical 2-turn state`);
    });
}

// A useful cross-gen guard: a gen5-generated team fails the gen9ou validator,
// so a gen9 fallback would be caught by the species comparison above.
test('gen5 randombattle team is NOT legal under gen9ou (cross-gen check is informative)', () => {
    const team5 = showdown.Teams.generate('gen5randombattle', { seed: P1_SEED.gen5ou, teamSize: 6 });
    const probs = new showdown.TeamValidator('gen9ou').validateTeam(team5) || [];
    assert.ok(probs.length > 0, 'gen5 team flags problems under gen9ou');
});
