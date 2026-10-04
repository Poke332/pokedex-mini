// S5 — dependency-free Standard MIDI file parser (formats 0/1).
//
// Decodes the .mid files in public/music/ so battle BGM can be played
// through the Web Audio oscillators in battleAudio.js (a .mid is not
// natively playable by <audio>; this module is the entire "MIDI engine" —
// byte-level parsing of the published Standard MIDI File spec: MThd
// header, MTrk chunks, variable-length delta times, 0x9x note-on / 0x8x
// note-off channel voice messages, FF 51 tempo meta, and 8-bit-sysex
// skipping. No dependencies (repo rule: react 19 + vite + tailwind);
// pure functions over Uint8Array/ArrayBuffer/number[], so it is
// unit-testable under node (node --test) against the real files.
//
// Event model: a flat, time-sorted list of note-on events covering the
// whole file (all MTrk chunks merged), one entry per sounding note-on:
//
//   { time, type: "on", note, dur }
//
// where `time` and `dur` are in SECONDS (converted from the file's ticks
// via the MThd division + the file's initial tempo), `note` is the MIDI
// pitch 0-127, and `dur` is the note's sounding length in seconds (the
// gap to its note-off; 0 when the file ends with the note still open).
// Note-offs are not returned — they exist only to close durations; a
// pitch's first off after its on is that on's release. The track's
// initial tempo (the FIRST FF 51 microseconds-per-quarter-note) is
// returned as `tempo` plus a convenience `bpm`.

// ------------------------------------------------------------------ bytes
function u16(buf, i) {
    return (buf[i] << 8) | buf[i + 1];
}

// MThd division is a SIGNED 16-bit value: positive = ticks per quarter
// note (the convention in game files); 0x0800-0xFFFF = SMPTE frames.
function divisionAt(buf, i) {
    const raw = u16(buf, i);
    return raw >= 0x8000 ? raw - 0x10000 : raw;
}

function u32(buf, i) {
    return ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
}

// A MIDI variable-length quantity: low 7 bits per byte, MSB = "more".
// Returns [value, nextIndex].
function readVarLen(buf, i) {
    let value = 0;
    for (;;) {
        const b = buf[i];
        i += 1;
        value = (value << 7) | (b & 0x7f);
        if (!(b & 0x80)) return [value, i];
    }
}

function toBytes(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Array.isArray(input)) return Uint8Array.from(input);
    throw new Error("midi: expected a Uint8Array, ArrayBuffer, or number[]");
}

// ------------------------------------------------------------ event model
/**
 * Parse a Standard MIDI file (format 0 or 1) into flat note-on events.
 * @param {Uint8Array|ArrayBuffer|number[]} data the .mid bytes.
 * @returns {{events: Array<{time:number, type:"on", note:number, dur:number}>,
 *            tempo:(number|null), bpm:(number|null), duration:number,
 *            tracks:number, format:number}}
 *   `events`   — the whole file's note-on timeline, merged across all
 *                MTrk chunks and sorted by `time` (ties: lower pitch).
 *   `tempo`    — the first FF 51 microseconds-per-quarter-note, or null
 *                when the file carries no tempo meta (timing then falls
 *                back to a 1 tick = 1 ms interpretation).
 *   `bpm`      — 60e6 / tempo, or null with it.
 *   `duration` — the last event's time + dur, in seconds (the loop's
 *                natural wrap point for the scheduler).
 *   `tracks`   — how many MTrk chunks were consumed.
 */
export function parseMidi(data) {
    const buf = toBytes(data);
    if (buf.length < 14 || u32(buf, 0) !== 0x4d546864) {
        throw new Error("midi: not a Standard MIDI file (missing MThd)");
    }
    const format = u16(buf, 8);
    const trackCount = u16(buf, 10);
    const division = divisionAt(buf, 12);

    if (format > 1) throw new Error(`midi: unsupported format ${format} (only 0/1)`);

    // On-events with their durations attached in ticks; note-offs close
    // them and are not emitted.
    const events = [];
    const activeByNote = new Map(); // pitch -> index into `events`
    let tempo = null;
    let off = 8 + u32(buf, 4); // skip MThd (4 magic + 4 len) and its payload

    for (let t = 0; t < trackCount; t += 1) {
        if (off + 8 > buf.length || u32(buf, off) !== 0x4d54726b) {
            throw new Error("midi: missing MTrk chunk");
        }
        const trackLen = u32(buf, off + 4);
        off += 8;
        const end = off + trackLen;
        if (end > buf.length) throw new Error("midi: MTrk runs past end of file");
        let i = off;
        let tick = 0;
        let lastChStatus = 0xff; // running-status state (spec §3.2)

        while (i < end) {
            const [delta, next] = readVarLen(buf, i);
            tick += delta;
            i = next;

            let status = buf[i];
            if (status < 0x80) {
                // running status: the status byte was omitted; reuse the
                // previous channel-voice status (its data bytes follow).
                status = lastChStatus;
            } else {
                i += 1;
            }

            if (status === 0xff) {
                // meta event: meta-type + varlen length + payload
                const meta = buf[i];
                i += 1;
                const [len, payload] = readVarLen(buf, i);
                if (meta === 0x51 && len >= 3 && tempo === null) {
                    tempo = (buf[payload] << 16) | (buf[payload + 1] << 8) | buf[payload + 2];
                }
                i = payload + len;
                lastChStatus = 0xff; // meta resets running status
                continue;
            }

            if (status === 0xf0 || status === 0xf7) {
                // 8-bit-sysex: varlen length + payload (F7 uses the same form)
                const [len, payload] = readVarLen(buf, i);
                i = payload + len;
                lastChStatus = 0xff;
                continue;
            }

            const hi = status & 0xf0;
            if (hi === 0x90 || hi === 0x80) {
                // note-on / note-off: two data bytes (pitch, velocity)
                const note = buf[i];
                const vel = buf[i + 1];
                i += 2;
                if (hi === 0x90 && vel > 0) {
                    // note-on: record the event and open a pending slot.
                    // A re-hit before the off closes the older on first —
                    // its dur is the gap up to now.
                    events.push({ timeTicks: tick, note, durTicks: 0 });
                    const prev = activeByNote.get(note);
                    if (prev !== undefined) {
                        events[prev].durTicks = tick - events[prev].timeTicks;
                    }
                    activeByNote.set(note, events.length - 1);
                } else {
                    // note-off (0x8x) or a zero-velocity on: close the
                    // pitch — attach the duration to its on-event.
                    const idx = activeByNote.get(note);
                    activeByNote.delete(note);
                    if (idx !== undefined && tick > events[idx].timeTicks) {
                        events[idx].durTicks = tick - events[idx].timeTicks;
                    }
                }
                lastChStatus = status;
                continue;
            }

            // every other channel-voice message (CC, pitch bend, etc.):
            // two data bytes — no state this parser tracks lives in them.
            i += 2;
            lastChStatus = status;
        }
        off = end;
    }

    // Notes still open at the file's end keep durTicks = 0 (the loop
    // scheduler simply drops them at the wrap point).

    // ---- ticks -> seconds.
    // Positive division = ticks per quarter note: with the initial tempo
    // the quarter lasts tempo/1e6 s. Anything else (SMPTE division, or no
    // tempo meta at all) falls back to 1 tick = 1 ms so the track still
    // plays at a sane rate instead of drifting.
    const ticksPerSecond = (division > 0 && tempo !== null)
        ? (division * 1e6) / tempo
        : 1000;

    const out = events
        .map((e) => ({
            time: e.timeTicks / ticksPerSecond,
            type: "on",
            note: e.note,
            dur: e.durTicks / ticksPerSecond,
        }))
        .sort((a, b) => a.time - b.time || a.note - b.note);

    let duration = 0;
    for (const e of out) duration = Math.max(duration, e.time + e.dur);

    const bpm = tempo !== null ? 60000000 / tempo : null;
    return { events: out, tempo, bpm, duration, tracks: trackCount, format };
}

// --------------------------------------------------------------- fetcher
export const MIDI_BASE = "/music/";

// The default battle BGM track (S5's scope: one track — the Wild battle
// theme; the other .mid files in public/music/ are a follow-up picker,
// not over-built here). Exported so a later picker builds on this
// constant. The file name contains spaces -> URL-encoded.
export function defaultBattleTrack() {
    return `${MIDI_BASE}${encodeURIComponent("Pokemon X  Pokemon Y - Battle Wild Pokemon.mid")}`;
}

// Module-level track cache: fetched .mid files are parsed once per URL
// (a rematch re-uses the parse; no re-fetch). Keyed by URL — the URL
// already encodes the file name.
const trackCache = new Map();

/**
 * Fetch + parse a .mid file, using the module cache so a rematch does not
 * re-fetch.
 * @param {string} url the SPA URL (e.g. defaultBattleTrack()).
 * @param {typeof fetch} [fetchFn] injectable (tests pass a fake; node has
 *   no global fetch in older runtimes).
 * @returns {Promise<{events:Array, tempo:(number|null), bpm:(number|null),
 *                    duration:number, tracks:number, format:number,
 *                    url:string}>} the parsed track; REJECTS on
 *   fetch/parse failure — the caller (battleAudio) treats that as a
 *   silent no-op.
 */
export async function loadMidi(url, fetchFn = globalThis.fetch) {
    if (typeof fetchFn !== "function") throw new Error("midi: no fetch implementation");
    const cached = trackCache.get(url);
    if (cached) return cached;
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`midi: fetch failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const parsed = { ...parseMidi(bytes), url };
    trackCache.set(url, parsed);
    return parsed;
}

/**
 * Drop the track cache (tests; a future picker may re-load after a swap).
 * @returns {void}
 */
export function clearMidiCache() {
    trackCache.clear();
}

export { u16, u32, readVarLen, divisionAt };
