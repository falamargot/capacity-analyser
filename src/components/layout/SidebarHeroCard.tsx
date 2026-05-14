import { memo, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';

type HeroTone = 'satelliteLeo' | 'satelliteGeo' | 'satelliteInactive' | 'gateway' | 'snp' | 'aircraft' | 'vessel' | 'moon' | 'position' | 'spectrum' | 'iss' | 'idle';
type BadgeTone = 'pink' | 'blue' | 'emerald' | 'teal' | 'amber' | 'slate' | 'red';

interface SidebarHeroBadge {
  label: string;
  tone: BadgeTone;
}

interface SiteHeroData {
  label: string;
  coordinates: string;
  location?: string;
  weatherRow?: ReactNode;
  onClear: () => void;
}

interface SiteToSiteCardData {
  siteA: SiteHeroData;
  siteB: SiteHeroData;
}

interface SidebarHeroCardProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  footer?: ReactNode;
  backgroundImageUrl?: string;
  backgroundImageLabel?: string;
  tone?: HeroTone;
  badges?: SidebarHeroBadge[];
  compact?: boolean;
  onReset: () => void;
  siteToSite?: SiteToSiteCardData;
}

const toneStyles: Record<HeroTone, string> = {
  satelliteLeo: 'from-pink-500/18 via-fuchsia-500/10 to-transparent border-pink-200/70 dark:border-pink-500/20',
  satelliteGeo: 'from-blue-500/18 via-sky-500/10 to-transparent border-blue-200/70 dark:border-blue-500/20',
  satelliteInactive: 'from-slate-400/18 via-slate-300/10 to-transparent border-slate-200/70 dark:border-slate-600/30',
  gateway: 'from-cyan-500/18 via-sky-500/10 to-transparent border-cyan-200/70 dark:border-cyan-500/20',
  snp: 'from-amber-500/16 via-orange-500/8 to-transparent border-amber-200/70 dark:border-amber-500/20',
  aircraft: 'from-sky-500/18 via-blue-500/10 to-transparent border-sky-200/70 dark:border-sky-500/20',
  vessel: 'from-teal-500/18 via-emerald-500/10 to-transparent border-teal-200/70 dark:border-teal-500/20',
  moon: 'from-slate-300/18 via-amber-200/8 to-transparent border-slate-200/70 dark:border-slate-500/25',
  position: 'from-slate-400/16 via-slate-300/8 to-transparent border-slate-200/70 dark:border-slate-600/30',
  spectrum: 'from-sky-500/18 via-emerald-500/10 to-transparent border-sky-200/70 dark:border-sky-500/20',
  iss: 'from-cyan-500/20 via-teal-500/10 to-transparent border-cyan-200/70 dark:border-cyan-500/25',
  idle: 'from-slate-300/12 via-transparent to-transparent border-slate-200/70 dark:border-slate-700/60',
};

const badgeStyles: Record<BadgeTone, string> = {
  pink: 'bg-pink-100 text-pink-700 dark:bg-pink-500/15 dark:text-pink-200',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
  teal: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-200',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700/70 dark:text-slate-200',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200',
};

const SiteCardInner = ({ site }: { site: SiteHeroData }) => {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white/70 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/60">
      <div className="flex items-center justify-between gap-1 border-b border-slate-100 px-2.5 py-1.5 dark:border-slate-700/50">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          {site.label}
        </span>
        <button
          type="button"
          onClick={site.onClear}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          aria-label={`Clear ${site.label}`}
          title={`Clear ${site.label}`}
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-px px-2.5 py-2">
        <div
          className="truncate font-mono text-[16px] foÒnt-semibold leading-snug text-slate-800 dark:text-slate-100"
          title={site.coordinates}
        >
          {site.coordinates}
        </div>
        {site.location && (
          <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400" title={site.location}>
            {site.location}
          </div>
        )}
        {site.weatherRow && (
          <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-700/50">
            {site.weatherRow}
          </div>
        )}
      </div>
    </div>
  );
};

const SidebarHeroCard = memo<SidebarHeroCardProps>(({
  eyebrow,
  title,
  subtitle,
  footer,
  backgroundImageUrl,
  backgroundImageLabel,
  tone = 'idle',
  badges = [],
  compact = false,
  onReset,
  siteToSite,
}) => {
  const outerPad = compact ? 'px-2.5 pt-2.5 pb-2' : 'px-3 pt-3 pb-2';
  const innerPad = compact ? 'px-3.5 py-3.5' : 'px-4 py-4';
  const toneClass = toneStyles[tone];

  // Site-to-Site mode: two standalone cards, no enclosing container card
  if (siteToSite) {
    return (
      <div className={outerPad}>
        <div className="grid grid-cols-2 gap-2">
          <SiteCardInner site={siteToSite.siteA} />
          <SiteCardInner site={siteToSite.siteB} />
        </div>
      </div>
    );
  }

  // Standard single-site card
  return (
    <div className={outerPad}>
      <div
        className={`overflow-hidden rounded-2xl border bg-gradient-to-br ${toneClass} bg-white dark:bg-slate-900 shadow-[0_20px_45px_-28px_rgba(15,23,42,0.55)]`}
        style={backgroundImageUrl ? {
          backgroundImage: `linear-gradient(135deg, rgba(8, 15, 30, 0.78), rgba(8, 47, 73, 0.60)), url(${backgroundImageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : undefined}
      >
        <div className={`relative ${innerPad}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.85),transparent_42%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_42%)]" />
          <div className={`relative flex items-start justify-between ${compact ? 'gap-3' : 'gap-4'}`}>
            <div className="min-w-0">
              <div className={`${compact ? 'text-[10px] tracking-[0.16em]' : 'text-[11px] tracking-[0.18em]'} font-semibold uppercase text-slate-500 dark:text-slate-400`}>
                {eyebrow}
              </div>
              <h2 className={`mt-1 truncate font-semibold leading-tight text-slate-950 dark:text-slate-50 ${compact ? 'text-[22px]' : 'text-[26px]'}`}>
                {title}
              </h2>
              <p className={`mt-1 text-slate-600 dark:text-slate-300 ${compact ? 'text-[13px]' : 'text-sm'}`}>
                {subtitle}
              </p>
              {badges.length > 0 && (
                <div className={`flex flex-wrap ${compact ? 'mt-2.5 gap-1.5' : 'mt-3 gap-2'}`}>
                  {badges.map((badge) => (
                    <span
                      key={`${badge.tone}-${badge.label}`}
                      className={`rounded-full font-semibold uppercase ${badgeStyles[badge.tone]} ${compact ? 'px-2 py-0.5 text-[10px] tracking-[0.06em]' : 'px-2.5 py-1 text-[11px] tracking-[0.08em]'}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
              {footer && (
                <div className={`mt-3 border-t border-slate-200/80 pt-3 dark:border-slate-700/80 ${compact ? 'text-[12px]' : 'text-sm'}`}>
                  {footer}
                </div>
              )}
              {backgroundImageUrl && backgroundImageLabel && (
                <div className={`mt-2 text-slate-500 dark:text-slate-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                  {backgroundImageLabel}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onReset}
                className={`inline-flex items-center rounded-xl border border-white/60 bg-white/80 font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:bg-slate-800 ${compact ? 'gap-1.5 px-2.5 py-1.5 text-[11px]' : 'gap-2 px-3 py-2 text-xs'}`}
                aria-label="Clear current target"
                title="Clear current target"
              >
                <RotateCcw className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                Clear Target
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

SidebarHeroCard.displayName = 'SidebarHeroCard';

export default SidebarHeroCard;
