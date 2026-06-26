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
  const coreId = `ca-${gradientId}-core`;
  const accentId = `ca-${gradientId}-accent`;
  const surfaceId = `ca-${gradientId}-surface`;

  return (
    <svg
      width={isIcon ? 60 : 96}
      height={isIcon ? 84 : 132}
      viewBox={isIcon ? '18 0 60 84' : '0 0 96 132'}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <defs>
        <linearGradient id={coreId} x1="28" y1="10" x2="72" y2="82" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F172A" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
        <linearGradient id={accentId} x1="22" y1="18" x2="78" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22D3EE" />
          <stop offset="0.52" stopColor="#38BDF8" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
        <linearGradient id={surfaceId} x1="34" y1="26" x2="63" y2="49" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#BFDBFE" />
        </linearGradient>
      </defs>

      <g strokeLinecap="round" strokeLinejoin="round">
        <path
          d="M48 12V76"
          className="stroke-slate-300 dark:stroke-slate-600"
          strokeWidth="1"
          strokeDasharray="2.2 5"
          opacity="0.65"
        />

        <g opacity="0.96">
          <ellipse
            cx="48"
            cy="34"
            rx="30"
            ry="10"
            transform="rotate(-31 48 34)"
            stroke={`url(#${accentId})`}
            strokeWidth="1.8"
          />
          <ellipse
            cx="48"
            cy="34"
            rx="25"
            ry="8.2"
            transform="rotate(32 48 34)"
            className="stroke-slate-500 dark:stroke-slate-300"
            strokeWidth="1.25"
            opacity="0.72"
          />
          <path
            d="M24 46C31 56 64 57 72 42"
            stroke={`url(#${accentId})`}
            strokeWidth="1.45"
            opacity="0.78"
          />
        </g>

        <g>
          <path
            d="M48 20L64 32L58 49L38 49L32 32L48 20Z"
            fill={`url(#${coreId})`}
            className="stroke-slate-900 dark:stroke-sky-100"
            strokeWidth="1.45"
          />
          <path
            d="M48 26L58 34L54 44L42 44L38 34L48 26Z"
            fill={`url(#${surfaceId})`}
            stroke={`url(#${accentId})`}
            strokeWidth="1.2"
          />
          <path
            d="M43 34H53M48 29V44"
            className="stroke-slate-800"
            strokeWidth="1.25"
            opacity="0.8"
          />
          <path
            d="M32 32L21 25M64 32L75 25M38 49L29 58M58 49L67 58"
            className="stroke-slate-600 dark:stroke-slate-300"
            strokeWidth="1.35"
            opacity="0.72"
          />
          <circle cx="21" cy="25" r="2.2" fill="#22D3EE" />
          <circle cx="75" cy="25" r="2.2" fill="#38BDF8" />
          <circle cx="29" cy="58" r="2" fill="#4F46E5" />
          <circle cx="67" cy="58" r="2" fill="#06B6D4" />
        </g>

        <g>
          <path
            d="M22 78C28.5 63.5 67.5 63.5 74 78"
            className="stroke-slate-800 dark:stroke-slate-100"
            strokeWidth="2.1"
          />
          <path
            d="M27 78H69"
            stroke={`url(#${accentId})`}
            strokeWidth="2.2"
          />
          <path
            d="M36 73V78M44 69V78M52 66V78M60 71V78"
            className="stroke-slate-700 dark:stroke-slate-200"
            strokeWidth="1.55"
            opacity="0.9"
          />
          <path
            d="M48 58V76"
            stroke={`url(#${accentId})`}
            strokeWidth="1.5"
            opacity="0.72"
          />
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
