N-Guard

N-Guard is a lightweight Next.js app for rapid nitrogen risk analysis and compliance guidance. It estimates field nitrogen demand, leaching probability, economic exposure, and lists nearby waterways with a proximity-weighted estimate of how much leached nitrogen may reach each stream.

Quickstart

Prerequisites:
- Node.js (v18+ recommended)
- npm

Install dependencies:

```
npm install
```

Run development server:

```
npm run dev
```

Open http://localhost:3000

Key files
- `app/page.tsx` — main dashboard and UI (streams panel, results)
- `lib/nguard.ts` — core calculation engine (adjusted N, leachingProb)
- `lib/economics.ts` — cost & exposure calculations
- `app/api/streams/route.ts` — Overpass-based waterways lookup

APIs

- `POST /api/calc` — calculation engine (payload: crop, plannedYield, acreage, prevN, fertilizerForm, soil, irrigation, rainMm, tempC, windMph)
- `POST /api/weather` — fetch live forecast for coords or city
- `POST /api/memo` — generate compliance memo
- `GET  /api/streams?lat={lat}&lon={lon}&radius={meters}` — returns nearby waterways from Overpass. Response JSON: `{ features: [{ id, name, centroid: {lat,lon}, distanceMeters }, ...] }`

Example streams API call:

```
curl "http://localhost:3000/api/streams?lat=36.7378&lon=-119.7871&radius=5000"
```

How stream N estimates are computed

- Leached N per acre is estimated inside `lib/nguard.ts` as `adjustedN * leachingProb` and passed into `lib/economics.ts`.
- Total leached N = `nLossLbs * acreage`.
- The dashboard assumes a default runoff fraction (30%) of leached N reaches surface waters; this fraction is configurable in `app/page.tsx` via the `runoffFraction` variable.
- The runoff-to-stream allocation is distributed by inverse-distance weighting among nearby waterways returned by the Overpass query.

Adjusting behavior

- Change the presumed runoff fraction: edit `runoffFraction` in `app/page.tsx`.
- To change Overpass radius, modify the fetch query or pass a different `radius` param to `/api/streams`.

Notes & Limitations

- This is a screening-level tool. Estimates are approximate and intended for planning; verify with local experts or monitoring data before regulatory decisions.
- Overpass queries may be rate-limited; consider caching or using a paid OSM/Overpass instance for heavy use.
