import { buildTypeMatrix, cellMeta } from "../utils/typechart";
import TypeIcon from "./TypeIcon";

const TONE_CELL = {
    super: "bg-red-100 text-red-800",
    weak: "bg-amber-100 text-amber-800",
    immune: "bg-neutral-100 text-neutral-400",
    neutral: "bg-transparent text-neutral-300",
};

function Legend() {
    const items = [
        ["super", "2×", "super effective"],
        ["weak", "½", "not very effective"],
        ["immune", "×", "no effect"],
        ["neutral", "·", "neutral"],
    ];
    return (
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
            {items.map(([tone, mark, label]) => (
                <span key={tone} className="flex items-center gap-1.5 text-xs text-neutral-500">
                    <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-semibold ${TONE_CELL[tone]}`}>
                        {mark}
                    </span>
                    {label}
                </span>
            ))}
        </div>
    );
}

export default function TypeChartTable({ types, relations }) {
    const matrix = buildTypeMatrix(types, relations);
    return (
        <div className="flex h-full min-h-0 flex-col">
            <Legend />
            <div className="min-h-0 flex-1 overflow-x-auto lg:overflow-hidden">
                <table className="h-full w-full min-w-[560px] table-fixed border-separate border-spacing-0 text-xs lg:min-w-0">
                    <thead>
                        <tr>
                            <th className="sticky left-0 z-30 w-24 border-b border-r border-neutral-200 bg-white p-2 text-left">
                                <span className="text-[10px] font-semibold text-neutral-400">Atk ↓ · Def →</span>
                            </th>
                            {types.map((t) => (
                                <th key={t} className="border-b border-r border-neutral-200 bg-white p-1">
                                    <TypeIcon type={t} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {types.map((atk, r) => (
                            <tr key={atk}>
                                <th className="sticky left-0 z-10 border-b border-r border-neutral-200 bg-white p-1 pl-2">
                                    <TypeIcon type={atk} />
                                </th>
                                {matrix[r].map((m, c) => {
                                    const meta = cellMeta(m);
                                    return (
                                        <td key={c} className={`border-b border-r border-neutral-100 text-center text-[11px] font-semibold ${TONE_CELL[meta.tone]}`}>
                                            {meta.text || "·"}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
