import { useState, useEffect } from "react";
import { getBerries, getBerryDetails } from "../utils/api";
import BerryCard from "../components/BerryCard";

export default function BerryPage() {
    const [berries, setBerries] = useState([]);
    const [details, setDetails] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getBerries();
                if (cancelled) return;
                setBerries(data.results);
                setLoading(false);
                // Decoupled from the loading gate: card fields (sprite, growth,
                // flavor) only exist on the single berry resource, so fetch
                // them batched + cached and fill the cards in progressively.
                const merged = await getBerryDetails(data.results);
                if (!cancelled) setDetails(merged);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="flex w-full flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Berries</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        All {berries.length || ""} berries in the Pokédex. Pick one to see its flavor and growth data.
                    </p>
                </div>

                {loading && <p className="py-16 text-sm text-neutral-500">Loading berries...</p>}

                {!loading && error && <p className="max-w-md py-16 text-sm text-red-600">{error}</p>}

                {!loading && !error && (
                    <div className="flex w-full flex-row flex-wrap justify-center gap-4">
                        {berries.map((berry) => (
                            <BerryCard key={berry.name} berry={{ ...berry, ...(details[berry.name] || {}) }} />
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
