/**
 * An empty team slot in the /party grid (C1 §2.2 EmptySlotCard): a dashed
 * card whose single ghost button scrolls to the add section and focuses the
 * search input.
 *
 * @param {{onAdd: () => void}} props
 *   onAdd — scroll the page to the add section and focus the search input.
 */
export default function EmptySlotCard({ onAdd }) {
    return (
        <div className="flex min-h-44 flex-col items-center justify-center gap-3 border-2 border-dashed border-neutral-300 bg-white/50 p-4 rounded-lg">
            <button
                type="button"
                onClick={onAdd}
                className="min-h-11 rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
                + Add Pokémon
            </button>
        </div>
    );
}
