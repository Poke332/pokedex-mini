import { getSpriteUrl } from "../../utils/api";
import TypeBadge from "../TypeBadge";
import HpBar from "./HpBar";
import { parseCondition, statusLabel, stripHeldItem } from "../../utils/battleLog";

/**
 * One arena plate: an active or foe Pokémon card (C1 §3.2).
 *
 * Renders the sprite (clamped h-24 at 390, h-32 desktop), the name + dex #
 * (red-600), type badges, a status-condition row, and the animated HP bar.
 * A fainted mon shows the sprite grayscale + opacity-50 with a "Fainted"
 * label and an empty HP track (C1 §3.2).
 *
 * The dex number is resolved from the shared dexMap (species id -> national
 * dex); a null dex shows a blank plate slot, never a wrong sprite.
 *
 * D3 (docs/battle-scene-spec.md §2): the plate is the mount surface for the
 * scene FX. The page owns the one-shot `bs-*` class toggles and reaches the
 * DOM through two refs this component exposes — `rootRef` (the plate root,
 * which carries the `--bs-dir` lunge direction and is the direct parent of
 * the `.bs-sprite-box` the attack/hit flash targets) and `statusChipRef`
 * (the status chip span, the `bs-status` flicker target). No new FX state
 * lives in the component; the motion is pure CSS, the refs are the hook.
 *
 * P4 (doubles): two doubles-only props, both no-ops in singles (the singles
 * markup is unchanged):
 *   - `compact` — the h-clamped variant: a 2-col row of two plates must fit
 *     at 390px, so the sprite box shrinks (h-14/ h-20), the name is text-sm,
 *     and the quiet details line is dropped. Same HP bar + condition semantics.
 *   - `isTarget` / `onTarget` — the doubles move-target picker: when a
 *     target-needing move is pending, the legal target plates get a red
 *     ring + pointer + a "target" marker (role="button" so they are
 *     focusable); `onTarget` commits the move with that plate's target-loc.
 *   - `plateData` — S4: a static `data-battle-plate` hook ("foe:0" /
 *     "yours:1") the page reads to scroll the first valid target into view
 *     when targeting mode engages at 390px.
 *
 * @param {{
 *   mon: object,
 *   side: "yours" | "foe",
 *   dexMap: Record<string, number|null>,
 *   rootRef?: React.Ref<HTMLDivElement>,
 *   statusChipRef?: React.Ref<HTMLSpanElement>,
 *   compact?: boolean,
 *   isTarget?: boolean,
 *   onTarget?: () => void,
 * }} props
 *   mon    — an envelope mon (C2 §2.1/§2.4: name, species, details,
 *     condition, status, types resolved by the parent from the record lane).
 *   side   — "yours" (the caller's active) or "foe" (the opposing active).
 *   dexMap — species id -> national dex number (for the sprite + # display).
 *   rootRef / statusChipRef — FX class-toggle targets (see above).
 *   compact — doubles: the clamped two-plates-per-row layout.
 *   isTarget — doubles: this plate is a legal target of the pending move.
 *   onTarget — doubles: commit the pending move on this plate's slot.
 *   plateData — S4: `data-battle-plate` value for the scroll-into-view hook.
 */
export default function PokemonPlate({
    mon, side, dexMap, rootRef, statusChipRef, compact, isTarget, onTarget, plateData,
}) {
    // The empty-plate placeholder (no mon yet): same clamping for compact.
    if (!mon) {
        return (
            <div
                ref={rootRef}
                data-battle-plate={plateData}
                style={side === "foe" ? { "--bs-dir": -1, direction: "rtl" } : { "--bs-dir": 1 }}
                className={`flex w-full items-center justify-center gap-4 border border-neutral-200 bg-white rounded-lg ${compact ? "p-3" : "p-4"}`}
            >
                <div className={`animate-pulse rounded-lg bg-neutral-100 ${compact ? "h-14 w-14 md:h-20 md:w-20" : "h-24 w-24 md:h-32 md:w-32"}`} />
                <div className={`space-y-2 ${compact ? "w-28" : "w-40"}`}>
                    <div className="h-3 w-20 animate-pulse rounded bg-neutral-100" />
                    <div className="h-3 w-28 animate-pulse rounded bg-neutral-100" />
                </div>
            </div>
        );
    }

    const { fainted, status } = parseCondition(mon.condition);
    const dex = dexMap?.[mon.species] ?? null;
    const sprite = dex ? getSpriteUrl(dex) : null;
    const statusWord = statusLabel(status);
    // C1 §3.2: the type badges come from the mon's species record; the
    // envelope carries no types field, so the parent is expected to attach
    // `mon.types` when rendering (see BattlePage).
    const types = Array.isArray(mon.types) ? mon.types : [];
    // D3: the lunge direction — yours lunges +x (toward the foe row), the
    // foe's mirrored row lunges -x (spec §2.1 `--bs-dir`).
    const dirStyle = side === "foe" ? { "--bs-dir": -1, direction: "rtl" } : { "--bs-dir": 1 };

    // P4: the target affordance. The plate root doubles as the click target
    // (role="button" + tabIndex only when isTarget — a non-target plate is
    // inert, so singles never gains a focus stop).
    const targetable = !!isTarget && !!onTarget;

    return (
        <div
            ref={rootRef}
            data-battle-plate={plateData}
            style={dirStyle}
            role={targetable ? "button" : undefined}
            tabIndex={targetable ? 0 : undefined}
            aria-label={
                targetable
                    ? `Target ${mon.name}`
                    : undefined
            }
            onClick={targetable ? onTarget : undefined}
            onKeyDown={
                targetable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onTarget();
                        }
                    }
                    : undefined
            }
            className={`relative flex w-full items-center gap-4 border bg-white rounded-lg transition-colors ${compact ? "p-3" : "p-4"} ${
                isTarget
                    ? "cursor-pointer border-red-600 ring-2 ring-red-600 ring-offset-2 hover:bg-red-600/5 focus-visible:outline-none focus-visible:ring-red-600"
                    : "border-neutral-200"
            }`}
        >
            {/* Sprite box — grayscale + dimmed when fainted; the .bs-sprite-box
                hook is the direct child the attack flash / hit flicker target. */}
            <div
                className={`bs-sprite-box flex shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 ${
                    compact ? "h-14 w-14 md:h-20 md:w-20" : "h-24 w-24 md:h-32 md:w-32"
                } ${fainted ? "opacity-50 grayscale" : ""}`}
            >
                {sprite ? (
                    <img
                        src={sprite}
                        alt={mon.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                    />
                ) : (
                    <div className="h-full w-full animate-pulse bg-neutral-100" />
                )}
            </div>

            {/* P4: the target marker — a corner badge so the highlight reads
                even at 390px where the ring alone is subtle. */}
            {isTarget && (
                <span className="absolute right-2 top-2 z-10 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Target
                </span>
            )}

            <div className={`min-w-0 flex-1 ${targetable ? "relative" : ""}`}>
                <div className="flex items-baseline gap-2">
                    <h3 className={`truncate font-semibold text-neutral-900 ${compact ? "text-sm" : "text-base"}`}>
                        {fainted ? "Fainted" : mon.name}
                    </h3>
                    {dex ? (
                        <span className="text-xs font-semibold text-red-600">#{dex}</span>
                    ) : null}
                </div>

                {types.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                        {types.map((t) => (
                            <TypeBadge key={t} type={t} />
                        ))}
                    </span>
                )}

                {/* Status condition row (C1 §3.2): word chip, aria-labeled.
                    The .bs-status chip is the flicker target when a status
                    token just appeared (spec §2.1). */}
                {statusWord && !fainted ? (
                    <span
                        ref={statusChipRef}
                        className="bs-status-chip mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
                        aria-label={`${mon.name}, ${statusWord}`}
                    >
                        {statusWord}
                    </span>
                ) : null}

                {/* details line (level / species) — quiet, from the envelope.
                    D4 fix 2: the "@ Item" clause is stripped at display —
                    held items are opponent intel and stay hidden on BOTH
                    plates (yours and the foe's). The wire contract
                    (mon.details) keeps the item; this is display-layer only.
                    P4: dropped in compact (the 2-plate row has no room at
                    390px; the level is uniform across the arena). */}
                {!compact && (
                    <p className="mt-1 truncate text-xs text-neutral-500">
                        {stripHeldItem(mon.details) || ""}
                    </p>
                )}

                <div className="mt-2">
                    <HpBar mon={mon} name={mon.name} />
                </div>
            </div>
        </div>
    );
}
