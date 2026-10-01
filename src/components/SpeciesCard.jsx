import { toProperCase } from "../utils/api";
import { getSpeciesSummary } from "../utils/species";

export default function SpeciesCard({ species }) {
    const summary = getSpeciesSummary(species);
    if (!summary) return null;
    const { flavorText, flags, rows } = summary;
    return (
        <div className="flex flex-col gap-4">
            {flavorText && <p className="text-sm text-neutral-600 italic">"{flavorText}"</p>}
            {flags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {flags.map((f) => (
                        <span key={f} className="rounded-full bg-blue-50 text-blue-800 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                            {f}
                        </span>
                    ))}
                </div>
            )}
            <dl className="flex flex-col gap-2">
                {rows.map(([k, v]) => (
                    <div key={k} className="flex items-baseline gap-3">
                        <dt className="w-28 shrink-0 text-xs text-neutral-500">{k}</dt>
                        <dd className="text-sm font-medium text-neutral-900">{toProperCase(v)}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}
