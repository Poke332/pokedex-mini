import { useState } from "react";
import { battleAudio } from "../../utils/battleAudio";

// Compact battle-sound toggle (Q2): the master on/off for cries + SFX + BGM.
// ON by default, persisted under the pokedex namespace; the localStorage
// value is authoritative (shared across battle sessions, re-read on mount).
//
// `active` says a battle is running (the entry or end state). The ON flip is
// the user gesture that unlocks audio, so only then does it (re)start the
// BGM loop — flipping it while no battle is running just persists the
// preference. Mirrors CriesPlayer's 44px round control so the app keeps one
// tap-target size.

function SpeakerIcon({ muted }) {
    return (
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M3 8v4h3l4 3.5v-11L6 8H3z" />
            {muted ? (
                <path
                    d="M12.5 8.5l4 4m0-4l-4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                />
            ) : (
                <path
                    d="M13 7.5a4 4 0 0 1 0 5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                />
            )}
        </svg>
    );
}

export default function SoundToggle({ active }) {
    // Read the persisted state once, in the lazy initializer (no effect):
    // the toggle's own flips update `on` locally, and a fresh mount re-reads
    // storage here.
    const [on, setOn] = useState(() => battleAudio.enabled());

    const flip = (next) => {
        setOn(next);
        battleAudio.toggleSound(next);
        if (next && active) {
            // The flip is the gesture that unlocks audio: (re)start the loop.
            battleAudio.unlock();
            battleAudio.startBattleMusic();
        }
    };

    return (
        <button
            type="button"
            aria-label="Toggle battle sound"
            aria-pressed={on}
            data-sound-toggle
            onClick={() => flip(!on)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-900 text-blue-100 transition-colors hover:bg-blue-950 focus:outline-none focus:ring-2 focus:ring-blue-300"
        >
            <SpeakerIcon muted={!on} />
        </button>
    );
}
