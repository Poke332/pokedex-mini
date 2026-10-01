import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getBerry, toProperCase } from "../utils/api";
import { getBerrySpriteUrl, berryLabel, flavorProfile } from "../utils/berries";
import DetailSection from "../components/DetailSection";
import FlavorBar from "../components/FlavorBar";
import TypeBadge from "../components/TypeBadge";

function FactRow({ label, value }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex items-baseline gap-3">
            <dt className="w-28 shrink-0 text-xs text-neutral-500">{label}</dt>
            <dd className="text-sm font-medium text-neutral-900">{value}</dd>
        </div>
    );
}

export default function BerryDetailPage() {
    const { name } = useParams();
    const [berry, setBerry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            setBerry(null);
            try {
                const data = await getBerry(name);
                if (!cancelled) setBerry(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [name]);

    const sprite = berry ? getBerrySpriteUrl(berry) : null;
    const flavors = berry ? flavorProfile(berry) : [];

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="w-full bg-blue-800 px-6 pb-4 pt-8 border-b-4 border-red-600">
                <div className="flex w-full flex-col items-center gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">
                        {berry ? berryLabel(berry) : toProperCase(name)}
                    </h1>
                    <Link to="/berries" className="text-sm font-medium text-white hover:text-red-200 transition-colors">
                        Back to Berries
                    </Link>
                </div>
            </div>

            <div className="w-full flex-1 px-4 py-6 lg:px-6">
                {loading && <p className="w-full max-w-3xl mx-auto py-16 text-center text-sm text-neutral-500">Loading {toProperCase(name)}...</p>}

                {!loading && error && (
                    <div className="w-full max-w-md mx-auto rounded-xl border border-neutral-200 bg-white p-8 text-center">
                        <p className="text-sm text-red-600">{error}</p>
                        <Link to="/berries" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700">
                            Back to Berries
                        </Link>
                    </div>
                )}

                {!loading && !error && berry && (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                        <section className="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-white p-6 sm:flex-row sm:gap-6">
                            {sprite && (
                                <img src={sprite} alt={berry.name} className="rounded-lg border border-blue-100 bg-blue-50 p-2" />
                            )}
                            <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
                                <p className="text-xs font-semibold text-red-600">Berry</p>
                                <h2 className="text-3xl font-semibold tracking-tight">{berryLabel(berry)}</h2>
                                {berry.natural_gift_type && (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs text-neutral-500">Natural Gift type</span>
                                        <TypeBadge type={berry.natural_gift_type.name} />
                                    </div>
                                )}
                            </div>
                        </section>

                        <DetailSection title="Flavor">
                            {flavors.length ? (
                                <div className="flex flex-col gap-2">
                                    {flavors.map(([flavorName, potency]) => (
                                        <FlavorBar key={flavorName} flavor={{ name: flavorName, potency }} />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-neutral-500">No flavor data.</p>
                            )}
                        </DetailSection>

                        <DetailSection title="Growth">
                            <dl className="flex flex-col gap-2">
                                <FactRow label="Growth time" value={`${berry.growth_time} hours`} />
                                <FactRow label="Max harvest" value={berry.max_harvest} />
                                <FactRow label="Firmness" value={toProperCase(berry.firmness?.name)} />
                                <FactRow label="Soil dryness" value={berry.soil_dryness} />
                                <FactRow label="Smoothness" value={berry.smoothness} />
                                <FactRow label="Size" value={`${berry.size} g`} />
                            </dl>
                        </DetailSection>
                    </div>
                )}
            </div>
        </main>
    );
}
