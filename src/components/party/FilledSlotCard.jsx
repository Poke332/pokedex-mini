import { getSpriteUrl, toProperCase } from "../../utils/api";
import TypeBadge from "../TypeBadge";

/**
 * A filled team slot in the /party grid (C1 §2.2 FilledSlotCard).
 *
 * @param {{
 *   set: object,
 *   record: object|null,
 *   warnings: number,
 *   onEdit: () => void,
 *   onRemove: () => void,
 * }} props
 *   set — the stored draft set for this slot (C2 §1 fields).
 *   record — the C2 §4 record for this species+format, or null when the data
 *     lane has not loaded it yet (sprite/name/types fall back gracefully).
 *   warnings — count of unresolved move slots (C1 §2.2 amber chip; 0 hides it).
 *   onEdit — open the SetEditor for this slot.
 *   onRemove — remove this slot from the team.
 */
export default function FilledSlotCard({ set, record, warnings = 0, onEdit, onRemove }) {
    const moveIds = Array.isArray(set.moves) ? set.moves : [];
    const filledMoves = moveIds.filter(Boolean).length;

    // Resolve display move names from the record's legal pool (by id).
    const movePool = (record?.moves || []).reduce((acc, m) => {
        acc[m.id] = m.name;
        return acc;
    }, {});
    const moveNames = moveIds
        .map((id) => (id && movePool[id]) || (id ? toProperCase(id) : null))
        .filter(Boolean);

    const displayName = record?.species || toProperCase(set.species || "");
    const types = record?.types;
    const dexNum = record?.dexNum;
    const ability = record?.abilities?.find((a) => a.id === set.ability)?.name
        || (set.ability ? toProperCase(set.ability) : null);

    return (
        <div className="flex w-full flex-col gap-3 border border-neutral-200 bg-white p-4 rounded-lg">
            <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
                    {dexNum ? (
                        <img src={getSpriteUrl(dexNum)} alt={displayName} className="h-full w-full object-contain" />
                    ) : (
                        <div className="h-full w-full animate-pulse bg-neutral-100" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-red-600">
                        {dexNum ? `#${dexNum}` : " "}
                    </p>
                    <h3 className="truncate text-base font-semibold text-neutral-900">{displayName}</h3>
                    {types && (
                        <span className="mt-1 flex flex-wrap gap-1">
                            {types.map((t) => (
                                <TypeBadge key={t} type={t} />
                            ))}
                        </span>
                    )}
                </div>
            </div>

            <div className="space-y-1 text-xs text-neutral-600">
                <p className="truncate">
                    {moveNames.length ? moveNames.join(" · ") : "No moves set"}
                    <span className="text-neutral-400"> · {filledMoves}/4</span>
                </p>
                <p className="truncate">
                    {[ability, `Lv. ${set.level ?? 100}`].filter(Boolean).join(" · ")}
                </p>
                {warnings > 0 && (
                    <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {"⚠"} {warnings} unresolved
                    </span>
                )}
            </div>

            <div className="mt-auto flex gap-2">
                <button
                    type="button"
                    onClick={onEdit}
                    className="min-h-11 flex-1 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                    Edit
                </button>
                <button
                    type="button"
                    onClick={onRemove}
                    className="min-h-11 flex-1 rounded-lg border border-red-200 bg-white px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                    Remove
                </button>
            </div>
        </div>
    );
}
