/**
 * P4 — the doubles move-target instruction row (the "target picker" banner).
 *
 * Shown above the move grid when a target-needing doubles move is in
 * targeting mode: it names the pending move, tells the caller to pick a
 * highlighted target on the field, and offers an explicit cancel (ESC).
 * The highlighted targets themselves are the arena plates (the page drives
 * the highlight + click), so this row is the instructions + affordance only.
 *
 * @param {{
 *   move: object|null,
 *   targetCount: number,
 *   onCancel: () => void,
 *   busy: boolean,
 * }} props
 *   move — the pending move entry (its display name + type badge).
 *   targetCount — how many highlighted targets are live on the field.
 *   onCancel — cancel targeting (also bound to ESC on the page).
 *   busy — the service is processing; the cancel is inert.
 */
import TypeBadge from "../TypeBadge";

export default function TargetPicker({ move, targetCount, onCancel, busy }) {
    if (!move) return null;
    const name = move.move || move.id;
    return (
        <div
            role="group"
            aria-label={`Target for ${name}`}
            className="mb-3 flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between"
        >
            <p className="text-sm font-semibold text-blue-900">
                <span className="text-neutral-500">Choose a target for</span>{" "}
                {name}
                {move.type ? <TypeBadge type={move.type} /> : null}
                <span className="ml-2 font-normal text-blue-800">
                    {targetCount > 0
                        ? `${targetCount} valid target${targetCount === 1 ? "" : "s"} — tap a highlighted Pokémon`
                        : "no valid target — the move auto-resolves"}
                </span>
            </p>
            <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="min-h-9 shrink-0 self-start rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
            >
                Cancel (Esc)
            </button>
        </div>
    );
}
