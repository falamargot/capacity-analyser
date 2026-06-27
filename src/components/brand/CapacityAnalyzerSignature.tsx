import { useId, type SVGProps } from 'react';

export type CapacityAnalyzerSignatureProps = SVGProps<SVGSVGElement> & {
  variant?: 'full' | 'icon';
};

export function CapacityAnalyzerSignature({
  variant = 'full',
  className,
  ...props
}: CapacityAnalyzerSignatureProps) {
  const isIcon = variant === 'icon';
  const gradientId = useId().replace(/:/g, '');
  const globeId = `ca-${gradientId}-globe`;
  const routeId = `ca-${gradientId}-route`;
  const satelliteId = `ca-${gradientId}-satellite`;
  const beamId = `ca-${gradientId}-beam`;

  return (
    <svg
      width={isIcon ? 60 : 96}
      height={isIcon ? 84 : 132}
      viewBox={isIcon ? '18 10 60 72' : '0 0 96 132'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient id={globeId} x1="25" y1="50" x2="72" y2="84" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0EA5E9" />
          <stop offset="0.56" stopColor="#2563EB" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id={routeId} x1="24" y1="52" x2="72" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" />
          <stop offset="0.5" stopColor="#A78BFA" />
          <stop offset="1" stopColor="#F472B6" />
        </linearGradient>
        <linearGradient id={satelliteId} x1="34" y1="14" x2="64" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FAFC" />
          <stop offset="0.45" stopColor="#BAE6FD" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id={beamId} x1="44" y1="30" x2="60" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE68A" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>

      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M20 78C24.5 61.5 38.5 52 48 52C57.5 52 71.5 61.5 76 78Z"
          fill={`url(#${globeId})`}
          className="stroke-slate-950 dark:stroke-sky-100"
          strokeWidth="1.8"
        />
        <path
          d="M25 78C29 67.5 39.5 61 48 61C56.5 61 67 67.5 71 78"
          className="stroke-sky-100"
          strokeWidth="1.25"
          opacity="0.58"
        />
        <path
          d="M48 53.5V78"
          className="stroke-sky-100"
          strokeWidth="1.1"
          opacity="0.34"
        />

        <path
          d="M30 66C39 49.5 58 47.5 67 60"
          stroke={`url(#${routeId})`}
          strokeWidth="3.2"
        />
        <path
          d="M33 64.5C42 54.5 56 53.2 64 60.5"
          className="stroke-white"
          strokeWidth="1.1"
          opacity="0.72"
        />
        <circle cx="30" cy="66" r="4.3" fill="#22D3EE" className="stroke-slate-950 dark:stroke-slate-950" strokeWidth="1.4" />
        <circle cx="67" cy="60" r="4.3" fill="#F472B6" className="stroke-slate-950 dark:stroke-slate-950" strokeWidth="1.4" />

        <path
          d="M49 33L31 62"
          stroke={`url(#${beamId})`}
          strokeWidth="1.75"
          strokeDasharray="2.8 4.2"
          opacity="0.85"
        />
        <path
          d="M52 33L67 57"
          stroke={`url(#${beamId})`}
          strokeWidth="1.75"
          strokeDasharray="2.8 4.2"
          opacity="0.7"
        />

        <g transform="translate(49 25) rotate(-14)">
          <rect
            x="-7"
            y="-5"
            width="14"
            height="10"
            rx="2.6"
            fill={`url(#${satelliteId})`}
            className="stroke-slate-950 dark:stroke-sky-50"
            strokeWidth="1.35"
          />
          <path
            d="M-7 0H-18M7 0H18"
            className="stroke-slate-700 dark:stroke-slate-100"
            strokeWidth="1.6"
          />
          <rect x="-27" y="-4" width="9" height="8" rx="1.4" fill="#2563EB" className="stroke-sky-100" strokeWidth="1" />
          <rect x="18" y="-4" width="9" height="8" rx="1.4" fill="#06B6D4" className="stroke-sky-100" strokeWidth="1" />
          <path d="M-2 -5V5M2 -5V5" className="stroke-slate-700" strokeWidth="0.9" opacity="0.65" />
        </g>
      </g>

      {!isIcon && (
        <>
          <text
            x="48"
            y="108"
            textAnchor="middle"
            className="fill-slate-950 dark:fill-slate-50"
            fontFamily="Inter, Segoe UI, sans-serif"
            fontSize="11"
            fontWeight="800"
            letterSpacing="0.16em"
          >
            CAPACITY
          </text>
          <text
            x="48"
            y="124"
            textAnchor="middle"
            className="fill-slate-600 dark:fill-slate-300"
            fontFamily="Inter, Segoe UI, sans-serif"
            fontSize="10.5"
            fontWeight="700"
            letterSpacing="0.18em"
          >
            ANALYZER
          </text>
        </>
      )}
    </svg>
  );
}
