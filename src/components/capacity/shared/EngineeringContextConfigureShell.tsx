import { Settings2 } from 'lucide-react';
import type {
  EngineeringConfigureCandidates,
  EngineeringConfigureDraft,
  EngineeringConfigureTechnology,
} from '../../../types/engineeringConfigure';
import { LINK_MODE_LABELS } from '../../../types/linkMode';
import { getPublishedEngineeringGeoPath } from '../../../utils/engineeringConfigureModel';

interface EngineeringContextConfigureShellProps {
  technology: EngineeringConfigureTechnology;
  baseline: EngineeringConfigureDraft;
  candidates: EngineeringConfigureCandidates;
  onConfigure: () => void;
}

const weatherLabel = (weather: EngineeringConfigureDraft['siteA']['weatherType']) => (
  weather.replaceAll('_', ' ')
);

const terminalLabel = (
  technology: EngineeringConfigureTechnology,
  site: EngineeringConfigureDraft['siteA'],
) => technology === 'GEO'
  ? `${site.geoTerminalType} · ${site.geoRFClassId.replaceAll('_', ' ')}`
  : `${site.leoTerminalType} · ${site.leoTerminalModelId}`;

const candidateLabel = (candidate: ReturnType<typeof getPublishedEngineeringGeoPath>[number]) => (
  `${candidate.satelliteName} · ${candidate.beamName || candidate.beamId || candidate.coverageName}`
);

const topologyLabel = (
  technology: EngineeringConfigureTechnology,
  baseline: EngineeringConfigureDraft,
) => technology === 'GEO'
  ? LINK_MODE_LABELS[baseline.geoLinkMode]
  : baseline.leoTopologyMode === 'SITE_TO_SITE' ? 'Site-to-Site' : 'Single Site';

const isSiteToSite = (
  technology: EngineeringConfigureTechnology,
  baseline: EngineeringConfigureDraft,
) => technology === 'GEO'
  ? baseline.geoLinkMode === 'MESH' || baseline.geoLinkMode === 'POINT_TO_POINT'
  : baseline.leoTopologyMode === 'SITE_TO_SITE';

/** Shared Phase 3 published context. Editing remains owned by Configure. */
export default function EngineeringContextConfigureShell({
  technology,
  baseline,
  candidates,
  onConfigure,
}: EngineeringContextConfigureShellProps) {
  const siteToSite = isSiteToSite(technology, baseline);
  const publishedPath = technology === 'GEO'
    ? getPublishedEngineeringGeoPath(baseline, candidates)
    : [];
  const direction = baseline.direction === 'reverse' ? 'Site B → Site A' : 'Site A → Site B';
  const selectionMode = baseline.selectionPolicy === 'manual' ? 'Manual override' : 'Automatic';

  return (
    <section
      className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950"
      aria-label={`${technology} context and configuration`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Context &amp; Configure</div>
          <h3 className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{technology} engineering scenario</h3>
          <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            Published inputs and path policy. Configure stages changes before recalculation.
          </p>
        </div>
        <button
          type="button"
          onClick={onConfigure}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-700 dark:hover:bg-sky-950/35 dark:hover:text-sky-200"
          aria-label={`Configure ${technology} engineering scenario`}
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
          Configure
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 py-3 text-xs">
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Analysis focus</dt>
          <dd className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100">{technology}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Topology</dt>
          <dd className="mt-0.5 truncate font-semibold text-slate-800 dark:text-slate-100">{topologyLabel(technology, baseline)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Site A</dt>
          <dd className="mt-0.5 truncate font-semibold text-slate-800 dark:text-slate-100">{baseline.siteA.location?.label ?? 'Not set'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{siteToSite ? 'Direction' : 'Weather'}</dt>
          <dd className="mt-0.5 truncate font-semibold capitalize text-slate-800 dark:text-slate-100">
            {siteToSite ? direction : `${weatherLabel(baseline.siteA.weatherType)} · ${baseline.siteA.autoWeatherEnabled ? 'Current' : 'Manual'}`}
          </dd>
        </div>
        {siteToSite && (
          <div className="min-w-0">
            <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Site B</dt>
            <dd className="mt-0.5 truncate font-semibold text-slate-800 dark:text-slate-100">{baseline.siteB.location?.label ?? 'Required'}</dd>
          </div>
        )}
        <div className="min-w-0">
          <dt className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Terminal assumptions</dt>
          <dd className="mt-0.5 truncate font-semibold capitalize text-slate-800 dark:text-slate-100" title={terminalLabel(technology, baseline.siteA)}>
            {terminalLabel(technology, baseline.siteA)}
          </dd>
        </div>
      </dl>

      {technology === 'GEO' && (
        <div className="border-t border-slate-200 bg-violet-50/35 px-3.5 py-3 dark:border-slate-800 dark:bg-violet-950/10" aria-label="GEO path selection">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Path Selection</div>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${baseline.selectionPolicy === 'manual' ? 'border-violet-300 bg-violet-100 text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200' : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
              {selectionMode}
            </span>
          </div>
          <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-800 dark:text-slate-100">
            {publishedPath.length > 0 ? publishedPath.map(candidateLabel).join(' → ') : 'No published GEO path candidate'}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
            {baseline.selectionPolicy === 'manual'
              ? 'The published satellite/beam override remains locked until Configure returns the path to Automatic.'
              : 'The existing route engine owns satellite and beam selection.'}
          </p>
        </div>
      )}
    </section>
  );
}
