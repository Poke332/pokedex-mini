import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getMachine, toProperCase } from "../utils/api";
import { machineLabel, machineGroupLabel, machineMoveName } from "../utils/machines";
import DetailSection from "../components/DetailSection";

function FactRow({ label, value }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex items-baseline gap-3">
            <dt className="w-32 shrink-0 text-xs text-neutral-500">{label}</dt>
            <dd className="text-sm font-medium text-neutral-900">{value}</dd>
        </div>
    );
}

export default function MachineDetailPage() {
    const { id } = useParams();
    const [machine, setMachine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            setMachine(null);
            try {
                const data = await getMachine(id);
                if (!cancelled) setMachine(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [id]);

    const label = machine ? machineLabel(machine) : null;
    const moveName = machine ? machineMoveName(machine) : null;

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="w-full bg-blue-800 px-6 pb-4 pt-8 border-b-4 border-red-600">
                <div className="flex w-full flex-col items-center gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">
                        {label ? `${label} (#${id})` : `Machine #${id}`}
                    </h1>
                    <Link to="/machines" className="text-sm font-medium text-white hover:text-red-200 transition-colors">
                        Back to Machines
                    </Link>
                </div>
            </div>

            <div className="w-full flex-1 px-4 py-6 lg:px-6">
                {loading && (
                    <p className="w-full max-w-3xl mx-auto py-16 text-center text-sm text-neutral-500">
                        Loading machine #{id}...
                    </p>
                )}

                {!loading && error && (
                    <div className="w-full max-w-md mx-auto rounded-xl border border-neutral-200 bg-white p-8 text-center">
                        <p className="text-sm text-red-600">{error}</p>
                        <Link
                            to="/machines"
                            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                            Back to Machines
                        </Link>
                    </div>
                )}

                {!loading && !error && machine && (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                        <section className="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-white p-6 sm:flex-row sm:gap-6">
                            <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
                                <span className="text-xl font-semibold text-blue-800">{label || id}</span>
                            </div>
                            <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
                                <p className="text-xs font-semibold text-red-600">Machine</p>
                                <h2 className="text-3xl font-semibold tracking-tight">
                                    {label ? label : `#${id}`}
                                </h2>
                                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                                    {machineGroupLabel(machine)}
                                </span>
                            </div>
                        </section>

                        <DetailSection title="Move">
                            {moveName ? (
                                <Link
                                    to={`/move/${moveName}`}
                                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-100"
                                >
                                    {toProperCase(moveName)}
                                </Link>
                            ) : (
                                <p className="text-sm text-neutral-500">This machine teaches no move.</p>
                            )}
                        </DetailSection>

                        <DetailSection title="Details">
                            <dl className="flex flex-col gap-2">
                                <FactRow label="Machine id" value={`#${machine.id}`} />
                                <FactRow label="Item" value={machineLabel(machine)} />
                                <FactRow label="Version group" value={machineGroupLabel(machine)} />
                            </dl>
                        </DetailSection>
                    </div>
                )}
            </div>
        </main>
    );
}
