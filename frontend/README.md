# Varuna Netra — Frontend (Phase 1)

React 18 + TypeScript (strict) + Vite. Routes: `/`, `/project`, `/case-studies`, `/history`, `/data-resources`, `/contact`, `/app` (Mission Control).

## Run
```bash
cp .env.example .env      # set VITE_API_BASE_URL (default http://localhost:8000/api)
npm install
npm run dev               # http://localhost:5173
npm run build && npm run lint
```
Or `docker compose up frontend` (compose already sets `VITE_API_BASE_URL`).

## Backend endpoints used (read-only, all verified against backend/app/api)
`GET /api/health` · `/api/providers/status` · `/api/incidents` · `/api/scenes` · `/api/reports` · `/api/observations`

## Real vs. presentation data
- Real backend data: Mission Control, Past Investigations, provider badges.
- Presentation only (labelled): `src/data/*` (M1–M6 copy, DEMO CASE studies, data-source descriptions).
- Provider badges show "Configured / Not configured" — credential presence, not upstream reachability.

## Configure
- Contact email: `VITE_CONTACT_EMAIL`. Empty = form disabled (no fake "sent").
- Team / socials: `src/config/site.ts` (`TEAM`, `CONTACT`). Empty = section hidden.
- Map: schematic projection of real incident/scene geometry; no tile basemap is configured.
