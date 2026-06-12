/**
 * CapacityHeatmapLayer — Global beam load visualisation
 *
 * Renders a 2° × 2° grid coloured by estimated beam load (0-100%).
 * The colour at each cell is derived from the same `estimateBeamLoad()` model
 * that feeds the service-layer performance calculation — so the heatmap is a
 * spatial projection of the actual capacity input parameter, not a decorative overlay.
 *
 * Color scale: blue (0%, low load) → yellow (50%, medium) → red (100%, saturated)
 * Thresholds: NOMINAL < 70% | DEGRADED 70–95% | SATURATED > 95%
 */

import React, { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import { Color, CustomDataSource, Rectangle } from 'cesium';
import { estimateBeamLoad } from '../../utils/capacityLayer';
import { BASE_OVERLAY_LAYER_HEIGHT_M } from './layerHeights';

// ─── Grid configuration ───────────────────────────────────────────────────────

const GRID_DEG = 2;
const DS_NAME = 'capacity-heatmap';

// ─── Color mapping ────────────────────────────────────────────────────────────

// Interpolates: blue (0%) → yellow (50%) → red (100%)
function loadToColor(pct: number, isOcean: boolean): Color {
    const t = Math.max(0, Math.min(1, pct / 100));
    const alpha = isOcean ? 0.22 : 0.62;

    let r: number, g: number, b: number;
    if (t < 0.5) {
        const u = t * 2;
        r = 34 + (234 - 34) * u;
        g = 197 + (179 - 197) * u;
        b = 94 + (8 - 94) * u;
    } else {
        const u = (t - 0.5) * 2;
        r = 234 + (239 - 234) * u;
        g = 179 * (1 - u);
        b = 8 + (68 - 8) * u;
    }

    return new Color(r / 255, g / 255, b / 255, alpha);
}

// ─── Geographic context approximation ────────────────────────────────────────
//
// `estimateBeamLoad()` needs `isOcean` and `countryCode` to classify density zones.
// For the global grid we can't call the regulatory API for 16K cells, so we use
// lat/lng bounding boxes that produce the right countryCode input to `classifyZone()`.
// The result closely matches what the performance calculator computes when a user
// selects a point (which uses the real regulatory API for the exact country code).

type GeoCtx = { isOcean: boolean; countryCode: string | null };

function approxGeoContext(lat: number, lng: number): GeoCtx {
    const land = (code: string): GeoCtx => ({ isOcean: false, countryCode: code });
    const ocean: GeoCtx = { isOcean: true, countryCode: null };
    const rural: GeoCtx = { isOcean: false, countryCode: null };

    // Southern / Arctic ocean
    if (lat < -60 || lat > 83) return ocean;

    // Open Pacific (east + west)
    if ((lng < -130 || lng > 160) && lat > -55 && lat < 60 &&
        !(lat > 45 && lng > 130 && lng < 150) &&   // Japan
        !(lat > -50 && lat < -35 && lng > 165))      // NZ
        return ocean;
    // Mid-Pacific
    if (lat > -15 && lat < 45 && lng > -130 && lng < -95) return ocean;
    // North Atlantic
    if (lat > 5 && lat < 58 && lng > -53 && lng < -18) return ocean;
    // South Atlantic
    if (lat > -50 && lat < 5 && lng > -38 && lng < -15) return ocean;
    // Indian Ocean (mid)
    if (lat > -45 && lat < 8 && lng > 58 && lng < 82) return ocean;
    if (lat < -15 && lat > -50 && lng > 35 && lng < 115) return ocean;

    // ── Urban country codes ──────────────────────────────────────────────────
    // (URBAN_COUNTRY_CODES in classifyZone: NL, BE, DE, GB, IT, FR, JP, KR, CH, AT, SG, HK, …)
    if (lat > 47 && lat < 55 && lng > 6 && lng < 15) return land('DE');
    if (lat > 50 && lat < 52 && lng > 3 && lng < 7) return land('BE');
    if (lat > 50 && lat < 54 && lng > 2 && lng < 6) return land('NL');
    if (lat > 50 && lat < 58 && lng > -4 && lng < 2) return land('GB');
    if (lat > 42 && lat < 51 && lng > -5 && lng < 8) return land('FR');
    if (lat > 36 && lat < 47 && lng > 7 && lng < 19) return land('IT');
    if (lat > 46 && lat < 49 && lng > 6 && lng < 10) return land('CH');
    if (lat > 47 && lat < 49 && lng > 9 && lng < 18) return land('AT');
    if (lat > 32 && lat < 45 && lng > 129 && lng < 146) return land('JP');
    if (lat > 34 && lat < 39 && lng > 126 && lng < 130) return land('KR');
    if (lat > 22 && lat < 24 && lng > 113 && lng < 116) return land('HK');
    if (lat > 1 && lat < 2 && lng > 103 && lng < 105) return land('SG');

    // ── Suburban country codes ───────────────────────────────────────────────
    // Scandinavia
    if (lat > 55 && lat < 72 && lng > 4 && lng < 32) return land('SE');
    // Iberian Peninsula
    if (lat > 36 && lat < 44 && lng > -10 && lng < 4) return land('ES');
    // Eastern Europe
    if (lat > 49 && lat < 55 && lng > 14 && lng < 24) return land('PL');
    if (lat > 44 && lat < 50 && lng > 16 && lng < 30) return land('RO');
    if (lat > 36 && lat < 42 && lng > 26 && lng < 37) return land('TR');
    // Turkey / Anatolia
    if (lat > 36 && lat < 42 && lng > 26 && lng < 45) return land('TR');
    // China east coast
    if (lat > 20 && lat < 42 && lng > 108 && lng < 125) return land('CN');
    // India subcontinent
    if (lat > 8 && lat < 35 && lng > 68 && lng < 92) return land('IN');
    // Southeast Asia
    if (lat > 5 && lat < 22 && lng > 97 && lng < 108) return land('TH');
    if (lat > 8 && lat < 24 && lng > 102 && lng < 110) return land('VN');
    if (lat > -8 && lat < 20 && lng > 116 && lng < 128) return land('PH');
    if (lat > -8 && lat < 6 && lng > 105 && lng < 120) return land('ID');
    if (lat > 20 && lat < 28 && lng > 88 && lng < 94) return land('BD');
    // Australia
    if (lat > -40 && lat < -10 && lng > 113 && lng < 155) return land('AU');
    // USA (non-polar)
    if (lat > 25 && lat < 50 && lng > -126 && lng < -65) return land('US');
    // Canada (southern, non-arctic — lat > 55 + 'CA' → polar in classifyZone)
    if (lat > 42 && lat < 65 && lng > -140 && lng < -53) return land('CA');
    // Mexico
    if (lat > 14 && lat < 32 && lng > -118 && lng < -86) return land('MX');
    // Brazil
    if (lat > -35 && lat < 5 && lng > -80 && lng < -34) return land('BR');
    // Colombia / Peru
    if (lat > -5 && lat < 12 && lng > -80 && lng < -67) return land('CO');
    // Egypt (→ arid in classifyZone for its lat/lng band, which is correct)
    if (lat > 22 && lat < 32 && lng > 25 && lng < 37) return land('EG');
    // Nigeria / West Africa coast
    if (lat > 4 && lat < 14 && lng > -5 && lng < 15) return land('NG');
    // South Africa
    if (lat > -35 && lat < -22 && lng > 16 && lng < 33) return land('ZA');
    // Morocco
    if (lat > 28 && lat < 36 && lng > -6 && lng < 2) return land('MA');
    // Saudi Arabia / Gulf (→ arid in classifyZone for desert bbox)
    if (lat > 15 && lat < 32 && lng > 36 && lng < 60) return land('SA');
    // Iran
    if (lat > 25 && lat < 40 && lng > 44 && lng < 63) return land('IR');
    // European Russia (suburban latitude band)
    if (lat > 50 && lat < 58 && lng > 30 && lng < 60) return land('RU');

    return rural;
}

// ─── Cell data cache (plain numbers, no Cesium objects) ─────────────────────
//
// Pre-computed once at module level. No Cesium types here — avoids issues
// with sharing Cesium objects across viewer lifecycles.

type CellSpec = [west: number, south: number, east: number, north: number,
                  r: number, g: number, b: number, a: number];

let cachedSpecs: CellSpec[] | null = null;

function getCellSpecs(): CellSpec[] {
    if (cachedSpecs) return cachedSpecs;
    cachedSpecs = [];
    for (let lat = -88; lat < 90; lat += GRID_DEG) {
        for (let lng = -180; lng < 180; lng += GRID_DEG) {
            const centerLat = lat + GRID_DEG / 2;
            const centerLng = lng + GRID_DEG / 2;
            const { isOcean, countryCode } = approxGeoContext(centerLat, centerLng);
            // Ocean cells skipped — they darken the basemap and add no useful information
            if (isOcean) continue;
            const load = estimateBeamLoad(centerLat, centerLng, isOcean, countryCode);
            const c = loadToColor(load.beamLoadPercent, isOcean);
            cachedSpecs.push([lng, lat, lng + GRID_DEG, lat + GRID_DEG, c.red, c.green, c.blue, c.alpha]);
        }
    }
    return cachedSpecs;
}

// ─── Per-viewer DataSource registry ──────────────────────────────────────────
//
// DataSources are never removed from the viewer (removing corrupts Cesium's
// internal visualizer state). Instead they persist for the viewer's lifetime
// and visibility is toggled via ds.show. WeakMap ensures cleanup when the
// viewer is garbage-collected.

const viewerDsMap = new WeakMap<object, CustomDataSource>();

async function getOrCreateDataSource(viewer: { dataSources: { add: (ds: CustomDataSource) => Promise<CustomDataSource>; contains: (ds: CustomDataSource) => boolean }; isDestroyed: () => boolean }): Promise<CustomDataSource> {
    const existing = viewerDsMap.get(viewer);
    if (existing) return existing;

    const ds = new CustomDataSource(DS_NAME);
    for (const [west, south, east, north, r, g, b, a] of getCellSpecs()) {
        ds.entities.add({
            rectangle: {
                coordinates: Rectangle.fromDegrees(west, south, east, north),
                material: new Color(r, g, b, a),
                outline: false,
                height: BASE_OVERLAY_LAYER_HEIGHT_M,
            },
        });
    }

    ds.show = false; // hidden until the component explicitly shows it
    const added = await viewer.dataSources.add(ds);
    viewerDsMap.set(viewer, added as CustomDataSource);
    return added as CustomDataSource;
}

// ─── Layer component ──────────────────────────────────────────────────────────

interface CapacityHeatmapLayerProps {
    visible: boolean;
}

const CapacityHeatmapLayer: React.FC<CapacityHeatmapLayerProps> = ({ visible }) => {
    const { viewer } = useCesium();
    const dataSourceRef = useRef<CustomDataSource | null>(null);
    const visibleRef = useRef(visible);
    visibleRef.current = visible;

    // Mount: get or create DataSource for this viewer (never removed, only hidden)
    useEffect(() => {
        if (!viewer) return;

        let cancelled = false;

        const attach = async () => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const ds = await getOrCreateDataSource(viewer as any);
                if (cancelled || viewer.isDestroyed()) return;
                dataSourceRef.current = ds;
                ds.show = visibleRef.current;
            } catch (e) {
                console.error('[CapacityHeatmapLayer] Failed to attach DataSource:', e);
            }
        };

        void attach();

        return () => {
            cancelled = true;
            // Don't remove from viewer — only hide. DataSource persists for viewer lifetime.
            if (dataSourceRef.current) dataSourceRef.current.show = false;
            dataSourceRef.current = null;
        };
    }, [viewer]);

    // Toggle visibility
    useEffect(() => {
        if (dataSourceRef.current) dataSourceRef.current.show = visible;
    }, [visible]);

    return null;
};

// ─── Legend component ─────────────────────────────────────────────────────────

interface CapacityHeatmapLegendProps {
    show: boolean;
    isPhone?: boolean;
}

export const CapacityHeatmapLegend: React.FC<CapacityHeatmapLegendProps> = ({ show, isPhone }) => {
    if (!show || isPhone) return null;

    return (
        <div
            className="pointer-events-none absolute bottom-0.5 left-0.5 z-30 w-[272px] max-w-[calc(100vw-0.25rem)] transition-all duration-300"
            aria-hidden={false}
        >
            <div className="overflow-hidden rounded-[22px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.78)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(30,41,59,0.78))] dark:ring-slate-700/70">

                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Beam Load
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            Geographic density model · LEO
                        </div>
                    </div>
                    <div className="rounded-full border border-amber-200/80 bg-amber-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                        Simulated
                    </div>
                </div>

                {/* Gradient bar */}
                <div className="mt-4">
                    <div
                        className="h-3 w-full rounded-full"
                        style={{
                            background: 'linear-gradient(to right, rgb(34,197,94), rgb(234,179,8), rgb(239,68,68))',
                            opacity: 0.85,
                        }}
                    />
                    {/* Scale labels */}
                    <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                </div>

                {/* Status zones */}
                <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">Nominal</span>
                        <span className="ml-auto text-slate-400 dark:text-slate-500">&lt; 70%</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-500" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">Degraded</span>
                        <span className="ml-auto text-slate-400 dark:text-slate-500">70 – 95%</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                        <span className="font-medium text-slate-700 dark:text-slate-200">Saturated</span>
                        <span className="ml-auto text-slate-400 dark:text-slate-500">&gt; 95%</span>
                    </div>
                </div>

                {/* Footer note */}
                <div className="mt-3 rounded-2xl border border-white/55 bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-slate-700/80 dark:bg-slate-950/30 dark:text-slate-400">
                    Values feed service-layer performance calculations. Same model as the Capacity card.
                </div>
            </div>
        </div>
    );
};

export default React.memo(CapacityHeatmapLayer);
