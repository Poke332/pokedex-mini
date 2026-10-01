import { getSpriteUrl } from "../../utils/api";
import HpBar from "./HpBar";
import { parseCondition } from "../../utils/battleLog";

/**
 * One bench chip in the bench row (C1 §3.2): a sprite thumb, the name, and
 * a 4px mini HP bar. Three states:
 *  - passive (default display)
 *  - switchable (SWITCH is active — lifts on hover, ring on focus, taps
 *    commit the switch immediately, OD-7)
 *  - fainted (grayscale, "Fainted" label, unselectable)
 *
 * @param {{
 *   mon: object,
 *   switchable: boolean,
 *   dexMap: Record<string, number|null>,
 *   onSwitch: (position: number) => void,
 * }} props
 *   mon        — a C2 §2.3 BenchMon (position is the team index the
 *     `switch <position>` choice string references).
 *   switchable — the bench row is in its switchable state (SWITCH pressed).
 *   dexMap     — species id -> national dex number.
 *   onSwitch   — commit a switch by the mon's team position.
 */
export default function BenchChip({ mon, switchable, dexMap, onSwitch }) {
    const { fainted } = parseCondition(mon?.condition);
    const dex = dexMap?.[mon.species] ?? null;
    const sprite = dex ? getSpriteUrl(dex) : null;
    const clickable = switchable && !fainted;

    return (
        <button
            type="button"
            aria-label={
                fainted
                    ? `${mon.name} fainted`
                    : clickable
                        ? `Switch to ${mon.name}`
                        : `${mon.name}, on the bench`
            }
            aria-disabled={!clickable}
            onClick={() => { if (clickable) onSwitch(mon.position); }}
            className={`flex w-24 shrink-0 snap-start items-center gap-2 rounded-lg border bg-white p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                fainted
                    ? "cursor-not-allowed border-neutral-200 opacity-60 grayscale"
                    : clickable
                        ? "cursor-pointer border-blue-200 hover:-translate-y-0.5 hover:border-blue-800 hover:bg-blue-50"
                        : "border-neutral-200"
            }`}
        >
            <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 ${
                    fainted ? "grayscale" : ""
                }`}
            >
                {sprite ? (
                    <img src={sprite} alt="" className="h-full w-full object-contain" loading="lazy" />
                ) : (
                    <span className="h-full w-full animate-pulse bg-neutral-100" />
                )}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-neutral-900">
                    {fainted ? "Fainted" : mon.name}
                </span>
                <span className="mt-1 block">
                    <HpBar mon={mon} name={mon.name} size="sm" />
                </span>
            </span>
        </button>
    );
}
