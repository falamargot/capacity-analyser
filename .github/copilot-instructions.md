# Eutelsat Capacity Analyser - AI Agent Instructions

## Project Overview
A React+TypeScript satellite capacity visualization tool that analyzes coverage and connectivity for EUTELSAT (GEO) and ONEWEB (LEO) satellite constellations. Displays 3D/2D maps with real-time satellite positions, coverage footprints, and air traffic overlays.

## Architecture Essentials

### Core Data Flow
1. **Satellite Data** → `src/services/satelliteService.ts` fetches TLE data, computes orbital positions via `satellite.js`
2. **Coverage Calculation** → `src/utils/leoFootprint.ts` & `coverageCalculator.ts` compute elevation-based footprints
3. **User Selection** → Click point/satellite in `App.tsx` (state hub)
4. **Capacity Analysis** → `CapacityDetails.tsx` computes latency, throughput, connectivity chains

### Key Type System
- `SatelliteData` ([src/types/satellites.ts](src/types/satellites.ts#L1)): id, name, noradId, position, capacity, coverages (array of GeoJSON features)
- `Aircraft` ([src/modules/airTraffic/airTrafficService.ts](src/modules/airTraffic/airTrafficService.ts#L6)): icao24, callsign, lat/lng, altitude, velocity, heading
- Coverage zones are stored as GeoJSON Polygons with elevation-mask properties

### Component Hierarchy
```
App.tsx (state manager, satellite updates)
├─ MapViewSwitcher (view toggle: Globe ↔ Map2D)
│  ├─ Globe.tsx (react-globe.gl 3D rendering)
│  │  ├─ Satellites as cone+mesh objects with labels
│  │  ├─ Coverages as GeoJSON polygons with elevation colors
│  │  ├─ SNPs (Strategic Network Points) as markers
│  │  └─ AirTrafficLayer (aircraft as 3D objects + tooltips)
│  └─ Map2D.tsx (pigeon-maps 2D fallback)
├─ CapacityDetails.tsx (connectivity analysis panel)
│  └─ SatelliteDetails.tsx (beam/coverage selection)
└─ AircraftDetails.tsx (commercial flights table)
```

## Critical Workflows

### Build & Run
```bash
npm run dev          # Vite dev server on localhost:5173
npm run build        # Production build to dist/
npm run lint         # ESLint check
npm test             # Vitest unit tests
```

### Satellite Position Updates
- Updates every ~1000ms (throttled in App.tsx with `satelliteUpdateTimeoutRef`)
- TLE data cached or fetched from `/public/celestrak.txt`
- Position recalculated via `calculatePosition()` using SGP4 propagation (`satellite.js`)

#### Celestrak TLE Integration
**Data Source** ([src/services/satelliteService.ts](src/services/satelliteService.ts#L6)):
```typescript
const CELESTRAK_API = {
  EUTELSAT: 'https://celestrak.org/NORAD/elements/gp.php?NAME=EUTELSAT&FORMAT=tle',
  ONEWEB: 'https://celestrak.org/NORAD/elements/gp.php?NAME=ONEWEB&FORMAT=tle'
};
```

**Caching Strategy**:
- `USE_CACHE = true` (default): Fetches from bundled `/public/celestrak.txt` (static file, never stale during session)
- `USE_CACHE = false`: Fetches live from Celestrak API (fresh data, ~1s delay per fetch, rate limits apply)
- TLE data reloaded once per hour (App.tsx line ~102: `setInterval(loadSatellites, 3600000)`)
- Each TLE line parsed to extract: name, NORAD ID, orbital elements

**SGP4 Propagation**:
```typescript
const positionAndVelocity = satellite.propagate(sat.satrec, date);
const gmst = satellite.gstime(date);
const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
// Returns: {lat, lng, alt} in WGS-84 coordinates
```

**Type Guard Example** ([satelliteService.ts#50](src/services/satelliteService.ts#L50)):
```typescript
// satellite.js returns position as [x,y,z] or false if error
if (positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
  // Safe to use as coordinate array
}
```

### Coverage Calculation Pattern
GeoJSON coverage features stored in `/public/coverage/{satelliteId}.json`. If missing, fallback generates circular footprint:
- `footprintRadiusKm(altitude, minElevationDeg)` calculates ground distance
- Generates circle polygon with 16 segments for smooth rendering
- Elevation masks: ONEWEB Standard=37°, Backhaul=15°
- Color logic: Green if SNP covered, Gray if no SNP coverage (neutral, non-alarming)

### Air Traffic Integration
- **Hook**: `useAirTraffic(config, cameraBounds, focusPoint)` polls OpenSky API every 10s (default)
- **Filtering**: Aircraft filtered by map bounds and max distance from focus point
- **Rendering**: `AirTrafficLayer` generates 3D cone objects, handles click/hover
- **State**: App.tsx manages selectedAircraft, hoveredAircraft for synchronized updates

#### Air Traffic Deep Dive
**OpenSky Integration** ([src/modules/airTraffic/airTrafficService.ts](src/modules/airTraffic/airTrafficService.ts)):
- Fetches from `https://opensky-network.org/api/states/all` (no auth required for public data)
- Falls back to mock aircraft data if API fails or returns invalid JSON
- 30-second client-side cache to reduce API load
- Parses raw array format: `[icao24, callsign, origin_country, ..., latitude, longitude, baro_altitude, on_ground, velocity, heading, ...]`
- Computes derived fields: `altitude_km` (meters→km), `speed_kmh` (m/s→km/h)

**Filtering Logic** ([useAirTraffic.ts#75-90](src/modules/airTraffic/useAirTraffic.ts#L75)):
```typescript
filterAircraftByView(aircraft, cameraBounds, focusPoint, maxDistanceKm, maxAircraft)
// Filters by:
// 1. Latitude/longitude within cameraBounds (north/south/east/west)
// 2. Distance from focusPoint ≤ maxDistanceKm (default 3000km)
// 3. Limits results to maxAircraft (default 3000)
// 4. Excludes aircraft on ground (on_ground === false)
```

**Hook Lifecycle** ([useAirTraffic.ts#102-140](src/modules/airTraffic/useAirTraffic.ts#L102)):
- Initial fetch when enabled=true
- Sets polling interval (default 10s); clears on disable
- Manual refresh via `refresh()` callback
- Config changes (updateInterval, bounds) trigger new interval setup
- Cleanup on unmount prevents memory leaks

## Patterns & Conventions

### Performance Optimization
- Components wrapped with `memo()` to prevent re-renders (Globe, CapacityDetails)
- Heavy calculations use `useCallback` + `useMemo` (e.g., calculateBestConnectivity)
- `useRef` for cached refs to avoid stale closures in intervals (e.g., satellitesRef.current)
- Real-time updates throttled (e.g., 1000ms satellite position refresh)

### State Management
- Centralized in `App.tsx`: satellites, selectedPosition, selectedSatellite, airTrafficEnabled
- Props drilling to map components; custom hooks for air traffic (`useAirTraffic`, `useAirTrafficInterpolation`)
- No global state library—intentional for simplicity

### Color & Styling Conventions
- **Satellites**: GEO=#2563eb (blue), LEO=#ef4444 (red) — defined in [src/components/globe/GlobeConfig.ts](src/components/globe/GlobeConfig.ts#L55)
- **ONEWEB Coverage**: Green zones when SNP covered, Gray zones when no SNP (neutral colors in [src/services/coverageService.ts](src/services/coverageService.ts))
- **Filters**: GEO button=blue-100 bg + text, LEO=pink-100, ALL=gray-100 — see [SatelliteScopeFilter.tsx](src/components/SatelliteScopeFilter.tsx)
- **Tailwind CSS** primary+secondary CSS vars; all components use Tailwind classes

### Testing
- Tests use Vitest; test file: [src/__tests__/geoCoverage.test.ts](src/__tests__/geoCoverage.test.ts#L1)
- Mock data helpers create SatelliteData with test coverage polygons
- Coverage intersection logic verified for GEO beam selection

## Key Files Reference

| File | Purpose |
|------|---------|
| [src/App.tsx](src/App.tsx#L1) | State hub, satellite updates, event handlers |
| [src/services/satelliteService.ts](src/services/satelliteService.ts#L1) | TLE fetching, position calculation (SGP4) |
| [src/services/coverageService.ts](src/services/coverageService.ts#L1) | GeoJSON loading, fallback circle generation |
| [src/utils/leoFootprint.ts](src/utils/leoFootprint.ts#L1) | Elevation-mask footprint math (haversine, angular radius) |
| [src/utils/capacityCalculator.ts](src/utils/capacityCalculator.ts#L1) | Latency, throughput, elevation angle calculations |
| [src/modules/airTraffic/useAirTraffic.ts](src/modules/airTraffic/useAirTraffic.ts#L1) | Custom hook for OpenSky polling + filtering |
| [src/components/globe/GlobeConfig.ts](src/components/globe/GlobeConfig.ts#L55) | SNP data, globe constants, colors |

## TypeScript Patterns & Conventions

### Interface Design
Organized by domain module to avoid circular imports:
- **Satellite types** ([src/types/satellites.ts](src/types/satellites.ts)): Core domain types (SatelliteData, Coverage)
- **Service interfaces** ([airTrafficService.ts](src/modules/airTraffic/airTrafficService.ts#L6)): Aircraft, AirTrafficResponse
- **Hook configs** ([useAirTraffic.ts](src/modules/airTraffic/useAirTraffic.ts#L9)): AirTrafficState, AirTrafficConfig, CameraBounds

Example pattern—closed-world union type for satellite types:
```typescript
type SatelliteType = 'ALL' | 'EUTELSAT' | 'ONEWEB'; // Exhaustive; prevents typos
as const satisfies SatelliteType // Type-safe exhaustiveness check
```

### Generic & Utility Patterns
- **Computed fields in interfaces**: Aircraft stores both raw API data + computed `altitude_km`, `speed_kmh`
- **Partial override merges**: `useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config])` for flexible hook config
- **Function overloading via optional params**: `loadSatelliteCoverage(id, name, type, radius)` with single-type fallback
- **Type predicates**: `typeof positionAndVelocity.position !== 'boolean'` guards against satellite.js union type

### Performance Patterns
- **useRef for interval/timeout handles**: `intervalRef.current` for cleanup safety
- **Memoized derived state**: `useMemo` for coverageCache key generation to avoid recomputation
- **Selective re-renders**: `memo()` for Globe, CapacityDetails; `useCallback` for event handlers
- **Position comparison optimization** ([App.tsx#130-145](src/App.tsx#L130)): Only recalculate coverage if position changed &gt;threshold or satellite selected

## Debugging Workflows

### Debug Satellite Positions
1. **Check TLE freshness** ([src/public/celestrak.txt](public/celestrak.txt)):
   - Run: `npm run dev` and inspect Network tab for `/celestrak.txt` fetch
   - Stale TLE = inaccurate positions; refresh via Celestrak API in satelliteService.ts (toggle `USE_CACHE`)

2. **Verify position calculation**:
   - Add to `App.tsx` useEffect (line ~115):
     ```typescript
     satellites.forEach(sat => {
       const pos = calculatePosition(sat);
       console.log(`${sat.name}: ${pos.lat.toFixed(2)}, ${pos.lng.toFixed(2)}, alt=${pos.alt.toFixed(0)}km`);
     });
     ```
   - Compare latitude/longitude against known online tools (e.g., N2YO.com)
   - Check altitude ≈ orbital specs (GEO ~36000km, LEO ~1200km)

3. **Trace coverage mismatch**:
   - Coverage cache key built from position rounded to 3 decimals (line ~56 coverageCalculator.ts)
   - Small position changes (&lt;111m) don't trigger recalculation; intentional for perf
   - Force recalc: Clear `coverageCache.clear()` in DevTools console

### Debug Air Traffic
1. **Check OpenSky API availability**:
   - Network tab: `https://opensky-network.org/api/states/all` should return `{time, states: [...]}`
   - If blocked (CORS), mock data auto-activates; check console: `🛩️ API returned HTTP...`

2. **Filter debugging** ([useAirTraffic.ts#75](src/modules/airTraffic/useAirTraffic.ts#L75)):
   - Add to App.tsx:
     ```typescript
     const airTraffic = useAirTraffic(
       { enabled: true, updateInterval: 5000, maxDistanceKm: 3000 },
       cameraBounds,
       focusPoint
     );
     console.log(`Filtered: ${airTraffic.aircraft.length} / ${airTraffic.aircraft.length} aircraft`);
     ```
   - Verify cameraBounds align with globe viewport (debug: log bounds in Globe.tsx)

3. **Stale aircraft data**:
   - Cache duration: 30s (airTrafficService.ts line ~25)
   - Manual refresh: Call `airTraffic.refresh()` from CapacityDetails or button
   - Check `airTraffic.lastUpdate` timestamp for staleness

## State Flow Diagrams

### Satellite Selection Flow
```
User clicks on Globe/Map
  ↓
App.handlePointClick(position)
  ├─ setSelectedPosition(position)
  ├─ Auto-resolve best satellites:
  │  ├─ LEO: Nearest satellite in standard/backhaul footprint (1100km/2500km)
  │  └─ GEO: First satellite covering point
  └─ Auto-select beam/coverage for GEO
      ↓
CapacityDetails renders with:
  • Real-time capacity (6 Gbps if in standard coverage, 0 Gbps otherwise)
  • Elevation angles & latency to best SNP
  • Service availability check: totalCapacity > 0
```

### Air Traffic State Updates
```
useAirTraffic Hook (enabled=true)
  ├─ Initial fetch on mount
  └─ Poll every 10000ms:
      ├─ getAircraftData() 
      │  ├─ Check 30s cache
      │  └─ Hit OpenSky API if stale
      ├─ filterAircraftByView()
      │  └─ Apply cameraBounds + distance limits
      └─ setState({aircraft, lastUpdate, error})
          ↓
      AirTrafficLayer receives new aircraft[]
      ├─ Regenerate 3D cone objects (useMemo)
      ├─ Update globe positions
      └─ Sync hovered/selected aircraft with App state
```

### Coverage Calculation Optimization
```
App.selectedSatellite OR position changes
  ├─ Check: Has position moved >3 decimals (~111m)?
  ├─ If YES or satellite selected:
  │  ├─ calculateCoverages(satellite)
  │  ├─ Generate 2 LEO zones (standard/backhaul) or GEO beams
  │  ├─ Cache key: "id_lat.XXX_lng.XXX_alt.XXX"
  │  └─ Store in Map<cacheKey, Coverage[]>
  └─ If NO: Use cached coverage
      ↓
  Globe renders GeoJSON polygons with
  elevation-color styling (green=service, gray=no-service)
```

## Build & Deployment Configuration

### Development
```bash
npm run dev
# Runs: vite
# Serves: http://localhost:5173 (Vite default)
# HMR: Enabled (hot module replacement)
```

### Production Build
```bash
npm run build
# Runs: vite build
# Output: dist/ folder
# Optimizations applied:
#   - Code splitting (React, node_modules separate)
#   - Tree-shaking of unused exports
#   - CSS minification
#   - JS minification + source maps
```

### Vite Configuration ([vite.config.ts](vite.config.ts))
```typescript
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'], // Prevent pre-bundling of icon library
  },
  // Implicit settings:
  // - Root: current directory (src/index.html)
  // - Build output: dist/
  // - Base: '/' (change if deploying to subdirectory)
});
```

### Environment-Specific Behaviors
- **Development**: 
  - `USE_CACHE = true` → `/public/celestrak.txt` (bundled, instant)
  - OpenSky API hits → fallback to mock if fails
  - Console logs enabled (🛩️, ✈️ prefixes)

- **Production**:
  - Consider toggling `USE_CACHE = false` for live TLE data (1s latency acceptable)
  - Implement auth for OpenSky Premium if rate-limited (200 req/s vs. 4000 burst)
  - Disable console logs via tree-shaking: `if (import.meta.env.DEV) console.log(...)`

### Deployment Checklist
- [ ] Verify TLE data freshness (check Celestrak file timestamp)
- [ ] Test OpenSky fallback (disconnect network, confirm mock data works)
- [ ] Configure CORS headers if API calls fail from frontend domain
- [ ] Set BASE in vite.config if deploying to non-root path: `base: '/capacity-analyser/'`
- [ ] Enable gzip compression on server (dist/ files)
- [ ] Cache-bust assets with Vite's automatic `?t=timestamp` query params

## API Rate Limiting Strategies

### Celestrak TLE Fetching
**Default (USE_CACHE=true)**:
- **Rate limit**: No API calls during session (bundled `/public/celestrak.txt`)
- **Freshness**: Static file, ~7 days old at deployment time
- **Best for**: Production, demos, offline capability

**Live (USE_CACHE=false)**:
- **Rate limit**: Celestrak allows unlimited requests (no auth required)
- **Freshness**: 15 minutes old (official update cadence)
- **Latency**: ~1s per fetch
- **Implementation**: Toggle line ~5 in satelliteService.ts, add retry logic for timeouts

**Production Strategy**:
```typescript
// Recommended: Hybrid approach
const USE_CACHE = true; // Default to bundled
const AUTO_REFRESH_LIVE = import.meta.env.PROD ? false : true; // Dev-only live updates

// Once per hour, attempt live refresh if available
const interval = setInterval(async () => {
  try {
    const freshData = await fetch(CELESTRAK_API.EUTELSAT, { signal: AbortSignal.timeout(5000) });
    if (freshData.ok) updateLocalCache(await freshData.json());
  } catch (e) {
    console.warn('Live TLE refresh failed, using cached data');
  }
}, 3600000);
```

### OpenSky Aircraft Data
**Current Caching**:
- **30-second cache**: Reduces API calls from 6/min (10s polling) to 2/min
- **Mock fallback**: Graceful degradation (no API errors visible to user)
- **Rate limit**: Unofficial API allows ~4000 requests/burst, ~200 sustained
- **Current load**: 1 request per `updateInterval` (default 10s) = 6 req/min per client

**Production Scaling**:
- **Single user**: 6 req/min → No issues (under 200 sustained limit)
- **100 concurrent users**: 600 req/min → Exceeds limit; implement server-side proxy

**Server-Side Proxy Strategy** (Recommended for >10 concurrent users):
```typescript
// Backend (Node.js/Python):
// GET /api/aircraft?bounds=north,south,east,west
// ├─ Cache OpenSky response for 30s globally
// ├─ Serve cached data to all clients
// └─ Max 2 req/min to OpenSky (not 600)

// Frontend (App.tsx):
const airTraffic = useAirTraffic({
  enabled: true,
  updateInterval: 10000,
}, cameraBounds, focusPoint);

// Fetches from /api/aircraft instead of opensky-network.org
// airTrafficService.ts should detect environment & switch endpoint
const API_URL = import.meta.env.PROD 
  ? '/api/aircraft'  // Use proxy in production
  : 'https://opensky-network.org/api/states/all'; // Direct in dev
```

**Authentication & Premium**:
- OpenSky Premium: Username + password → Higher rate limits (1000 req/s)
- Implementation: Pass credentials in Authorization header (Basic auth)
- Cost: $10/month for business use

### Recommended Rate Limit Configuration for Production
```typescript
// src/services/rateLimitConfig.ts
export const RATE_LIMITS = {
  CELESTRAK: {
    enabled: import.meta.env.PROD,
    refreshIntervalMs: 3600000, // 1 hour
    timeout: 5000, // 5s timeout to avoid blocking
    strategy: 'hybrid', // Bundle + periodic live refresh
  },
  OPENSKY: {
    enabled: true,
    cacheMs: 30000, // 30s cache
    updateIntervalMs: 10000, // 10s polling
    useProxy: import.meta.env.PROD, // Proxy in prod
    proxyEndpoint: '/api/aircraft',
    maxAircraft: 3000,
  },
};
```

## Gotchas & Common Patterns

1. **Coordinate System**: GeoJSON uses [lng, lat] order; JavaScript uses {lat, lng} objects—watch conversions
2. **LEO Footprint**: Double-zone model (standard/backhaul) with fixed radii: Standard 1100km (37°), Backhaul 2500km (15°)
3. **GEO Coverage**: Beam polygons stored as arbitrary shapes in GeoJSON; hit-testing done via [isPointInCoverage](src/utils/coverageCalculator.ts)
4. **React-Globe.gl**: Requires dimension sync on fullscreen toggle; uses `updateDimensions()` with setTimeout (line ~75 Globe.tsx)
5. **Mobile Layout**: Flex direction toggle (row → col) at <1024px; affects map container sizing
6. **Coverage cache key**: Rounded to 3 decimals (~111m precision); small drift doesn't trigger recalculation
7. **API fallback**: OpenSky API failures auto-use mock data; no visible error to users (graceful degradation)
8. **Service Availability**: Use `totalCapacity > 0` to check if service is available

## Common Tasks

### Add Satellite Type Filter
Update `SatelliteType` type union in App.tsx, modify `filteredSatellites` useMemo logic

### Modify Coverage Color
Edit [GLOBE_CONFIG.SATELLITE_COLORS](src/components/globe/GlobeConfig.ts#L55) or coverage function in [src/services/coverageService.ts](src/services/coverageService.ts#L1)

### Adjust Air Traffic Polling
Modify `DEFAULT_CONFIG.updateInterval` in [useAirTraffic.ts](src/modules/airTraffic/useAirTraffic.ts#L42) or pass config to hook in App.tsx

### Add New Calculation (Latency, SNR, etc.)
Implement in [src/utils/capacityCalculator.ts](src/utils/capacityCalculator.ts#L1), export, use in CapacityDetails via useCallback

## Performance Tuning Checklist

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| High CPU on position updates | Recalculating all satellite coverages every frame | Use `prevSatellitesRef` to track position delta; only recalc if moved >threshold or selected (App.tsx ~130) |
| Slow aircraft rendering | Unfiltered 15k+ aircraft from API | `filterAircraftByView()` limits to maxAircraft=3000 and cameraBounds (useAirTraffic.ts ~75) |
| Stale satellite data | TLE cached for 1 hour | Toggle `USE_CACHE=false` in satelliteService.ts to fetch live; risk: API rate limits |
| Stale aircraft data | OpenSky cache 30s | Call `airTraffic.refresh()` manually or reduce `updateInterval` in hook config |
| Globe stuttering on drag | Dimension recalc during pointer move | Use `updateDimensions()` throttle in Globe.tsx (~75); avoid inline position updates |
