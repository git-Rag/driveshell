import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  FileVideo,
  File,
  MoreVertical,
  ArrowUpDown,
  Upload,
  FolderPlus,
  HardDrive,
  Share2,
  Search,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { getFiles, searchFiles } from '../../lib/api';
import type { FileRecord } from '../../lib/api';
import { useSyncStatus } from '../../hooks/useSyncStatus';

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const delta = Date.now() - ms;
  if (delta < 86_400_000 && d.getDate() === now.getDate()) {
    return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (delta < 172_800_000) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function MimeIcon({ mime, size = 18 }: { mime: string; size?: number }) {
  if (mime.startsWith('image/')) return <ImageIcon size={size} className="text-blue-400" />;
  if (mime.startsWith('video/')) return <FileVideo size={size} className="text-purple-400" />;
  if (mime === 'application/vnd.google-apps.folder') return <Folder size={size} className="text-amber-400" />;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return <FileSpreadsheet size={size} className="text-emerald-400" />;
  if (mime.includes('document') || mime.includes('pdf') || mime.includes('text')) return <FileText size={size} className="text-rose-400" />;
  if (mime.includes('javascript') || mime.includes('json') || mime.includes('xml')) return <FileCode size={size} className="text-violet-400" />;
  return <File size={size} className="text-ds-text-muted" />;
}

export function FilesView() {
  const [search, setSearch] = useState('');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const LIMIT = 50;

  const { syncStatus } = useSyncStatus();
  const fileCount = syncStatus?.accounts[0]?.fileCount ?? 0;
  const syncDone = syncStatus?.accounts[0]?.fullSyncStage === 'done';

  const fetchFiles = useCallback(async (q: string, off: number) => {
    setLoading(true);
    setError(null);
    try {
      if (q.trim()) {
        const res = await searchFiles({ q: q.trim(), limit: LIMIT });
        setFiles(res.files);
        setTotal(res.files.length);
      } else {
        const res = await getFiles({ offset: off, limit: LIMIT });
        setFiles(res.files);
        setTotal(res.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void fetchFiles('', 0);
  }, [fetchFiles, syncDone]); // re-fetch when sync completes

  // Search with debounce
  useEffect(() => {
    const t = setTimeout(() => {
      setOffset(0);
      void fetchFiles(search, 0);
    }, 300);
    return () => clearTimeout(t);
  }, [search, fetchFiles]);

  function loadMore() {
    const nextOffset = offset + LIMIT;
    setOffset(nextOffset);
    void fetchFiles(search, nextOffset);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-ds-bg text-ds-text-primary">
      {/* Action Toolbar */}
      <div className="sticky top-0 z-20 glass border-b border-ds-border px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            disabled
            className="btn-primary opacity-60 cursor-not-allowed flex items-center gap-1.5 text-xs py-1.5 px-3"
            title="Write operations — Phase 5"
          >
            <Upload size={13} />
            Upload
          </button>
          <button
            disabled
            className="btn-ghost opacity-60 cursor-not-allowed flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <FolderPlus size={13} />
            New folder
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Live search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ds-text-muted pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-ds-bg-elevated border border-ds-border focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30 w-52 text-ds-text-primary placeholder:text-ds-text-muted transition-all"
            />
            {loading && (
              <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-ds-text-muted animate-spin" />
            )}
          </div>

          <button
            onClick={() => void fetchFiles(search, offset)}
            className="p-1.5 rounded-lg bg-ds-bg-elevated border border-ds-border text-ds-text-muted hover:text-ds-text-primary hover:border-brand/50 transition-all"
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>

          <div className="flex items-center gap-2 bg-ds-bg-elevated px-3 py-1 rounded-lg border border-ds-border/60 text-xs text-ds-text-muted">
            <HardDrive size={13} className="text-brand" />
            <span>{fileCount > 0 ? `${fileCount.toLocaleString()} files in SQLite` : 'SQLite Metadata Index'}</span>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ds-text-primary">All Files</h2>
            <p className="text-xs text-ds-text-muted mt-0.5">
              {syncDone
                ? `${total.toLocaleString()} files from local SQLite index${search ? ` matching "${search}"` : ''}`
                : 'Reads metadata from local SQLite — start a Drive sync to populate'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="card overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-ds-border bg-ds-bg-raised text-ds-text-secondary font-semibold">
                <th className="py-3 px-4 w-10"></th>
                <th className="py-3 px-4">
                  <div className="flex items-center gap-1.5 cursor-pointer hover:text-ds-text-primary">
                    Name <ArrowUpDown size={11} className="opacity-60" />
                  </div>
                </th>
                <th className="py-3 px-4">Modified</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border/50">
              {files.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-ds-text-muted text-xs">
                    {syncDone
                      ? search
                        ? `No files match "${search}"`
                        : 'No files found'
                      : 'Start a Drive sync to see your files here'}
                  </td>
                </tr>
              ) : null}

              {files.map((file) => (
                <tr
                  key={file.rowid}
                  className="hover:bg-ds-bg-hover transition-colors cursor-pointer group"
                >
                  <td className="py-3 px-4">
                    <MimeIcon mime={file.mime_type} />
                  </td>
                  <td className="py-3 px-4 font-medium text-ds-text-primary max-w-xs">
                    <span className="truncate block max-w-[300px]" title={file.name}>
                      {file.name}
                    </span>
                    {file.starred === 1 && (
                      <span className="text-[10px] text-amber-400 font-mono">★ Starred</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-ds-text-muted whitespace-nowrap">
                    {formatDate(file.modified_at)}
                  </td>
                  <td className="py-3 px-4 font-mono text-ds-text-muted">
                    {formatBytes(file.size_bytes)}
                  </td>
                  <td className="py-3 px-4 text-ds-text-secondary">
                    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-ds-bg-elevated border border-ds-border/60">
                      {file.mime_type.split('/').pop()?.toUpperCase().slice(0, 10) ?? '—'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    {file.web_view_link ? (
                      <a
                        href={file.web_view_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 rounded hover:bg-ds-bg-elevated text-ds-text-muted hover:text-ds-text-primary inline-flex"
                        title="Open in Drive"
                      >
                        <Share2 size={13} />
                      </a>
                    ) : (
                      <button className="text-ds-text-muted hover:text-ds-text-primary p-1 rounded hover:bg-ds-bg-elevated">
                        <MoreVertical size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {loading && files.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 size={20} className="animate-spin text-brand mx-auto" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Load more */}
        {!search && total > files.length + offset && (
          <div className="mt-4 text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="btn-ghost text-xs flex items-center gap-2 mx-auto"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : null}
              Load more ({total - files.length - offset} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
