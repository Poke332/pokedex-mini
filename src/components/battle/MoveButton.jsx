import { useEffect, useId, useState } from "react";
import TypeBadge from "../TypeBadge";
import { moveDisabledReason } from "../../utils/battleLog";
import MoveTooltip from "./MoveTooltip";

/**
 * One move button in the 2×2 move grid (C1 §3.2): the move name, a type
 * badge, and a `PP n/max` chip (OD-6). Disabled moves grey out with a
 * tooltip (and aria) explaining why. Moves are content, not the primary
 * action — white card, red-600 hover fill (C1 §3.2).
 *
 * D1 (fix 3): the button also drives a real detail tooltip (MoveTooltip) —
 * hover OR focus opens it, ESC closes it, the button's native `title`
 * keeps the disabled-reason fallback, and the panel is wired with
 * aria-describedby. Effectiveness inside the panel is computed live from
 * `foe` (the current active foe's types) + `relations`, so it re-renders
 * when the opponent's active changes.
 *
 * @param {{
 *   move: object,
 *   busy: boolean,
 *   disabledByState: boolean,
 *   onMove: (id: string) => void,
 *   foe?: object|null,
 *   relations?: object|null,
 *   moveMeta?: object|null,
 * }} props
 *   move — a C2 §2.2 MoveEntry (id, move, type, category, pp, maxpp,
 *     disabled, disabledReason).
 *   busy — the service is processing the caller's choice; all moves disable.
 *   disabledByState — the request state does not allow moves this turn
 *     (e.g. a forced switch where only switching is legal, C1 §3.4 OD-9).
 *   onMove — commit a move by id.
 *   foe — the envelope's `foe` (active-foe mon) with `types` attached by
 *     the page (withMeta). null/absent → the panel's effectiveness reads "—".
 *   relations — the PokeAPI damage_relations map (null while loading → "—").
 *   moveMeta — the data-lane record for this move (adds `accuracy` to the
 *     panel); optional.
 */
export default function MoveButton({ move, busy, disabledByState, onMove, foe, relations, moveMeta }) {
    const moveDisabled = !!move.disabled;
    const reason = moveDisabledReason(move);
    const disabled = busy || disabledByState || moveDisabled;
    // C1 §3.5: announce type + damage class ("Flamethrower, fire, special").
    const label = [
        move.move || move.id,
        move.type || "",
        (move.category || "").toLowerCase(),
    ].filter(Boolean).join(", ");

    const [open, setOpen] = useState(false);
    const panelId = useId();

    // ESC closes the panel (keyboard users); mounted only while open.
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    // The panel shows on hover AND on focus; busy buttons never open it.
    const canOpen = !disabled;

    // Enrich the MoveEntry with the data-lane accuracy for the panel when
    // available (the C2 §2.2 entry itself carries no accuracy field).
    const fullMove = moveMeta?.accuracy != null
        ? { ...move, accuracy: moveMeta.accuracy }
        : move;

    return (
        <div className="relative">
            <button
                type="button"
                title={reason || undefined}
                aria-describedby={open ? panelId : undefined}
                aria-label={moveDisabled ? `${label}. ${reason}` : label}
                aria-disabled={disabled || undefined}
                onMouseEnter={() => canOpen && setOpen(true)}
                onMouseLeave={() => canOpen && setOpen(false)}
                onFocus={() => canOpen && setOpen(true)}
                onBlur={() => canOpen && setOpen(false)}
                onClick={() => { if (!disabled) onMove(move.id); }}
                className={`min-h-11 flex w-full items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
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
            {open && canOpen && (
                <MoveTooltip
                    id={panelId}
                    move={fullMove}
                    foe={foe}
                    relations={relations}
                    disabledReason={reason}
                />
            )}
        </div>
    );
}
