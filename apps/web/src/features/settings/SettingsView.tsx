import { User, Shield, Database, CheckCircle2, Lock, Palette, Sun, Moon } from 'lucide-react';
import type { AccountSummary } from '../../lib/api';

interface SettingsViewProps {
  account?: AccountSummary | null;
  isDark?: boolean;
  onThemeToggle?: () => void;
}

export function SettingsView({
  account,
  isDark = true,
  onThemeToggle,
}: SettingsViewProps) {
  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full bg-ds-bg text-ds-text-primary">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-ds-text-primary">Settings</h1>
        <p className="text-xs text-ds-text-muted mt-1">
          Sunflower Drive configuration, local database, and security preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Appearance & Theme */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ds-text-secondary mb-4 flex items-center gap-2">
            <Palette size={15} className="text-brand" />
            Appearance & Theme
          </h2>

          <div className="flex items-center justify-between p-4 rounded-xl bg-ds-bg-elevated border border-ds-border">
            <div>
              <p className="text-sm font-semibold text-ds-text-primary">Theme Mode</p>
              <p className="text-xs text-ds-text-muted mt-0.5">
                Current active palette:{' '}
                <span className="font-medium text-ds-text-primary">
                  {isDark ? 'Sunflower Dark (Night)' : 'Sunflower Light (Daylight)'}
                </span>
              </p>
            </div>

            <button
              onClick={onThemeToggle}
              className="px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 bg-ds-bg-raised hover:bg-ds-bg-hover border border-ds-border text-ds-text-primary transition-all active:scale-95 shadow-xs"
            >
              {isDark ? (
                <>
                  <Sun size={14} className="text-amber-400" />
                  Switch to Light
                </>
              ) : (
                <>
                  <Moon size={14} className="text-indigo-400" />
                  Switch to Dark
                </>
              )}
            </button>
          </div>
        </div>
        {/* Connected Account */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ds-text-secondary mb-4 flex items-center gap-2">
            <User size={15} className="text-brand" />
            Connected Account
          </h2>

          {account ? (
            <div className="flex items-center justify-between p-4 rounded-xl bg-ds-bg-elevated border border-ds-border">
              <div className="flex items-center gap-3.5">
                {account.avatarUrl ? (
                  <img
                    src={account.avatarUrl}
                    alt={account.displayName}
                    className="w-12 h-12 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand/20 text-brand font-bold flex items-center justify-center">
                    {account.displayName[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ds-text-primary">
                      {account.displayName}
                    </p>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Connected
                    </span>
                  </div>
                  <p className="text-xs text-ds-text-muted font-mono">{account.email}</p>
                  <p className="text-[11px] text-ds-text-secondary mt-1">
                    Permission ID:{' '}
                    <span className="font-mono text-ds-text-muted">{account.id}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  OAuth Token Active
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-ds-text-muted">No account connected.</p>
          )}
        </div>

        {/* Local Storage & SQLite Engine */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ds-text-secondary mb-4 flex items-center gap-2">
            <Database size={15} className="text-brand" />
            Local Database & Storage
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-ds-bg-elevated border border-ds-border">
              <p className="text-xs text-ds-text-muted">SQLite Mode</p>
              <p className="text-sm font-semibold text-ds-text-primary mt-0.5">
                WAL (Write-Ahead Logging)
              </p>
              <p className="text-[11px] text-ds-text-muted mt-2">
                Enables simultaneous reads while syncing writes in the background.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-ds-bg-elevated border border-ds-border">
              <p className="text-xs text-ds-text-muted">Search Index</p>
              <p className="text-sm font-semibold text-ds-text-primary mt-0.5">
                FTS5 Trigram Hybrid
              </p>
              <p className="text-[11px] text-ds-text-muted mt-2">
                Sub-50ms full-text search across 100k+ filenames and paths.
              </p>
            </div>
          </div>
        </div>

        {/* Security & Credentials */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ds-text-secondary mb-4 flex items-center gap-2">
            <Shield size={15} className="text-brand" />
            Security & Keychain
          </h2>

          <div className="p-4 rounded-xl bg-ds-bg-elevated border border-ds-border flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ds-text-primary">
                Native OS Credential Storage
              </p>
              <p className="text-xs text-ds-text-muted mt-0.5">
                Windows Credential Manager / Keychain stores client secrets and tokens.
              </p>
            </div>
            <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
              <Lock size={12} />
              Secured
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
