interface LayerHeadingProps {
  title: string;
  detail?: string;
}

/** Section divider used between GEO/LEO connectivity-section layers (Access, Space Segment, etc). */
const LayerHeading = ({ title, detail }: LayerHeadingProps) => (
  <div className="border-t border-slate-200/60 pt-2.5 first:border-t-0 first:pt-0 dark:border-slate-800/60">
    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
      {title}
    </div>
    {detail && (
      <div className="mt-0.5 text-[11px] leading-4 text-slate-400 dark:text-slate-500">
        {detail}
      </div>
    )}
  </div>
);

export default LayerHeading;
