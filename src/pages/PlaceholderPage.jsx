import { useLocation } from "react-router-dom";

export default function PlaceholderPage() {
    const { pathname } = useLocation();
    const title = pathname.replace(/^\//, "").replace(/-/g, " ") || "Page";

    return (
        <main className="flex min-h-dvh flex-col bg-neutral-50 px-6 py-16 text-neutral-900">
            <div className="mx-auto w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center">
                <h1 className="text-lg font-semibold capitalize tracking-tight">{title}</h1>
                <p className="mt-2 text-sm text-neutral-500">
                    This page is coming soon. Use the navigation to go back to the Pokédex.
                </p>
            </div>
        </main>
    );
}
