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
//    cached; a 404/absence is a silent no-op and NEVER a broken promise
//    (the card's "no-throw" bar).
//  - move-hit / faint SFX: synthesized on the fly with Web Audio
//    oscillators — no network dependency (PokeAPI's /v2/sound set is
//    sparse and 400s in this environment, so not load-bearing). Audio
//    never gates the D3 CSS animation: the synth is best-effort and every
//    failure path is a silent no-op.
//  - BGM: a generated 8-step chiptune loop scheduled on a lookahead timer
//    (no audio file shipped).
//
// Autoplay: browsers block audio before a user gesture. The battle only
// starts after the user picks a lead, so the page calls startBattleMusic()
// and unlock() inside that gesture; the header toggle is the fallback
// unlock path. SFX is additionally gated on an internal `unlocked` flag so
// a pre-gesture synth call is a documented no-op, not a silent hang.
//
// Injectable env (storage + audio factories) mirrors partyStore.js's
// pattern so the state machine is unit-testable under node (battleAudio
// .test.js). The browser calls the default export with no args.

export const CRY_BASE =
    "https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest";

export const BGM_STEPS_PER_LOOP = 8;

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
// An 8-step chiptune loop: a square lead over a soft pulse, C minor, whose
// last notes land on the loop's root so the wrap sounds intentional. Note
// values are semitones over A4; 0 = rest.
const BGM_STEP_MS = 120;
const BGM_LEAD = [12, 0, 15, 0, 13, 12, 10, 7];
const BGM_BASS = [0, 7, 0, 7, 0, 7, 5, 3];
const BGM_PULSE = [24, 0, 19, 0, 17, 0, 15, 0];
const HZ_FROM_SEMITONES = (semi) => 440 * Math.pow(2, semi / 12);

// ---------------------------------------------------------------- synthesis
// One osc+gain note: an oscillator through a gain node into the context
// destination (the card's fixed volume: no slider in scope).
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
 *   intervalMs?: number,
 * }} [env] injectables; the browser default export omits all of them.
 * @returns {Object} the controller (see the method typedefs on the object).
 */
export function createBattleAudio(env = {}) {
    const storage = env.storage != null ? env.storage : defaultStorage();
    const createElement = env.audioElement ?? ((url) => new window.Audio(url));
    const contextFactory = env.audioContext ?? defaultAudioContext;
    const stepMs = Math.max(60, Number(env.intervalMs) > 0 ? Number(env.intervalMs) : BGM_STEP_MS);

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
    let stopHandle = null; // the BGM scheduler timer
    let musicPlaying = false;

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
    const scheduleStep = (index) => {
        const c = ensureCtx();
        if (!c || c.state !== "running") return; // a suspended context schedules nothing
        const lead = BGM_LEAD[index];
        const bass = BGM_BASS[index];
        const pulse = BGM_PULSE[index];
        const dur = Math.max(0.09, (stepMs - 15) / 1000);
        try {
            if (lead) note(c, "square", HZ_FROM_SEMITONES(lead), HZ_FROM_SEMITONES(lead), 0, dur, 0.055, c.destination);
            if (bass) note(c, "triangle", HZ_FROM_SEMITONES(bass - 12), HZ_FROM_SEMITONES(bass - 12), 0, dur, 0.1, c.destination);
            if (pulse) note(c, "sine", HZ_FROM_SEMITONES(pulse), HZ_FROM_SEMITONES(pulse), 0, Math.min(0.06, dur * 0.5), 0.04, c.destination);
        } catch {
            /* the loop's step is lost; the next step reschedules cleanly */
        }
    };

    const startBattleMusic = () => {
        if (musicPlaying) return false; // one loop at a time (idempotent)
        if (!enabledNow()) return false;
        const c = ensureCtx();
        if (!c) return false;
        musicPlaying = true;
        unlocked = true; // starting the loop IS the post-gesture unlock
        // The first loop is scheduled up front so the wrap never gaps on
        // its own beat (a timer-only scheduler would drift).
        for (let i = 0; i < BGM_STEPS_PER_LOOP; i += 1) scheduleStep(i);
        let index = BGM_STEPS_PER_LOOP;
        stopHandle = setInterval(() => {
            scheduleStep(index % BGM_STEPS_PER_LOOP);
            index += 1;
        }, stepMs);
        return true;
    };

    const stopBattleMusic = () => {
        if (!musicPlaying) return false;
        musicPlaying = false;
        if (stopHandle != null) {
            clearInterval(stopHandle);
            stopHandle = null;
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
        startBattleMusic,
        stopBattleMusic,
        isMusicPlaying,
        cryUrlFor,
    };
}

// The browser-wide singleton: the header toggle and every battle page share
// one master state (persisted once under the pokedex namespace).
export const battleAudio = createBattleAudio();
