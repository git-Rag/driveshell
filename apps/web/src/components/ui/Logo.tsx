// Project Sunflower brand mark — warm sunflower icon + wordmark
// All original artwork. No third-party logos or brand assets.

interface LogoProps {
  /** Show just the icon mark without the wordmark */
  iconOnly?: boolean;
  size?: number;
  className?: string;
}

export function Logo({ iconOnly = false, size = 28, className }: LogoProps) {
  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
      className={className}
      aria-label="Project Sunflower"
    >
      {/* Brand mark — small elegant golden sunflower motif centered on a bluish canvas */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Deep modern blue canvas */}
          <linearGradient
            id="sunflower-bg"
            x1="0"
            y1="0"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#0b1329" />
            <stop offset="50%" stopColor="#0f1f42" />
            <stop offset="100%" stopColor="#080e1e" />
          </linearGradient>

          {/* Blueish boundary glow border */}
          <linearGradient
            id="sunflower-border"
            x1="0"
            y1="0"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.8" />
          </linearGradient>

          {/* Golden sunflower petals */}
          <linearGradient
            id="sunflower-petal"
            x1="0"
            y1="-8"
            x2="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="50%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>

          <radialGradient
            id="sunflower-ambient"
            cx="14"
            cy="14"
            r="8"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Outer rounded bluish canvas container */}
        <rect
          x="1"
          y="1"
          width="26"
          height="26"
          rx="7"
          fill="url(#sunflower-bg)"
          stroke="url(#sunflower-border)"
          strokeWidth="1.2"
        />

        {/* Ambient bluish highlight */}
        <circle cx="14" cy="14" r="8" fill="url(#sunflower-ambient)" />

        {/* Small sunflower centered in the middle */}
        <g transform="translate(14, 14) scale(0.65)">
          {/* Main 8 petals */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path
              key={angle}
              d="M0 -8.2 C1.4 -5.5, 1.4 -2.8, 0 -1.8 C-1.4 -2.8, -1.4 -5.5, 0 -8.2 Z"
              fill="url(#sunflower-petal)"
              transform={`rotate(${angle})`}
            />
          ))}
          {/* Interspersed secondary petals for richness */}
          {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((angle) => (
            <path
              key={`sub-${angle}`}
              d="M0 -7 C1.1 -4.8, 1.1 -2.5, 0 -1.6 C-1.1 -2.5, -1.1 -4.8, 0 -7 Z"
              fill="#f59e0b"
              opacity="0.9"
              transform={`rotate(${angle})`}
            />
          ))}
          {/* Center seed disk */}
          <circle r="3.2" fill="#78350f" />
          <circle r="2" fill="#92400e" opacity="0.85" />
          <circle r="1" fill="#b45309" opacity="0.75" />
        </g>
      </svg>

      {!iconOnly && (
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.3px',
            userSelect: 'none',
          }}
        >
          <span
            style={{
              background: 'var(--ds-brand-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Project
          </span>{' '}
          <span style={{ color: 'var(--ds-text-primary)' }}>Sunflower</span>
        </span>
      )}
    </span>
  );
}
