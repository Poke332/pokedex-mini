import { formatEncounters } from "../utils/encounters";

export default function EncountersList({ encounters }) {
    const rows = formatEncounters(encounters);
    if (!rows.length) return null;
    return (
        <div>
            <ul className="flex flex-col divide-y divide-neutral-100">
                {rows.map((e, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
                        <span className="min-w-40 text-sm font-medium text-neutral-900">
                            {e.area}
                        </span>
                        <span className="text-xs text-neutral-500">
                            {e.version}
                            {e.range ? ` · ${e.range}` : ""}
                        </span>
                    </li>
                ))}
            </ul>
            <p className="pt-2 text-xs text-neutral-400">Showing {rows.length} encounter areas.</p>
        </div>
    );
}
