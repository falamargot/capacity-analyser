import type { ReactNode } from 'react';
import { SectionTooltip } from '../../SectionTooltip';
import CollapsibleSection from '../../layout/CollapsibleSection';

interface LatencyBreakdownCardProps {
  /** Unique key used for localStorage persistence. Must be stable across renders. */
  storageKey: string;
  accentColor: string;
  summary: string;
  title?: ReactNode;
  tooltip?: string;
  collapsible?: boolean;
  children: ReactNode;
}

/**
 * Collapsible latency breakdown panel shared by GEO and LEO connectivity
 * sections. Built on CollapsibleSection so collapse state persists across
 * reloads like every other section, instead of resetting on each visit.
 */
const LatencyBreakdownCard = ({
  storageKey,
  accentColor,
  summary,
  title = 'Latency breakdown',
  tooltip,
  collapsible = true,
  children,
}: LatencyBreakdownCardProps) => (
  <CollapsibleSection
    storageKey={storageKey}
    accentColor={accentColor}
    defaultOpen={false}
    collapsible={collapsible}
    title={<>{title}{tooltip && <SectionTooltip content={tooltip} />}</>}
    subtitle={summary}
  >
    {children}
  </CollapsibleSection>
);

export default LatencyBreakdownCard;
