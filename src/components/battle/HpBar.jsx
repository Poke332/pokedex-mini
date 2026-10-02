import { parseCondition, hpBarClass } from "../../utils/battleLog";

/**
 * An animated HP bar for a battle plate (C1 §3.2 / §1 — 8px track, the
 * functional green/amber/red thresholds of OD-5). The fill width animates
 * from the mon's `condition` (C2 §2.4: "73/100 par") so turn-to-turn changes
 * slide instead of jump.
 *
 * Progressbar semantics: `role="progressbar"` with valuenow/min/max and an
 * "Charizard, 73 of 100 HP" label (C1 §3.2/§3.5).
 *
 * @param {{
 *   mon: object,
 *   name: string,
 *   size?: "lg" | "sm",
 * }} props
 *   mon  — an envelope mon (active/bench/foe) carrying `condition`.
 *   name — the mon's display name (for the aria-label).
 *   size — "lg" is the 8px plate bar; "sm" is the 4px bench-chip bar.
 */
export default function HpBar({ mon, name, size = "lg" }) {
    const { fraction, fainted } = parseCondition(mon?.condition);
    const pct = Math.round(fraction * 100);
    const tall = size === "lg";
    const hpNow = fainted ? "0" : `${Math.round(fraction * 100)}%`;
    return (
        <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label={`${name}, ${hpNow} HP`}
            className={`w-full overflow-hidden rounded-full bg-neutral-100 ${tall ? "h-2" : "h-1"}`}
        >
            <div
                className={`bs-hp-fill h-full rounded-full transition-[width] duration-500 ease-out ${fainted ? "bg-neutral-300" : hpBarClass(fraction)}`}
                style={{ width: `${fainted ? 0 : fraction * 100}%` }}
            />
        </div>
    );
}
