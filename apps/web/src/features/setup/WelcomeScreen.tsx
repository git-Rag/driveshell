import { ArrowRight, CloudOff, FolderOpen, Images, Lock, Search, Shield, Zap } from 'lucide-react';

export function WelcomeScreen() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        gap: 0,
        minHeight: 0,
        overflowY: 'auto',
      }}
    >
      {/* Hero glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 480,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(59,130,246,0.07) 0%, transparent 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 560, width: '100%' }}>
        {/* Setup required badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            borderRadius: 'var(--ds-radius-full)',
            border: '1px solid var(--ds-border)',
            background: 'var(--ds-bg-elevated)',
            fontSize: 12,
            color: 'var(--ds-text-secondary)',
            marginBottom: 24,
            userSelect: 'none',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--ds-accent)',
              flexShrink: 0,
              boxShadow: '0 0 6px var(--ds-accent)',
            }}
            aria-hidden
          />
          Setup required
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: '-0.75px',
            lineHeight: 1.2,
            marginBottom: 14,
            color: 'var(--ds-text-primary)',
          }}
        >
          Your Drive,{' '}
          <span
            style={{
              background: 'var(--ds-brand-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            beautifully fast.
          </span>
        </h1>

        <p
          style={{
            fontSize: 15,
            color: 'var(--ds-text-secondary)',
            lineHeight: 1.65,
            marginBottom: 36,
            maxWidth: 440,
          }}
        >
          Connect your Google account to sync your library into a local index. Scroll 100k photos at
          60 fps. Search in milliseconds. Everything stays on your machine.
        </p>

        {/* CTA */}
        <button
          disabled
          title="Complete setup to get started"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 22px',
            borderRadius: 'var(--ds-radius-lg)',
            background: 'var(--ds-brand-gradient)',
            border: 'none',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'not-allowed',
            opacity: 0.5,
            letterSpacing: '-0.1px',
            boxShadow: 'var(--ds-shadow-brand)',
            fontFamily: 'inherit',
          }}
        >
          Connect Google Drive
          <ArrowRight size={15} />
        </button>
        <p style={{ fontSize: 12, color: 'var(--ds-text-disabled)', marginTop: 10 }}>
          Setup wizard launches in Phase 1 — credentials entered in the UI, stored in your OS
          keychain.
        </p>

        {/* Feature grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12,
            marginTop: 48,
          }}
        >
          {FEATURES.map((f) => (
            <FeatureCard key={f.title} {...f} />
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: <Zap size={16} />,
    iconColor: '#f59e0b',
    iconBg: 'rgba(245,158,11,0.12)',
    title: 'Instant everywhere',
    desc: 'Local SQLite index. Scroll 100k photos at 60 fps. FTS search in < 50 ms.',
  },
  {
    icon: <Images size={16} />,
    iconColor: '#3b82f6',
    iconBg: 'rgba(59,130,246,0.12)',
    title: 'Photo-first',
    desc: 'Justified grid with moments, albums, date-jump picker, and zoom levels.',
  },
  {
    icon: <Lock size={16} />,
    iconColor: '#8b5cf6',
    iconBg: 'rgba(139,92,246,0.12)',
    title: 'Private Vault',
    desc: 'AES-256-GCM encrypted storage. Drive sees only ciphertext. No backdoor.',
  },
  {
    icon: <Shield size={16} />,
    iconColor: '#10b981',
    iconBg: 'rgba(16,185,129,0.12)',
    title: 'Private by design',
    desc: 'Binds to 127.0.0.1 only. No telemetry. No cloud backend. MIT licensed.',
  },
  {
    icon: <FolderOpen size={16} />,
    iconColor: '#f97316',
    iconBg: 'rgba(249,115,22,0.12)',
    title: 'Full Files view',
    desc: 'Folder tree, sortable table, rename, trash, and drag-drop upload.',
  },
  {
    icon: <CloudOff size={16} />,
    iconColor: '#a1a1aa',
    iconBg: 'rgba(161,161,170,0.1)',
    title: 'Offline-ready UI',
    desc: 'UI reads the local DB. Works even when Drive is unreachable.',
  },
] as const;

function FeatureCard({
  icon,
  iconColor,
  iconBg,
  title,
  desc,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  desc: string;
}) {
  return (
    <div
      style={{
        padding: '16px 18px',
        borderRadius: 'var(--ds-radius-lg)',
        border: '1px solid var(--ds-border)',
        background: 'var(--ds-bg-elevated)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--ds-border-strong)';
        e.currentTarget.style.boxShadow = 'var(--ds-shadow-sm)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--ds-border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--ds-radius-md)',
          background: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <p
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: 'var(--ds-text-primary)',
            marginBottom: 3,
            letterSpacing: '-0.1px',
          }}
        >
          {title}
        </p>
        <p style={{ fontSize: 12.5, color: 'var(--ds-text-secondary)', lineHeight: 1.55 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

// Suppress unused import warning — Search will be used in Phase 1
void Search;
