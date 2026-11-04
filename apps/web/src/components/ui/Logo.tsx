// DriveShell brand mark — gradient icon + wordmark
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
      aria-label="DriveShell"
    >
      {/* Brand mark — a rounded square with an abstract "shell/frame" motif */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="brand-g" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient
            id="brand-inner"
            x1="0"
            y1="0"
            x2="28"
            y2="28"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#c4b5fd" />
          </linearGradient>
        </defs>
        {/* Outer rounded square */}
        <rect width="28" height="28" rx="7" fill="url(#brand-g)" />
        {/* Shell motif: nested L-shaped brackets suggesting a UI frame */}
        <path
          d="M7 9.5C7 8.12 8.12 7 9.5 7H12V9.5H9.5V18.5H12V21H9.5C8.12 21 7 19.88 7 18.5V9.5Z"
          fill="url(#brand-inner)"
          opacity="0.95"
        />
        <path
          d="M21 9.5C21 8.12 19.88 7 18.5 7H16V9.5H18.5V18.5H16V21H18.5C19.88 21 21 19.88 21 18.5V9.5Z"
          fill="url(#brand-inner)"
          opacity="0.95"
        />
        {/* Center connector line */}
        <rect x="11" y="13" width="6" height="2" rx="1" fill="url(#brand-inner)" opacity="0.7" />
      </svg>

      {!iconOnly && (
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '-0.3px',
            color: 'var(--ds-text-primary)',
            userSelect: 'none',
          }}
        >
          DriveShell
        </span>
      )}
    </span>
  );
}
