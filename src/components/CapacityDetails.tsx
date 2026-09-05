import { useEffect, useState, useCallback, memo, type KeyboardEvent } from 'react';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import ExportButton from './ExportButton';
import DataProvenancePanel from './DataProvenancePanel';
import type { CandidateCoverage } from '../types/analysis';
import { useSimulation } from '../contexts/SimulationContext';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from '../utils/capacityLayer';
import type { LinkMode } from '../types/linkMode';
import type { TerminalRFClassId } from '../utils/geoTerminalRFModel';
import { useEngineeringAnalysisContext } from '../contexts/EngineeringAnalysisContext';

// ─── Extracted sub-components ─────────────────────────────────────────────────
import {
  AnalysisHeader,
  LEOConnectivitySection,
  GEOConnectivitySection,
} from './capacity';
import type { TerminalType, WeatherType } from './capacity';
import { formatNumber } from '../utils/formatters';
import { ConnectivityDot } from './capacity/shared/ConnectivityDot';

interface CapacityDetailsProps {
  satellites: SatelliteData[];
  selectedPoint: { lat: number; lng: number; altitude?: number } | null;
  onNavigateToLoc?: (lat: number, lng: number, height: number) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedGEOSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
  activeConnectionTab?: 'LEO' | 'GEO';
  onActiveConnectionTabChange?: (tab: 'LEO' | 'GEO') => void;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  candidateCoverages?: CandidateCoverage[];
  selectedCoverage?: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  onSelectUplinkCoverage?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverage?: (coverage: CandidateCoverage) => void;
  onSelectUplinkCoverageB?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverageB?: (coverage: CandidateCoverage) => void;
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
  leoTerminalType: TerminalType;
  onLeoTerminalTypeChange: (type: TerminalType) => void;
  onLeoTerminalModelIdChange?: (id: string) => void;
  leoTerminalTypeB?: TerminalType;
  onLeoTerminalTypeBChange?: (type: TerminalType) => void;
  onLeoTerminalModelIdBChange?: (id: string) => void;
  geoTerminalType: TerminalType;
  onGeoTerminalTypeChange: (type: TerminalType) => void;
  geoTerminalTypeB?: TerminalType;
  onGeoTerminalTypeBChange?: (type: TerminalType) => void;
  /** RF capability class for terminal A — drives computed EIRP/G/T in the link budget. */
  geoRFClassIdA?: TerminalRFClassId;
  onGeoRFClassIdAChange?: (id: TerminalRFClassId) => void;
  geoRFPresetDisplayLabelA?: string;
  /** RF capability class for terminal B — drives computed EIRP/G/T in the link budget. */
  geoRFClassIdB?: TerminalRFClassId;
  onGeoRFClassIdBChange?: (id: TerminalRFClassId) => void;
  geoRFPresetDisplayLabelB?: string;
  /** #4: per-endpoint GEO modem (MESH/P2P). null ⇒ RF is an estimated ceiling. */
  geoModemIdA?: import('../utils/geoModemCatalogue').GeoModemId | null;
  onGeoModemIdAChange?: (id: import('../utils/geoModemCatalogue').GeoModemId | null) => void;
  geoModemIdB?: import('../utils/geoModemCatalogue').GeoModemId | null;
  onGeoModemIdBChange?: (id: import('../utils/geoModemCatalogue').GeoModemId | null) => void;
  geoRFCustomParamsA?: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null;
  onGeoRFCustomParamsAChange?: (params: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null) => void;
  geoRFCustomParamsB?: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null;
  onGeoRFCustomParamsBChange?: (params: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  onWeatherTypeBChange?: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  /** Current link connectivity mode. */
  linkMode?: LinkMode;
  onLinkModeChange?: (mode: LinkMode) => void;
  /** Second geographic point for MESH / Point-to-Point modes. */
  pointB?: { lat: number; lng: number } | null;
  /** Coverage candidates at Point B (MESH / Point-to-Point only). */
  candidateCoveragesB?: CandidateCoverage[];
  pointAIsUserDefined?: boolean;
  pointBIsUserDefined?: boolean;
  /** Controlled MESH direction tab — lifted to App so the globe can reflect the active direction. */
  activeMeshTab?: 'forward' | 'reverse';
  onActiveMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  /** LEO topology mode — single site (default) or site-to-site. */
  leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  /** Second geographic point for LEO site-to-site mode. */
  pointBLeo?: { lat: number; lng: number } | null;
  /** Whether the user has armed the "click to place Point B (LEO)" action. */
  isPointBLeoArmed?: boolean;
  /** Called when the user wants to place Point B on the globe for LEO S2S. */
  onArmPointBLeo?: () => void;
  /** Called to toggle the LEO topology mode. */
  onLeoTopologyModeChange?: (mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => void;
  selectionMotionKey?: number;
}


// Performance optimization: Memoize component to prevent unnecessary re-renders
const CapacityDetails = memo<CapacityDetailsProps>(({ satellites, selectedPoint, selectedSatellite, satelliteScope, activeConnectionTab, onActiveConnectionTabChange, onSatelliteClick, analysisSource, aircraftCallsign, candidateCoverages = [], selectedCoverage = null, onSelectCoverage, selectedUplinkCoverage = null, selectedDownlinkCoverage = null, onSelectUplinkCoverage, onSelectDownlinkCoverage, onSelectUplinkCoverageB, onSelectDownlinkCoverageB, selectedGeoMission, selectedGeoCoverageName, selectedGeoBeamId, visibleGeoCoverageKeys, onSelectGeoMission, onSelectGeoCoverage, onSelectGeoBeam, onVisibleGeoCoverageKeysChange, onSnpClick, compactDesktop = false, externalHeader = false, leoTerminalType, onLeoTerminalTypeChange, onLeoTerminalModelIdChange, leoTerminalTypeB, onLeoTerminalTypeBChange, onLeoTerminalModelIdBChange, geoTerminalType, onGeoTerminalTypeChange, geoTerminalTypeB, onGeoTerminalTypeBChange, geoRFClassIdA, onGeoRFClassIdAChange, geoRFPresetDisplayLabelA, geoRFClassIdB, onGeoRFClassIdBChange, geoRFPresetDisplayLabelB, geoModemIdA, onGeoModemIdAChange, geoModemIdB, onGeoModemIdBChange, geoRFCustomParamsA, onGeoRFCustomParamsAChange, geoRFCustomParamsB, onGeoRFCustomParamsBChange, weatherType, onWeatherTypeChange, autoWeatherEnabled, onAutoWeatherChange, linkMode = 'STAR_FORWARD', onLinkModeChange, pointB = null, candidateCoveragesB = [], pointAIsUserDefined = false, pointBIsUserDefined = false, activeMeshTab, onActiveMeshTabChange,
  leoTopologyMode = 'SINGLE_SITE',
  pointBLeo = null,
  isPointBLeoArmed = false,
  onArmPointBLeo,
  onLeoTopologyModeChange,
  selectionMotionKey,
}) => {
  const [selectionRevealActive, setSelectionRevealActive] = useState(false);

  useEffect(() => {
    if (!selectionMotionKey) return;
    setSelectionRevealActive(true);
    const timeout = window.setTimeout(() => setSelectionRevealActive(false), 360);
    return () => window.clearTimeout(timeout);
  }, [selectionMotionKey]);

  // Feature 1+3: read simulation context for failedSnps, hsBeamsSet
  const {
    failedSnps,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition: ctxWeather,
  } = useSimulation();

  const [internalActiveConnTab, setInternalActiveConnTab] = useState<'LEO' | 'GEO'>(
    satelliteScope === 'GEO' ? 'GEO' : 'LEO'
  );
  const activeConnTab = activeConnectionTab ?? internalActiveConnTab;
  const setActiveConnTab = useCallback((tab: 'LEO' | 'GEO') => {
    setInternalActiveConnTab(tab);
    onActiveConnectionTabChange?.(tab);
  }, [onActiveConnectionTabChange]);
  const showLeoConnectivity = satelliteScope === 'LEO' || (satelliteScope === 'ALL' && activeConnTab === 'LEO');
  const showGeoConnectivity = satelliteScope === 'GEO' || (satelliteScope === 'ALL' && activeConnTab === 'GEO');
  const handleTechnologyTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveConnTab(activeConnTab === 'LEO' ? 'GEO' : 'LEO');
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveConnTab('LEO');
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveConnTab('GEO');
    }
  }, [activeConnTab, setActiveConnTab]);
  // Sync active tab when scope changes
  useEffect(() => {
    if (satelliteScope === 'LEO') setActiveConnTab('LEO');
    else if (satelliteScope === 'GEO') setActiveConnTab('GEO');
  }, [satelliteScope, setActiveConnTab]);

  // ── M2: all engineering derivations come from the shared analysis engine,
  // computed once in App and distributed through EngineeringAnalysisContext.
  const {
    selectedLeoTerminalProfile,
    selectedLeoTerminalProfileB,
    calculateGEOPerformance,
    resolvedLEOConnectivity,
    leoGeometry,
    regulatoryResult,
    beamLoadResult,
    serviceLayerResult,
    leoServiceViewModel,
    leoPerformance,
    leoSiteToSiteResult,
    resolvedGEOConnectivity,
    geoGeometry,
    trafficGatewaySelection,
    dualSegmentResult,
    uplinkAtB,
    downlinkAtB,
    validSatelliteIds,
    selectedSNP,
    nearestLocation,
    detailHeaderRouteSummary,
    mobileLeoMetrics,
    engineeringAnalysisViewModels,
    activeEngineeringTruth,
    exportButtonPayload,
    realTimeData,
  } = useEngineeringAnalysisContext();

  const activePoint = selectedPoint;


  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!selectedPoint && !selectedSatellite) {
    return (
      <div className="capacity-details-surface flex h-full flex-col rounded-lg border border-gray-100 bg-white p-5 shadow-lg transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
        <div className="max-w-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Analysis standby
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Build a satellite connection profile
          </h2>
          <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
            Choose a position on the globe to resolve coverage, capacity, RF conditions and service constraints.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Origin
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Click the globe
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Location, weather, regulatory and link-budget context appear here.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Path
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Add a destination when needed
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Shift-click to evaluate site-to-site connectivity and direction-dependent budgets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Output
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Compare GEO and LEO service paths
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Review throughput, latency, bottlenecks, RF availability and satellite evidence.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedSatellite) {
    return (
      <SatelliteDetails
        satellites={satellites}
        selectedSatellite={selectedSatellite}
        selectedGeoMission={selectedGeoMission}
        selectedGeoCoverageName={selectedGeoCoverageName}
        selectedGeoBeamId={selectedGeoBeamId}
        visibleGeoCoverageKeys={visibleGeoCoverageKeys}
        onSelectGeoMission={onSelectGeoMission}
        onSelectGeoCoverage={onSelectGeoCoverage}
        onSelectGeoBeam={onSelectGeoBeam}
        onVisibleGeoCoverageKeysChange={onVisibleGeoCoverageKeysChange}
        onSnpClick={onSnpClick}
        compactDesktop={compactDesktop}
        externalHeader={externalHeader}
        activePoint={activePoint}
        targetRegulatoryResult={regulatoryResult as RegulatoryResult | null}
        targetBeamLoadResult={beamLoadResult as BeamLoadResult | null}
      />
    );
  }

  // ─── Main analysis view (USER_LOCATION_SELECTED) ───────────────────────────

  return (
    <div className={['capacity-details-surface h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300', selectionRevealActive ? 'endpoint-selection-panel-reveal' : ''].join(' ')}>
      <div className={`engineering-details-layout flex h-full flex-col ${satelliteScope === 'ALL' ? (compactDesktop ? 'px-1 py-2.5' : 'px-1.5 py-3') : (compactDesktop ? 'p-2.5' : 'p-3')}`}>
        {/* Section 1: Header */}
        {!externalHeader && (
          <AnalysisHeader
            activePoint={activePoint}
            selectedSNP={selectedSNP}
            analysisSource={analysisSource}
            aircraftCallsign={aircraftCallsign}
            nearestLocation={nearestLocation}
            routeSummary={detailHeaderRouteSummary}
            compact={compactDesktop}
          />
        )}

        <div className="engineering-details-scroll flex-1 min-h-0 overflow-y-auto">
          {/* Section 2: Constellation-based Connectivity */}
          {(satelliteScope === 'LEO' || satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="engineering-technology-frame mb-4">
              <div className={satelliteScope === 'ALL'
                ? `relative overflow-hidden rounded-xl border border-transparent bg-transparent transition-colors duration-300 after:pointer-events-none after:absolute after:inset-y-2 after:left-0 after:z-10 after:w-[2px] after:rounded-full after:content-[''] ${activeConnTab === 'LEO' ? 'after:bg-pink-500/45 dark:after:bg-pink-400/40' : 'after:bg-blue-500/45 dark:after:bg-blue-400/40'}`
                : undefined}
              >
                {/* Technology focus selector (only when scope is ALL) */}
                {satelliteScope === 'ALL' && !externalHeader && (
                  <div
                    role="group"
                    aria-label="Focused analysis technology"
                    className="flex items-end gap-px border-b border-slate-200 bg-slate-100 px-0 pt-1 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <button
                      id="technology-tab-leo"
                      type="button"
                      aria-pressed={activeConnTab === 'LEO'}
                      onClick={() => setActiveConnTab('LEO')}
                      onKeyDown={handleTechnologyTabKeyDown}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg border border-b-0 font-semibold transition-all duration-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'LEO' ? 'relative -mb-px border-pink-500 bg-pink-500 text-white' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}
                    >
                      <ConnectivityDot
                        state={resolvedLEOConnectivity?.snp ? 'ready' : resolvedLEOConnectivity ? 'partial' : 'none'}
                        technology="LEO"
                      />
                      <span>LEO</span>
                    </button>
                    <button
                      id="technology-tab-geo"
                      type="button"
                      aria-pressed={activeConnTab === 'GEO'}
                      onClick={() => setActiveConnTab('GEO')}
                      onKeyDown={handleTechnologyTabKeyDown}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg border border-b-0 font-semibold transition-all duration-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'GEO' ? 'relative -mb-px border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}
                    >
                      <ConnectivityDot
                        state={resolvedGEOConnectivity ? 'ready' : 'none'}
                        technology="GEO"
                      />
                      <span>GEO</span>
                    </button>
                  </div>
                )}

                <div
                  className={satelliteScope === 'ALL' ? `engineering-technology-workspace ${compactDesktop ? 'gap-2 p-1.5' : 'gap-3 p-2'} flex flex-col bg-transparent transition-colors duration-300` : undefined}
                >

              {/* LEO Connectivity */}
              {showLeoConnectivity && (
                <div className={satelliteScope === 'ALL' ? (activeConnTab === 'LEO' ? 'order-1' : 'order-2') : undefined}>
                  {/* ── Site-to-Site mode ──────────────────────────────────── */}
                  {leoTopologyMode === 'SITE_TO_SITE' && (
                <LEOConnectivitySection
                  engineeringAnalysisViewModel={engineeringAnalysisViewModels.LEO}
                  resolvedLEOConnectivity={resolvedLEOConnectivity}
                  leoGeometry={leoGeometry}
                  leoPerformance={leoPerformance}
                  mobileLeoMetrics={mobileLeoMetrics}
                  activePoint={activePoint}
                  terminalType={leoTerminalType}
                  onTerminalTypeChange={onLeoTerminalTypeChange}
                  terminalModelId={selectedLeoTerminalProfile.id}
                  onTerminalModelIdChange={onLeoTerminalModelIdChange}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  aircraftCallsign={aircraftCallsign}
                  onSatelliteClick={onSatelliteClick}
                  failedSnps={failedSnps}
                  hsBeamsSet={hsBeamsSet}
                  weatherCondition={ctxWeather}
                  beamHealthFactors={beamHealthFactors}
                  regulatoryResult={regulatoryResult}
                  beamLoadResult={beamLoadResult}
                  serviceLayerResult={serviceLayerResult}
                  leoServiceViewModel={leoServiceViewModel}
                  leoTopologyMode={leoTopologyMode}
                  onLeoTopologyModeChange={onLeoTopologyModeChange}
                  siteToSiteResult={leoSiteToSiteResult}
                  pointBLeo={pointBLeo}
                  onArmPointBLeo={onArmPointBLeo}
                  isPointBLeoArmed={isPointBLeoArmed}
                  activeMeshTab={activeMeshTab}
                  onActiveMeshTabChange={onActiveMeshTabChange}
                  terminalTypeB={leoTerminalTypeB ?? leoTerminalType}
                  onTerminalTypeBChange={onLeoTerminalTypeBChange}
                  terminalModelIdB={selectedLeoTerminalProfileB.id}
                  onTerminalModelIdBChange={onLeoTerminalModelIdBChange}
                />
                  )}

                  {/* ── Single-site mode ───────────────────────────────────── */}
                  {leoTopologyMode === 'SINGLE_SITE' && (
                <LEOConnectivitySection
                  engineeringAnalysisViewModel={engineeringAnalysisViewModels.LEO}
                  resolvedLEOConnectivity={resolvedLEOConnectivity}
                  leoGeometry={leoGeometry}
                  leoPerformance={leoPerformance}
                  mobileLeoMetrics={mobileLeoMetrics}
                  activePoint={activePoint}
                  terminalType={leoTerminalType}
                  onTerminalTypeChange={onLeoTerminalTypeChange}
                  terminalModelId={selectedLeoTerminalProfile.id}
                  onTerminalModelIdChange={onLeoTerminalModelIdChange}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  aircraftCallsign={aircraftCallsign}
                  onSatelliteClick={onSatelliteClick}
                  failedSnps={failedSnps}
                  hsBeamsSet={hsBeamsSet}
                  weatherCondition={ctxWeather}
                  beamHealthFactors={beamHealthFactors}
                  regulatoryResult={regulatoryResult}
                  beamLoadResult={beamLoadResult}
                  serviceLayerResult={serviceLayerResult}
                  leoServiceViewModel={leoServiceViewModel}
                  leoTopologyMode={leoTopologyMode}
                  onLeoTopologyModeChange={onLeoTopologyModeChange}
                />
                  )}
                </div>
              )}

              {/* GEO Connectivity */}
              {showGeoConnectivity && (
                <div className={satelliteScope === 'ALL' ? (activeConnTab === 'GEO' ? 'order-1' : 'order-2') : undefined}>
                  <GEOConnectivitySection
                    engineeringAnalysisViewModel={engineeringAnalysisViewModels.GEO}
                    resolvedGEOConnectivity={resolvedGEOConnectivity}
                    geoGeometry={geoGeometry}
                    calculateGEOPerformance={calculateGEOPerformance}
                    terminalType={geoTerminalType}
                    onTerminalTypeChange={onGeoTerminalTypeChange}
                    rfClassIdA={geoRFClassIdA}
                    onRFClassIdAChange={onGeoRFClassIdAChange}
                    rfPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                    rfClassIdB={geoRFClassIdB}
                    onRFClassIdBChange={onGeoRFClassIdBChange}
                    rfPresetDisplayLabelB={geoRFPresetDisplayLabelB}
                    modemIdA={geoModemIdA}
                    onModemIdAChange={onGeoModemIdAChange}
                    modemIdB={geoModemIdB}
                    onModemIdBChange={onGeoModemIdBChange}
                    rfCustomParamsA={geoRFCustomParamsA}
                    onRFCustomParamsAChange={onGeoRFCustomParamsAChange}
                    rfCustomParamsB={geoRFCustomParamsB}
                    onRFCustomParamsBChange={onGeoRFCustomParamsBChange}
                    weatherType={weatherType}
                    onWeatherTypeChange={onWeatherTypeChange}
                    autoWeatherEnabled={autoWeatherEnabled}
                    onAutoWeatherChange={onAutoWeatherChange}
                    candidateCoverages={candidateCoverages}
                    bestCoverage={candidateCoverages[0] ?? null}
                    selectedCoverage={selectedCoverage}
                    onSelectCoverage={onSelectCoverage}
                    selectedUplinkCoverage={selectedUplinkCoverage}
                    selectedDownlinkCoverage={selectedDownlinkCoverage}
                    onSelectUplinkCoverage={onSelectUplinkCoverage}
                    onSelectDownlinkCoverage={onSelectDownlinkCoverage}
                    activePoint={activePoint}
                    analysisSource={analysisSource}
                    aircraftCallsign={aircraftCallsign}
                    onSatelliteClick={onSatelliteClick}
                    linkMode={linkMode}
                    onLinkModeChange={onLinkModeChange}
                    dualSegmentResult={dualSegmentResult}
                    starTrafficGatewaySelection={trafficGatewaySelection}
                    pointB={pointB}
                    terminalTypeB={geoTerminalTypeB}
                    onTerminalTypeBChange={onGeoTerminalTypeBChange}
                    pointAIsUserDefined={pointAIsUserDefined}
                    pointBIsUserDefined={pointBIsUserDefined}
                    candidateCoveragesB={candidateCoveragesB}
                    uplinkCoverageAtB={uplinkAtB}
                    downlinkCoverageAtB={downlinkAtB}
                    onSelectUplinkCoverageB={onSelectUplinkCoverageB}
                    onSelectDownlinkCoverageB={onSelectDownlinkCoverageB}
                    activeMeshTab={activeMeshTab}
                    onActiveMeshTabChange={onActiveMeshTabChange}
                    validSatelliteIds={validSatelliteIds}
                  />
                </div>
              )}
                </div>
              </div>
            </div>
          )}

          {/* Export the same canonical result shown above. */}
          {exportButtonPayload && activeEngineeringTruth
            && activeEngineeringTruth.state !== 'incomplete'
            && activeEngineeringTruth.state !== 'path-unavailable'
            && activeEngineeringTruth.state !== 'budget-unavailable' && (
            <div className="mb-3 space-y-2">
              {/* Same canonical provenance model the exported PDF renders. */}
              <DataProvenancePanel model={exportButtonPayload.dataProvenance} />
              <ExportButton {...exportButtonPayload} />
            </div>
          )}

          {/* Section 5: Footer Statistics */}
          {selectedPoint && (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2 space-y-1">
              <div>
                {realTimeData.leoCapacityIsTerminalPeak
                  ? `Est. terminal peak: ${(realTimeData.totalCapacity * 1000).toFixed(0)} Mbps (sim.) · `
                  : `Nominal capacity: ${formatNumber(realTimeData.totalCapacity)} Gbps · `}
                {realTimeData.coveredSatellites.length} {satelliteScope === 'ALL' ? 'satellites' : satelliteScope.toLowerCase()} in coverage
              </div>
              {analysisSource === 'aircraft' && aircraftCallsign && (
                <div className="text-blue-600 font-medium">
                  Analysis source: Aircraft {aircraftCallsign}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}); // End of memo component

export default CapacityDetails;
