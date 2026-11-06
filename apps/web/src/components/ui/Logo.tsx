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
      {/* Brand mark — an elegant golden sunflower motif */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="sunflower-bg"
            x1="0"
            y1="0"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient
            id="sunflower-petal"
            x1="0"
            y1="0"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#fde047" />
          </linearGradient>
        </defs>
        {/* Outer rounded container */}
        <rect width="28" height="28" rx="7" fill="url(#sunflower-bg)" />
        {/* Stylized geometric sunflower petals */}
        <g transform="translate(14, 14)">
          {/* Petals radiating in 8 directions */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <path
              key={angle}
              d="M0 -8.5 C1.5 -6, 1.5 -3, 0 -2 C-1.5 -3, -1.5 -6, 0 -8.5 Z"
              fill="url(#sunflower-petal)"
              transform={`rotate(${angle})`}
            />
          ))}
          {/* Center seed disk */}
          <circle r="3.4" fill="#78350f" />
          <circle r="2" fill="#92400e" opacity="0.8" />
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
