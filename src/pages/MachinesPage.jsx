import { useState, useEffect } from "react";
import { getMachines, getMachineDetails } from "../utils/api";
import MachineCard from "../components/MachineCard";

const PER_PAGE = 20;

export default function MachinesPage() {
    const [machines, setMachines] = useState([]);
    const [details, setDetails] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getMachines((page - 1) * PER_PAGE, PER_PAGE)
            .then((data) => {
                if (cancelled) return;
                setMachines(data.results);
                setTotalCount(data.count);
                setDetails({});
            })
            .catch((e) => {
                if (!cancelled) setError(e.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [page]);

    // The /machine list returns bare URLs — item, group and move only exist
    // on the single machine resource, so fill the cards in progressively.
    useEffect(() => {
        if (!machines.length) return;
        let cancelled = false;
        getMachineDetails(machines).then((d) => {
            if (!cancelled) setDetails(d);
        });
        return () => { cancelled = true; };
    }, [machines]);

    const maxPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="flex w-full flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Machines</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {totalCount ? `All ${totalCount} TM/HM/TR/BR machines.` : "Machines."} Pick one to see which move it teaches.
                    </p>
                </div>

                {loading && <p className="py-16 text-sm text-neutral-500">Loading machines...</p>}

                {!loading && error && <p className="max-w-md py-16 text-sm text-red-600">{error}</p>}

                {!loading && !error && (
                    <>
                        <div className="flex w-full flex-row flex-wrap justify-center gap-4">
                            {machines.map((machine) => (
                                <MachineCard
                                    key={machine.url}
                                    machine={{ ...machine, ...(details[machine.url] || {}) }}
                                />
                            ))}
                        </div>
                        <div className="flex w-full flex-row items-center justify-center gap-4 border-t border-neutral-200 pt-8">
                            <button
                                className="min-h-11 rounded-lg border border-blue-200 bg-white px-5 py-2.5 text-sm font-medium text-blue-800 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => setPage((p) => p - 1)}
                                disabled={page === 1}
                            >
                                Previous
                            </button>
                            <span className="text-sm text-neutral-500">Page {page} of {maxPage}</span>
                            <button
                                className="min-h-11 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                                onClick={() => setPage((p) => p + 1)}
                                disabled={page >= maxPage}
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
