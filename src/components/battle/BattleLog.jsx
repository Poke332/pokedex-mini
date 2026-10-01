import { useEffect, useRef, useState } from "react";
import { parseLogLine, isDisplayLogLine } from "../../utils/battleLog";

/**
 * The battle log (C1 §3.2): renders the C2 §2.6 `log[]` lines as prose.
 *
 * Desktop: the right side column (w-80, sticky, its own scroll,
 * bottom-anchored, aria-live="polite" so new entries are announced).
 * Mobile: a collapsed card showing its entry count with an expand toggle
 * (C1 §3.3 / OD-4 — always-open pushes the controls off-screen at 390px).
 *
 * Auto-scroll: when the viewer is at the bottom, new entries scroll into
 * view; otherwise a floating "↓ new" pill appears at the log's bottom edge
 * (C1 §3.2 chat-scroller rule).
 *
 * @param {{
 *   log: string[],
 *   collapsible: boolean,
 *   className?: string,
 * }} props
 *   log         — the accumulated display lines (the page owns the
 *     accumulation across envelopes; this component renders the whole).
 *   collapsible — mobile mode: start collapsed with the entry-count header.
 *   className   — extra wrapper classes (the desktop side column passes its
 *     sticky/width rules from the page layout).
 */
export default function BattleLog({ log, collapsible = false, className = "" }) {
    const [open, setOpen] = useState(!collapsible);
    const [hasNew, setHasNew] = useState(false);
    const scrollRef = useRef(null);
    const countRef = useRef(0);

    // The displayable rows, pre-parsed; turn boundaries become divider rows.
    const rows = (log || []).filter(isDisplayLogLine).map(parseLogLine);
    const count = rows.length;

    // Track at-bottom before a re-render, then auto-scroll only when we were
    // already at the bottom (C1 §3.2). New lines while away-from-bottom set
    // the floating "↓ new" pill instead.
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || !open) { countRef.current = count; return; }
        const wasAtBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        if (wasAtBottom) {
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            setHasNew(false);
        } else {
            setHasNew(count > countRef.current);
        }
        countRef.current = count;
    }, [count, open]);

    const jumpToBottom = () => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        setHasNew(false);
    };

    const entryCount = rows.length;

    return (
        <section
            aria-label="Battle log"
            className={`relative flex flex-col border border-neutral-200 bg-white rounded-lg ${className}`}
        >
            {collapsible && (
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((o) => !o)}
                    className="min-h-11 flex w-full items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                    <span>Battle Log — {entryCount} {entryCount === 1 ? "entry" : "entries"}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                        {open ? "Collapse" : "Expand"}
                    </span>
                </button>
            )}

            {open && (
                <div className="relative flex-1">
                    <div
                        ref={scrollRef}
                        aria-live="polite"
                        className="max-h-[50dvh] overflow-y-auto p-4 pb-10 lg:max-h-[calc(100dvh-10rem)]"
                    >
                        <ol className="flex flex-col gap-1 text-sm text-neutral-700">
                            {rows.map((row, i) => {
                                if (row.kind === "turn") {
                                    return (
                                        <li
                                            key={i}
                                            className="flex items-baseline gap-2 border-t border-neutral-200 pt-2 first:border-t-0 first:pt-0"
                                        >
                                            <span className="text-xs uppercase tracking-wider text-neutral-500">
                                                {row.text}
                                            </span>
                                        </li>
                                    );
                                }
                                return (
                                    <li
                                        key={i}
                                        className={
                                            row.kind === "faint"
                                                ? "font-semibold"
                                                : ""
                                        }
                                    >
                                        {row.kind === "faint" ? (
                                            <span className="text-red-600">{row.text}</span>
                                        ) : (
                                            row.text
                                        )}
                                    </li>
                                );
                            })}
                            {rows.length === 0 && (
                                <li className="text-sm text-neutral-400">No entries yet</li>
                            )}
                        </ol>
                    </div>

                    {hasNew && (
                        <button
                            type="button"
                            onClick={jumpToBottom}
                            className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-800 px-3 py-1 text-xs font-semibold text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                        >
                            ↓ new
                        </button>
                    )}
                </div>
            )}
        </section>
    );
}
