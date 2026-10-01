import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getItem, toProperCase } from "../utils/api";
import {
    itemLabel,
    itemCategoryLabel,
    itemAttributes,
    itemEffectText,
    itemHeldBy,
    itemSpriteUrl,
} from "../utils/items";
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

export default function ItemDetailPage() {
    const { name } = useParams();
    const [item, setItem] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            setItem(null);
            try {
                const data = await getItem(name);
                if (!cancelled) setItem(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [name]);

    const sprite = item ? itemSpriteUrl(item) : null;
    const category = item ? itemCategoryLabel(item) : null;
    const attrs = item ? itemAttributes(item) : [];
    const effect = item ? itemEffectText(item) : null;
    const heldBy = item ? itemHeldBy(item) : [];
    const flingPower = item ? item.fling_power : null;
    const flingEffect = item?.fling_effect?.name ? toProperCase(item.fling_effect.name) : null;
    const babyTrigger = item?.baby_trigger_for?.name ? toProperCase(item.baby_trigger_for.name) : null;

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="w-full bg-blue-800 px-6 pb-4 pt-8 border-b-4 border-red-600">
                <div className="flex w-full flex-col items-center gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">
                        {item ? itemLabel(item) : toProperCase(name)}
                    </h1>
                    <Link to="/items" className="text-sm font-medium text-white hover:text-red-200 transition-colors">
                        Back to Items
                    </Link>
                </div>
            </div>

            <div className="w-full flex-1 px-4 py-6 lg:px-6">
                {loading && (
                    <p className="w-full max-w-3xl mx-auto py-16 text-center text-sm text-neutral-500">
                        Loading {toProperCase(name)}...
                    </p>
                )}

                {!loading && error && (
                    <div className="w-full max-w-md mx-auto rounded-xl border border-neutral-200 bg-white p-8 text-center">
                        <p className="text-sm text-red-600">{error}</p>
                        <Link
                            to="/items"
                            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                            Back to Items
                        </Link>
                    </div>
                )}

                {!loading && !error && item && (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                        <section className="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-white p-6 sm:flex-row sm:gap-6">
                            {sprite ? (
                                <img src={sprite} alt={item.name} className="rounded-lg border border-blue-100 bg-blue-50 p-2" />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400">
                                    no art
                                </div>
                            )}
                            <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
                                <p className="text-xs font-semibold text-red-600">Item</p>
                                <h2 className="text-3xl font-semibold tracking-tight">{itemLabel(item)}</h2>
                                {category && (
                                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                                        {category}
                                    </span>
                                )}
                            </div>
                        </section>

                        {effect && (
                            <DetailSection title="Effect">
                                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{effect}</p>
                            </DetailSection>
                        )}

                        <DetailSection title="Details">
                            <dl className="flex flex-col gap-2">
                                <FactRow label="Category" value={category} />
                                <FactRow label="Fling power" value={flingPower} />
                                <FactRow label="Fling effect" value={flingEffect} />
                                <FactRow label="Baby trigger for" value={babyTrigger} />
                            </dl>
                        </DetailSection>

                        {attrs.length > 0 && (
                            <DetailSection title="Attributes">
                                <div className="flex flex-wrap gap-2">
                                    {attrs.map((a) => (
                                        <span key={a} className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                                            {a}
                                        </span>
                                    ))}
                                </div>
                            </DetailSection>
                        )}

                        {heldBy.length > 0 && (
                            <DetailSection title={`Held by ${heldBy.length} Pokémon`}>
                                <div className="flex flex-wrap gap-2">
                                    {heldBy.map((p) => (
                                        <Link
                                            key={p.name}
                                            to={`/pokemon/${p.name}`}
                                            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100"
                                        >
                                            {toProperCase(p.name)}
                                        </Link>
                                    ))}
                                </div>
                            </DetailSection>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
