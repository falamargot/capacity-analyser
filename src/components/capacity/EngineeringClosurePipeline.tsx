export interface LinkBudgetWorkspaceClosureStep {
  label: string;
  value?: string;
  detail?: string;
  input?: string;
  transformation?: string;
  output?: string;
  loss?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger' | 'accent';
  inputMbps?: number | null;
  outputMbps?: number | null;
}

export type EngineeringClosurePipelineLayout = 'geo' | 'leo-single' | 'leo-s2s';

interface EngineeringClosurePipelineProps {
  layout: EngineeringClosurePipelineLayout;
  steps: LinkBudgetWorkspaceClosureStep[];
  blocked?: boolean;
}

interface PipelineNodeModel {
  label: string;
  value: string;
  detail?: string;
  tone?: LinkBudgetWorkspaceClosureStep['tone'];
  compact?: boolean;
}

interface PipelineTransitionModel {
  label: string;
  loss?: string;
  tone?: LinkBudgetWorkspaceClosureStep['tone'];
}

interface PipelineSegmentModel {
  node: PipelineNodeModel;
  transition?: PipelineTransitionModel;
}

const toneClass: Record<NonNullable<LinkBudgetWorkspaceClosureStep['tone']>, string> = {
  default: 'text-slate-100',
  good: 'text-teal-300',
  warn: 'text-amber-300',
  danger: 'text-rose-300',
  accent: 'text-sky-300',
};

const borderClass: Record<NonNullable<LinkBudgetWorkspaceClosureStep['tone']>, string> = {
  default: 'border-slate-700 bg-slate-950/55',
  good: 'border-teal-500/35 bg-teal-950/15',
  warn: 'border-amber-500/35 bg-amber-950/15',
  danger: 'border-rose-500/40 bg-rose-950/20',
  accent: 'border-sky-500/35 bg-sky-950/15',
};

const findStep = (steps: LinkBudgetWorkspaceClosureStep[], label: string) =>
  steps.find((step) => step.label.toLowerCase() === label.toLowerCase());

const firstStepStartingWith = (steps: LinkBudgetWorkspaceClosureStep[], label: string) =>
  steps.find((step) => step.label.toLowerCase().startsWith(label.toLowerCase()));

const outputValue = (step: LinkBudgetWorkspaceClosureStep | undefined) =>
  step?.output ?? step?.value ?? '--';

const stepTone = (step: LinkBudgetWorkspaceClosureStep | undefined): NonNullable<LinkBudgetWorkspaceClosureStep['tone']> =>
  step?.tone ?? 'default';

const compactTransformation = (step: LinkBudgetWorkspaceClosureStep | undefined, fallback = 'then') => {
  const text = step?.transformation ?? step?.detail ?? fallback;
  return text.replace(/\.$/, '');
};

const connectorLabelForStep = (step: LinkBudgetWorkspaceClosureStep | undefined) => {
  if (!step) return 'then';
  if (step.label === 'Uplink') return 'Propagation';
  if (step.label === 'Payload') return 'Payload routing';
  if (step.label === 'Downlink') return 'Propagation';
  if (step.label === 'Margin') return 'Combine C/N';
  if (step.label === 'RF throughput') return 'MODCOD selection';
  if (step.label === 'Protocol efficiency') return 'Protocol application';
  if (step.label === 'Below threshold') return 'Threshold check';
  if (step.label === 'Delivered') {
    const limit = step.detail?.replace(/^Limit:\s*/i, '').trim();
    if (limit?.toLowerCase() === 'shared capacity') return 'Contention limit';
    if (limit && limit !== 'Final user throughput') return `Apply ${limit}`;
  }
  if (step.label === 'Shared capacity') return 'Beam sharing';
  if (step.label === 'Feeder (Ka)') return 'Ka feeder bound';
  if (step.label === 'Terminal cap') return 'Terminal cap';
  if (step.label === 'Protocol/handover') return 'Protocol / handover';
  return compactTransformation(step);
};

const nodeLabelForStep = (step: LinkBudgetWorkspaceClosureStep | undefined) => {
  if (!step) return 'Step';
  if (step.label === 'Uplink') return 'Uplink C/N';
  if (step.label === 'Downlink') return 'Downlink C/N';
  if (step.label === 'Margin') return 'Combined margin';
  if (step.label === 'RF throughput') return 'MODCOD / RF throughput';
  if (step.label === 'Protocol efficiency') return 'Protocol efficiency';
  if (step.label === 'Shared capacity') return 'Shared beam capacity';
  if (step.label === 'Feeder (Ka)') return 'Feeder (Ka)';
  if (step.label === 'Protocol/handover') return 'Protocol / handover';
  if (step.label === 'Delivered') return 'Delivered throughput';
  return step.label;
};

const shouldShowNodeDetail = (step: LinkBudgetWorkspaceClosureStep | undefined) =>
  step?.label === 'Uplink'
  || step?.label === 'Downlink'
  || step?.label === 'Margin'
  || step?.label === 'Delivered';

const nodeFromStep = (step: LinkBudgetWorkspaceClosureStep | undefined): PipelineNodeModel => ({
  label: nodeLabelForStep(step),
  value: outputValue(step),
  detail: shouldShowNodeDetail(step) ? step?.detail : undefined,
  tone: stepTone(step),
});

const transitionFromStep = (step: LinkBudgetWorkspaceClosureStep | undefined): PipelineTransitionModel => ({
  label: connectorLabelForStep(step),
  loss: step?.loss,
  tone: stepTone(step),
});

const phaseFromSteps = (
  steps: Array<LinkBudgetWorkspaceClosureStep | undefined>,
): PipelineSegmentModel[] => {
  const concreteSteps = steps.filter(Boolean);
  const firstStep = concreteSteps[0];
  if (!firstStep) return [];
  const segments: PipelineSegmentModel[] = [{ node: nodeFromStep(firstStep) }];
  concreteSteps.slice(1).forEach((step) => {
    segments[segments.length - 1].transition = transitionFromStep(step);
    segments.push({ node: nodeFromStep(step) });
  });
  return segments;
};

const screenReaderText = (title: string, segments: PipelineSegmentModel[]) =>
  `${title}: ${segments.map((segment) => {
    const transition = segment.transition ? `, then ${segment.transition.label}${segment.transition.loss ? `, loss ${segment.transition.loss}` : ''}` : '';
    return `${segment.node.label} ${segment.node.value}${transition}`;
  }).join('; ')}`;

const PipelineNode = ({ node }: { node: PipelineNodeModel }) => (
  <div className={`min-w-[8rem] max-w-[9.5rem] rounded-md border px-2.5 py-1.5 ${borderClass[node.tone ?? 'default']}`}>
    <div className="text-[8px] font-bold uppercase tracking-wide text-slate-600">{node.label}</div>
    <div className={`mt-0.5 break-words text-[15px] font-black leading-tight tabular-nums ${toneClass[node.tone ?? 'default']}`}>{node.value}</div>
    {node.detail && <div className="mt-0.5 text-[9px] leading-snug text-slate-600">{node.detail}</div>}
  </div>
);

const PipelineConnector = ({ transition }: { transition: PipelineTransitionModel }) => (
  <div className="flex w-[6.75rem] shrink-0 flex-col items-center justify-center gap-1 px-1 text-center" aria-hidden="true">
    <div className="flex w-full items-center gap-1.5">
      <div className="h-[2px] flex-1 bg-slate-500/80" />
      <div className="text-base leading-none text-slate-300">→</div>
      <div className="h-[2px] flex-1 bg-slate-500/80" />
    </div>
    <div className="w-full text-[10px] font-bold leading-tight text-slate-200">{transition.label}</div>
    {transition.loss && transition.loss !== '0 Mbps' && transition.loss !== 'no loss' && (
      <div className="flex items-center gap-1 text-[10px] font-bold tabular-nums text-amber-300/90">
        <span className="h-px w-3 bg-amber-400/40" />
        {transition.loss}
        <span className="h-px w-3 bg-amber-400/40" />
      </div>
    )}
  </div>
);

const LinearPhase = ({ title, segments, subtle = false }: { title: string; segments: PipelineSegmentModel[]; subtle?: boolean }) => (
  <div className={`min-w-0 ${subtle ? 'border-t-2 border-slate-700/60 pt-2' : ''}`}>
    <div className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</div>
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-stretch">
        {segments.map((segment, index) => (
          <div key={`${segment.node.label}-${index}`} className="flex items-stretch">
            <PipelineNode node={segment.node} />
            {segment.transition && <PipelineConnector transition={segment.transition} />}
          </div>
        ))}
      </div>
    </div>
    <p className="sr-only">{screenReaderText(title, segments)}</p>
  </div>
);

const GeoPipeline = ({ steps, blocked }: { steps: LinkBudgetWorkspaceClosureStep[]; blocked?: boolean }) => {
  const uplink = findStep(steps, 'Uplink');
  const payload = findStep(steps, 'Payload');
  const downlink = findStep(steps, 'Downlink');
  const margin = findStep(steps, 'Margin');
  const rfThroughput = findStep(steps, 'RF throughput');
  const protocol = findStep(steps, 'Protocol efficiency');
  const delivered = findStep(steps, 'Delivered');

  if (blocked) {
    const blockedSegments = phaseFromSteps(
      [
        uplink,
        payload,
        downlink,
        margin,
        {
          label: 'Below threshold',
          transformation: 'Threshold check',
          output: 'Below threshold',
          tone: 'danger',
        },
        {
          label: 'Delivered',
          transformation: 'Blocked',
          output: delivered?.output ?? rfThroughput?.output ?? '0 Mbps',
          tone: 'danger',
        },
      ]
    );
    return <LinearPhase title="RF closure" segments={blockedSegments} />;
  }

  const rfSegments = phaseFromSteps(
    [uplink, payload, downlink, margin, rfThroughput]
  );
  const networkSegments = phaseFromSteps(
    [rfThroughput, protocol, delivered]
  );

  return (
    <div className="grid gap-2">
      <LinearPhase title="RF closure" segments={rfSegments} />
      {(protocol || delivered) && <LinearPhase title="Network shaping" segments={networkSegments} subtle />}
    </div>
  );
};

const LeoSinglePipeline = ({ steps }: { steps: LinkBudgetWorkspaceClosureStep[] }) => {
  const rf = findStep(steps, 'RF throughput') ?? steps[0];
  const remaining = [
    findStep(steps, 'Shared capacity'),
    findStep(steps, 'Feeder (Ka)'),
    findStep(steps, 'Terminal cap'),
    findStep(steps, 'Protocol/handover'),
    findStep(steps, 'Delivered'),
  ];

  return (
    <LinearPhase
      title="LEO single-site closure"
      segments={phaseFromSteps([rf, ...remaining])}
    />
  );
};

const BranchNode = ({ title, step }: { title: string; step: LinkBudgetWorkspaceClosureStep | undefined }) => (
  <div className={`min-w-0 rounded-lg border px-3 py-2 ${borderClass[stepTone(step)]}`}>
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
    <div className={`mt-1 text-base font-black tabular-nums ${toneClass[stepTone(step)]}`}>{outputValue(step)}</div>
    <div className="mt-1 text-[10px] leading-snug text-slate-400">{compactTransformation(step, 'Access constraint')}</div>
    {step?.loss && <div className="mt-1 text-[10px] font-bold tabular-nums text-amber-300">{step.loss}</div>}
  </div>
);

const LeoSiteToSitePipeline = ({ steps }: { steps: LinkBudgetWorkspaceClosureStep[] }) => {
  const source = firstStepStartingWith(steps, 'Access');
  const destination = steps.filter((step) => step.label.startsWith('Access'))[1];
  const backbone = findStep(steps, 'Backbone');
  const delivered = findStep(steps, 'Delivered');
  const selectedLimit = `min(${outputValue(source)}, ${outputValue(destination)}) = ${outputValue(delivered)}`;

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Branch / merge access closure</div>
      <div className="grid min-w-0 items-stretch gap-2 lg:grid-cols-[minmax(0,2fr)_10rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-1 rounded-md border border-slate-800/80 bg-slate-950/25 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">
            Parallel access comparison
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-2">
            <BranchNode title="Source access" step={source} />
            <BranchNode title="Destination access" step={destination} />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-1 text-center text-[10px] font-semibold text-slate-300" aria-hidden="true">
          <span>Compare access legs</span>
          <div className="flex w-full items-center gap-1.5">
            <div className="h-[2px] flex-1 bg-slate-500/80" />
            <span className="text-base leading-none text-slate-300">→</span>
            <div className="h-[2px] flex-1 bg-slate-500/80" />
          </div>
          <span>Select lower rate</span>
          <span className="text-[9px] font-bold tabular-nums text-slate-500">{selectedLimit}</span>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${borderClass[stepTone(delivered)]}`}>
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Delivered throughput</div>
          <div className={`mt-1 text-base font-black tabular-nums ${toneClass[stepTone(delivered)]}`}>{outputValue(delivered)}</div>
          <div className="mt-1 text-[10px] leading-snug text-slate-400">Delivered = selected lower access rate after final constraints.</div>
          {delivered?.loss && <div className="mt-1 text-[10px] font-bold tabular-nums text-amber-300">{delivered.loss}</div>}
        </div>
      </div>
      {backbone && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2 text-xs text-slate-300">
          <span className="font-bold uppercase tracking-wide text-slate-500">Backbone context: </span>
          {backbone.output ?? backbone.value ?? '--'}
          {backbone.input && <span className="text-slate-500"> via {backbone.input}</span>}
        </div>
      )}
      <p className="sr-only">
        Site-to-site closure compares source access {outputValue(source)} and destination access {outputValue(destination)}.
        The selected limit is {selectedLimit}. Backbone latency is {backbone?.output ?? '--'}.
      </p>
    </div>
  );
};

const EngineeringClosurePipeline = ({ layout, steps, blocked = false }: EngineeringClosurePipelineProps) => {
  if (layout === 'geo') return <GeoPipeline steps={steps} blocked={blocked} />;
  if (layout === 'leo-s2s') return <LeoSiteToSitePipeline steps={steps} />;
  return <LeoSinglePipeline steps={steps} />;
};

export default EngineeringClosurePipeline;
