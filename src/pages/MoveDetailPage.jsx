import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { getMove, toProperCase } from "../utils/api";
import {
    moveLabel,
    moveType,
    moveDamageClass,
    movePower,
    movePP,
    moveAccuracy,
    moveEffectText,
    moveAilment,
    moveMachines,
    machineIdFromUrl,
} from "../utils/moves";
import { typeClasses } from "../utils/types";
import DetailSection from "../components/DetailSection";
import TypeBadge from "../components/TypeBadge";

function FactRow({ label, value }) {
    if (value === null || value === undefined || value === "") return null;
    return (
        <div className="flex items-baseline gap-3">
            <dt className="w-32 shrink-0 text-xs text-neutral-500">{label}</dt>
            <dd className="text-sm font-medium text-neutral-900">{value}</dd>
        </div>
    );
}

export default function MoveDetailPage() {
    const { name } = useParams();
    const [move, setMove] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            setMove(null);
            try {
                const data = await getMove(name);
                if (!cancelled) setMove(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [name]);

    const type = move ? moveType(move) : null;
    const effect = move ? moveEffectText(move) : null;
    const machines = move ? moveMachines(move) : [];

    return (
        <main className="min-h-dvh flex flex-col bg-neutral-50 text-neutral-900">
            <div className="w-full bg-blue-800 px-6 pb-4 pt-8 border-b-4 border-red-600">
                <div className="flex w-full flex-col items-center gap-4">
                    <h1 className="text-2xl font-semibold tracking-tight text-white">
                        {move ? moveLabel(move) : toProperCase(name)}
                    </h1>
                    <Link to="/moves" className="text-sm font-medium text-white hover:text-red-200 transition-colors">
                        Back to Moves
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
                            to="/moves"
                            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                            Back to Moves
                        </Link>
                    </div>
                )}

                {!loading && !error && move && (
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                        <section className="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-white p-6 sm:flex-row sm:gap-6">
                            {type ? (
                                <span className={`flex h-20 w-20 items-center justify-center rounded-lg text-lg font-semibold ${typeClasses(type)}`}>
                                    {toProperCase(type)}
                                </span>
                            ) : (
                                <span className="flex h-20 w-20 items-center justify-center rounded-lg bg-neutral-100 text-sm font-semibold text-neutral-500">
                                    Status
                                </span>
                            )}
                            <div className="flex flex-1 flex-col items-center gap-3 sm:items-start">
                                <p className="text-xs font-semibold text-red-600">Move</p>
                                <h2 className="text-3xl font-semibold tracking-tight">{moveLabel(move)}</h2>
                                <div className="flex flex-wrap items-center gap-2">
                                    {type && <TypeBadge type={type} />}
                                    {moveDamageClass(move) && (
                                        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                                            {moveDamageClass(move)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </section>

                        <DetailSection title="Power & PP">
                            <dl className="flex flex-col gap-2">
                                <FactRow label="Power" value={movePower(move) ?? "—"} />
                                <FactRow label="PP" value={movePP(move) ?? "—"} />
                                <FactRow label="Accuracy" value={moveAccuracy(move) != null ? `${moveAccuracy(move)}%` : "—"} />
                                <FactRow label="Ailment" value={moveAilment(move)} />
                            </dl>
                        </DetailSection>

                        {effect && (
                            <DetailSection title="Effect">
                                <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700">{effect}</p>
                            </DetailSection>
                        )}

                        {machines.length > 0 && (
                            <DetailSection title={`Learned via ${machines.length} machines`}>
                                <div className="flex flex-wrap gap-2">
                                    {machines.map((entry) => {
                                        const mId = machineIdFromUrl(entry.machine?.url);
                                        return (
                                            <Link
                                                key={`${mId}-${entry.version_group?.name ?? ""}`}
                                                to={`/machine/${mId}`}
                                                className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 transition-colors hover:bg-blue-100"
                                            >
                                                {toProperCase(entry.version_group?.name ?? mId)}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </DetailSection>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
