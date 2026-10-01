import { useState, useEffect } from "react";
import { getMoves, getMove, getMoveDetails, slugify } from "../utils/api";
import MoveCard from "../components/MoveCard";
import SearchBar from "../components/SearchBar";

const PER_PAGE = 20;

export default function MovesPage() {
    const [moves, setMoves] = useState([]);
    const [details, setDetails] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [searched, setSearched] = useState(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getMoves((page - 1) * PER_PAGE, PER_PAGE)
            .then((data) => {
                if (cancelled) return;
                setMoves(data.results);
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

    // Card fields (type, power, pp) live on the single move resource, not the
    // list — resolve them batched + cached so the grid fills in progressively.
    useEffect(() => {
        if (!moves.length) return;
        let cancelled = false;
        getMoveDetails(moves).then((d) => {
            if (!cancelled) setDetails(d);
        });
        return () => { cancelled = true; };
    }, [moves]);

    const maxPage = Math.max(1, Math.ceil(totalCount / PER_PAGE));

    const searchHandler = async (name) => {
        if (name.trim() === "") {
            setSearched(null);
            setSearchError(null);
            return;
        }
        setSearchLoading(true);
        setSearchError(null);
        try {
            const data = await getMove(slugify(name));
            setSearched(data);
        } catch (e) {
            setSearched(null);
            setSearchError(e.message);
        }
        setSearchLoading(false);
    };

    const showGrid = !searched && !searchLoading && !searchError;

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="flex w-full flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Moves</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {totalCount ? `All ${totalCount} moves in the Pokédex.` : "Moves in the Pokédex."} Pick one to see its power and effect.
                    </p>
                </div>

                <div className="w-full">
                    <SearchBar onSearch={searchHandler} placeholder="Search moves by name (e.g. thunderbolt)" />
                </div>

                {searched && (
                    <div className="flex w-full flex-row flex-wrap justify-center gap-4">
                        <MoveCard move={searched} />
                    </div>
                )}

                {searchLoading && <p className="py-16 text-sm text-neutral-500">Searching moves...</p>}

                {searchError && <p className="max-w-md py-10 text-center text-sm text-red-600">{searchError}</p>}

                {showGrid && loading && <p className="py-16 text-sm text-neutral-500">Loading moves...</p>}

                {showGrid && !loading && error && <p className="max-w-md py-16 text-sm text-red-600">{error}</p>}

                {showGrid && !loading && !error && (
                    <>
                        <div className="flex w-full flex-row flex-wrap justify-center gap-4">
                            {moves.map((move) => (
                                <MoveCard key={move.name} move={{ ...move, ...(details[move.name] || {}) }} />
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
