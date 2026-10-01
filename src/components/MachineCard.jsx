import { Link } from "react-router-dom";
import { parseIdFromUrl, toProperCase } from "../utils/api";
import { machineLabel, machineGroupLabel, machineMoveName } from "../utils/machines";

// The /machine list carries only a URL, so a raw entry shows just its id and
// fills in (item, group, move) once the detail batch resolves.
export default function MachineCard({ machine }) {
    const id = parseIdFromUrl(machine.url);
    const label = machineLabel(machine);
    const group = machineGroupLabel(machine);
    const moveName = machineMoveName(machine);
    const resolved = Boolean(label || group || moveName);

    return (
        <Link
            to={`/machine/${id}`}
            className="flex w-54 flex-col items-center gap-2 border border-neutral-200 bg-white p-4 rounded-xl transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-600"
        >
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
                <span className="text-lg font-semibold text-blue-800">{label || `#${id}`}</span>
            </div>
            <h2 className="text-base font-semibold text-neutral-900">{resolved ? label : `Machine ${id}`}</h2>
            <div className="flex flex-col items-center gap-1">
                {group && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">{group}</span>}
                {moveName && <p className="text-xs text-neutral-500">Teaches {toProperCase(moveName)}</p>}
            </div>
        </Link>
    );
}
