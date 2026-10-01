export default function DetailSection({ title, children, fluid = false }) {
    return (
        <section className={`rounded-xl border border-neutral-200 bg-white p-4 ${fluid ? "flex min-h-0 flex-1 flex-col" : ""}`}>
            <h2 className={`text-sm font-semibold text-neutral-900 ${fluid ? "shrink-0" : ""}`}>{title}</h2>
            <div className={`mt-4 ${fluid ? "min-h-0 flex-1" : ""}`}>{children}</div>
        </section>
    )
}
