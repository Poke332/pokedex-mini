/**
 * The battle end card (C1 §3.2 end state): the single centered card the
 * arena + controls collapse into when `battleOver`.
 *
 *  - Victory: blue-800 band header "Victory".
 *  - Defeat: neutral-900 band header "Defeat" with red-600 text.
 *  - Subtitle: "Turns: N · Format: <format>" (the turn count is the
 *    caller's choice count, tracked client-side per C2 §2.7).
 *  - Buttons: Rematch (red-600 — re-run the preview with the same team)
 *    and Edit Party (blue outline -> /party).
 *  - Announced: role="status" for victory, role="alert" for defeat
 *    (C1 §3.5).
 *
 * @param {{
 *   victory: boolean,
 *   turns: number,
 *   format: string,
 *   busy: boolean,
 *   onRematch: () => void,
 *   onEditParty: () => void,
 * }} props
 */
export default function EndStateCard({ victory, turns, format, busy, onRematch, onEditParty }) {
    return (
        <div
            role={victory ? "status" : "alert"}
            className="w-full border border-neutral-200 bg-white rounded-lg"
        >
            {/* Result band */}
            <div
                className={`flex items-center justify-between gap-3 rounded-t-lg px-5 py-4 ${
                    victory ? "bg-blue-800" : "bg-neutral-900"
                }`}
            >
                <h2
                    className={`text-xl font-semibold tracking-tight ${
                        victory ? "text-white" : "text-red-600"
                    }`}
                >
                    {victory ? "Victory" : "Defeat"}
                </h2>
                <p className="text-sm text-blue-100">
                    Turns: {turns} · Format: {format}
                </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-3 p-5 sm:flex-row">
                <button
                    type="button"
                    onClick={onRematch}
                    disabled={busy}
                    className="min-h-11 flex-1 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {busy ? "Starting…" : "Rematch"}
                </button>
                <button
                    type="button"
                    onClick={onEditParty}
                    disabled={busy}
                    className="min-h-11 flex-1 rounded-lg border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                    Edit Party
                </button>
            </div>
        </div>
    );
}
