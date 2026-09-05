import { Globe2, MapPin, Radio, Satellite, Waypoints } from 'lucide-react';
import { useHoveredEntity } from '../../../contexts/HoveredEntityContext';

/**
 * Path-stage route diagram — a vertical node/connector chain modeled on
 * EngineeringClosurePipeline's visual grammar (numbered rows, left-border
 * tone color, thin vertical connector) so the Path stage matches the Link
 * Budget stage's diagram quality, using each Inspector's own established
 * per-technology accent color (GEO blue, LEO magenta) rather than the globe
 * overlay's separate hop-role color scheme.
 *
 * Deliberately new, not extracted from EngineeringClosurePipeline.tsx (that
 * file is coupled to RF-transformation-step formatting rules and already has
 * passing tests; this is visually similar but semantically different —
 * route hops, not RF/throughput transformations).
 *
 * Every resolved hop must be passed explicitly as a node — this is the fix
 * for Cross-Surface Consistency Audit 2026-07-21 F2/M1: a node list cannot
 * silently drop an intermediate satellite/SNP the way a string template can.
 */

export type RouteDiagramNodeKind = 'site' | 'satellite' | 'snp' | 'pop' | 'gateway';
export type RouteDiagramTone = 'default' | 'good' | 'warn' | 'danger';

export interface RouteDiagramNode {
  id: string;
  label: string;
  kind: RouteDiagramNodeKind;
  /** Short secondary line, e.g. "Beam 7", "Failover". */
  sub?: string;
  tone?: RouteDiagramTone;
  onClick?: () => void;
  /**
   * The id the GLOBE knows this hop by (M-5). Present, this row highlights when
   * the globe hovers that entity and tells the globe when the pointer — or the
   * keyboard — reaches it. Absent, the row behaves exactly as before.
   */
  globeId?: string;
}

export interface RouteDiagramConnector {
  distanceLabel?: string;
  latencyLabel?: string;
  /** Look angle at the ground-side endpoint of this hop, e.g. "33.5°" or "75.6° · Guaranteed service zone". */
  elevationLabel?: string;
  /** Terrestrial/backbone hops render as a dashed line, matching the globe overlay convention. */
  dashed?: boolean;
  tone?: RouteDiagramTone;
}

export interface RouteDiagramProps {
  technology: 'GEO' | 'LEO';
  nodes: RouteDiagramNode[];
  /** Length must be nodes.length - 1. */
  connectors: RouteDiagramConnector[];
  /** Accessible label for the whole diagram, also used for the sr-only text summary. */
  ariaLabel: string;
}

const KIND_ICON: Record<RouteDiagramNodeKind, typeof MapPin> = {
  site: MapPin,
  satellite: Satellite,
  snp: Radio,
  gateway: Radio,
  pop: Waypoints,
};

const toneTextClass: Record<RouteDiagramTone, string> = {
  default: 'text-slate-900 dark:text-slate-100',
  good: 'text-teal-700 dark:text-teal-300',
  warn: 'text-amber-700 dark:text-amber-300',
  danger: 'text-rose-700 dark:text-rose-300',
};

const toneBorderClass: Record<RouteDiagramTone, string> = {
  default: 'border-slate-200 dark:border-slate-700',
  good: 'border-teal-300/80 dark:border-teal-600/60',
  warn: 'border-amber-300/80 dark:border-amber-600/60',
  danger: 'border-rose-300/80 dark:border-rose-600/60',
};

const accentClass: Record<'GEO' | 'LEO', { line: string; ring: string; icon: string }> = {
  GEO: {
    line: 'bg-blue-300 dark:bg-blue-700/70',
    ring: 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
    icon: 'text-blue-600 dark:text-blue-300',
  },
  LEO: {
    line: 'bg-fuchsia-300 dark:bg-fuchsia-700/70',
    ring: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-600 dark:border-fuchsia-700 dark:bg-fuchsia-950/50 dark:text-fuchsia-300',
    icon: 'text-fuchsia-600 dark:text-fuchsia-300',
  },
};

const RouteDiagramNodeRow = ({
  node,
  index,
  technology,
}: {
  node: RouteDiagramNode;
  index: number;
  technology: 'GEO' | 'LEO';
}) => {
  const Icon = KIND_ICON[node.kind];
  const tone = node.tone ?? 'default';
  const accent = accentClass[technology];
  const isRelay = node.kind === 'satellite' || node.kind === 'gateway';
  const Wrapper = node.onClick ? 'button' : 'div';

  // M-5. Pointer AND focus both drive it: a keyboard user reaching this row
  // deserves the same globe highlight a mouse user gets, and the row is already
  // focusable whenever it has an onClick.
  const { satelliteId: hoveredGlobeId, setHoveredSatelliteId } = useHoveredEntity();
  const linked = node.globeId != null;
  const isHovered = linked && hoveredGlobeId === node.globeId;
  const link = linked
    ? {
      onMouseEnter: () => setHoveredSatelliteId(node.globeId ?? null),
      onMouseLeave: () => setHoveredSatelliteId(null),
      onFocus: () => setHoveredSatelliteId(node.globeId ?? null),
      onBlur: () => setHoveredSatelliteId(null),
    }
    : {};

  return (
    <div
      data-route-diagram-node=""
      data-route-diagram-hovered={isHovered ? '' : undefined}
      {...link}
      className={`grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 rounded-r-lg px-3 py-2 border-l-2 ${toneBorderClass[tone]} ${isHovered
        ? 'bg-sky-50 ring-1 ring-inset ring-sky-300 dark:bg-sky-500/10 dark:ring-sky-400/50'
        : 'bg-white dark:bg-slate-950/40'}`}
    >
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${isRelay ? accent.ring : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}
        aria-hidden="true"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <Wrapper
        type={node.onClick ? 'button' : undefined}
        onClick={node.onClick}
        className={`min-w-0 text-left ${node.onClick ? 'cursor-pointer underline-offset-2 hover:underline' : ''}`}
      >
        <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
          {String(index + 1).padStart(2, '0')} · {node.kind === 'site' ? 'Site' : node.kind === 'satellite' ? 'Satellite' : node.kind === 'pop' ? 'Backbone PoP' : node.kind === 'gateway' ? 'Gateway' : 'SNP'}
        </div>
        <div className={`truncate text-[13px] font-bold leading-5 ${toneTextClass[tone]}`} title={node.label}>
          {node.label}
        </div>
        {node.sub && <div className="truncate text-[10px] leading-4 text-slate-500 dark:text-slate-400">{node.sub}</div>}
      </Wrapper>
    </div>
  );
};

const RouteDiagramConnectorRow = ({
  connector,
  technology,
}: {
  connector: RouteDiagramConnector;
  technology: 'GEO' | 'LEO';
}) => {
  const accent = accentClass[technology];
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 px-3 py-0.5" aria-hidden="true">
      <div className="flex h-full justify-center">
        <div
          className={`w-px flex-1 ${connector.dashed ? '' : accent.line}`}
          style={connector.dashed ? {
            backgroundImage: 'repeating-linear-gradient(180deg, currentColor 0, currentColor 3px, transparent 3px, transparent 7px)',
            width: '1px',
          } : undefined}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 py-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
        {connector.distanceLabel && <span className="font-semibold tabular-nums">{connector.distanceLabel}</span>}
        {connector.latencyLabel && <span className="tabular-nums">{connector.latencyLabel}</span>}
        {connector.elevationLabel && <span className="tabular-nums">Elevation: {connector.elevationLabel}</span>}
      </div>
    </div>
  );
};

const nodeKindLabel = (kind: RouteDiagramNodeKind): string => (
  kind === 'site' ? 'Site' : kind === 'satellite' ? 'Satellite' : kind === 'pop' ? 'Backbone PoP' : kind === 'gateway' ? 'Gateway' : 'SNP'
);

const RouteDiagram = ({ technology, nodes, connectors, ariaLabel }: RouteDiagramProps) => {
  if (nodes.length === 0) return null;
  const summary = nodes.map((node, index) => {
    const connector = connectors[index];
    const hop = connector ? `, then ${[connector.distanceLabel, connector.latencyLabel, connector.elevationLabel && `elevation ${connector.elevationLabel}`].filter(Boolean).join(' ')}` : '';
    return `${nodeKindLabel(node.kind)} ${node.label}${hop}`;
  }).join('; ');

  return (
    <div data-route-diagram={technology} aria-label={ariaLabel} className="min-w-0">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <Globe2 className={`h-3 w-3 ${accentClass[technology].icon}`} />
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Resolved route
        </span>
      </div>
      <div className="mt-1.5">
        {nodes.map((node, index) => (
          <div key={node.id}>
            <RouteDiagramNodeRow node={node} index={index} technology={technology} />
            {connectors[index] && <RouteDiagramConnectorRow connector={connectors[index]} technology={technology} />}
          </div>
        ))}
      </div>
      <p className="sr-only">{summary}</p>
    </div>
  );
};

export default RouteDiagram;
