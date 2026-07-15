import { ArrowLeft, Check, CircleDashed, Search, X } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { CandidateCoverage } from '../../types/analysis';
import type {
  EngineeringConfigureCandidates,
  EngineeringConfigureDraft,
  EngineeringConfigureLocation,
  EngineeringConfigureSite,
} from '../../types/engineeringConfigure';
import type { EngineeringTruth } from '../../utils/engineeringAnalysisViewModel';
import { useEngineeringConfigureDraft } from '../../hooks/useEngineeringConfigureDraft';
import {
  getEngineeringGeoManualSelectionKeys,
  getPublishedEngineeringGeoPath,
  isEngineeringConfigureDraftComplete,
} from '../../utils/engineeringConfigureModel';
import { getCandidateCoverageDisplayName, getCandidateCoverageKey } from '../../utils/geoCoverageSelection';
import { getLeoTerminalProfile } from '../../config/leoTerminals';
import { useLocationSearch, type LocationResult } from '../../hooks/useLocationSearch';
import InlineLocationSearchInput from '../commercial/InlineLocationSearchInput';
import InlineSearchResultsPopover from '../commercial/InlineSearchResultsPopover';
import LinkModeSelector from './LinkModeSelector';
import TerminalConfig, { getDefaultRFClassForUseCase, type TerminalType } from './TerminalConfig';
import { handleRadioGroupKeyDown } from './shared/radioGroupKeyboard';

const STAGE_LABELS = {
  scenario: 'Scenario',
  path: 'Path',
  rf: 'RF closure',
  service: 'Service gates',
  delivery: 'Delivery',
} as const;

function truthMetricSummary(truth: EngineeringTruth | undefined): string {
  if (!truth) return 'No result published';
  const metrics = truth.primaryMetrics.map((metric) => metric.display).join(' · ');
  return [truth.headline, metrics].filter(Boolean).join(' · ');
}

function DraftLocationField({
  label,
  location,
  required,
  onChange,
}: {
  label: string;
  location: EngineeringConfigureLocation | null;
  required?: boolean;
  onChange: (location: EngineeringConfigureLocation | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { results, isLoading, error, clear } = useLocationSearch(query.trim());

  const select = (result: LocationResult) => {
    onChange({ label: result.name, lat: result.lat, lng: result.lng });
    setQuery('');
    setActiveIndex(0);
    clear();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('');
      clear();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => results.length ? (index + 1) % results.length : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => results.length ? (index - 1 + results.length) % results.length : 0);
    } else if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      select(results[activeIndex]);
    }
  };

  return (
    <div ref={wrapperRef} className="relative rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950/60">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {location?.label ?? (required ? 'Required' : 'Not set')}
          </div>
          {location && (
            <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
              {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
            </div>
          )}
        </div>
        {location && !required && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            aria-label={`Clear ${label}`}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <InlineLocationSearchInput
          roleLabel={label}
          value={query}
          placeholder={location ? `Change ${label}` : `Set ${label}`}
          onChange={(value) => { setQuery(value); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
        />
        {query.trim() && (
          <InlineSearchResultsPopover
            activeIndex={activeIndex}
            error={error}
            isLoading={isLoading}
            query={query}
            results={results}
            onActiveIndexChange={setActiveIndex}
            onSelect={select}
          />
        )}
      </div>
    </div>
  );
}

function CandidateSelect({
  label,
  candidates,
  uplink,
  selectedKey,
  onChange,
}: {
  label: string;
  candidates: CandidateCoverage[];
  uplink: boolean;
  selectedKey: string | null;
  onChange: (key: string | null) => void;
}) {
  const options = candidates.filter((candidate) => candidate.isUplink === uplink && !candidate.isSynthesized);
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={selectedKey ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">Best eligible candidate</option>
        {options.map((candidate) => {
          const key = getCandidateCoverageKey(candidate);
          return (
            <option key={key} value={key}>
              {getCandidateCoverageDisplayName(candidate)} · {candidate.linkMarginDb?.toFixed(1) ?? '—'} dB
            </option>
          );
        })}
      </select>
    </label>
  );
}

function candidatePathLabel(candidate: CandidateCoverage): string {
  return getCandidateCoverageDisplayName(candidate);
}

function ResolvedAutoPath({
  baseline,
  candidates,
}: {
  baseline: EngineeringConfigureDraft;
  candidates: EngineeringConfigureCandidates;
}) {
  const publishedPath = getPublishedEngineeringGeoPath(
    { ...baseline, selectionPolicy: 'auto' },
    candidates,
  );
  if (publishedPath.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Published auto-selected path</div>
      <div className="mt-1 text-xs font-semibold leading-5 text-slate-800 dark:text-slate-100">
        {publishedPath.map(candidatePathLabel).join(' → ')}
      </div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">Read-only until Manual selection is chosen.</p>
    </div>
  );
}

function updateSiteTerminalType(
  site: EngineeringConfigureSite,
  terminalType: TerminalType,
): EngineeringConfigureSite {
  return {
    ...site,
    geoTerminalType: terminalType,
    geoRFClassId: getDefaultRFClassForUseCase(terminalType),
    geoRFCustomParams: null,
  };
}

export interface EngineeringConfigurePanelProps {
  baseline: EngineeringConfigureDraft;
  truths: Partial<Record<'GEO' | 'LEO', EngineeringTruth>>;
  candidates: EngineeringConfigureCandidates;
  applying?: boolean;
  showPublishedResultSummary?: boolean;
  returnLabel?: string;
  onCancel: () => void;
  onApply: (draft: EngineeringConfigureDraft) => void;
}

export default function EngineeringConfigurePanel({
  baseline,
  truths,
  candidates,
  applying = false,
  showPublishedResultSummary = true,
  returnLabel = 'Result',
  onCancel,
  onApply,
}: EngineeringConfigurePanelProps) {
  const { draft, setDraft, changes, affectedStages, discard } = useEngineeringConfigureDraft(baseline);
  const isGeo = draft.technology === 'GEO';
  const isSiteToSite = isGeo
    ? draft.geoLinkMode === 'MESH' || draft.geoLinkMode === 'POINT_TO_POINT'
    : draft.leoTopologyMode === 'SITE_TO_SITE';
  const canApply = changes.length > 0
    && isEngineeringConfigureDraftComplete(draft);
  const activeTruth = truths[draft.technology];
  const activeManualSelectors = isGeo && draft.selectionPolicy === 'manual'
    ? draft.geoLinkMode === 'STAR_FORWARD'
      ? [{ label: 'Site A downlink', site: 'siteA' as const, uplink: false, key: 'geoDownlinkKeyA' as const }]
      : draft.geoLinkMode === 'STAR_RETURN'
        ? [{ label: 'Site A uplink', site: 'siteA' as const, uplink: true, key: 'geoUplinkKeyA' as const }]
        : draft.direction === 'forward'
          ? [
              { label: 'Site A uplink', site: 'siteA' as const, uplink: true, key: 'geoUplinkKeyA' as const },
              { label: 'Site B downlink', site: 'siteB' as const, uplink: false, key: 'geoDownlinkKeyB' as const },
            ]
          : [
              { label: 'Site B uplink', site: 'siteB' as const, uplink: true, key: 'geoUplinkKeyB' as const },
              { label: 'Site A downlink', site: 'siteA' as const, uplink: false, key: 'geoDownlinkKeyA' as const },
            ]
    : [];

  const updateSite = (key: 'siteA' | 'siteB', update: Partial<EngineeringConfigureSite>) => {
    setDraft((current) => ({ ...current, [key]: { ...current[key], ...update } }));
  };

  const setSelectionPolicy = (selectionPolicy: EngineeringConfigureDraft['selectionPolicy']) => {
    setDraft((current) => ({
      ...current,
      selectionPolicy,
      ...(selectionPolicy === 'auto' ? {
        geoUplinkKeyA: null,
        geoDownlinkKeyA: null,
        geoUplinkKeyB: null,
        geoDownlinkKeyB: null,
      } : {
        ...getEngineeringGeoManualSelectionKeys(current, candidates),
      }),
    }));
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-50/55 dark:bg-slate-950" aria-label="Configure engineering scenario">
      <header className="shrink-0 border-b border-slate-200/80 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-300">Configure</div>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-950 dark:text-white">Engineering scenario</h2>
          </div>
          <button
            type="button"
            onClick={() => { discard(); onCancel(); }}
            disabled={applying}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            {returnLabel}
          </button>
        </div>
        {showPublishedResultSummary && (
          <div className="mt-2.5 rounded-lg border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/45">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Published baseline · Engineering Truth</div>
            <div className="mt-1 text-xs font-semibold leading-5 text-slate-800 dark:text-slate-100">{truthMetricSummary(activeTruth)}</div>
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Technology & path</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900" role="radiogroup" aria-label="Engineering technology focus" onKeyDown={handleRadioGroupKeyDown}>
              {(['GEO', 'LEO'] as const).map((technology) => (
                <button
                  key={technology}
                  type="button"
                  onClick={() => setDraft((current) => ({ ...current, technology }))}
                  role="radio"
                  aria-checked={draft.technology === technology}
                  tabIndex={draft.technology === technology ? 0 : -1}
                  className={`h-10 rounded-lg text-sm font-bold transition-colors ${draft.technology === technology ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950' : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                >
                  {technology}
                </button>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/25">
              {isGeo ? (
                <LinkModeSelector
                  linkMode={draft.geoLinkMode}
                  onChange={(geoLinkMode) => setDraft((current) => ({ ...current, geoLinkMode }))}
                />
              ) : (
                <div>
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">LEO topology</div>
                  <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="LEO topology" onKeyDown={handleRadioGroupKeyDown}>
                    {(['SINGLE_SITE', 'SITE_TO_SITE'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, leoTopologyMode: mode }))}
                        role="radio"
                        aria-checked={draft.leoTopologyMode === mode}
                        tabIndex={draft.leoTopologyMode === mode ? 0 : -1}
                        className={`min-h-10 rounded-lg px-2 text-xs font-semibold ${draft.leoTopologyMode === mode ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                      >
                        {mode === 'SINGLE_SITE' ? 'Single Site' : 'Site-to-Site'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isSiteToSite && (
                <div className="mt-3">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Active direction</div>
                  <div className="grid grid-cols-2 gap-1" role="radiogroup" aria-label="Active engineering direction" onKeyDown={handleRadioGroupKeyDown}>
                    {(['forward', 'reverse'] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        onClick={() => setDraft((current) => ({ ...current, direction }))}
                        role="radio"
                        aria-checked={draft.direction === direction}
                        tabIndex={draft.direction === direction ? 0 : -1}
                        className={`h-9 rounded-lg text-xs font-semibold ${draft.direction === direction ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                      >
                        {direction === 'forward' ? 'Site A → Site B' : 'Site B → Site A'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Endpoints</legend>
            <div className="grid gap-3">
              <DraftLocationField
                label="Site A"
                location={draft.siteA.location}
                required
                onChange={(location) => updateSite('siteA', { location })}
              />
              <DraftLocationField
                label="Site B"
                location={draft.siteB.location}
                required={isSiteToSite}
                onChange={(location) => updateSite('siteB', { location })}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Terminal & weather assumptions</legend>
            <div className="grid gap-3">
              {(['siteA', ...(isSiteToSite ? ['siteB'] : [])] as Array<'siteA' | 'siteB'>).map((key) => {
                const site = draft[key];
                return (
                  <TerminalConfig
                    key={`${draft.technology}:${key}`}
                    terminalType={isGeo ? site.geoTerminalType : site.leoTerminalType}
                    onTerminalTypeChange={(terminalType) => {
                      if (isGeo) {
                        setDraft((current) => ({ ...current, [key]: updateSiteTerminalType(current[key], terminalType) }));
                      } else {
                        updateSite(key, {
                          leoTerminalType: terminalType,
                          leoTerminalModelId: getLeoTerminalProfile(terminalType).id,
                        });
                      }
                    }}
                    rfClassId={site.geoRFClassId}
                    onRFClassChange={isGeo ? (geoRFClassId) => updateSite(key, { geoRFClassId, geoRFCustomParams: null }) : undefined}
                    rfCustomParams={site.geoRFCustomParams}
                    onRFCustomParamsChange={isGeo ? (geoRFCustomParams) => updateSite(key, { geoRFCustomParams }) : undefined}
                    leoTerminalModelId={site.leoTerminalModelId}
                    onLeoTerminalModelIdChange={!isGeo ? (leoTerminalModelId) => updateSite(key, { leoTerminalModelId }) : undefined}
                    showLeoTerminalModelSelector={!isGeo}
                    showRFClass={isGeo}
                    weatherType={site.weatherType}
                    onWeatherTypeChange={(weatherType) => updateSite(key, { weatherType, autoWeatherEnabled: false })}
                    autoWeatherEnabled={site.autoWeatherEnabled}
                    onAutoWeatherChange={(autoWeatherEnabled) => updateSite(key, { autoWeatherEnabled })}
                    compact
                    stacked
                    title={key === 'siteA' ? 'Site A' : 'Site B'}
                    subtitle={site.location?.label ?? 'Location not set'}
                    className="mb-0"
                  />
                );
              })}
            </div>
          </fieldset>

          {isGeo && (
            <fieldset>
              <legend className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Path selection</legend>
              <div className="rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/25">
                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-900" role="radiogroup" aria-label="GEO path selection policy" onKeyDown={handleRadioGroupKeyDown}>
                  {(['auto', 'manual'] as const).map((selectionPolicy) => (
                    <button
                      key={selectionPolicy}
                      type="button"
                      onClick={() => setSelectionPolicy(selectionPolicy)}
                      role="radio"
                      aria-checked={draft.selectionPolicy === selectionPolicy}
                      tabIndex={draft.selectionPolicy === selectionPolicy ? 0 : -1}
                      className={`h-9 rounded-md text-xs font-semibold ${draft.selectionPolicy === selectionPolicy ? 'bg-violet-600 text-white' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                      {selectionPolicy === 'auto' ? 'Automatic' : 'Manual'}
                    </button>
                  ))}
                </div>

                {draft.selectionPolicy === 'auto' ? (
                  <>
                    <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      The existing route engine will continue to select the highest-valid eligible end-to-end path.
                    </p>
                    <ResolvedAutoPath baseline={baseline} candidates={candidates} />
                  </>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {activeManualSelectors.map((selector) => (
                      <CandidateSelect
                        key={selector.key}
                        label={selector.label}
                        candidates={candidates[selector.site]}
                        uplink={selector.uplink}
                        selectedKey={draft[selector.key]}
                        onChange={(key) => setDraft((current) => ({ ...current, [selector.key]: key }))}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => setSelectionPolicy('auto')}
                      className="h-9 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 dark:border-violet-800 dark:bg-violet-950/25 dark:text-violet-200 dark:hover:bg-violet-900/40"
                    >
                      Return to Automatic selection
                    </button>
                    <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                      Returning to Automatic clears the staged satellite and beam overrides. The existing route engine selects the path after Apply.
                    </p>
                  </div>
                )}
              </div>
            </fieldset>
          )}

          <section aria-label="Pending scenario changes" className="rounded-xl border border-sky-200/80 bg-sky-50/45 p-3 dark:border-sky-900/80 dark:bg-sky-950/12">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">Pending scenario changes</div>
            {changes.length === 0 ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">No pending changes.</p>
            ) : (
              <>
                <ul className="mt-2 space-y-1.5">
                  {changes.map((change) => (
                    <li key={`${change.label}:${change.after}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{change.label}</span>
                      <span className="max-w-[12rem] truncate text-right text-slate-500 dark:text-slate-400" title={`${change.before} → ${change.after}`}>{change.before} → {change.after}</span>
                    </li>
                  ))}
                </ul>
                {affectedStages.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Expected affected engineering stages">
                    {affectedStages.map((stage) => (
                      <span key={stage} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2 py-1 text-[10px] font-semibold text-sky-800 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-200">
                        <CircleDashed className="h-3 w-3" />
                        {STAGE_LABELS[stage]}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[10px] leading-4 text-slate-500 dark:text-slate-400">No speculative performance is shown. Apply publishes only the recalculated Engineering Truth.</p>
              </>
            )}
          </section>
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-200/80 bg-white/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/95">
        <div className="grid grid-cols-[0.8fr_1.2fr] gap-2">
          <button
            type="button"
            onClick={() => { discard(); onCancel(); }}
            disabled={applying}
            className="h-11 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            disabled={!canApply || applying}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
          >
            {applying ? <CircleDashed className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {applying ? 'Recalculating…' : 'Apply and recalculate'}
          </button>
        </div>
      </footer>
    </section>
  );
}
