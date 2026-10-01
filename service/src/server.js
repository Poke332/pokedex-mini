// C4 sim service entry point — boots the HTTP server (node:http, no new deps).
//
// Run: npm start  (from service/). In dev the React SPA fetches this service
// same-origin via a proxy; the endpoints are the docs/simulation-dto.md §3 list.

import { buildApp } from './router.js';

const PORT = Number(process.env.PORT) || 4040;
const app = buildApp();
app.listen(PORT, () => {
    console.log(`sim service listening on http://localhost:${PORT}`);
});
