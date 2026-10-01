import { useState, useEffect, useRef } from "react";
import { getSpriteUrl, toProperCase } from "../../utils/api";
import { TYPE_IDS, MAX_EV, EV_TOTAL_CAP } from "../../utils/pokemonSets";
import TypeBadge from "../TypeBadge";

/**
 * A single legal-move slot picker (C1 §2.2: 4 independent rows, each a
 * searchable select sourced from the C2 §4 `record.moves` pool). Duplicates
 * are allowed — the service validator is the legality authority.
 *
 * @param {{
 *   slot: number,
 *   value: string,
 *   moves: Array<{id:string,name:string,type:string|null,category:string|null,power:number|null}>,
 *   name: string,
 *   loading: boolean,
 *   onChange: (slot: number, moveId: string) => void,
 * }} props
 *   slot — the 0-based move slot being edited (drives the aria-label).
 *   value — the current move id ("" = empty).
 *   moves — the legal pool for this species+format; rendered as options,
 *     grouped by type badge + damage-class chip so the picker shows the C1
 *     metadata inline without a second fetch.
 *   name — the species display name, used in the aria-label.
 *   loading — the data lane is still resolving this species; picker disabled.
 *   onChange — commit a slot to a move id ("" clears the slot).
 */
function MovePicker({ slot, value, moves, name, loading, onChange }) {
    const selected = moves.find((m) => m.id === value) || null;

    // Group options by type for a compact, scannable select.
    const byType = {};
    for (const m of moves) {
        const key = m.type || "status";
        (byType[key] = byType[key] || []).push(m);
    }

    return (
        <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-200 text-xs font-semibold text-neutral-700">
                {slot + 1}
            </span>
            <div className="relative min-w-0 flex-1">
                <select
                    aria-label={`${name}, move ${slot + 1}`}
                    value={value}
                    disabled={loading}
                    onChange={(e) => onChange(slot, e.target.value)}
                    className="min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <option value="">
                        {loading ? "Loading legal moves…" : "\u2014 No move \u2014"}
                    </option>
                    {Object.entries(byType).map(([type, group]) => (
                        <optgroup key={type} label={toProperCase(type)}>
                            {group.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.name}
                                    {m.category ? ` · ${m.category}` : ""}
                                    {m.power != null ? ` · P${m.power}` : ""}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">
                    &#9662;
                </span>
            </div>
            {selected && selected.type && (
                <span className="hidden shrink-0 sm:block">
                    <TypeBadge type={selected.type} />
                </span>
            )}
        </div>
    );
}

/**
 * The per-Pokémon editor (C1 §2.2 SetEditor). One instance, opened by a
 * slot's `Edit`, inserted above the team grid. Fields: 4 move pickers,
 * ability, item, level, nature, IVs (with 31s/0s presets), EVs (with a
 * total line), and the two C2 §1 optional type-metadata fields (Hidden Power
 * type, Tera type). `Done` saves into the slot; `Cancel` discards.
 *
 * @param {{
 *   set: object,
 *   record: object|null,
 *   format: string,
 *   loading: boolean,
 *   onUpdate: (patch: object) => void,
 *   onDone: () => void,
 *   onCancel: () => void,
 * }} props
 *   set — the current draft set being edited.
 *   record — the C2 §4 record for this species+format (null while the data
 *     lane loads; moves/abilities/items then render in their loading states).
 *   format — the active format id (shown in the header for context).
 *   loading — the data lane is still resolving this species.
 *   onUpdate — patch the draft in place (the parent persists it).
 *   onDone — save + close the editor.
 *   onCancel — discard + close the editor.
 */
export default function SetEditor({ set, record, format, loading, onUpdate, onDone, onCancel }) {
    const [ivPreset, setIvPreset] = useState("full");

    const name = record?.species || toProperCase(set.species || "");
    const dexNum = record?.dexNum;
    const moves = record?.moves || [];
    const abilities = record?.abilities || [];
    const items = record?.items || [];
    const natures = record?.natures || [];

    // D1 (fix 4): the form-gate surface. Item-locked formes (Mega/Primal/
    // Z-Crystal …) battle ONLY while their required item is held. Two
    // directions:
    //   - a BASE slot (record.gatedForms): the list of forms the user can
    //     unlock by equipping an item — Mega stones are Past-standard, so
    //     gate items missing from the pool are appended to the item select.
    //   - a FORM slot (record.formGate): the set itself is the transformed
    //     form; without its item it silently falls back to the base.
    const gatedForms = record?.gatedForms || [];
    const thisFormGate = record?.formGate || null;
    const gateItems = [
        ...new Set([
            ...gatedForms.map((f) => f.item),
            thisFormGate?.item,
        ].filter(Boolean)),
    ];
    const extraGateItems = gateItems.filter((id) => !items.includes(id));
    const itemOptions = [...items, ...extraGateItems];
    // Which gate item (if any) this set is currently holding?
    const activeGate =
        gatedForms.find((f) => f.item && set.item === f.item) ||
        (thisFormGate?.item && set.item === thisFormGate.item
            ? { item: thisFormGate.item, itemName: thisFormGate.itemName, formName: thisFormGate.formName }
            : null) ||
        null;

    // Focus the first field on mount (C1 §2.4 a11y).
    const firstFieldRef = useRef(null);
    useEffect(() => {
        firstFieldRef.current?.focus();
    }, []);

    // IV/EV presets + total.
    const evTotal = Object.values(set.evs || {}).reduce((a, b) => a + Number(b || 0), 0);

    const setAllIv = (val) => {
        onUpdate({
            ivs: { hp: val, atk: val, def: val, spa: val, spd: val, spe: val },
        });
        setIvPreset(val === 31 ? "full" : val === 0 ? "zero" : "custom");
    };
    const setOneIv = (stat, val) => {
        onUpdate({ ivs: { ...set.ivs, [stat]: Number(val) } });
        setIvPreset("custom");
    };
    const setOneEv = (stat, val) => {
        onUpdate({ evs: { ...set.evs, [stat]: Math.min(MAX_EV, Math.max(0, Number(val) || 0)) } });
    };

    const statKeys = ["hp", "atk", "def", "spa", "spd", "spe"];

    return (
        <div className="w-full border-l-4 border-blue-800 border border-neutral-200 bg-white rounded-lg">
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-neutral-200 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
                    {dexNum ? (
                        <img src={getSpriteUrl(dexNum)} alt={name} className="h-full w-full object-contain" />
                    ) : (
                        <div className="h-full w-full animate-pulse bg-neutral-100" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-neutral-900">{name}</h2>
                    <p className="text-xs text-neutral-500">{format}{" · "}set editor</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-h-11 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onDone}
                        className="min-h-11 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                        Done
                    </button>
                </div>
            </div>

            <div className="grid gap-6 p-4 md:grid-cols-2">
                {/* Left: moves */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Moves</h3>
                    {[0, 1, 2, 3].map((i) => (
                        <MovePicker
                            key={i}
                            slot={i}
                            value={set.moves?.[i] || ""}
                            moves={moves}
                            name={name}
                            loading={loading}
                            onChange={(slot, id) =>
                                onUpdate({ moves: set.moves.map((m, idx) => (idx === slot ? id : m)) })
                            }
                        />
                    ))}
                </div>

                {/* Right: everything else */}
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Ability
                            <select
                                aria-label={`${name}, ability`}
                                value={set.ability || ""}
                                onChange={(e) => onUpdate({ ability: e.target.value })}
                                className="mt-1 min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                                {abilities.map((a) => (
                                    <option key={a.id} value={a.id}>
                                        {a.name}
                                        {a.default ? " · signature" : ""}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Item
                            <select
                                aria-label={`${name}, item`}
                                value={set.item || ""}
                                onChange={(e) => onUpdate({ item: e.target.value })}
                                className="mt-1 min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                                {itemOptions.map((id, i) => {
                                    const isGate = extraGateItems.includes(id);
                                    return (
                                        <option key={id || `none-${i}`} value={id}>
                                            {isGate ? `★ ${id} (form item)` : id || "No item"}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>

                        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Level
                            <input
                                ref={firstFieldRef}
                                type="number"
                                aria-label={`${name}, level`}
                                min={record?.levelRange?.min ?? 5}
                                max={record?.levelRange?.max ?? 100}
                                value={set.level ?? 100}
                                onChange={(e) => onUpdate({ level: Number(e.target.value) || 100 })}
                                className="mt-1 min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                            />
                        </label>

                        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Nature
                            <select
                                aria-label={`${name}, nature`}
                                value={set.nature || "hardy"}
                                onChange={(e) => onUpdate({ nature: e.target.value })}
                                className="mt-1 min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                                {(natures.length ? natures : ["hardy"]).map((n) => (
                                    <option key={n} value={n}>
                                        {toProperCase(n)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Hidden Power type
                            <select
                                aria-label={`${name}, Hidden Power type`}
                                value={set.hpType || ""}
                                onChange={(e) => onUpdate({ hpType: e.target.value })}
                                className="mt-1 min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                                <option value="">None</option>
                                {TYPE_IDS.map((t) => (
                                    <option key={t} value={t}>{toProperCase(t)}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Tera type
                            <select
                                aria-label={`${name}, Tera type`}
                                value={set.teraType || ""}
                                onChange={(e) => onUpdate({ teraType: e.target.value })}
                                className="mt-1 min-h-11 w-full appearance-none rounded-lg border border-neutral-200 bg-white px-3 py-2.5 pr-8 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                            >
                                <option value="">None</option>
                                {TYPE_IDS.map((t) => (
                                    <option key={t} value={t}>{toProperCase(t)}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {/* D1 (fix 4): the form gate. Item-locked formes
                        (Mega/Primal/Z-Crystal …) battle ONLY while their
                        required item is held. The base form is the default;
                        equipping a gate item unlocks the transformed form,
                        and a stored form falls back to the base without it. */}
                    {(gatedForms.length || thisFormGate) && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                                Form transformation
                            </h3>
                            {/* base slot: the unlockable sibling forms */}
                            {gatedForms.length > 0 && (
                                <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
                                    {gatedForms.map((f) => {
                                        const equipped = f.item && set.item === f.item;
                                        return (
                                            <li key={f.form} className="flex items-center justify-between gap-2">
                                                <span>
                                                    {f.formName}
                                                    {f.item
                                                        ? <> — requires <strong>{f.itemName}</strong></>
                                                        : " — no v1 item (unavailable)"}
                                                </span>
                                                {equipped ? (
                                                    <button
                                                        type="button"
                                                        aria-label={`Unequip ${f.itemName}`}
                                                        onClick={() => onUpdate({ item: "" })}
                                                        className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                                                    >
                                                        Unequip
                                                    </button>
                                                ) : f.item ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onUpdate({ item: f.item })}
                                                        className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                                                    >
                                                        Equip
                                                    </button>
                                                ) : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {/* form slot: THIS set is the gated form itself */}
                            {thisFormGate && thisFormGate.item && (
                                <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
                                    <li className="flex items-center justify-between gap-2">
                                        <span>
                                            This set is <strong>{thisFormGate.formName}</strong> —
                                            requires <strong>{thisFormGate.itemName}</strong>
                                        </span>
                                        {set.item === thisFormGate.item ? (
                                            <button
                                                type="button"
                                                aria-label={`Unequip ${thisFormGate.itemName}`}
                                                onClick={() => onUpdate({ item: "" })}
                                                className="shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                                            >
                                                Unequip
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onUpdate({ item: thisFormGate.item })}
                                                className="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-amber-700"
                                            >
                                                Equip
                                            </button>
                                        )}
                                    </li>
                                </ul>
                            )}
                            {activeGate && (
                                <p className="mt-2 text-xs font-medium text-amber-700">
                                    {activeGate.itemName} equipped — this set now battles as {activeGate.formName}.
                                </p>
                            )}
                            {thisFormGate && !thisFormGate.item && (
                                <p className="mt-2 text-xs text-amber-700">
                                    This forme is not item-locked in v1; it battles as-is.
                                </p>
                            )}
                        </div>
                    )}

                    {/* IVs */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">IVs</h3>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setAllIv(31)}
                                    className={`min-h-8 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                                        ivPreset === "full"
                                            ? "bg-blue-800 text-white"
                                            : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
                                    }`}
                                >
                                    31s
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAllIv(0)}
                                    className={`min-h-8 rounded-lg px-2.5 text-xs font-medium transition-colors ${
                                        ivPreset === "zero"
                                            ? "bg-blue-800 text-white"
                                            : "border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
                                    }`}
                                >
                                    0s
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {statKeys.map((k) => (
                                <label key={k} className="block text-[10px] font-semibold uppercase text-neutral-400">
                                    {k === "spa" ? "Sp.A" : k === "spd" ? "Sp.D" : toProperCase(k)}
                                    <select
                                        aria-label={`${name}, IV ${k}`}
                                        value={set.ivs?.[k] ?? 31}
                                        onChange={(e) => setOneIv(k, e.target.value)}
                                        className="mt-0.5 min-h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                                    >
                                        {Array.from({ length: 32 }, (_, v) => (
                                            <option key={v} value={v}>{v}</option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* EVs */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">EVs</h3>
                            <p className={`text-xs ${evTotal > EV_TOTAL_CAP ? "font-semibold text-red-600" : "text-neutral-500"}`}>
                                Total: {evTotal}/{EV_TOTAL_CAP}
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                            {statKeys.map((k) => (
                                <label key={k} className="block text-[10px] font-semibold uppercase text-neutral-400">
                                    {k === "spa" ? "Sp.A" : k === "spd" ? "Sp.D" : toProperCase(k)}
                                    <input
                                        type="number"
                                        aria-label={`${name}, EV ${k}`}
                                        min={0}
                                        max={MAX_EV}
                                        value={set.evs?.[k] ?? 0}
                                        onChange={(e) => setOneEv(k, e.target.value)}
                                        className="mt-0.5 min-h-9 w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-900 focus:outline-none focus:ring-2 focus:ring-red-600"
                                    />
                                </label>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
