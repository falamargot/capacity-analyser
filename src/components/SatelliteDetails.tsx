import { SatelliteData } from '../types/satellites';
import { formatCoordinates } from '../utils/formatters';
import { getNearestSNPInBackhaul } from '../services/coverageService';
import { getActiveBeamCount } from '../utils/oneWebComb';
import { calculateElevationAngle } from '../utils/capacityCalculator';
import { JulianDate } from 'cesium';
import { useState, useMemo } from 'react';
import * as satellite from 'satellite.js';
import { useGSOAvoidance } from '../hooks/useGSOAvoidance';
import { ShieldCheck, ShieldAlert, ShieldX, Users } from 'lucide-react';
import {
  getCoverageBeamName,
  getCoverageBeamId,
  getCoverageDisplayName,
  getCoverageGroupId,
} from '../utils/geoCoverageSelection';
import { hasRFConnectivity } from '../utils/rfConnectivity';
import { getBestConnectedGateway } from '../utils/connectivityRules';
import { computeServiceStatus, type ServiceLayerResult } from '../utils/serviceLayer';
import { MIN_SNP_GATEWAY_ELEVATION_DEG, MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from '../utils/leoFootprint';

// NEW IMPORTS - BeamStatusComponents integration
import { BeamStatusGrid, CoveragePolicyDisplay } from './BeamStatusComponents';
import { useSimulation } from '../contexts/SimulationContext';
import { SNPS_DATA } from './globe/GlobeConfig';
import { SectionTooltip } from './SectionTooltip';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from '../utils/capacityLayer';
import { PublicTranspondersSection } from './PublicTranspondersSection';

const formatLeoServiceZoneLabel = (elevationDeg: number | null): string => {
  if (elevationDeg === null || !Number.isFinite(elevationDeg)) return 'Below terminal elevation threshold';
  if (elevationDeg < MIN_USER_TERMINAL_ELEVATION_DEG) return 'Below terminal elevation threshold';
  if (elevationDeg < STANDARD_SERVICE_ELEVATION_DEG) return 'Service possible, below guaranteed elevation';
  return 'Guaranteed service zone';
};


// ─── Pitch Monitoring Chart ───────────────────────────────────────────────────
// The SVG curve depends only on two fixed constants — compute it once at module
// load instead of inside a useMemo (which re-runs on every component mount).
const PITCH_START_LAT = 45.0;
const MAX_PITCH_DEG = 17.0;

const SAFETY_DOME_CURVE_POINTS = (() => {
  const points: string[] = [];
  for (let lat = -90; lat <= 90; lat += 1) {
    const progress = Math.abs(lat) / PITCH_START_LAT;
    const pitchMagnitude = progress <= 1 ? MAX_PITCH_DEG * Math.cos(progress * (Math.PI / 2)) : 0;
    const pitch = lat >= 0 ? pitchMagnitude : -pitchMagnitude;
    const x = 30 + ((lat + 90) / 180) * 270;
    const y = 97 - (Math.abs(pitch) / 20) * 94;
    points.push(`${x},${y}`);
  }
  return points.join(' ');
})();

const PitchMonitoringChart: React.FC<{ currentLatitude: number; currentPitch: number }> = ({
  currentLatitude,
  currentPitch
}) => {
  const curvePoints = SAFETY_DOME_CURVE_POINTS;

  // Calculate current position on curve using same formula
  const currentX = 30 + ((currentLatitude + 90) / 180) * 270;
  const currentY = 97 - (Math.abs(currentPitch) / 20) * 94;

  return (
    <div className="relative w-full h-full">
      <svg width="100%" height="100%" viewBox="0 0 320 120" className="overflow-visible">
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width="15" height="24" patternUnits="userSpaceOnUse">
            <path d="M 15 0 L 0 0 0 24" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="30" y="0" width="272" height="94" fill="url(#grid)" />

        {/* Axes */}
        <line x1="30" y1="97" x2="300" y2="97" stroke="#9ca3af" strokeWidth="1" />
        <line x1="30" y1="0" x2="30" y2="97" stroke="#9ca3af" strokeWidth="1" />

        {/* Avoidance Zone - between -45° and +45° */}
        <rect x="97" y="0" width="137" height="97" fill="#ecb54fff" opacity="0.2" />

        {/* Equator line with flip visualization */}
        <text x="170" y="-3" textAnchor="middle" fill="#ecb54fff" fontSize="9" fontWeight="medium">GSO Arc Protection</text>

        {/* Exclusion Zone - between -2° and +2° */}
        <rect x="163" y="0" width="5" height="97" fill="#6b7280" opacity="0.3" />
        <text x="160" y="68" textAnchor="middle" fill="#374151" fontSize="8" fontWeight="medium" opacity="0.8" transform="rotate(-90 160 60)">EXCLUSION</text>

        {/* Dome curve */}
        <polyline
          points={curvePoints}
          fill="none"
          stroke="#ec4899"
          strokeWidth="2"
        />

        {/* Current position dot - snapped to curve */}
        <circle
          cx={currentX}
          cy={currentY}
          r="4"
          fill={Math.abs(currentLatitude) <= 2 ? "#6b7280" : "#ec4899"}
          stroke="white"
          strokeWidth="2"
        />

        {/* Tooltip with calculated values */}
        <g transform={`translate(${currentX}, ${currentY - 10})`}>
          <rect
            x="-30"
            y="-13"
            width="60"
            height="14"
            fill="white"
            stroke="#e5e7eb"
            strokeWidth="1"
            rx="2"
          />
          <text
            x="2"
            y="-3"
            textAnchor="middle"
            fill="#374151"
            fontSize="9"
            fontWeight="medium"
          >
            {currentLatitude.toFixed(1)}° | {Math.abs(currentPitch).toFixed(1)}°
          </text>
        </g>

        {/* Axis labels */}
        <text x="168" y="115" textAnchor="middle" fill="#6b7280" fontSize="10">Latitude</text>
        <text x="10" y="50" textAnchor="middle" fill="#6b7280" fontSize="10" transform="rotate(-90 10 50)">Pitch</text>

        {/* X-axis labels */}
        <text x="30" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">-90°</text>
        <text x="98" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">-45°</text>
        <text x="168" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">0°</text>
        <text x="233" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">+45°</text>
        <text x="300" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">+90°</text>

        {/* Y-axis labels */}
        <text x="25" y="102" textAnchor="end" fill="#6b7280" fontSize="8">0°</text>
        <text x="25" y="53" textAnchor="end" fill="#6b7280" fontSize="8">10°</text>
        <text x="25" y="07" textAnchor="end" fill="#6b7280" fontSize="8">20°</text>
      </svg>
    </div>
  );
};


interface SatelliteDetailsProps {
  satellites: SatelliteData[];
  selectedSatellite: SatelliteData;
  selectedGeoMission?: string | null;
  selectedGeoCoverageName?: string | null;
  selectedGeoBeamId?: string | null;
  visibleGeoCoverageKeys?: string[];
  onSelectGeoMission?: (mission: string | null) => void;
  onSelectGeoCoverage?: (coverageName: string | null) => void;
  onSelectGeoBeam?: (coverageName: string, beamId: string | null) => void;
  onVisibleGeoCoverageKeysChange?: (keys: string[]) => void;
  onSnpClick?: (snpName: string) => void;
  compactDesktop?: boolean;
  externalHeader?: boolean;
  activePoint?: { lat: number; lng: number; altitude?: number } | null;
  targetRegulatoryResult?: RegulatoryResult | null;
  targetBeamLoadResult?: BeamLoadResult | null;
}


const getSelectedSatellitePosition = (satellites: SatelliteData[], selectedSatellite: SatelliteData) => {
  const position = satellites.find(sat => sat.id === selectedSatellite.id)?.position;
  return (!position) ? { lat: 0, lng: 0 } : { lat: position.lat, lng: position.lng };
};


const SatelliteDetails: React.FC<SatelliteDetailsProps> = ({
  satellites,
  selectedSatellite,
  selectedGeoMission = null,
  selectedGeoCoverageName = null,
  selectedGeoBeamId = null,
  visibleGeoCoverageKeys,
  onSelectGeoMission,
  onSelectGeoCoverage,
  onSelectGeoBeam,
  onVisibleGeoCoverageKeysChange,
  onSnpClick,
  compactDesktop = false,
  externalHeader = false,
  activePoint = null,
  targetRegulatoryResult = null,
  targetBeamLoadResult = null,
}) => {
  // NEW: Get coverage policy from simulation context
  const {
    coveragePolicy,
    beamHealthFactors, setBeamHealthFactor, resetBeamHealth,
    weatherCondition,
    failedSnps,
    beamHsStatus, toggleBeamHs, resetBeamHs,
  } = useSimulation();

  const isOperational = selectedSatellite.opsStatus === 'operational';

  // Get current satellite position from satellites array (real-time)
  const currentSatellite = satellites.find(sat => sat.id === selectedSatellite.id);
  const effectiveSatellite = currentSatellite ?? selectedSatellite;

  // Orbital speed derived from the ECI velocity vector — updates whenever satellites prop updates
  const orbitalSpeedKms = useMemo(() => {
    const sat = effectiveSatellite;
    const pv = satellite.propagate(sat.satrec, new Date());
    if (!pv || typeof pv.velocity === 'boolean' || !pv.velocity) return null;
    const v = pv.velocity as { x: number; y: number; z: number };
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }, [effectiveSatellite]);

  // Calculate nearest SNP for LEO satellites using current position (real-time)
  // Pass failedSnps so the nearest SNP lookup skips any failed ground stations
  const nearestSNP = currentSatellite?.type === 'ONEWEB'
    ? getNearestSNPInBackhaul(currentSatellite, failedSnps)
    : null;

  const currentTargetHasRF = useMemo(() => {
    if (!activePoint || !isOperational || effectiveSatellite.type !== 'ONEWEB') return false;
    return hasRFConnectivity(
      activePoint,
      effectiveSatellite,
      JulianDate.fromDate(new Date()),
      {
        coveragePolicy,
        weatherCondition,
        beamHealthFactors,
        hsBeams: beamHsStatus,
      }
    );
  }, [
    activePoint,
    beamHealthFactors,
    beamHsStatus,
    coveragePolicy,
    effectiveSatellite,
    isOperational,
    weatherCondition,
  ]);

  const currentTargetServingGateway = useMemo(() => {
    if (!activePoint || !isOperational || effectiveSatellite.type !== 'ONEWEB' || !currentTargetHasRF) {
      return null;
    }
    return getBestConnectedGateway(effectiveSatellite, MIN_SNP_GATEWAY_ELEVATION_DEG, failedSnps);
  }, [activePoint, currentTargetHasRF, effectiveSatellite, failedSnps, isOperational]);

  const currentTargetServiceStatus = useMemo<ServiceLayerResult | null>(() => {
    if (
      !activePoint ||
      !targetRegulatoryResult ||
      !targetBeamLoadResult ||
      !isOperational ||
      effectiveSatellite.type !== 'ONEWEB'
    ) {
      return null;
    }

    return computeServiceStatus({
      hasRF: currentTargetHasRF,
      hasSNP: currentTargetServingGateway !== null,
      regulatoryResult: targetRegulatoryResult,
      beamLoadResult: targetBeamLoadResult,
    });
  }, [
    activePoint,
    currentTargetHasRF,
    currentTargetServingGateway,
    effectiveSatellite.type,
    isOperational,
    targetBeamLoadResult,
    targetRegulatoryResult,
  ]);

  const currentTargetUserElevation = useMemo(() => {
    if (!activePoint || effectiveSatellite.type !== 'ONEWEB') return null;
    return calculateElevationAngle(activePoint, effectiveSatellite);
  }, [activePoint, effectiveSatellite]);

  // SNPs within backhaul range of the current satellite (elevation ≥ 15°)
  const visibleSNPs = useMemo(() => {
    if (!currentSatellite) return [];
    return SNPS_DATA
      .map(snp => ({ snp, elevation: calculateElevationAngle({ lat: snp.lat, lng: snp.lng }, currentSatellite) }))
      .filter(({ elevation }) => elevation >= MIN_SNP_GATEWAY_ELEVATION_DEG)
      .sort((a, b) => b.elevation - a.elevation);
  }, [currentSatellite]);

  // Track GSO Protection state for ONEWEB satellites — via shared hook (no duplicate interval)
  const gsoAvoidanceData = useGSOAvoidance(selectedSatellite.type === 'ONEWEB' ? selectedSatellite : null);

  const geoCoverageByMission = useMemo(() => {
    if (selectedSatellite.type !== 'EUTELSAT' || !selectedSatellite.coverages?.length) {
      return [];
    }

    const groups = new Map<string, {
      key: string;
      label: string;
      isUplink: boolean;
      contours: { id: string; level: number | null; label: string }[];
    }>();

    for (const coverage of selectedSatellite.coverages) {
      const coverageKey = getCoverageGroupId(coverage);
      const properties = (coverage.feature?.properties as Record<string, unknown>) ?? {};
      const isUplink = properties.isUplink === true;

      const current = groups.get(coverageKey) ?? {
        key: coverageKey,
        label: getCoverageDisplayName(coverage),
        isUplink,
        contours: [],
      };

      const contourId = getCoverageBeamId(coverage);
      if (!current.contours.some((c) => c.id === contourId)) {
        const rawLevel = typeof properties.level === 'number' ? properties.level : null;
        const contourLabel = rawLevel !== null
          ? isUplink ? `${rawLevel.toFixed(1)} dB/K` : `${rawLevel.toFixed(1)} dBW`
          : getCoverageBeamName(coverage);
        current.contours.push({ id: contourId, level: rawLevel, label: contourLabel });
      }

      groups.set(coverageKey, current);
    }

    return Array.from(groups.values())
      .map((coverage) => ({
        ...coverage,
        contours: [...coverage.contours].sort((a, b) => {
          if (a.level !== null && b.level !== null) return b.level - a.level;
          return 0;
        }),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [selectedSatellite]);

  const effectiveVisibleGeoCoverageKeys = visibleGeoCoverageKeys ?? geoCoverageByMission.map((coverage) => coverage.key);
  const visibleGeoCoverageKeySet = useMemo(
    () => new Set(effectiveVisibleGeoCoverageKeys),
    [effectiveVisibleGeoCoverageKeys]
  );
  const [expandedGeoCoverageState, setExpandedGeoCoverageState] = useState<{
    satelliteId: string | null;
    keys: string[];
  }>({ satelliteId: null, keys: [] });
  const effectiveExpandedGeoCoverageKeys = expandedGeoCoverageState.satelliteId === selectedSatellite.id
    ? expandedGeoCoverageState.keys
    : [];
  const expandedGeoCoverageKeySet = useMemo(
    () => new Set(effectiveExpandedGeoCoverageKeys),
    [effectiveExpandedGeoCoverageKeys]
  );

  const updateVisibleGeoCoverageKeys = (keys: string[]) => {
    onVisibleGeoCoverageKeysChange?.(Array.from(new Set(keys)));
  };

  const setGeoCoverageExpanded = (coverageKey: string, expanded: boolean) => {
    setExpandedGeoCoverageState((current) => {
      const currentKeys = current.satelliteId === selectedSatellite.id ? current.keys : [];
      const nextKeys = expanded
        ? [...currentKeys, coverageKey]
        : currentKeys.filter((key) => key !== coverageKey);

      return {
        satelliteId: selectedSatellite.id,
        keys: Array.from(new Set(nextKeys)),
      };
    });
  };

  const setVisibleGeoCoverageGroup = (mode: 'all' | 'none' | 'uplink' | 'downlink') => {
    if (mode === 'all') {
      updateVisibleGeoCoverageKeys(geoCoverageByMission.map((coverage) => coverage.key));
      return;
    }

    if (mode === 'none') {
      updateVisibleGeoCoverageKeys([]);
      return;
    }

    updateVisibleGeoCoverageKeys(
      geoCoverageByMission
        .filter((coverage) => (mode === 'uplink' ? coverage.isUplink : !coverage.isUplink))
        .map((coverage) => coverage.key)
    );
  };

  const toggleVisibleGeoCoverage = (coverageKey: string, checked: boolean) => {
    if (checked) {
      updateVisibleGeoCoverageKeys([...effectiveVisibleGeoCoverageKeys, coverageKey]);
      return;
    }

    updateVisibleGeoCoverageKeys(effectiveVisibleGeoCoverageKeys.filter((key) => key !== coverageKey));
  };

  const isGeoCoverageFiltered = selectedSatellite.type === 'EUTELSAT' && (
    selectedGeoCoverageName !== null || selectedGeoBeamId !== null
  );

  const handlePanelClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isGeoCoverageFiltered) return;

    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.closest('[data-geo-coverage-list="true"]')) {
      return;
    }

    onSelectGeoCoverage?.(null);
  };

  const serviceStatusColor = (status: ServiceLayerResult['status'] | undefined) => {
    if (status === 'ALLOWED') return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-200' };
    if (status === 'DEGRADED') return { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200' };
    if (status === 'BLOCKED') return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-200' };
    return { bg: 'bg-gray-50 dark:bg-slate-800/50', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-slate-700', badge: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300' };
  };

  const regulatoryStatusColor = (status: RegulatoryResult['status'] | undefined) => {
    if (status === 'ALLOWED') return 'text-emerald-600 dark:text-emerald-400';
    if (status === 'RESTRICTED') return 'text-amber-600 dark:text-amber-400';
    if (status === 'BLOCKED') return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  return (
    <div
      className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300"
      onClickCapture={handlePanelClickCapture}
    >
      <div className={`flex h-full flex-col overflow-y-auto ${compactDesktop ? 'p-3.5' : 'p-4'}`}>
        <div className={compactDesktop ? 'space-y-3.5' : 'space-y-4'}>
          {!externalHeader && (
            <div className={`mb-4 flex items-center justify-between border-b border-gray-200 pb-4 dark:border-slate-700 ${compactDesktop ? 'gap-3' : ''}`}>
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${isOperational
                  ? 'bg-gradient-to-br from-pink-500 to-purple-600 animate-pulse shadow-lg shadow-pink-500/50'
                  : 'bg-gray-400 dark:bg-gray-500'
                }`}></div>
                <div>
                  <h2 className={`font-bold text-gray-900 dark:text-gray-100 ${compactDesktop ? 'text-xl' : 'text-2xl'}`}>Satellite Details</h2>
                  {selectedSatellite.name}
                </div>
              </div>
              <div className={`flex items-center ${compactDesktop ? 'gap-1.5' : 'gap-2'}`}>
                {!isOperational && (
                  <span className={`rounded-full border bg-gray-100 font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 ${compactDesktop ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'}`}>
                    Non-operational
                  </span>
                )}
                <span className={`rounded-full font-medium ${compactDesktop ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${selectedSatellite.type === 'EUTELSAT'
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
                  : 'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-200'
                  }`}>
                  {selectedSatellite.type}
                </span>
              </div>
            </div>
          )}

          <div className={`mb-4 grid grid-cols-1 items-start ${compactDesktop ? 'gap-3' : 'gap-4'}`}>
            <div className={`self-start rounded-lg border border-gray-100 bg-gray-50 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/50 ${compactDesktop ? 'px-3.5 py-2' : 'px-4 py-2'}`}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">Position<SectionTooltip content="Current orbital position (latitude, longitude, altitude) of the selected satellite, computed from its TLE data at the current simulation time." /></h3>
              <p className={`font-semibold text-gray-900 dark:text-gray-100 ${compactDesktop ? 'text-base' : 'text-lg'}`}>
                {formatCoordinates(getSelectedSatellitePosition(satellites, selectedSatellite))}
              </p>
              <p className={`mt-1 whitespace-nowrap text-gray-500 dark:text-gray-400 ${compactDesktop ? 'text-[13px]' : 'text-sm'}`}>
                Altitude: {(currentSatellite?.position.alt || selectedSatellite.position.alt).toFixed(0)} km{orbitalSpeedKms !== null && ` (${Math.round(orbitalSpeedKms * 3600).toLocaleString()} km/h)`}
              </p>
            </div>

            <div className={`self-start rounded-lg border border-gray-100 bg-gray-50 shadow-sm backdrop-blur-sm dark:border-slate-700 dark:bg-slate-800/50 ${compactDesktop ? 'px-3.5 py-2' : 'px-4 py-2'}`}>
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                Capacity
                <SectionTooltip content="Satellite capacity figures. 'Official Aggregate' is an engineering approximation based on public OneWeb Gen 1 sources (range: 7.5–8 Gbps). 'Simulated Effective Beam' is the 5-pillar simulation output at boresight, clear sky, full health — not a filed or marketed value. Model combines public ITU/FCC data and simulated RF assumptions." />
              </h3>
              {isOperational ? (
                <>
                  {selectedSatellite.capacity.officialAggregateCapacityGbps !== undefined ? (
                    <div className="space-y-1">
                      <div>
                        <p className={`font-semibold text-gray-900 dark:text-gray-100 ${compactDesktop ? 'text-base' : 'text-lg'}`}>
                          {selectedSatellite.capacity.officialAggregateCapacityGbps.toLocaleString()} Gbps
                        </p>
                        <p className={`text-gray-400 dark:text-gray-500 ${compactDesktop ? 'text-[11px]' : 'text-xs'}`}>
                          Official Aggregate Capacity*
                        </p>
                      </div>
                      {selectedSatellite.capacity.simulatedEffectiveBeamCapacityMbps !== undefined && (
                        <div>
                          <p className={`font-medium text-gray-700 dark:text-gray-300 ${compactDesktop ? 'text-sm' : 'text-sm'}`}>
                            ~{selectedSatellite.capacity.simulatedEffectiveBeamCapacityMbps} Mbps / beam
                          </p>
                          <p className={`text-gray-400 dark:text-gray-500 ${compactDesktop ? 'text-[11px]' : 'text-xs'}`}>
                            Simulated Effective Beam Capacity
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className={`font-semibold text-gray-900 dark:text-gray-100 ${compactDesktop ? 'text-base' : 'text-lg'}`}>
                      {selectedSatellite.capacity.maxThroughput.toLocaleString()} Gbps
                    </p>
                  )}
                  <p className={`mt-1 text-gray-500 dark:text-gray-400 ${compactDesktop ? 'text-[13px]' : 'text-sm'}`}>
                    Availability: {(selectedSatellite.capacity.availability * 100).toFixed(2)}%
                  </p>
                  {selectedSatellite.capacity.officialAggregateCapacityGbps !== undefined && (
                    <p className={`mt-1 text-gray-400 dark:text-gray-500 italic ${compactDesktop ? 'text-[10px]' : 'text-[11px]'}`}>
                      * Engineering approximation — ITU/FCC filings + simulated RF
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className={`font-semibold text-gray-400 dark:text-gray-600 ${compactDesktop ? 'text-base' : 'text-lg'}`}>Off</p>
                  <p className={`mt-1 text-gray-400 dark:text-gray-600 ${compactDesktop ? 'text-[13px]' : 'text-sm'}`}>Availability: —</p>
                </>
              )}
            </div>
          </div>

          {selectedSatellite.type === 'ONEWEB' && activePoint && (
            <div className="mb-4">
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700 space-y-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                    Current Target Impact
                    <SectionTooltip content="Contextual service view for the currently active ground target. These values depend on the selected point and do not describe the intrinsic activation state of the satellite itself." />
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Target at {formatCoordinates(activePoint)}
                  </p>
                </div>

                {currentTargetServiceStatus && (() => {
                  const colors = serviceStatusColor(currentTargetServiceStatus.status);
                  const ServiceIcon = currentTargetServiceStatus.status === 'ALLOWED' ? ShieldCheck : currentTargetServiceStatus.status === 'BLOCKED' ? ShieldX : ShieldAlert;
                  return (
                    <div className={`rounded-lg border px-4 py-3 ${colors.bg} ${colors.border}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <ServiceIcon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Service Status for Current Target</span>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${colors.badge}`}>
                          {currentTargetServiceStatus.status}
                        </span>
                      </div>
                      <p className={`mt-1.5 text-xs ${colors.text}`}>{currentTargetServiceStatus.reason}</p>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                      Regulatory Status for Current Target
                      <SectionTooltip content="Country-based service status for the active point. This is location-specific, not satellite-specific." />
                    </h4>
                    {targetRegulatoryResult ? (
                      <div className="mt-2 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-gray-700 dark:text-gray-300">
                            {targetRegulatoryResult.isOcean
                              ? 'International waters'
                              : (targetRegulatoryResult.countryName ?? 'Unknown territory')}
                          </span>
                          <span className={`font-bold uppercase tracking-wide ${regulatoryStatusColor(targetRegulatoryResult.status)}`}>
                            {targetRegulatoryResult.status}
                          </span>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 leading-snug">{targetRegulatoryResult.reason}</p>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No active target context.</p>
                    )}
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                      Serving SNP for Current Target
                      <SectionTooltip content="Gateway actually usable for the active target through this selected satellite. This is distinct from the nearest reachable SNP shown below, which remains satellite-centric." />
                    </h4>
                    <div className="mt-2 space-y-1.5 text-xs">
                      {currentTargetServingGateway ? (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{currentTargetServingGateway.snp.name}</span>
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              Serving target
                            </span>
                          </div>
                          <p className="text-gray-500 dark:text-gray-400">
                            Gateway elevation from satellite: {currentTargetServingGateway.elevation.toFixed(1)}°
                          </p>
                          {currentTargetUserElevation !== null && (
                            <p className="text-gray-500 dark:text-gray-400">
                              User elevation from target: {currentTargetUserElevation.toFixed(1)}° · {formatLeoServiceZoneLabel(currentTargetUserElevation)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-500 dark:text-gray-400">
                          {currentTargetHasRF
                            ? 'No gateway currently reachable for this target through the selected satellite.'
                            : 'No serving SNP because the selected satellite has no RF service for the current target.'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 lg:col-span-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
                      Beam Load for Current Target
                      <SectionTooltip content="Estimated load affecting the target service context. This is a contextual serving-beam estimate, not a permanent property of the whole satellite." />
                    </h4>
                    {targetBeamLoadResult ? (
                      <div className="mt-2 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                            <Users className="h-3 w-3" />
                            Estimated load
                          </span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {targetBeamLoadResult.beamLoadPercent}% ({targetBeamLoadResult.capacityStatus})
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              targetBeamLoadResult.capacityStatus === 'NOMINAL'
                                ? 'bg-emerald-500'
                                : targetBeamLoadResult.capacityStatus === 'DEGRADED'
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(100, targetBeamLoadResult.beamLoadPercent)}%` }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-gray-500 dark:text-gray-400">
                          <span>Fill rate: ~{targetBeamLoadResult.beamLoadPercent}%</span>
                          <span>Estimated user share: ~{targetBeamLoadResult.estimatedUserThroughputMbps} Mbps</span>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No active target context.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Separate SNP Information Section */}
          {selectedSatellite.type === 'ONEWEB' && isOperational && (
            <div className="mb-4">
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                {nearestSNP ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Nearest reachable SNP: <span className="font-medium text-gray-800 dark:text-gray-100">{nearestSNP.name} ({nearestSNP.distance.toFixed(0)} km, {nearestSNP.oneWayLatencyMs.toFixed(1)} ms one-way)</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Satellite-centric nearest gateway, not necessarily the SNP serving the current target.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Nearest reachable SNP: <span className="font-medium text-gray-500 dark:text-gray-400">None</span>
                  </p>
                )}
                {gsoAvoidanceData && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 space-y-2">
                    {/* Mode Indicator Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Payload mode:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${gsoAvoidanceData.isBlankingZone
                        ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 animate-pulse'
                        : gsoAvoidanceData.isGSOAvoidance
                          ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800'
                          : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                        }`}>
                        {gsoAvoidanceData.isBlankingZone
                          ? 'OFF (EXCLUSION ZONE)'
                          : gsoAvoidanceData.isGSOAvoidance
                            ? 'GSO Protection'
                            : 'Nadir Pointing'
                        }
                      </span>
                    </div>


                    {/* Equatorial Transition Alert */}
                    {Math.abs(gsoAvoidanceData.latitude) <= 2.0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2">
                        <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 flex items-center">
                          ⚠️ EQUATORIAL FLIP IN PROGRESS
                        </p>
                      </div>
                    )}

                    {/* Real-time Pitch Value */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Pitch:</span>
                      <span className={`font-medium text-sm ${gsoAvoidanceData.isGSOAvoidance
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-green-600 dark:text-green-400'
                        }`}>
                        {gsoAvoidanceData.pitchAngleDeg.toFixed(1)}°
                      </span>
                    </div>

                    {/* Pitch Monitoring Chart */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">Pitch Monitoring<SectionTooltip content="GSO avoidance pitch angle plotted against latitude. In the equatorial crossing zone, the satellite pitches its antenna to avoid interference with geostationary (GEO) satellites." /></h4>
                      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3" style={{ height: '200px' }}>
                        <PitchMonitoringChart
                          currentLatitude={gsoAvoidanceData.latitude}
                          currentPitch={gsoAvoidanceData.pitchAngleDeg}
                        />
                      </div>
                    </div>

                    {/* NEW: Beam Status Grid */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        Beam Status<SectionTooltip content="Operational status of each of the 16 spot beams. Beams can be degraded by weather or manually set to HS (High-Spot) or degraded mode. All beams are blanked in the GSO exclusion zone." />
                      </h4>
                      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                        <BeamStatusGrid
                          activeBeams={gsoAvoidanceData.activeBeamCount}
                          isBlankingZone={gsoAvoidanceData.isBlankingZone}
                          isGSOAvoidance={gsoAvoidanceData.isGSOAvoidance}
                          latitude={gsoAvoidanceData.latitude}
                          beamHealthFactors={beamHealthFactors}
                          onHealthChange={setBeamHealthFactor}
                          onReset={resetBeamHealth}
                          weatherCondition={weatherCondition}
                          isMovingNorth={gsoAvoidanceData.isMovingNorth}
                          beamHsStatus={beamHsStatus}
                          onHsToggle={toggleBeamHs}
                          onResetHs={resetBeamHs}
                        />
                      </div>
                    </div>

                    {/* SNP Backhaul Reach */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center">
                        Visible SNPs from Satellite
                        <SectionTooltip content={`SNPs currently visible from this selected satellite (elevation ≥ ${MIN_SNP_GATEWAY_ELEVATION_DEG}°). This list is satellite-centric and does not by itself mean that a given SNP is serving the active ground target.`} />
                        {visibleSNPs.some(({ snp }) => failedSnps.has(snp.name)) && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                            {visibleSNPs.filter(({ snp }) => failedSnps.has(snp.name)).length} FAILED
                          </span>
                        )}
                      </h4>
                      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-2 space-y-1">
                        {visibleSNPs.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic py-1 px-1">No SNPs in backhaul range</p>
                        ) : visibleSNPs.map(({ snp, elevation }) => {
                          const isFailed = failedSnps.has(snp.name);
                          const isNearest = nearestSNP?.name === snp.name;
                          return (
                            <button
                              key={snp.name}
                              type="button"
                              onClick={() => onSnpClick?.(snp.name)}
                              title={`Open ${snp.name} detail panel`}
                              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors bg-gray-50 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-orange-900/20 border border-gray-100 dark:border-slate-700"
                            >
                              <span className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isFailed ? 'bg-red-500' : isNearest ? 'bg-green-500' : 'bg-[#FFA500]'}`} />
                                <span className={`text-sm font-medium ${isFailed ? 'text-red-600 dark:text-red-400 line-through opacity-70' : 'text-gray-800 dark:text-gray-200'}`}>{snp.name}</span>
                                {isNearest && !isFailed && <span className="text-[9px] text-green-600 dark:text-green-400 font-bold">ACTIVE</span>}
                                {currentTargetServingGateway?.snp.name === snp.name && !isFailed && (
                                  <span className="text-[9px] text-blue-600 dark:text-blue-400 font-bold">SERVING TARGET</span>
                                )}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{elevation.toFixed(1)}°</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${isFailed ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'}`}>
                                  {isFailed ? 'Failed' : 'OK'}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NEW: Coverage Policy Display */}
          {selectedSatellite.type === 'ONEWEB' && isOperational && (
            <CoveragePolicyDisplay policy={coveragePolicy} />
          )}

          {/* Public frequency plan - only for GEO satellites */}
          {selectedSatellite.type === 'EUTELSAT' && isOperational && (
            <PublicTranspondersSection
              satellite={selectedSatellite}
              coveragesByMission={geoCoverageByMission}
              onSelectGeoCoverage={onSelectGeoCoverage}
              onSelectGeoBeam={onSelectGeoBeam}
            />
          )}

          {/* Coverage Areas - only for GEO satellites */}
          {selectedSatellite.type === 'EUTELSAT' && isOperational && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100 flex items-center">Coverage Areas<SectionTooltip content="GEO satellite coverage footprints. Use checkboxes to display zero, one, or multiple coverages on the map. Each selected coverage renders all of its contours." /></h3>
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                {geoCoverageByMission.length > 0 ? (
                  <div className="space-y-2" data-geo-coverage-list="true">
                    <div className="mb-3 flex flex-wrap items-center gap-1.5">
                      {([
                        ['downlink', 'Downlink'],
                        ['uplink', 'Uplink'],
                        ['all', 'All'],
                        ['none', 'None'],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setVisibleGeoCoverageGroup(mode)}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-300"
                        >
                          {label}
                        </button>
                      ))}
                      <span className="ml-auto text-[11px] font-medium text-gray-500 dark:text-gray-400">
                        {effectiveVisibleGeoCoverageKeys.length}/{geoCoverageByMission.length}
                      </span>
                    </div>
                    {geoCoverageByMission.map((coverage, coverageIndex) => {
                      const coverageHasSelectedBeam = coverage.contours.some((c) => c.id === selectedGeoBeamId);
                      const isCoverageSelected = selectedGeoCoverageName === coverage.key;
                      const isCoverageVisible = visibleGeoCoverageKeySet.has(coverage.key);
                      const isCoverageActive = isCoverageVisible || isCoverageSelected || coverageHasSelectedBeam;
                      const isCoverageExpanded = expandedGeoCoverageKeySet.has(coverage.key);
                      return (
                        <details
                          key={`${coverage.key}-${coverageIndex}`}
                          open={isCoverageExpanded}
                          onToggle={(event) => {
                            setGeoCoverageExpanded(coverage.key, event.currentTarget.open);
                          }}
                          className="group/coverage"
                        >
                          <summary className="cursor-pointer list-none text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                            <span className="shrink-0 text-blue-500 dark:text-blue-400 group-open/coverage:rotate-90 transition-transform">▶</span>
                            <label
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                              className={`flex flex-1 cursor-pointer items-center gap-2 text-left ${isCoverageActive
                                ? 'text-blue-700 dark:text-blue-300 font-semibold'
                                : 'text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isCoverageVisible}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  toggleVisibleGeoCoverage(coverage.key, event.currentTarget.checked);
                                }}
                                className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                              />
                              {coverage.label}
                            </label>
                            <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] px-1 py-0.5 rounded ${
                              coverage.isUplink
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                            }`}>
                              {coverage.isUplink ? 'UL' : 'DL'}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                              ({coverage.contours.length})
                            </span>
                          </summary>
                          <ul className="mt-1 ml-5 space-y-1">
                            {coverage.contours.map((contour, contourIndex) => {
                              const isContourSelected = selectedGeoBeamId === contour.id;
                              return (
                                <li
                                  key={`${coverage.key}-${contour.id}-${contourIndex}`}
                                  className="text-sm flex items-center"
                                >
                                  <span className={`w-1.5 h-1.5 shrink-0 rounded-full mr-2 ${isContourSelected ? 'bg-blue-700 dark:bg-blue-300' : isCoverageActive ? 'bg-blue-400 dark:bg-blue-300' : 'bg-blue-300 dark:bg-slate-500'}`}></span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleVisibleGeoCoverage(coverage.key, true);
                                      onSelectGeoBeam?.(coverage.key, contour.id);
                                    }}
                                    className={`text-left font-mono hover:underline ${isContourSelected
                                      ? 'text-blue-700 dark:text-blue-300 font-semibold'
                                      : isCoverageActive
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : 'text-gray-600 dark:text-gray-400'
                                    }`}
                                  >
                                    {contour.label}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No coverage areas defined</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default SatelliteDetails;
