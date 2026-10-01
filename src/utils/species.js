export function getSpeciesSummary(species) {
    if (!species) return null;
    const flavorEntry = (species.flavor_text_entries || [])
        .filter((f) => f.language?.name === "en")
        .pop();
    const flavorText = flavorEntry ? flavorEntry.flavor_text.replace(/[\n\f]/g, " ") : null;
    const flags = [
        species.is_legendary ? "Legendary" : null,
        species.is_mythical ? "Mythical" : null,
        species.is_baby ? "Baby" : null,
    ].filter(Boolean);
    const rows = [
        ["Genus", species.genus],
        ["Habitat", species.habitat?.name],
        ["Capture rate", species.capture_rate != null ? `${species.capture_rate}` : null],
    ].filter(([, v]) => v != null);

    return { flavorText, flags, rows };
}
