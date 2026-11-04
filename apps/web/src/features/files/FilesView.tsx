import { useState, useEffect, useCallback } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  FileVideo,
  File,
  FolderPlus,
  Search,
  Loader2,
  ChevronRight,
  Home,
  LayoutGrid,
  List,
  Heart,
  Trash2,
  Download,
  Edit2,
  X,
} from 'lucide-react';
import {
  browseFiles,
  updateFile,
  createFolder,
  getMediaThumbUrl,
  getMediaDownloadUrl,
} from '../../lib/api';
import type { FileRecord, BreadcrumbItem } from '../../lib/api';
import { PhotoLightbox } from '../gallery/PhotoLightbox';

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
  if (mime === 'application/vnd.google-apps.folder')
    return <Folder size={size} className="text-amber-400 fill-amber-400/20" />;
  if (mime.startsWith('image/')) return <ImageIcon size={size} className="text-blue-400" />;
  if (mime.startsWith('video/')) return <FileVideo size={size} className="text-purple-400" />;
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv'))
    return <FileSpreadsheet size={size} className="text-emerald-400" />;
  if (mime.includes('document') || mime.includes('pdf') || mime.includes('text'))
    return <FileText size={size} className="text-rose-400" />;
  if (mime.includes('javascript') || mime.includes('json') || mime.includes('xml'))
    return <FileCode size={size} className="text-violet-400" />;
  return <File size={size} className="text-zinc-400" />;
}

export function FilesView() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [_total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'modified_at' | 'size_bytes'>('modified_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Modals & Popovers
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [_activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Lightbox
  const [lightboxFile, setLightboxFile] = useState<FileRecord | null>(null);

  const fetchCurrentFolder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await browseFiles({
        parentId: currentFolderId,
        search: search.trim() || undefined,
        sortBy,
        sortDir,
        limit: 100,
      });
      setFiles(res.files);
      setTotal(res.total);
      setBreadcrumbs(res.breadcrumbs);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, search, sortBy, sortDir]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchCurrentFolder();
    }, 200);
    return () => clearTimeout(t);
  }, [fetchCurrentFolder]);

  // Folder navigation
  function handleNavigateFolder(folderId: string | null) {
    setCurrentFolderId(folderId);
    setSearch('');
  }

  // File action handlers
  async function handleToggleStar(file: FileRecord, e?: React.MouseEvent) {
    e?.stopPropagation();
    const newStarred = file.starred === 1 ? 0 : 1;
    setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, starred: newStarred } : f)));
    await updateFile(file.id, { starred: newStarred });
  }

  async function handleTrash(file: FileRecord, e?: React.MouseEvent) {
    e?.stopPropagation();
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    setActiveMenuId(null);
    await updateFile(file.id, { trashed: 1 });
  }

  async function handleRenameSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    const newName = renameValue.trim();
    setFiles((prev) => prev.map((f) => (f.id === renameTarget.id ? { ...f, name: newName } : f)));
    setRenameTarget(null);
    await updateFile(renameTarget.id, { name: newName });
  }

  async function handleCreateFolderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const name = newFolderName.trim();
    setShowNewFolderModal(false);
    setNewFolderName('');
    const res = await createFolder(name, currentFolderId);
    if (res.ok) {
      void fetchCurrentFolder();
    }
  }

  function handleItemClick(file: FileRecord) {
    if (file.mime_type === 'application/vnd.google-apps.folder') {
      handleNavigateFolder(file.id);
    } else if (file.mime_type.startsWith('image/') || file.mime_type.startsWith('video/')) {
      setLightboxFile(file);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#08080a] text-ds-text-primary">
      {/* Top Action Toolbar */}
      <div className="sticky top-0 z-20 glass border-b border-white/10 px-6 py-2.5 flex items-center justify-between gap-4 backdrop-blur-xl">
        {/* Left: Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewFolderModal(true)}
            className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-lg font-medium shadow-sm active:scale-95 transition-all"
          >
            <FolderPlus size={14} />
            New folder
          </button>
        </div>

        {/* Right: Search, Sort & View Mode */}
        <div className="flex items-center gap-3">
          {/* Live Search */}
          <div className="relative">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search in folder…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-zinc-900 border border-white/10 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/30 w-52 text-white placeholder:text-zinc-500 transition-all"
            />
            {loading && (
              <Loader2
                size={12}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin"
              />
            )}
          </div>

          {/* Sort Dropdown */}
          <select
            value={`${sortBy}_${sortDir}`}
            onChange={(e) => {
              const [f, d] = e.target.value.split('_');
              setSortBy(f as 'name' | 'modified_at' | 'size_bytes');
              setSortDir(d as 'asc' | 'desc');
            }}
            className="bg-zinc-900 border border-white/10 text-xs rounded-lg px-2.5 py-1.5 text-zinc-300 focus:outline-none focus:border-brand"
          >
            <option value="modified_at_desc">Modified (Newest)</option>
            <option value="modified_at_asc">Modified (Oldest)</option>
            <option value="name_asc">Name (A to Z)</option>
            <option value="name_desc">Name (Z to A)</option>
            <option value="size_bytes_desc">Size (Largest)</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-zinc-900 p-0.5 rounded-lg border border-white/10">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="List View"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Grid View"
            >
              <LayoutGrid size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation Bar */}
      <div className="px-6 py-2.5 border-b border-white/5 bg-zinc-950/40 flex items-center gap-1.5 text-xs text-zinc-400 overflow-x-auto">
        <button
          onClick={() => handleNavigateFolder(null)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors hover:text-white hover:bg-white/5 ${
            currentFolderId === null ? 'font-bold text-white bg-white/5' : ''
          }`}
        >
          <Home size={13} className="text-brand" />
          <span>Drive</span>
        </button>

        {breadcrumbs.map((crumb, idx) => (
          <div key={crumb.id} className="flex items-center gap-1.5 flex-shrink-0">
            <ChevronRight size={12} className="text-zinc-600" />
            <button
              onClick={() => handleNavigateFolder(crumb.id)}
              className={`px-2 py-1 rounded-md transition-colors hover:text-white hover:bg-white/5 ${
                idx === breadcrumbs.length - 1 ? 'font-bold text-white bg-white/5' : ''
              }`}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Main File Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {files.length === 0 && !loading && (
          <div className="py-20 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-500 mb-3">
              <Folder size={24} />
            </div>
            <p className="text-sm font-semibold text-zinc-300">This folder is empty</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              {search
                ? `No items match "${search}"`
                : 'Add files or create folders to organize your Drive.'}
            </p>
          </div>
        )}

        {viewMode === 'list' ? (
          /* Table View */
          <div className="card overflow-hidden border border-white/10 bg-zinc-950/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-zinc-900/60 text-zinc-400 font-semibold select-none">
                  <th className="py-2.5 px-4 w-10"></th>
                  <th className="py-2.5 px-4">Name</th>
                  <th className="py-2.5 px-4">Modified</th>
                  <th className="py-2.5 px-4">Size</th>
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4 w-16 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {files.map((file) => {
                  const isFolder = file.mime_type === 'application/vnd.google-apps.folder';

                  return (
                    <tr
                      key={file.id}
                      onClick={() => handleItemClick(file)}
                      className="hover:bg-white/5 transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-4">
                        <MimeIcon mime={file.mime_type} />
                      </td>
                      <td className="py-2.5 px-4 font-medium text-white max-w-sm">
                        <div className="flex items-center gap-2">
                          <span className="truncate block" title={file.name}>
                            {file.name}
                          </span>
                          {file.starred === 1 && (
                            <Heart
                              size={12}
                              className="text-rose-400 fill-rose-400 flex-shrink-0"
                            />
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400 whitespace-nowrap">
                        {formatDate(file.modified_at)}
                      </td>
                      <td className="py-2.5 px-4 font-mono text-zinc-400">
                        {isFolder ? '—' : formatBytes(file.size_bytes)}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400">
                        <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-white/10 font-mono">
                          {isFolder
                            ? 'Folder'
                            : file.mime_type.split('/').pop()?.toUpperCase().slice(0, 8)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Star */}
                          <button
                            onClick={(e) => handleToggleStar(file, e)}
                            className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-rose-400"
                            title="Favorite"
                          >
                            <Heart size={13} fill={file.starred === 1 ? 'currentColor' : 'none'} />
                          </button>

                          {/* Download */}
                          {!isFolder && (
                            <a
                              href={getMediaDownloadUrl(file.id)}
                              download
                              onClick={(e) => e.stopPropagation()}
                              className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white"
                              title="Download"
                            >
                              <Download size={13} />
                            </a>
                          )}

                          {/* Rename */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameTarget(file);
                              setRenameValue(file.name);
                            }}
                            className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white"
                            title="Rename"
                          >
                            <Edit2 size={13} />
                          </button>

                          {/* Trash */}
                          <button
                            onClick={(e) => handleTrash(file, e)}
                            className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-red-400"
                            title="Trash"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {files.map((file) => {
              const isFolder = file.mime_type === 'application/vnd.google-apps.folder';
              const isMedia =
                file.mime_type.startsWith('image/') || file.mime_type.startsWith('video/');

              return (
                <div
                  key={file.id}
                  onClick={() => handleItemClick(file)}
                  className="group relative p-3 rounded-xl bg-zinc-950/60 border border-white/10 hover:border-brand/60 hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div className="w-full aspect-video rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center mb-2 relative">
                    {isMedia ? (
                      <img
                        src={getMediaThumbUrl(file.id, 400)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <MimeIcon mime={file.mime_type} size={32} />
                    )}

                    {file.starred === 1 && (
                      <span className="absolute top-1.5 right-1.5 p-1 rounded-full bg-rose-500/80 text-white backdrop-blur-md">
                        <Heart size={10} fill="currentColor" />
                      </span>
                    )}
                  </div>

                  <div className="truncate">
                    <p className="text-xs font-medium text-white truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                      {isFolder ? 'Folder' : formatBytes(file.size_bytes)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <form
            onSubmit={handleCreateFolderSubmit}
            className="w-80 rounded-2xl bg-zinc-950 border border-white/10 p-5 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">New Folder</h3>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-white/15 focus:border-brand focus:outline-none text-white"
            />

            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowNewFolderModal(false)}
                className="btn-ghost px-3 py-1.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newFolderName.trim()}
                className="btn-primary px-3 py-1.5 rounded-lg"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <form
            onSubmit={handleRenameSubmit}
            className="w-80 rounded-2xl bg-zinc-950 border border-white/10 p-5 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Rename Item</h3>
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <input
              type="text"
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg bg-zinc-900 border border-white/15 focus:border-brand focus:outline-none text-white"
            />

            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="btn-ghost px-3 py-1.5 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!renameValue.trim()}
                className="btn-primary px-3 py-1.5 rounded-lg"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lightbox Preview */}
      {lightboxFile && (
        <PhotoLightbox
          files={[lightboxFile]}
          initialIndex={0}
          onClose={() => setLightboxFile(null)}
          onFileUpdated={(updated) => {
            setFiles((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
          }}
        />
      )}
    </div>
  );
}
