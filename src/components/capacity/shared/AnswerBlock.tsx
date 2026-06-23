interface AnswerBlockProps {
  accentColor: string;
  statusLabel: string;
  statusClassName: string;
  throughputLabel: string;
  throughputValue: string;
  latencyLabel: string;
  latencyValue: string;
  bottleneckLabel: string;
  bottleneckValue: string;
  confidenceValue: string;
}

/**
 * The first thing rendered in the Engineering Analysis sidebar, right after
 * the mode/topology selector. Answers the five questions a 15-second reader
 * needs (does it work / throughput / latency / bottleneck / confidence) in
 * one compact card, so the more detailed sections below (Access Layer, Space
 * Segment, End-to-End Analysis) are reached only if the reader wants more
 * than the headline answer.
 */
const AnswerBlock = ({
  accentColor,
  statusLabel,
  statusClassName,
  throughputLabel,
  throughputValue,
  latencyLabel,
  latencyValue,
  bottleneckLabel,
  bottleneckValue,
  confidenceValue,
}: AnswerBlockProps) => (
  <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/70">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusClassName}`}>
        {statusLabel}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500" style={{ color: accentColor }}>
        Engineering summary
      </span>
    </div>
    <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800">
      <div className="min-w-0 bg-white px-3.5 py-2.5 dark:bg-slate-900">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{throughputLabel}</div>
        <div className="mt-0.5 truncate text-2xl font-black tabular-nums text-slate-950 dark:text-slate-50">{throughputValue}</div>
      </div>
      <div className="min-w-0 bg-white px-3.5 py-2.5 dark:bg-slate-900">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{latencyLabel}</div>
        <div className="mt-0.5 truncate text-2xl font-black tabular-nums text-slate-950 dark:text-slate-50">{latencyValue}</div>
      </div>
      <div className="min-w-0 bg-white px-3.5 py-2.5 dark:bg-slate-900">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{bottleneckLabel}</div>
        <div className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{bottleneckValue}</div>
      </div>
      <div className="min-w-0 bg-white px-3.5 py-2.5 dark:bg-slate-900">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Confidence</div>
        <div className="mt-0.5 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{confidenceValue}</div>
      </div>
    </div>
  </section>
);

export default AnswerBlock;
