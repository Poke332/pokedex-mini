import { toProperCase } from "./api";

export function formatEncounters(encounters) {
    return (encounters || []).map((e) => {
        const v = toProperCase(e.version_details?.[0]?.version.name ?? "unknown");
        const detail = e.encounter_details?.[0];
        const range = detail
            ? detail.min_level === detail.max_level
                ? `Lv ${detail.min_level}`
                : `Lv ${detail.min_level}-${detail.max_level}`
            : "";
        return {
            area: toProperCase(e.location_area.name),
            version: v,
            range,
            count: e.encounter_details?.length ?? 0,
        };
    });
}
