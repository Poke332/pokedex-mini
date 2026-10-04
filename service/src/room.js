// C4 sim service — one battle room = one pokemon-showdown BattleStream.
//
// A room drives the sim one turn at a time over the C2 contract: the CALLER is
// p1 and submits a choice; the opponent p2 is driven autonomously (deterministic
// when a seed is supplied, so a reviewer can assert winner + turn count from the
// end LOGDATA per IMPLEMENTATION.md §7). Only that turn's envelope ships back.
//
// DOUBLES (gen9doublesou, format.gameType === 'doubles'): each side fields TWO
// actives, so a Showdown choice token is one sub-token PER PENDING ACTIVE,
// comma-joined ("move <id> <loc>, move" | "switch N, move"). The caller's token
// carries their sub-choice first; the remaining pending actives are auto-filled
// with bare 'move' / 'switch' sub-tokens (the sim's autoChoose determinism). A
// target sub-token only needs a location for foe/ally-targeting move types —
// self-typed moves ship no target.

import { BattleStream, getPlayerStreams } from './deps.js';
import {
    packTeam, validateTeam, generateTeam, normalizeSeed, toID,
} from './teams.js';
import { httpError } from './errors.js';
import { buildEnvelope } from './envelope.js';

// Move target types that take a TARGET LOCATION sub-token ("move <id> <loc>"),
// where <loc> is the signed relative position (0 = auto, +1/+2 = first/second
// foe, -1/-2 = ally/self). Mirrors the sim's CHOOSABLE_TARGETS
// (battle-actions.ts:3) exactly: every other target type (self / side / all /
// randomNormal …) rejects an explicit location ("can't choose a target").
const LOC_TARGETS = new Set([
    'normal', 'any', 'adjacentFoe', 'adjacentAlly', 'adjacentAllyOrSelf',
]);

// A single BattleStream room.
export class BattleRoom {
    constructor({ format, p1Team, p2Team, seed }) {
        this.id = 'b_' + Math.random().toString(36).slice(2, 8);
        this.format = toID(format);
        this.seed = normalizeSeed(seed);
        this.p1Team = p1Team;
        this.p2Team = p2Team;

        this.stream = new BattleStream();
        this.streams = getPlayerStreams(this.stream);
        this.battle = null;
        this.log = [];              // accumulated |display| lines for the room
        this._battleLogPos = 0;    // cursor into battle.log already captured
        this.lastEnvLogLen = 0;    // slice point for the next per-turn log
        this.rqid = 0;
        this.lastEnvelope = null;
        this._start();
    }

    // Kick off the sim: >start {formatid, seed} + >player p1/p2 <packed team>.
    // BattleStream creates the Battle object synchronously on the write, so
    // this.battle is ready by the time this returns.
    _start() {
        const spec = { formatid: this.format };
        if (this.seed) spec.seed = this.seed;
        this.streams.omniscient.write(
            `>start ${JSON.stringify(spec)}\n` +
            `>player p1 ${JSON.stringify({ name: 'P1', team: packTeam(this.p1Team) })}\n` +
            `>player p2 ${JSON.stringify({ name: 'P2', team: packTeam(this.p2Team) })}`,
        );
        this.battle = this.stream.battle;
    }

    // Pull new |display| lines off battle.log into this.log. Request lines are
    // never in battle.log (they ship on the player sub-streams), so we keep all
    // non-empty lines.
    _captureLog() {
        if (!this.battle) return;
        for (const line of this.battle.log.slice(this._battleLogPos || 0)) {
            if (line) this.log.push(line);
        }
        this._battleLogPos = this.battle.log.length;
    }

    // Opponent auto-respond: commit `default` on p2 until it has no pending
    // choice, so the caller's single advance resolves exactly one turn. A turn
    // can chain a simultaneous move + a forced switch on p2's side, so we loop
    // (capped) rather than writing a single `default`.
    _autoOpponent() {
        const p2 = this.battle.sides[1];
        let guard = 0;
        while (!this.battle.ended && !p2.isChoiceDone() && guard < 16) {
            this.streams.p2.write('default');
            guard++;
        }
    }

    // Build the per-turn envelope and attach that turn's log slice.
    _finalize() {
        this.rqid += 1;
        const env = buildEnvelope(this.battle, String(this.rqid));
        env.log = this.log.slice(this.lastEnvLogLen);
        this.lastEnvLogLen = this.log.length;
        this.lastEnvelope = env;
        return env;
    }

    // ------------------------------------------------------------------ create
    // Gate the CALLER's teams (Showdown's own dialect) before touching the sim.
    // p2 defaults to a tier-generated team when not supplied; a generated team is
    // trusted (the sim itself does not validate), so it is not hard-gated.
    // Returns the room; its first envelope (state "teampreview") is lastEnvelope.
    static create({ format, p1Team, p2Team, seed }) {
        if (!Array.isArray(p1Team) || p1Team.length < 1 || p1Team.length > 6) {
            throw httpError(400, 'invalid team', { problems: ['p1Team must be an array of 1-6 PokemonSet'] });
        }
        const callerProvidedP2 = Array.isArray(p2Team) && p2Team.length > 0;
        const p2 = callerProvidedP2 ? p2Team : generateTeam(format, seed, 6);
        const p1v = validateTeam(p1Team, format);
        const problems = [...p1v.problems];
        if (callerProvidedP2) problems.push(...validateTeam(p2, format).problems);
        if (problems.length) {
            throw httpError(422, 'invalid team', { problems });
        }
        const room = new BattleRoom({ format, p1Team, p2Team: p2, seed });
        room._captureLog(); // move the team-preview lines off battle.log into room.log
        room._finalize(); // first envelope (teampreview)
        return room;
    }

    // ------------------------------------------------------------- advance one
    // Take the caller's C2 choice, write p1's Showdown token, auto-respond p2,
    // and return that turn's envelope (only this turn's log).
    advance(choice) {
        if (!this.battle) throw httpError(404, 'battle not found');
        const p1 = this.battle.sides[0];
        if (this.battle.ended) throw httpError(409, 'not your turn', { reason: 'battle over' });
        if (p1.requestState === '') throw httpError(409, 'not your turn');

        const token = this._translateChoice(p1.requestState, String(choice ?? ''));
        this.streams.p1.write(token);
        this._autoOpponent();
        this._captureLog();
        return this._finalize();
    }

    // True for gen* doubles formats (`battle.format.gameType === 'doubles'` —
    // the sim's own field, reliable for gen9doublesou & co.).
    _isDoubles() {
        return !!(this.battle && this.battle.format && this.battle.format.gameType === 'doubles');
    }

    // C2 choice string -> Showdown choice token for p1.
    //   teampreview <i> (0-based)  -> team <i+1>
    //   move <id>                  -> move <id>
    //   switch <i> (0-based pos)   -> switch <i+1>
    // DOUBLES: a choice covers ONE PENDING ACTIVE per sub-token, comma-joined —
    // the caller's pick first, then a bare auto-fill ('move'/'switch') per
    // remaining active. The bare fill is the sim's autoChoose: deterministic.
    _translateChoice(rs, choiceStr) {
        const s = choiceStr.trim();
        if (rs === 'teampreview') {
            const m = /^teampreview(?:\s+(\d+))?/.exec(s);
            const idx = m && m[1] !== undefined ? Number(m[1]) : 0;
            return `team ${idx + 1}`;
        }
        if (!this._isDoubles()) {
            if (/^move\b/.test(s)) return s;                 // "move <id>" passthrough
            if (/^switch\b/.test(s)) {
                const idx = Number(s.replace(/^switch\b\s*/i, '').trim());
                return Number.isInteger(idx) ? `switch ${idx + 1}` : 'default';
            }
            return 'default';
        }
        return this._doublesToken(rs, s, this.battle.sides[0]);
    }

    // Doubles token builder. The sim wants ONE sub-token PER ACTIVE SLOT
    // (the full `p1.activeRequest.active` array in move state, or the
    // `forceSwitch` table in switch state), comma-joined — `choose()`
    // processes them in slot order and `isChoiceDone` requires an action
    // for every active. The caller's pick lands on the FIRST slot that
    // owns the pending choice; the other slots get a deterministic
    // auto-fill sub-token (bare 'move' = autoChoose, 'pass' = a free/empty
    // slot, bare 'switch' = an additional forced slot).
    _doublesToken(rs, s, p1) {
        if (rs === 'switch') {
            // switch-state request = { forceSwitch: [bool, bool], side }
            // (battle.ts getRequests). One sub-token per active slot: the
            // caller's switch on the first forced slot, a bare 'switch'
            // (autoChoose bench) on any further forced slot, 'pass' on free
            // slots. A bare 'switch' on a FREE slot would autoChoose a bench
            // mon, so free slots must 'pass'.
            const force = (p1.activeRequest && p1.activeRequest.forceSwitch) ||
                (p1.active || []).map((pk) => !!(pk && pk.switchFlag));
            const m = /^switch\s+(\d+)$/.exec(s.trim());
            const callerTok = m ? `switch ${Number(m[1]) + 1}` : 'switch';
            let ownerUsed = false;
            return force.map((f) => {
                if (!f) return 'pass';
                if (!ownerUsed) { ownerUsed = true; return callerTok; }
                return 'switch';
            }).join(', ');
        }
        // move state (and anything else the sim routes to p1 in doubles)
        const m = /^move\s+(\S+)(?:\s+([+-]?\d+))?$/.exec(s.trim());
        let callerTok;
        if (!m || m[1] === '0') {
            callerTok = 'move';                              // auto pick + auto target
        } else {
            const moveId = toID(m[1]);
            // Named move: a C2 explicit target-loc (m[2]) passes through. When
            // the C2 choice carries none (id-only — the SPA dialect), we supply
            // a default target-loc ONLY for target-needing move types. In
            // doubles a CHOOSABLE move with no target-loc is rejected by the
            // sim ("needs a target"), so we must emit a non-zero valid loc;
            // non-choosable move types reject any explicit target, so they
            // ship no suffix at all.
            const src = p1.active[0];
            let loc;
            if (m[2] !== undefined) {
                loc = Number(m[2]);                        // C2 explicit target-loc passes through
            } else {
                loc = this._defaultTargetLoc(moveId, src);
                // A target-needing move with no writable non-zero target-loc
                // (the resolver returns null): the named move can't be
                // addressed, so fall back to a bare auto-pick for this slot.
                if (loc === null) { callerTok = 'move'; }
            }
            if (loc !== null && callerTok !== 'move') {
                const locText = loc === 0 ? '' : (loc > 0 ? `+${loc}` : String(loc));
                callerTok = `move ${moveId}${locText ? ' ' + locText : ''}`;
            }
        }
        // Per-active sub-token list: one sub-token per slot that still holds a
        // LIVE (present, non-fainted) Pokémon. The sim auto-passes a fainted
        // active slot (getChoiceIndex's 'move' branch pushes a 'pass' for it),
        // so emitting a sub-token for a fainted slot shifts every following
        // sub-token onto an index past the last live Pokémon and the sim
        // rejects the whole choice ("You sent more choices than unfainted
        // Pokémon") — the no-substitute stall: the battle never resolves, a
        // client retry re-creates the room, and that is where the 422/500
        // surfaces. Fainted/empty slots therefore ship NO sub-token; the
        // caller's pick (named move or auto 'move') lands on the FIRST live
        // slot, later live slots get a bare auto-pick.
        const reqActive = ((p1.activeRequest && p1.activeRequest.active) || []);
        const toks = [];
        let callerPlaced = false;
        for (let i = 0; i < reqActive.length; i++) {
            const pk = p1.active && p1.active[i];
            if (!pk || pk.fainted) continue;            // auto-passed by the sim
            toks.push(callerPlaced ? 'move' : callerTok);
            callerPlaced = true;
        }
        return toks.length ? toks.join(', ') : 'move';
    }

    // Default target-loc for the caller's move in doubles. Choosable target
    // types (mirror the sim's CHOOSABLE_TARGETS, battle-actions.ts:3) need a
    // NON-zero loc — the sim's token grammar only writes ±1..±3 (0 is not a
    // writable suffix). We pick the nearest legal foe (+1/+2) or ally/self
    // (-1/-2) via battle.validTargetLoc.
    //   - non-locatable target type   -> 0      (ship no suffix; sim auto-resolves)
    //   - locatable but none writable -> null   (caller falls back to bare 'move')
    _defaultTargetLoc(moveId, src) {
        if (!moveId || !src) return 0;
        const md = this.battle.dex.moves.get(moveId);
        if (!md) return 0;
        const target = String(md.target || '');
        if (!LOC_TARGETS.has(target)) return 0;        // not target-needing: no suffix
        const foe = target !== 'adjacentAlly' && target !== 'adjacentAllyOrSelf';
        const candidates = foe ? [1, 2, -1, -2] : [-1, -2, 1, 2];
        for (const loc of candidates) {
            try {
                if (this.battle.validTargetLoc(loc, src, target)) return loc;
            } catch { /* try the next candidate */ }
        }
        return null;                                    // target-needing, none writable
    }

    // ----------------------------------------------------------------- state()
    // Most-recent envelope (resync for a client that reloaded).
    state() {
        if (!this.battle || !this.lastEnvelope) throw httpError(404, 'battle not found');
        return this.lastEnvelope;
    }

    // Authoritative result (winner index + total turn count) — mirrors the
    // end LOGDATA message, which carries the same winner name + turn count.
    result() {
        if (!this.battle || !this.battle.ended) return null;
        const winner = this.battle.winner === ''
            ? 0
            : this.battle.sides.findIndex((s) => s.name === this.battle.winner);
        return { winner: winner < 0 || winner > 1 ? 0 : winner, turns: this.battle.turn };
    }

}
