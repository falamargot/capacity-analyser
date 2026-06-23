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
  lossMbps: number;
  lossPct: number;
}

const toneColor: Record<NonNullable<LinkBudgetWorkspaceClosureStep['tone']>, string> = {
  default: '#94a3b8',
  good: '#2dd4bf',
  warn: '#fbbf24',
  danger: '#fb7185',
  accent: '#38bdf8',
};

const fmtBarMbps = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(2)} Gbps` : `${Math.round(v)} Mbps`);

// 2.7x the original 88px chart area so the waterfall reads as the primary
// explanatory visual for the closure path, not a small reference sparkline.
const CHART_HEIGHT = 240;
const TOP_PADDING = 30;
const BOTTOM_LABEL_HEIGHT = 46;
const BAR_WIDTH = 32;
const BAR_GAP = 14;
const GROUP_GAP = 44;

/**
 * Per-step "before vs after" throughput comparison, not a cumulative offset
 * waterfall — some closure chains (LEO site-to-site Access A / Access B) are
 * parallel legs rather than a single sequential chain, so stacking bars as a
 * running total would misrepresent the data. Each step's own input/output
 * pair is honest regardless of whether steps chain into each other.
 *
 * The bar with the largest absolute Mbps loss is badged as the bottleneck so
 * the dominant limiting step is readable at a glance, before the technical
 * cards below are read.
 */
const ThroughputWaterfall = ({ steps, accent }: ThroughputWaterfallProps) => {
  const bars: WaterfallBar[] = steps
    .filter((step): step is LinkBudgetWorkspaceClosureStep & { inputMbps: number; outputMbps: number } =>
      typeof step.inputMbps === 'number' && Number.isFinite(step.inputMbps)
      && typeof step.outputMbps === 'number' && Number.isFinite(step.outputMbps))
    .map((step) => {
      const lossMbps = Math.max(step.inputMbps - step.outputMbps, 0);
      return {
        label: step.label,
        inputMbps: step.inputMbps,
        outputMbps: step.outputMbps,
        tone: step.tone ?? 'default',
        lossMbps,
        lossPct: step.inputMbps > 0 ? (lossMbps / step.inputMbps) * 100 : 0,
      };
    });

  if (bars.length < 2) return null;

  const maxValue = Math.max(...bars.flatMap((bar) => [bar.inputMbps, bar.outputMbps]), 1);
  const chartWidth = bars.length * (BAR_WIDTH * 2 + BAR_GAP) + (bars.length - 1) * GROUP_GAP;
  const svgHeight = TOP_PADDING + CHART_HEIGHT + BOTTOM_LABEL_HEIGHT;
  const accentRail = accent === 'pink' ? '#f472b6' : '#38bdf8';

  const maxLossMbps = Math.max(...bars.map((bar) => bar.lossMbps));
  const bottleneckIndex = maxLossMbps > 0 ? bars.findIndex((bar) => bar.lossMbps === maxLossMbps) : -1;

  return (
    <div className="max-w-full min-w-0 overflow-x-auto rounded-lg border border-slate-800/70 bg-slate-950/25 px-3 py-2.5">
      <svg
        className="block max-w-none"
        role="img"
        aria-label="Throughput waterfall: input versus output Mbps at each closure step"
        width={chartWidth}
        height={svgHeight}
        viewBox={`0 0 ${chartWidth} ${svgHeight}`}
      >
        <line x1={0} y1={TOP_PADDING + CHART_HEIGHT} x2={chartWidth} y2={TOP_PADDING + CHART_HEIGHT} stroke="#1e293b" strokeWidth={1} />
        {bars.map((bar, index) => {
          const isBottleneck = index === bottleneckIndex;
          const groupX = index * (BAR_WIDTH * 2 + BAR_GAP + GROUP_GAP);
          const groupWidth = BAR_WIDTH * 2 + BAR_GAP;
          const baseline = TOP_PADDING + CHART_HEIGHT;
          const inputHeight = Math.max((bar.inputMbps / maxValue) * CHART_HEIGHT, bar.inputMbps > 0 ? 2 : 0);
          const outputHeight = Math.max((bar.outputMbps / maxValue) * CHART_HEIGHT, bar.outputMbps > 0 ? 2 : 0);
          const color = toneColor[bar.tone];
          const hasLoss = bar.lossMbps > 0;

          return (
            <g key={`${bar.label}-${index}`}>
              {isBottleneck && (
                <rect
                  x={groupX - 6}
                  y={TOP_PADDING - 4}
                  width={groupWidth + 12}
                  height={CHART_HEIGHT + 8}
                  rx={8}
                  fill="#fb7185"
                  fillOpacity={0.08}
                  stroke="#fb7185"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              )}
              {isBottleneck && (
                <text
                  x={groupX + groupWidth / 2}
                  y={TOP_PADDING - 10}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={800}
                  letterSpacing={0.5}
                  fill="#fb7185"
                >
                  BOTTLENECK
                </text>
              )}
              <rect
                x={groupX}
                y={baseline - inputHeight}
                width={BAR_WIDTH}
                height={inputHeight}
                rx={3}
                fill={accentRail}
                fillOpacity={0.35}
              >
                <title>{`${bar.label} input: ${fmtBarMbps(bar.inputMbps)}`}</title>
              </rect>
              <rect
                x={groupX + BAR_WIDTH + BAR_GAP}
                y={baseline - outputHeight}
                width={BAR_WIDTH}
                height={outputHeight}
                rx={3}
                fill={color}
              >
                <title>{`${bar.label} output: ${fmtBarMbps(bar.outputMbps)}`}</title>
              </rect>
              <text
                x={groupX + BAR_WIDTH + BAR_GAP + BAR_WIDTH / 2}
                y={Math.max(baseline - outputHeight - 8, TOP_PADDING + 12)}
                textAnchor="middle"
                fontSize={13}
                fontWeight={800}
                fill="#f1f5f9"
              >
                {fmtBarMbps(bar.outputMbps)}
              </text>
              <text
                x={groupX + BAR_WIDTH + BAR_GAP / 2}
                y={baseline + 20}
                textAnchor="middle"
                fontSize={14}
                fontWeight={700}
                fill="#cbd5e1"
              >
                {bar.label.length > 16 ? `${bar.label.slice(0, 15)}…` : bar.label}
              </text>
              <text
                x={groupX + BAR_WIDTH + BAR_GAP / 2}
                y={baseline + 38}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill={isBottleneck ? '#fb7185' : hasLoss ? '#fbbf24' : '#475569'}
              >
                {hasLoss ? `-${fmtBarMbps(bar.lossMbps)} (${Math.round(bar.lossPct)}%)` : 'no loss'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default ThroughputWaterfall;
