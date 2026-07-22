import { dataProvenanceRows, type DataProvenanceModel } from '../utils/dataProvenance';

interface DataProvenancePanelProps {
  model?: DataProvenanceModel | null;
  className?: string;
}

/**
 * Renders the canonical {@link DataProvenanceModel} in-app. Consumes the exact
 * same model instance that feeds the PDF export, so on-screen data-freshness
 * and the exported report can never disagree. Unknown dates surface as
 * "Date unavailable" (handled by dataProvenanceRows).
 */
const DataProvenancePanel = ({ model, className }: DataProvenancePanelProps) => {
  if (!model) return null;
  const rows = dataProvenanceRows(model);

  return (
    <section
      className={`rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-900/50 ${className ?? ''}`}
      aria-label="Data provenance and freshness"
    >
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        Data provenance
      </h4>
      <dl className="space-y-1.5">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,1.2fr)] items-baseline gap-x-3 gap-y-0.5 border-t border-slate-200/60 pt-1.5 first:border-t-0 first:pt-0 dark:border-slate-800/60"
          >
            <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
              {row.label}
            </dt>
            <dd className="min-w-0 text-[11px] leading-4 text-slate-700 dark:text-slate-200">
              <span className="break-words">{row.source}</span>
              {row.note && (
                <span className="block text-[10px] leading-3 text-slate-400 dark:text-slate-500">{row.note}</span>
              )}
              <span className="mt-0.5 block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                {row.nature} · {row.asOf}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default DataProvenancePanel;
