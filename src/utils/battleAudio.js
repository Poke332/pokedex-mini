// Q2 — battle audio controller (BGM + SFX + switch-in cries).
//
// One module, one export surface: `createBattleAudio()` builds a controller,
// and the default export `battleAudio` is the ready-made instance the UI
// consumes. No dependencies (the repo rule: react 19 + vite + tailwind) —
// everything is Web Audio API / HTMLAudioElement:
//
//  - switch-in cries: PokeAPI's bundled cries
//    (pokemon/{id}.cries -> raw.githubusercontent.com/PokeAPI/cries/main/
//     cries/pokemon/latest/{dexNum}.ogg), lazy-loaded per dex number and
//     cached; a 404/absence is a silent no-op and NEVER a broken promise
//     (the card's "no-throw" bar).
//  - move-hit / faint SFX: synthesized on the fly with Web Audio
//    oscillators — no network dependency (PokeAPI's /v2/sound set is
//    sparse and 400s in this environment, so not load-bearing). Audio
//    never gates the D3 CSS animation: the synth is best-effort and every
//    failure path is a silent no-op.
//  - BGM (S5): a user-supplied .mid battle track served from public/music/
//    — fetched once (module-level cache in midi.js), decoded by the
//    dependency-free parser in src/utils/midi.js, and played polyphonically
//    through the same oscillator note() family the SFX use. A .mid is not
//    natively playable by <audio>, so the decoded note events ARE the BGM
//    engine; there is no MIDI library and no build-time converter. A
//    .mid fetch/decode failure degrades to a silent no-op, same as a cry.
//
// Autoplay: browsers block audio before a user gesture. The battle only
// starts after the user picks a lead, so the page calls startBattleMusic()
// and unlock() inside that gesture; the header toggle is the fallback
// unlock path. SFX is additionally gated on an internal `unlocked` flag so
// a pre-gesture synth call is a documented no-op, not a silent hang.
//
// Injectable env (storage + audio factories + midi fetch) mirrors
// partyStore.js's pattern so the state machine is unit-testable under node
// (battleAudio .test.js). The browser calls the default export with no args.

import { defaultBattleTrack, loadMidi } from "./midi.js";

export const CRY_BASE =
    "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

// pokedex namespace, same family as pokedex.simulation.party/.battle.
export const SOUND_TOGGLE_KEY = "pokedex.simulation.battle-sound";

// ------------------------------------------------------------------ helpers
// A national dex number in the supported range, or null (species without a
// dexNum skip the cry entirely — the card's "skip" ruling).
function isValidDexNum(dexNum) {
    return Number.isInteger(dexNum) && dexNum >= 1 && dexNum <= 20000;
}

/**
 * The cry URL for a dex number (the PokeAPI cries layout), or null when the
 * dex number is not plausible. Pure, exported for strip-style tests.
 * @param {number|string} dexNum
 * @returns {string|null}
 */
export function cryUrlFor(dexNum) {
    return isValidDexNum(dexNum) ? `${CRY_BASE}/${dexNum}.ogg` : null;
}

const defaultStorage = () =>
    typeof localStorage !== "undefined" ? localStorage : null;

// One HTMLAudioElement per cry URL: the cache IS the lazy-load; a dead
// element (load failure) is marked and never re-fetched under the same URL.
function makeAudioElementCache() {
    const byUrl = new Map();
    const failed = new Set();
    return {
        isFailed: (url) => failed.has(url),
        markFailed: (url) => { failed.add(url); byUrl.delete(url); },
        get(url, createElement) {
            if (byUrl.has(url)) return byUrl.get(url);
            const el = createElement(url);
            byUrl.set(url, el);
            return el;
        },
    };
}

// The default AudioContext factory: null in node (no Web Audio) — the SFX
// and BGM then degrade to documented no-ops without throwing.
function defaultAudioContext() {
    if (typeof window === "undefined" || !window.AudioContext) return null;
    return new window.AudioContext();
}

// ------------------------------------------------------------------- BGM
// The decoded .mid events play through the note() helper (polyphonic: every
// sounding note of the track gets its own oscillator in the pass). Timbre
// is a plain square — a few notes overlap, so per-note gain stays low and
// a dedicated gain bus carries the whole BGM at a fixed level (the card's
// "no volume slider" ruling; stopping the battle disconnects that bus,
// which silences an already-scheduled pass in one move).
const MIDI_HZ = (pitch) => 440 * Math.pow(2, (pitch - 69) / 12);
const BGM_NOTE_GAIN = 0.035;
const BGM_BUS_GAIN = 0.8;
// Start the next pass this many seconds before the current one's last note
// ends, so the loop wrap never gaps.
const BGM_PASS_MARGIN = 0.05;

// ---------------------------------------------------------------- synthesis
// One osc+gain note: an oscillator through a gain node into `dest` (the
// context destination for SFX; the BGM bus for the loop).
function note(ctx, type, startHz, endHz, when, durSec, gainVal, dest) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const g = gain.gain;
    const now = ctx.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(startHz, now + when);
    if (endHz !== startHz) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(endHz, 1), now + when + durSec);
    }
    g.setValueAtTime(0.0001, now + when);
    g.linearRampToValueAtTime(gainVal, now + when + Math.min(0.015, durSec * 0.3));
    g.exponentialRampToValueAtTime(0.0001, now + when + durSec);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now + when);
    osc.stop(now + when + durSec + 0.05);
}

// ---------------------------------------------------------------- controller
/**
 * Build a battle audio controller.
 * @param {{
 *   storage?: {getItem:(string)=>string|null, setItem:(string,string)=>void} | null,
 *   audioElement?: (url:string)=>HTMLAudioElement,
 *   audioContext?: ()=>AudioContext|null,
 *   trackUrl?: string,
 *   fetchMidi?: (url:string)=>Promise<Response>,
 *   timers?: {setTimeout:Function, clearTimeout:Function},
 * }} [env] injectables; the browser default export omits all of them
 * (fetchMidi then defaults to global fetch, timers to the global
 * setTimeout/clearTimeout).
 * @returns {Object} the controller (see the method typedefs on the object).
 */
export function createBattleAudio(env = {}) {
    const storage = env.storage != null ? env.storage : defaultStorage();
    const createElement = env.audioElement ?? ((url) => new window.Audio(url));
    const contextFactory = env.audioContext ?? defaultAudioContext;
    const fetchMidi = env.fetchMidi ??
        (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
    // The BGM pass chain schedules a full pass-length timer (~87 s for the
    // default track). Real timers in the browser; tests inject a no-op pair
    // so a pending chain timer never pins node's event loop between runs.
    const timers = env.timers ?? globalThis;

    // The master toggle. A persisted value (set by this or another tab /
    // session) is authoritative and read live on every query; the in-memory
    // flag is the fallback when storage is absent (private mode). This keeps
    // two battle sessions or tabs in sync under one key.
    let enabled = (() => {
        if (!storage) return true;
        try {
            const raw = storage.getItem(SOUND_TOGGLE_KEY);
            return raw === null ? true : raw === "1";
        } catch {
            return true; // private mode: in-memory default
        }
    })();

    const enabledNow = () => {
        if (storage) {
            try {
                const raw = storage.getItem(SOUND_TOGGLE_KEY);
                if (raw !== null) return raw === "1";
            } catch { /* fall through to the in-memory flag */ }
        }
        return enabled;
    };

    const toggleSound = (on) => {
        enabled = !!on;
        try {
            if (storage) storage.setItem(SOUND_TOGGLE_KEY, enabled ? "1" : "0");
        } catch { /* private mode: in-memory only */ }
        if (!enabled) stopBattleMusic(); // the master governs the BGM loop too
        return enabled;
    };

    let ctx = null;
    const ensureCtx = () => {
        if (!ctx) {
            try { ctx = contextFactory(); } catch { ctx = null; }
        }
        return ctx;
    };

    // True once the AudioContext has been resumed by a user gesture. SFX is
    // gated on it so a pre-gesture call is a documented no-op, not a hang.
    let unlocked = false;

    const audioCache = makeAudioElementCache();
    let stopHandle = null; // the BGM pass-chain timer
    let bgmBus = null; // the BGM gain bus (disconnect = silent stop)
    let musicPlaying = false;
    let musicStarting = false; // a start is mid-fetch: overlapping starts no-op
    let musicGen = 0; // bumped on every stop: a fetch that finishes after
    // a stop must not resurrect the loop (the unmount race)
    let trackUrl = typeof env.trackUrl === "string" && env.trackUrl
        ? env.trackUrl
        : defaultBattleTrack();

    // ------------------------------------------------------------- cries
    const playSwitchInCry = (dexNum) => {
        if (!enabledNow()) return false;
        const url = cryUrlFor(dexNum);
        if (!url) return false; // species without a dexNum skip the cry
        if (audioCache.isFailed(url)) return false; // cached-dead, no re-fetch
        let el;
        try {
            el = audioCache.get(url, createElement);
        } catch {
            return false; // creation failed (no Audio in the env): silent no-op
        }
        if (!el) return false;
        try {
            const p = el.play();
            if (p && p.catch) {
                // A 404/absence rejects async; mark the URL dead so it is
                // never re-fetched, and never let the rejection escape into
                // the battle flow.
                p.catch(() => audioCache.markFailed(url));
            }
        } catch {
            /* play() throwing (autoplay-locked element): the cry skips */
        }
        return true;
    };

    // ------------------------------------------------------- SFX (synth)
    const synth = (specs) => {
        if (!enabledNow() || !unlocked) return false;
        const c = ensureCtx();
        if (!c || c.state !== "running") return false;
        try {
            for (const s of specs) {
                note(c, s.type, s.from, s.to ?? s.from, s.at ?? 0, s.dur, s.gain, c.destination);
            }
            return true;
        } catch {
            return false; // a broken context: the battle continues, silently
        }
    };

    // A move-hit: a single impact thump; the "attack" lunge reads as a low
    // sweep, a target impact as a higher one, so the pair reads "swing then
    // contact" alongside the D3 FX offsets.
    const playHit = (kind) => synth([
        kind === "attack"
            ? { type: "triangle", from: 180, to: 90, dur: 0.12, gain: 0.22, at: 0 }
            : { type: "square", from: 520, to: 160, dur: 0.1, gain: 0.14, at: 0 },
    ]);

    // A faint: a single descending sweep (the mon drops).
    const playFaint = () => synth([
        { type: "sine", from: 440, to: 110, dur: 0.4, gain: 0.25, at: 0 },
    ]);

    // ------------------------------------------------------------- unlock
    const unlock = async () => {
        const c = ensureCtx();
        if (!c) return false;
        try {
            if (c.state !== "running") await c.resume();
        } catch {
            return false;
        }
        if (c.state === "running") unlocked = true;
        return c.state === "running";
    };

    // ------------------------------------------------------------- BGM
    // Pick a battle .mid track for the NEXT startBattleMusic() call (S5's
    // "expose a way to pick a track later, don't over-build": one setter,
    // no picker UI yet). A running loop keeps its track until stopped.
    const setBattleTrack = (url) => {
        if (typeof url !== "string" || url.length === 0) return false;
        trackUrl = url;
        return true;
    };

    const startBattleMusic = async () => {
        if (musicPlaying || musicStarting) return false; // one loop at a time
        if (!enabledNow()) return false;
        let c = ensureCtx();
        if (!c) return false;
        musicStarting = true;
        const gen = musicGen;
        let track;
        try {
            // Cached per URL in midi.js: a rematch never re-fetches.
            track = await loadMidi(trackUrl, fetchMidi);
        } catch {
            track = null; // .mid fetch/decode failure: silent no-op
        } finally {
            musicStarting = false;
        }
        if (track === null) return false;
        // The fetch can outlive a stop (unmount mid-load): the generation
        // flip discards a late-arriving start — no resurrected loop.
        if (gen !== musicGen || musicPlaying) return false;
        // The fetch can outlive a suspended context: re-check + resume
        // before committing anything audible.
        c = ensureCtx();
        if (!c) return false;
        if (c.state !== "running") {
            try { await c.resume(); } catch { return false; }
            if (c.state !== "running") return false;
        }
        // A stop during the resume tick is a stop too: re-check the gen.
        if (gen !== musicGen) return false;
        // A dedicated gain bus carries the whole BGM at the fixed level
        // (the "no volume slider" ruling), and disconnecting it on stop
        // silences every already-scheduled pass in one move.
        let bus;
        try {
            bus = c.createGain();
            bus.gain.value = BGM_BUS_GAIN;
            bus.connect(c.destination);
        } catch {
            return false; // a broken context: the battle continues, silently
        }
        bgmBus = bus;
        musicPlaying = true;
        unlocked = true; // starting the loop IS the post-gesture unlock

        // One pass: schedule EVERY decoded note event of the track,
        // offset from the current ctx time. The lead-in silence is trimmed
        // (the pass starts at the track's first note) so the loop wrap has
        // no silent gap. Returns the pass length in seconds, or -1 when the
        // context broke mid-scheduling.
        const schedulePass = () => {
            const slice = track.events;
            const leadIn = slice.length ? slice[0].time : 0;
            let len = 0;
            try {
                for (const ev of slice) {
                    const offset = Math.max(0, ev.time - leadIn);
                    const dur = Math.max(0.05, ev.dur);
                    const hz = MIDI_HZ(ev.note);
                    note(c, "square", hz, hz, offset, dur, BGM_NOTE_GAIN, bus);
                    len = Math.max(len, offset + dur);
                }
                return Math.max(len, 0.25);
            } catch {
                return -1; // the pass is lost; the chain ends the loop quietly
            }
        };

        // The pass chain: each timer schedules the next pass BGM_PASS_MARGIN
        // seconds before the current one's last note ends (no gap at the
        // wrap). A stop, or a dead pass, breaks the chain. Timer handles
        // are opaque (the injectable timers pair owns their shape).
        const chain = (delaySec) => {
            stopHandle = timers.setTimeout(() => {
                stopHandle = null;
                if (!musicPlaying) return; // stopped during the delay
                const len = schedulePass();
                if (len > 0) chain(Math.max(0.1, len - BGM_PASS_MARGIN));
                else stopBattleMusic(); // a dead pass: end the loop quietly
            }, Math.max(0.1, delaySec) * 1000);
        };

        const first = schedulePass();
        if (first < 0) {
            musicPlaying = false;
            try { bus.disconnect(); } catch { /* noop */ }
            bgmBus = null;
            return false;
        }
        chain(first - BGM_PASS_MARGIN);
        return true;
    };

    const stopBattleMusic = () => {
        if (!musicPlaying) {
            // Even when nothing is playing, bump the generation so a
            // startBattleMusic() that is mid-fetch (the fetch already left
            // its entry check) cannot re-arm the loop after this stop.
            musicGen += 1;
            return false;
        }
        musicPlaying = false;
        musicGen += 1;
        if (stopHandle != null) {
            timers.clearTimeout(stopHandle);
            stopHandle = null;
        }
        if (bgmBus != null) {
            // Disconnecting the bus silences the already-scheduled passes
            // in one move (their oscillators run out and stop() on their
            // own — no per-oscillator teardown needed).
            try { bgmBus.disconnect(); } catch { /* noop */ }
            bgmBus = null;
        }
        return true;
    };

    const isMusicPlaying = () => musicPlaying;

    return {
        toggleSound,
        enabled: enabledNow,
        playSwitchInCry,
        playHit,
        playFaint,
        unlock,
        setBattleTrack,
        startBattleMusic,
        stopBattleMusic,
        isMusicPlaying,
        cryUrlFor,
    };
}

// The browser-wide singleton: the header toggle and every battle page share
// one master state (persisted once under the pokedex namespace).
export const battleAudio = createBattleAudio();
