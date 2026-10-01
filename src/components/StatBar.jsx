import { toProperCase } from "../utils/api";
import { statLabel, statColorClass } from "../utils/stats";

export default function StatBar({ stat }) {
    const { name } = stat.stat;
    const { base_stat } = stat;
    const slug = name;
    return (
        <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs font-medium text-neutral-500">{statLabel(slug)}</span>
            <div className="flex-1 rounded-full bg-neutral-100" style={{ height: 8 }}>
                <div
                    className={`rounded-full ${statColorClass(slug)}`}
                    style={{ width: `${(base_stat / 200) * 100}%`, height: 8 }}
                />
            </div>
            <span className="w-8 text-right text-xs font-semibold text-neutral-900">{base_stat}</span>
        </div>
    )
}
