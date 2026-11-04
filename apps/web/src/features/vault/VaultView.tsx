import { useState } from 'react';
import { Lock, Shield, Key, Eye, EyeOff, AlertTriangle } from 'lucide-react';

export function VaultView() {
  const [passphrase, setPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-ds-bg text-ds-text-primary text-center">
      <div className="max-w-md w-full card p-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-5 text-violet-400">
          <Lock size={30} />
        </div>

        <h2 className="text-xl font-bold tracking-tight text-ds-text-primary mb-1">
          Private Encrypted Vault
        </h2>
        <p className="text-xs text-ds-text-secondary max-w-sm mb-6 leading-relaxed">
          Client-side AES-256-GCM encrypted storage. Your files are encrypted locally before
          uploading to Google Drive. Google only ever sees ciphertext.
        </p>

        {/* Threat Model Callout */}
        <div className="w-full text-left p-3.5 rounded-xl bg-ds-bg-elevated border border-ds-border mb-6 text-xs text-ds-text-secondary space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-ds-text-primary">
            <Shield size={13} className="text-emerald-400" />
            <span>Zero-Knowledge Architecture</span>
          </div>
          <p className="text-[11px] text-ds-text-muted">
            Keys are derived via Argon2id from your passphrase and never sent over the network or
            stored unencrypted.
          </p>
        </div>

        {/* Unlock Form */}
        <div className="w-full space-y-3">
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              placeholder="Enter vault passphrase…"
              value={passphrase}
              onChange={(e) => setPassphrase(e.currentTarget.value)}
              className="input pr-10 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text-muted hover:text-ds-text-secondary"
            >
              {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          <button
            disabled
            className="btn-primary w-full flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
            title="Vault implementation planned in Phase 9"
          >
            <Key size={14} />
            Unlock Vault (Phase 9)
          </button>
        </div>
      </div>
    </div>
  );
}
