import { useState, useEffect } from "react";
import { getTypeDamageRelations } from "../utils/api";
import DetailSection from "../components/DetailSection";
import TypeChartTable from "../components/TypeChartTable";

export default function TypeAdvantagePage() {
    const [chart, setChart] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await getTypeDamageRelations();
                if (!cancelled) setChart(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <main className="h-dvh flex flex-col overflow-hidden bg-neutral-50 text-neutral-900">
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 lg:px-6 lg:py-6">
                <div className="shrink-0">
                    <h1 className="text-2xl font-semibold tracking-tight">Type Advantage</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Single-type damage chart. Rows are the attacking type, columns the defending type.
                    </p>
                </div>

                {loading && <p className="py-16 text-center text-sm text-neutral-500">Loading type chart...</p>}

                {!loading && error && (
                    <p className="max-w-md mx-auto py-16 text-center text-sm text-red-600">{error}</p>
                )}

                {!loading && !error && chart && (
                    <DetailSection fluid title="Damage Multipliers">
                        <TypeChartTable types={chart.types} relations={chart.relations} />
                    </DetailSection>
                )}
            </div>
        </main>
    );
}
