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
 * @param {{
 *   mon: object,
 *   side: "yours" | "foe",
 *   dexMap: Record<string, number|null>,
 *   rootRef?: React.Ref<HTMLDivElement>,
 *   statusChipRef?: React.Ref<HTMLSpanElement>,
 * }} props
 *   mon    — an envelope mon (C2 §2.1/§2.4: name, species, details,
 *     condition, status, types resolved by the parent from the record lane).
 *   side   — "yours" (the caller's active) or "foe" (the opposing active).
 *   dexMap — species id -> national dex number (for the sprite + # display).
 *   rootRef / statusChipRef — FX class-toggle targets (see above).
 */
export default function PokemonPlate({ mon, side, dexMap, rootRef, statusChipRef }) {
    if (!mon) {
        return (
            <div
                ref={rootRef}
                style={side === "foe" ? { "--bs-dir": -1, direction: "rtl" } : { "--bs-dir": 1 }}
                className="flex w-full items-center justify-center gap-4 border border-neutral-200 bg-white p-4 rounded-lg"
            >
                <div className="h-24 w-24 animate-pulse rounded-lg bg-neutral-100 md:h-32 md:w-32" />
                <div className="w-40 space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded bg-neutral-100" />
                    <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
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

    return (
        <div
            ref={rootRef}
            style={dirStyle}
            className="flex w-full items-center gap-4 border border-neutral-200 bg-white p-4 rounded-lg"
        >
            {/* Sprite box — grayscale + dimmed when fainted; the .bs-sprite-box
                hook is the direct child the attack flash / hit flicker target. */}
            <div
                className={`bs-sprite-box flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 md:h-32 md:w-32 ${
                    fainted ? "opacity-50 grayscale" : ""
                }`}
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

            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                    <h3 className="truncate text-base font-semibold text-neutral-900">
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
                    (mon.details) keeps the item; this is display-layer only. */}
                <p className="mt-1 truncate text-xs text-neutral-500">
                    {stripHeldItem(mon.details) || ""}
                </p>

                <div className="mt-2">
                    <HpBar mon={mon} name={mon.name} />
                </div>
            </div>
        </div>
    );
}
