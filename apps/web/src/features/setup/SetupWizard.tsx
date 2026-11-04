/**
 * Setup Wizard — 4-step flow:
 *
 *  Step 1: Welcome
 *  Step 2: Enter Client ID + Secret
 *  Step 3: Sign in with Google
 *  Step 4: Done
 *
 * The wizard replaces the main view when setup is not complete.
 * On completion it calls onComplete() and the shell takes over.
 */

import { useState, useCallback } from 'react';
import {
  ArrowRight,
  Key,
  Shield,
  Zap,
  HardDrive,
  ExternalLink,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronRight,
  Eye,
  EyeOff,
  User,
} from 'lucide-react';
import { Logo } from '../../components/ui/Logo';
import { saveCredentials, startAuth, type AccountSummary } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  accounts: AccountSummary[];
  onComplete: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Step indicators
// ---------------------------------------------------------------------------

function StepDots({ current, total }: { current: WizardStep; total: number }) {
  return (
    <div className="flex gap-1.5 items-center justify-center mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          className={[
            'rounded-full transition-all duration-300',
            n === current
              ? 'w-6 h-2 bg-brand'
              : n < current
                ? 'w-2 h-2 bg-brand/40'
                : 'w-2 h-2 bg-ds-border',
          ].join(' ')}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Welcome
// ---------------------------------------------------------------------------

function Step1Welcome({ onNext }: { onNext: () => void }) {
  const features = [
    {
      icon: Zap,
      label: 'Instant browse',
      desc: 'All metadata lives in a local SQLite DB — zero loading on scroll.',
    },
    {
      icon: HardDrive,
      label: 'Local-first',
      desc: 'No cloud backend. Your data stays on your machine.',
    },
    {
      icon: Shield,
      label: 'Privacy by design',
      desc: 'No telemetry, no analytics, no phoning home. Ever.',
    },
  ];

  return (
    <div className="wizard-step animate-fade-in">
      {/* Logo + hero */}
      <div className="flex flex-col items-center mb-10">
        <Logo size={52} className="mb-5" />
        <h1 className="text-3xl font-bold text-ds-text-primary mb-2 tracking-tight">
          Welcome to DriveShell
        </h1>
        <p className="text-ds-text-secondary text-center max-w-xs leading-relaxed">
          A fast, photo-first interface for Google Drive.
        </p>
      </div>

      {/* Feature pills */}
      <div className="flex flex-col gap-3 mb-10 w-full max-w-sm">
        {features.map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="flex items-start gap-3 p-3.5 rounded-xl bg-ds-raised border border-ds-border"
          >
            <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
              <Icon size={18} className="text-brand" />
            </div>
            <div>
              <p className="text-sm font-semibold text-ds-text-primary">{label}</p>
              <p className="text-xs text-ds-text-muted mt-0.5 leading-relaxed">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="btn-primary w-full max-w-sm flex items-center justify-center gap-2"
      >
        Get started
        <ArrowRight size={16} />
      </button>

      <p className="text-xs text-ds-text-muted mt-5 text-center max-w-xs">
        You&rsquo;ll need a Google Cloud project with the Drive API enabled.{' '}
        <a
          href="https://github.com/driveshell/driveshell/blob/main/docs/google-setup.md"
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:underline inline-flex items-center gap-0.5"
        >
          Setup guide <ExternalLink size={10} />
        </a>
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Credentials
// ---------------------------------------------------------------------------

function Step2Credentials({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both fields are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveCredentials(clientId.trim(), clientSecret.trim());
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials.');
    } finally {
      setLoading(false);
    }
  }, [clientId, clientSecret, onNext]);

  return (
    <div className="wizard-step animate-fade-in">
      <button
        onClick={onBack}
        className="text-ds-text-muted hover:text-ds-text-secondary text-sm flex items-center gap-1 mb-6 -mt-1 transition-colors"
      >
        <ChevronRight size={14} className="rotate-180" />
        Back
      </button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
          <Key size={20} className="text-brand" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-ds-text-primary">Google credentials</h2>
          <p className="text-sm text-ds-text-muted">Stored securely in your OS keychain.</p>
        </div>
      </div>

      {/* Warning callout */}
      <div className="flex gap-2.5 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 mb-6 text-sm">
        <Shield size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-amber-200/80 leading-relaxed">
          Never commit or share your Client ID or Client Secret.
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <div>
          <label htmlFor="clientId" className="label">
            Client ID
          </label>
          <input
            id="clientId"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="xxxx.apps.googleusercontent.com"
            value={clientId}
            onChange={(e) => setClientId(e.currentTarget.value)}
            className="input w-full font-mono text-sm"
          />
        </div>

        <div>
          <label htmlFor="clientSecret" className="label">
            Client Secret
          </label>
          <div className="relative">
            <input
              id="clientSecret"
              type={showSecret ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              placeholder="GOCSPX-…"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.currentTarget.value)}
              className="input w-full font-mono text-sm pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text-muted hover:text-ds-text-secondary transition-colors"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? 'Hide secret' : 'Show secret'}
            >
              {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <button
          className="btn-primary flex items-center justify-center gap-2 mt-1"
          onClick={() => void handleSubmit()}
          disabled={loading}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          {loading ? 'Saving…' : 'Save & continue'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Sign in with Google
// ---------------------------------------------------------------------------

function Step3SignIn({ onBack }: { onBack: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleSignIn = useCallback(() => {
    setLoading(true);
    startAuth('readonly'); // navigates away; loading spinner stays until redirect
  }, []);

  return (
    <div className="wizard-step animate-fade-in">
      <button
        onClick={onBack}
        className="text-ds-text-muted hover:text-ds-text-secondary text-sm flex items-center gap-1 mb-6 -mt-1 transition-colors"
      >
        <ChevronRight size={14} className="rotate-180" />
        Back
      </button>

      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <User size={28} className="text-brand" />
        </div>
        <h2 className="text-xl font-bold text-ds-text-primary mb-1">Sign in with Google</h2>
        <p className="text-sm text-ds-text-secondary max-w-xs leading-relaxed">
          DriveShell needs read access to your Drive to sync file metadata. No files are downloaded.
        </p>
      </div>

      {/* Scope explanation */}
      <div className="w-full max-w-sm flex flex-col gap-2.5 mb-8">
        {[
          { label: 'Read file metadata', granted: true },
          { label: 'Read file content (on demand)', granted: true },
          { label: 'Modify or delete files', granted: false },
          { label: 'Share your data', granted: false },
        ].map(({ label, granted }) => (
          <div key={label} className="flex items-center gap-2.5 text-sm">
            <div
              className={[
                'w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0',
                granted ? 'bg-emerald-500/15' : 'bg-ds-raised',
              ].join(' ')}
            >
              {granted ? (
                <CheckCircle2 size={12} className="text-emerald-400" />
              ) : (
                <div className="w-1.5 h-0.5 rounded bg-ds-text-muted" />
              )}
            </div>
            <span
              className={granted ? 'text-ds-text-secondary' : 'text-ds-text-muted line-through'}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Unverified app note */}
      <div className="w-full max-w-sm flex gap-2.5 p-3 rounded-xl bg-ds-raised border border-ds-border mb-6 text-xs text-ds-text-muted">
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5 text-amber-400" />
        <p className="leading-relaxed">
          Google will show an &ldquo;unverified app&rdquo; warning. This is expected for personal
          apps. Click{' '}
          <strong className="text-ds-text-secondary">Advanced → Go to DriveShell</strong> to
          proceed.
        </p>
      </div>

      <button
        className="btn-primary w-full max-w-sm flex items-center justify-center gap-2"
        onClick={handleSignIn}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Opening Google…
          </>
        ) : (
          <>
            <ExternalLink size={16} />
            Sign in with Google
          </>
        )}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Done
// ---------------------------------------------------------------------------

function Step4Done({
  accounts,
  onComplete,
}: {
  accounts: AccountSummary[];
  onComplete: () => void;
}) {
  const account = accounts[0];
  return (
    <div className="wizard-step animate-fade-in">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
          <CheckCircle2 size={32} className="text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-ds-text-primary mb-1">All set!</h2>
        <p className="text-sm text-ds-text-secondary">DriveShell is connected to your Drive.</p>
      </div>

      {account && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-ds-raised border border-ds-border mb-8 w-full max-w-sm">
          {account.avatarUrl ? (
            <img
              src={account.avatarUrl}
              alt={account.displayName}
              className="w-10 h-10 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-brand font-semibold text-sm">
              {account.displayName[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ds-text-primary truncate">
              {account.displayName}
            </p>
            <p className="text-xs text-ds-text-muted truncate">{account.email}</p>
          </div>
          <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 ml-auto" />
        </div>
      )}

      <button
        className="btn-primary w-full max-w-sm flex items-center justify-center gap-2"
        onClick={onComplete}
      >
        Open DriveShell
        <ArrowRight size={16} />
      </button>

      <p className="text-xs text-ds-text-muted mt-5 text-center max-w-xs">
        {/* TODO(phase-2): Initial sync will start automatically */}
        Initial sync will start in the background once Phase 2 is complete.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function SetupWizard({ accounts, onComplete }: Props) {
  // If we already have accounts (returned from OAuth), jump to step 4
  const [step, setStep] = useState<WizardStep>(accounts.length > 0 ? 4 : 1);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ds-bg p-6">
      <div className="w-full max-w-md">
        <StepDots current={step} total={4} />
        <div className="card p-8">
          {step === 1 && <Step1Welcome onNext={() => setStep(2)} />}
          {step === 2 && <Step2Credentials onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <Step3SignIn onBack={() => setStep(2)} />}
          {step === 4 && <Step4Done accounts={accounts} onComplete={onComplete} />}
        </div>
      </div>
    </div>
  );
}
