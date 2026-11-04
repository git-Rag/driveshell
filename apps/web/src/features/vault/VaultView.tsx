import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldCheck,
  Lock,
  Unlock,
  FilePlus,
  Trash2,
  Download,
  AlertTriangle,
  Clock,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import type { VaultFile, VaultStatus } from '../../lib/api';
import {
  getVaultStatus,
  setupVault,
  listVaultFiles,
  uploadVaultFile,
  getVaultFileData,
  deleteVaultFile,
  resetVault,
} from '../../lib/api';
import {
  generateSalt,
  deriveVaultKey,
  encryptText,
  decryptBytes,
  encryptBytes,
  verifyVaultKey,
  VAULT_CANARY_MESSAGE,
} from '../../lib/vault-crypto';

const AUTO_LOCK_SECONDS = 300; // 5 minutes inactivity

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export function VaultView() {
  const [status, setStatus] = useState<VaultStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);

  // Setup form
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Unlocked state
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [secondsRemaining, setSecondsRemaining] = useState(AUTO_LOCK_SECONDS);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const previewUrlsRef = useRef<Record<string, string>>({});
  previewUrlsRef.current = previewUrls;

  // Stable lock function declared before any useEffect hooks that depend on it
  const handleLock = useCallback(() => {
    // Revoke all in-memory object URLs for privacy
    for (const url of Object.values(previewUrlsRef.current)) {
      URL.revokeObjectURL(url);
    }
    setPreviewUrls({});
    setVaultKey(null);
    setPassphrase('');
    setConfirmPassphrase('');
    setErrorMsg(null);
  }, []);

  // Load vault status
  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVaultStatus();
      setStatus(res);
      setErrorMsg(null);
    } catch (err) {
      console.error('Failed to get vault status', err);
      setErrorMsg('Failed to check vault status. Please ensure server is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  // Auto-lock countdown timer
  useEffect(() => {
    if (!vaultKey) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setSecondsRemaining(AUTO_LOCK_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          handleLock();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [vaultKey, handleLock]);

  // Reset timer on user interaction
  const resetActivityTimer = useCallback(() => {
    if (vaultKey) {
      setSecondsRemaining(AUTO_LOCK_SECONDS);
    }
  }, [vaultKey]);

  useEffect(() => {
    const handleActivity = () => resetActivityTimer();
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [resetActivityTimer]);

  // Load files once unlocked
  const loadVaultFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await listVaultFiles();
      setFiles(res.files);
    } catch (err) {
      console.error('Failed to list vault files', err);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (vaultKey) {
      void loadVaultFiles();
    }
  }, [vaultKey, loadVaultFiles]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  async function handleSetup(e: React.FormEvent) {
    e.preventDefault();
    if (passphrase.length < 6) {
      setErrorMsg('Passphrase must be at least 6 characters');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setErrorMsg('Passphrases do not match');
      return;
    }

    setIsBusy(true);
    setErrorMsg(null);
    try {
      const salt = generateSalt();
      const key = await deriveVaultKey(passphrase, salt);
      const canary = await encryptText(key, VAULT_CANARY_MESSAGE);

      await setupVault(salt, canary.ciphertextBase64, canary.ivBase64);
      setVaultKey(key);
      setStatus({
        initialized: true,
        salt,
        canaryCiphertext: canary.ciphertextBase64,
        canaryIv: canary.ivBase64,
      });
      setPassphrase('');
      setConfirmPassphrase('');
    } catch (err) {
      setErrorMsg('Failed to initialize vault');
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!status?.salt || !status.canaryCiphertext || !status.canaryIv) return;

    setIsBusy(true);
    setErrorMsg(null);
    try {
      const key = await deriveVaultKey(passphrase, status.salt);
      const isValid = await verifyVaultKey(key, status.canaryCiphertext, status.canaryIv);

      if (isValid) {
        setVaultKey(key);
        setPassphrase('');
      } else {
        setErrorMsg('Incorrect master passphrase. Zero-knowledge verification failed.');
      }
    } catch (err) {
      setErrorMsg('Decryption failed');
      console.error(err);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUploadFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (!vaultKey || !e.target.files) return;
    const uploadedFiles = Array.from(e.target.files);
    if (uploadedFiles.length === 0) return;

    setIsBusy(true);
    try {
      for (const f of uploadedFiles) {
        const buffer = await f.arrayBuffer();
        const encrypted = await encryptBytes(vaultKey, buffer);

        await uploadVaultFile({
          name: f.name,
          mimeType: f.type || 'application/octet-stream',
          sizeBytes: f.size,
          encryptedPayloadBase64: encrypted.ciphertextBase64,
          iv: encrypted.ivBase64,
        });
      }
      await loadVaultFiles();
    } catch (err) {
      console.error('Failed to upload encrypted file', err);
      alert('Failed to encrypt and upload file');
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDownloadAndDecrypt(file: VaultFile) {
    if (!vaultKey) return;
    try {
      const fileData = await getVaultFileData(file.id);
      if (!fileData.encryptedPayloadBase64) return;

      const decrypted = await decryptBytes(vaultKey, fileData.encryptedPayloadBase64, file.iv);
      const blob = new Blob([decrypted as unknown as BlobPart], {
        type: file.mime_type,
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('Failed to decrypt and download', err);
      alert('Failed to decrypt file');
    }
  }

  async function handlePreview(file: VaultFile) {
    if (!vaultKey || previewUrls[file.id]) return;
    try {
      const fileData = await getVaultFileData(file.id);
      if (!fileData.encryptedPayloadBase64) return;

      const decrypted = await decryptBytes(vaultKey, fileData.encryptedPayloadBase64, file.iv);
      const blob = new Blob([decrypted as unknown as BlobPart], {
        type: file.mime_type,
      });
      const url = URL.createObjectURL(blob);

      setPreviewUrls((prev) => ({ ...prev, [file.id]: url }));
    } catch (err) {
      console.error('Failed to decrypt preview', err);
    }
  }

  async function handleDeleteFile(fileId: string) {
    if (!confirm('Permanently delete this encrypted file from your vault?')) return;
    try {
      await deleteVaultFile(fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      if (previewUrls[fileId]) {
        URL.revokeObjectURL(previewUrls[fileId]);
        setPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to delete vault file', err);
    }
  }

  async function handleResetVault() {
    if (
      !confirm(
        'DANGER: This will permanently delete your Private Vault and all encrypted files. Are you sure?',
      )
    ) {
      return;
    }
    try {
      await resetVault();
      handleLock();
      void checkStatus();
    } catch (err) {
      console.error('Failed to reset vault', err);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#09090b] text-white/50 text-sm">
        Checking Private Vault security status…
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // State 1: Setup Vault
  // -------------------------------------------------------------------------
  if (!status?.initialized) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#09090b] text-white select-none">
        <form
          onSubmit={handleSetup}
          className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl relative overflow-hidden"
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <ShieldCheck size={36} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Setup Private Vault</h2>
              <p className="text-xs text-white/50 mt-1">
                Zero-knowledge client-side encryption powered by AES-256-GCM.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-amber-200/90 text-xs leading-relaxed">
            <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold block text-amber-300">
                Zero-Knowledge Guarantee:
              </strong>
              Your passphrase is never sent to the server. If you lose your passphrase, your vault
              data cannot be recovered.
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">Master Passphrase</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 6 characters…"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  required
                  autoFocus
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">Confirm Master Passphrase</label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Repeat master passphrase…"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-center">
                {errorMsg}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isBusy || !passphrase}
            className="w-full py-3 rounded-xl bg-brand hover:bg-brand/90 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
          >
            {isBusy ? 'Deriving AES-256 Key…' : 'Initialize & Encrypt Vault'}
          </button>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // State 2: Locked Screen
  // -------------------------------------------------------------------------
  if (!vaultKey) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#09090b] text-white select-none">
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-sm bg-zinc-900 border border-white/10 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl relative overflow-hidden"
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <Lock size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white">Private Vault</h2>
              <p className="text-xs text-white/50 mt-1">
                Enter your master passphrase to unlock encrypted storage.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Master passphrase…"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                required
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {errorMsg && (
              <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl text-center">
                {errorMsg}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={isBusy || !passphrase}
            className="w-full py-3 rounded-xl bg-brand hover:bg-brand/90 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-brand/20 transition-all flex items-center justify-center gap-2"
          >
            {isBusy ? 'Verifying Key…' : 'Unlock Vault'}
          </button>

          <div className="pt-2 border-t border-white/10 flex justify-center">
            <button
              type="button"
              onClick={handleResetVault}
              className="text-[11px] text-white/30 hover:text-rose-400 transition-colors"
            >
              Reset Vault
            </button>
          </div>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // State 3: Unlocked Vault View
  // -------------------------------------------------------------------------
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#09090b] text-white overflow-hidden select-none">
      {/* Top Bar */}
      <div className="px-8 py-5 border-b border-white/5 bg-zinc-950/60 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Unlock size={20} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white">Private Vault</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-mono">
                Unlocked
              </span>
            </div>
            <span className="text-xs text-white/50">
              {files.length} {files.length === 1 ? 'file' : 'files'} encrypted with AES-256-GCM
            </span>
          </div>
        </div>

        {/* Right action controls */}
        <div className="flex items-center gap-3">
          {/* Inactivity timer pill */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/70"
            title="Auto-locks on inactivity"
          >
            <Clock size={13} className="text-brand" />
            <span>Auto-lock {timeDisplay}</span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUploadFiles}
            multiple
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-brand/20 transition-all"
          >
            <FilePlus size={15} />
            {isBusy ? 'Encrypting…' : 'Encrypt & Add File'}
          </button>

          <button
            onClick={handleLock}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-medium flex items-center gap-1.5 transition-all"
            title="Lock Vault Now"
          >
            <Lock size={14} />
            Lock
          </button>
        </div>
      </div>

      {/* Main Files Area */}
      <div className="flex-1 overflow-y-auto p-8">
        {loadingFiles ? (
          <div className="flex items-center justify-center h-64 text-white/40 text-sm">
            Loading encrypted files…
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
              <Shield size={32} />
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <h3 className="text-base font-semibold text-white">Your vault is empty</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Add confidential photos, videos, or documents. Files are encrypted client-side with
                AES-256 before leaving your browser.
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-medium flex items-center gap-2 shadow-md transition-all"
            >
              <FilePlus size={16} />
              Encrypt First File
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {files.map((file) => {
              const isImage = file.mime_type.startsWith('image/');
              const previewUrl = previewUrls[file.id];

              return (
                <div
                  key={file.id}
                  className="group relative flex flex-col rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-brand/40 shadow-sm hover:shadow-2xl transition-all duration-200"
                >
                  {/* File preview / thumbnail area */}
                  <div className="relative aspect-[4/3] w-full bg-zinc-950 overflow-hidden flex items-center justify-center">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    ) : isImage ? (
                      <button
                        onClick={() => handlePreview(file)}
                        className="flex flex-col items-center gap-2 text-white/40 hover:text-white transition-colors"
                      >
                        <ImageIcon size={32} />
                        <span className="text-[11px] underline">Decrypt preview</span>
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-white/30">
                        <FileText size={32} />
                        <span className="text-[10px] uppercase font-mono">{file.mime_type}</span>
                      </div>
                    )}

                    {/* Quick action buttons overlay */}
                    <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                      <button
                        onClick={() => handleDownloadAndDecrypt(file)}
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-white/20 text-white transition-all backdrop-blur-md"
                        title="Decrypt & Download"
                      >
                        <Download size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteFile(file.id)}
                        className="p-1.5 rounded-lg bg-black/70 hover:bg-rose-500 text-white transition-all backdrop-blur-md"
                        title="Delete from Vault"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* File meta footer */}
                  <div className="p-3.5 flex flex-col gap-1 border-t border-white/5">
                    <span className="text-xs font-medium text-white truncate" title={file.name}>
                      {file.name}
                    </span>
                    <div className="flex items-center justify-between text-[10px] text-white/50 font-mono">
                      <span>{formatBytes(file.size_bytes)}</span>
                      <span>AES-GCM</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
