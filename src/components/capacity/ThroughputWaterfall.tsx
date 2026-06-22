import type { LinkBudgetWorkspaceClosureStep } from './LinkBudgetWorkspaceFrame';

interface ThroughputWaterfallProps {
  steps: LinkBudgetWorkspaceClosureStep[];
  accent: 'blue' | 'pink';
}

interface WaterfallBar {
  label: string;
  inputMbps: number;
  outputMbps: number;
  tone: NonNullable<LinkBudgetWorkspaceClosureStep['tone']>;
}

const toneColor: Record<NonNullable<LinkBudgetWorkspaceClosureStep['tone']>, string> = {
  default: '#94a3b8',
  good: '#2dd4bf',
  warn: '#fbbf24',
  danger: '#fb7185',
  accent: '#38bdf8',
};

const fmtBarMbps = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} Gbps` : `${Math.round(v)} Mbps`);

const CHART_HEIGHT = 88;
const BAR_WIDTH = 22;
const BAR_GAP = 10;
const GROUP_GAP = 26;

/**
 * Per-step "before vs after" throughput comparison, not a cumulative offset
 * waterfall — some closure chains (LEO site-to-site Access A / Access B) are
 * parallel legs rather than a single sequential chain, so stacking bars as a
 * running total would misrepresent the data. Each step's own input/output
 * pair is honest regardless of whether steps chain into each other.
 */
const ThroughputWaterfall = ({ steps, accent }: ThroughputWaterfallProps) => {
  const bars: WaterfallBar[] = steps
    .filter((step): step is LinkBudgetWorkspaceClosureStep & { inputMbps: number; outputMbps: number } =>
      typeof step.inputMbps === 'number' && Number.isFinite(step.inputMbps)
      && typeof step.outputMbps === 'number' && Number.isFinite(step.outputMbps))
    .map((step) => ({
      label: step.label,
      inputMbps: step.inputMbps,
      outputMbps: step.outputMbps,
      tone: step.tone ?? 'default',
    }));

  if (bars.length < 2) return null;

  const maxValue = Math.max(...bars.flatMap((bar) => [bar.inputMbps, bar.outputMbps]), 1);
  const chartWidth = bars.length * (BAR_WIDTH * 2 + BAR_GAP) + (bars.length - 1) * GROUP_GAP;
  const accentRail = accent === 'pink' ? '#f472b6' : '#38bdf8';

  return (
    <div className="overflow-x-auto">
      <svg
        role="img"
        aria-label="Throughput waterfall: input versus output Mbps at each closure step"
        width={chartWidth}
        height={CHART_HEIGHT + 36}
        viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT + 36}`}
      >
        <line x1={0} y1={CHART_HEIGHT} x2={chartWidth} y2={CHART_HEIGHT} stroke="#1e293b" strokeWidth={1} />
        {bars.map((bar, index) => {
          const groupX = index * (BAR_WIDTH * 2 + BAR_GAP + GROUP_GAP);
          const inputHeight = Math.max((bar.inputMbps / maxValue) * CHART_HEIGHT, bar.inputMbps > 0 ? 2 : 0);
          const outputHeight = Math.max((bar.outputMbps / maxValue) * CHART_HEIGHT, bar.outputMbps > 0 ? 2 : 0);
          const color = toneColor[bar.tone];
          return (
            <g key={`${bar.label}-${index}`}>
              <rect
                x={groupX}
                y={CHART_HEIGHT - inputHeight}
                width={BAR_WIDTH}
                height={inputHeight}
                rx={2}
                fill={accentRail}
                fillOpacity={0.35}
              >
                <title>{`${bar.label} input: ${fmtBarMbps(bar.inputMbps)}`}</title>
              </rect>
              <rect
                x={groupX + BAR_WIDTH + BAR_GAP}
                y={CHART_HEIGHT - outputHeight}
                width={BAR_WIDTH}
                height={outputHeight}
                rx={2}
                fill={color}
              >
                <title>{`${bar.label} output: ${fmtBarMbps(bar.outputMbps)}`}</title>
              </rect>
              <text
                x={groupX + BAR_WIDTH + BAR_GAP / 2}
                y={CHART_HEIGHT + 14}
                textAnchor="middle"
                fontSize={9}
                fontWeight={700}
                fill="#64748b"
              >
                {bar.label.length > 12 ? `${bar.label.slice(0, 11)}…` : bar.label}
              </text>
              <text
                x={groupX + BAR_WIDTH + BAR_GAP / 2}
                y={CHART_HEIGHT + 26}
                textAnchor="middle"
                fontSize={8}
                fill={bar.outputMbps < bar.inputMbps ? '#fbbf24' : '#475569'}
              >
                {bar.outputMbps < bar.inputMbps ? `-${fmtBarMbps(bar.inputMbps - bar.outputMbps)}` : 'no loss'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default ThroughputWaterfall;
