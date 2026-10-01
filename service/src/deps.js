// Central import shim for pokemon-showdown (CommonJS) so the ESM service
// modules share one resolved reference and the CJS-default-import quirk
// (`import showdown from 'pokemon-showdown'`) lives in exactly one place.
import showdown from 'pokemon-showdown';

export { showdown };

// Named re-exports used across the service.
export const { BattleStream, getPlayerStreams, Teams, TeamValidator, Dex, toID, PRNG } = showdown;
export const showdownTeams = showdown.Teams;
