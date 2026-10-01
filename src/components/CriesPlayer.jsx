import { useRef, useState } from "react";
import { toProperCase } from "../utils/api";

function CryButton({ src, label }) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);

    const toggle = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playing) {
            audio.pause();
            setPlaying(false);
        } else {
            try {
                await audio.play();
                setPlaying(true);
            } catch (e) {
                // play() rejects on load failure; stay in the play state
            }
        }
    };

    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                aria-label={`${playing ? "Pause" : "Play"} ${label}`}
                onClick={toggle}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
                {playing ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                        <rect x="2" y="1" width="3.5" height="12" rx="1" />
                        <rect x="8.5" y="1" width="3.5" height="12" rx="1" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                        <path d="M3 1.5 L12 7 L3 12.5 Z" />
                    </svg>
                )}
            </button>
            <span className="text-xs font-medium text-neutral-500">{label}</span>
            <audio ref={audioRef} src={src} preload="none" onEnded={() => setPlaying(false)} className="hidden" />
        </div>
    );
}

export default function CriesPlayer({ cries, name }) {
    if (!cries || (!cries.latest && !cries.legacy)) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {cries.latest && <CryButton src={cries.latest} label={`${toProperCase(name)} cry`} />}
            {cries.legacy && <CryButton src={cries.legacy} label="Legacy cry" />}
        </div>
    );
}
