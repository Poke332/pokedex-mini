import { buildMovesTable } from "../utils/moves";
import TypeBadge from "./TypeBadge";

export default function MovesList({ moves, moveDataByName }) {
    const rows = buildMovesTable(moves, moveDataByName);
    if (!rows.length) return null;
    return (
        <table className="w-full border-collapse text-left text-sm">
            <thead>
                <tr className="border-b border-neutral-200 text-xs text-neutral-400">
                    <th className="py-2 pr-3 font-semibold">Move</th>
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 pr-3 font-semibold">Origin</th>
                    <th className="py-2 pr-3 font-semibold">Level / Learn</th>
                    <th className="py-2 pr-3 font-semibold">Power</th>
                    <th className="py-2 font-semibold">PP</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
                {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-blue-50">
                        <td className="py-2 pr-3 font-medium text-neutral-900">{row.name}</td>
                        <td className="py-2 pr-3">
                            {row.type ? <TypeBadge type={row.type} /> : <span className="text-neutral-300">…</span>}
                        </td>
                        <td className="py-2 pr-3 text-neutral-500">{row.origin || "—"}</td>
                        <td className="py-2 pr-3 text-neutral-500">{row.learned || "—"}</td>
                        <td className="py-2 pr-3 text-neutral-900">
                            {row.status === "pending" ? "…" : row.power}
                        </td>
                        <td className="py-2 text-neutral-900">
                            {row.status === "pending" ? "…" : row.pp}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
