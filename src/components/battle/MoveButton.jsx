import TypeBadge from "../TypeBadge";
import { moveDisabledReason } from "../../utils/battleLog";

/**
 * One move button in the 2×2 move grid (C1 §3.2): the move name, a type
 * badge, and a `PP n/max` chip (OD-6). Disabled moves grey out with a
 * tooltip (and aria) explaining why. Moves are content, not the primary
 * action — white card, red-600 hover fill (C1 §3.2).
 *
 * @param {{
 *   move: object,
 *   busy: boolean,
 *   disabledByState: boolean,
 *   onMove: (id: string) => void,
 * }} props
 *   move — a C2 §2.2 MoveEntry (id, move, type, category, pp, maxpp,
 *     disabled, disabledReason).
 *   busy — the service is processing the caller's choice; all moves disable.
 *   disabledByState — the request state does not allow moves this turn
 *     (e.g. a forced switch where only switching is legal, C1 §3.4 OD-9).
 *   onMove — commit a move by id.
 */
export default function MoveButton({ move, busy, disabledByState, onMove }) {
    const moveDisabled = !!move.disabled;
    const reason = moveDisabledReason(move);
    const disabled = busy || disabledByState || moveDisabled;
    // C1 §3.5: announce type + damage class ("Flamethrower, fire, special").
    const label = [
        move.move || move.id,
        move.type || "",
        (move.category || "").toLowerCase(),
    ].filter(Boolean).join(", ");

    return (
        <button
            type="button"
            title={reason || undefined}
            aria-label={moveDisabled ? `${label}. ${reason}` : label}
            aria-disabled={disabled}
            onClick={() => { if (!disabled) onMove(move.id); }}
            className={`min-h-11 flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
                moveDisabled || disabledByState
                    ? "cursor-not-allowed border-neutral-200 opacity-40"
                    : "cursor-pointer border-neutral-200 hover:border-red-600 hover:bg-red-600/5"
            } ${busy ? "cursor-wait opacity-70" : ""}`}
        >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                {move.move || move.id}
            </span>
            {move.type ? (
                <TypeBadge type={move.type} />
            ) : null}
            <span className="shrink-0 text-xs text-neutral-500">
                PP {move.pp}/{move.maxpp}
            </span>
        </button>
    );
}
