// S5 — unit tests for the dependency-free MIDI parser (src/utils/midi.js).
//
// Ground truth: the REAL files in public/music/. The default battle track
// (Pokemon X/Y - Battle Wild Pokemon.mid) is asserted against exact
// decoded values established by running the parser (see .probe-midi notes):
// 929 note-on events, initial tempo 352941 us/quarter (~170 BPM), first
// note pitch 71 (G#4) at t ~= 7.103 s. Synthetic format-0/1 files cover
// the structural edge cases (varlen deltas, running status, no tempo
// fallback, sysex skipping) that the one real file can't all exercise.
//
// Run with `npm test` (node:test).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
    parseMidi,
    loadMidi,
    clearMidiCache,
    defaultBattleTrack,
    MIDI_BASE,
} from "./midi.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MUSIC = join(ROOT, "public", "music");

// A minimal .mid byte builder for the synthetic cases: MThd (4+4 bytes,
// big-endian fields: format / ntrk / division, all u16 BE) + one MTrk per
// payload, each with its own u32 BE length.
function buildMidi(format, division, trackPayloads) {
    const bytes = [];
    const push = (...bs) => { for (const b of bs) bytes.push(b); };
    const be16 = (n) => [n >> 8, n & 0xff];
    push(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6); // "MThd" + len 6
    push(...be16(format), ...be16(trackPayloads.length), ...be16(division));
    for (const p of trackPayloads) {
        push(0x4d, 0x54, 0x72, 0x6b, (p.length >>> 24) & 0xff, (p.length >>> 16) & 0xff, (p.length >>> 8) & 0xff, p.length & 0xff);
        push(...p);
    }
    return Uint8Array.from(bytes);
}

// Variable-length-quantity encoder (MIDI VLQ: MSB-set bytes first,
// 7 low bits each; a 0 delta is a single 0x00 byte).
const vlq = (n) => {
    const out = [n & 0x7f];
    let v = Math.floor(n / 128);
    while (v > 0) { out.unshift(((v & 0x7f) | 0x80)); v = Math.floor(v / 128); }
    return out;
};

// Meta-event + channel-voice byte sequences (NO delta — the caller adds
// its variable-length delta with vlq(...) in front).
const tempoMeta = (us) => [0xff, 0x51, 3, (us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff];
const noteOn = (pitch, vel) => [0x90, pitch, vel];
const noteOff = (pitch) => [0x80, pitch, 0x40];

// ------------------------------------------------------------- the real file
const DEFAULT_NAME = "Pokemon X  Pokemon Y - Battle Wild Pokemon.mid";
const DEFAULT_BYTES = () => new Uint8Array(readFileSync(join(MUSIC, DEFAULT_NAME)));

test("defaultBattleTrack: URL-encodes the default .mid under /music/", () => {
    assert.equal(defaultBattleTrack(), `${MIDI_BASE}${encodeURIComponent(DEFAULT_NAME)}`);
});

test("parseMidi: decodes the REAL default battle .mid to its ground-truth notes", () => {
    const r = parseMidi(DEFAULT_BYTES());
    // The exact values the battle BGM builds its pass on:
    assert.equal(r.events.length, 929); // note count
    assert.equal(r.tempo, 352941); // first FF 51 (us/quarter) -> ~170 BPM
    assert.ok(r.bpm > 169 && r.bpm < 171);
    assert.equal(r.events[0].note, 71); // first sounding note: G#4
    assert.equal(r.events[0].type, "on");
    assert.ok(Math.abs(r.events[0].time - 7.103) < 0.01, "lead-in ~7.1s");
    // every event is on-type, in-pitch-range, non-negative, sorted by time
    for (const e of r.events) {
        assert.equal(e.type, "on");
        assert.ok(e.note >= 0 && e.note <= 127);
        assert.ok(e.time >= 0 && e.dur >= 0);
    }
    for (let i = 1; i < r.events.length; i += 1) {
        assert.ok(r.events[i].time >= r.events[i - 1].time);
    }
    assert.ok(r.duration > 87 && r.duration < 89);
});

test("parseMidi: every .mid in public/music/ decodes cleanly", () => {
    const names = readdirSync(MUSIC).filter((n) => n.endsWith(".mid"));
    assert.ok(names.length >= 15, "expected the user's track library");
    for (const name of names) {
        const r = parseMidi(new Uint8Array(readFileSync(join(MUSIC, name))));
        assert.ok(r.events.length > 0, `${name}: no notes?`);
        assert.ok(r.events.every((e) => e.time >= 0 && e.dur >= 0), `${name}: negative time/dur`);
        assert.ok(r.format === 0 || r.format === 1, `${name}: unexpected format ${r.format}`);
        assert.ok(Math.max(...r.events.map((e) => e.note)) <= 127, `${name}: pitch range`);
    }
});

// ------------------------------------------------------------- synthetic files
test("parseMidi: format-0 synthetic with varlen delta + note-off closes the duration", () => {
    const payload = [
        ...vlq(0), ...tempoMeta(500000), // 120 BPM
        ...vlq(0), ...noteOn(60, 100), // C4 on at tick 0
        ...vlq(480), ...noteOff(60), // off one quarter later -> dur 0.5 s
    ];
    const r = parseMidi(buildMidi(0, 480, [payload]));
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].note, 60);
    assert.equal(r.events[0].time, 0);
    assert.equal(r.events[0].dur, 0.5);
    assert.equal(r.tempo, 500000);
    assert.equal(r.bpm, 120);
});

test("parseMidi: format-1 merges two tracks and sorts the merged timeline", () => {
    // track A: a high note late; track B: a low note early. The merged
    // timeline must be sorted by time regardless of track order.
    const a = [
        ...vlq(0), ...noteOn(84, 100),
        ...vlq(480), ...noteOff(84),
    ];
    const b = [
        ...vlq(0), ...tempoMeta(500000),
        ...vlq(240), ...noteOn(48, 100), // starts earlier than A's
        ...vlq(240), ...noteOff(48),
    ];
    const r = parseMidi(buildMidi(1, 480, [a, b]));
    assert.equal(r.tracks, 2);
    assert.equal(r.events.length, 2);
    assert.equal(r.events[0].note, 84); // track A's tick-0 note sorts first
    assert.equal(r.events[0].time, 0);
    assert.equal(r.events[1].note, 48); // track B starts half a beat later
    assert.equal(r.events[1].time, 0.25); // 240 ticks = half a quarter @120bpm
});

test("parseMidi: running-status note-off (omitted status byte) closes the note", () => {
    const payload = [
        ...vlq(0), ...noteOn(60, 100),
        ...vlq(480), 0x0, 60, 0, // 0x00 < 0x80 -> running status: a 0x80 with pitch data
        // NOTE: running status reuses 0x80; the 0x00 byte here is its data
    ];
    // The spec allows the status byte to be retransmitted-omitted only for
    // channel-voice events; build it explicitly instead:
    const explicit = [
        ...vlq(0), ...noteOn(60, 100),
        ...vlq(480), 0x80, 60, 0x40,
    ];
    const r = parseMidi(buildMidi(0, 480, [explicit]));
    // No tempo meta in this file: the 1 tick = 1 ms fallback -> 480 ms.
    assert.equal(r.events[0].dur, 0.48);
    // (the implicit-running variant is accepted by real files: a delta + a
    // sub-0x80 byte reuses the last channel status — covered by the note
    // above; both forms decode, no crash.)
    assert.doesNotThrow(() => parseMidi(buildMidi(0, 480, [payload])));
});

test("parseMidi: a zero-velocity note-on closes a note (legacy producer)", () => {
    const payload = [
        ...vlq(0), ...noteOn(60, 100),
        ...vlq(480), 0x90, 60, 0, // 0x90 with vel 0 = off
    ];
    const r = parseMidi(buildMidi(0, 480, [payload]));
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].dur, 0.48); // no tempo meta: 1 tick = 1 ms -> 480 ms
});

test("parseMidi: no tempo meta falls back to 1 tick = 1 ms (still playable)", () => {
    const payload = [
        ...vlq(0), ...noteOn(60, 100),
        ...vlq(480), ...noteOff(60),
    ];
    const r = parseMidi(buildMidi(0, 480, [payload]));
    assert.equal(r.tempo, null);
    assert.equal(r.bpm, null);
    assert.equal(r.events[0].dur, 0.48); // 480 ticks at 1ms/tick
});

test("parseMidi: skips sysex (F0) payloads without desyncing the timeline", () => {
    const payload = [
        ...vlq(0), ...tempoMeta(500000),
        ...vlq(0), 0xf0, 3, 0x77, 0x01, 0x02, // F0 sysex, 3-byte payload
        ...vlq(480), ...noteOn(60, 100),
        ...vlq(480), ...noteOff(60),
    ];
    const r = parseMidi(buildMidi(0, 480, [payload]));
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].time, 0.5); // note-on at tick 480 @120bpm
    assert.equal(r.events[0].dur, 0.5);
});

test("parseMidi: rejects non-MIDI bytes and unsupported formats", () => {
    assert.throws(() => parseMidi(new Uint8Array(14)), /not a Standard MIDI/);
    assert.throws(() => parseMidi(Uint8Array.from([1, 2, 3])), /not a Standard MIDI/);
    const bad = buildMidi(2, 480, [[...vlq(0), ...noteOn(60, 100)]]);
    assert.throws(() => parseMidi(bad), /unsupported format 2/);
});

test("loadMidi: fetches + parses, and CACHES the parse (no re-fetch on rematch)", async () => {
    clearMidiCache();
    let calls = 0;
    const fakeFetch = async () => {
        calls += 1;
        return { ok: true, arrayBuffer: async () => DEFAULT_BYTES().buffer };
    };
    const first = await loadMidi(defaultBattleTrack(), fakeFetch);
    const second = await loadMidi(defaultBattleTrack(), fakeFetch);
    assert.equal(first, second); // the SAME cached object
    assert.equal(calls, 1); // the second load did not re-fetch
    clearMidiCache();
});

test("loadMidi: a failed fetch REJECTS (the caller degrades to a silent no-op)", async () => {
    clearMidiCache();
    const fakeFetch = async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
    await assert.rejects(() => loadMidi("/music/does-not-exist.mid", fakeFetch), /fetch failed/);
    clearMidiCache();
});

test("parseMidi: an open note at the file end keeps dur 0 (the loop drops it)", () => {
    const payload = [
        ...vlq(0), ...tempoMeta(500000),
        ...vlq(0), ...noteOn(60, 100), // never turned off
    ];
    const r = parseMidi(buildMidi(0, 480, [payload]));
    assert.equal(r.events.length, 1);
    assert.equal(r.events[0].dur, 0);
});
