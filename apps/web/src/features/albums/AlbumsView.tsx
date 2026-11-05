import { useState, useEffect, useCallback } from 'react';
import {
  FolderPlus,
  Plus,
  Trash2,
  Edit2,
  ArrowLeft,
  Image as ImageIcon,
  Check,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { Album, FileRecord } from '../../lib/api';
import {
  listAlbums,
  createAlbum,
  getAlbum,
  updateAlbum,
  deleteAlbum,
  addItemsToAlbum,
  removeItemFromAlbum,
  listPhotos,
  getMediaThumbUrl,
} from '../../lib/api';
import { PhotoLightbox } from '../gallery/PhotoLightbox';
import { MediaThumbnail } from '../gallery/MediaThumbnail';
import { isRealMedia } from '@driveshell/shared';

export function AlbumsView() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [albumFiles, setAlbumFiles] = useState<FileRecord[]>([]);
  const [loadingAlbumFiles, setLoadingAlbumFiles] = useState(false);

  // New Album Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Rename Album Modal
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [editTitle, setEditTitle] = useState('');

  // Add Photos to Album Modal
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<FileRecord[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [addingPhotos, setAddingPhotos] = useState(false);

  // Lightbox for photos in album
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  const loadAlbums = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAlbums();
      setAlbums(res.albums);
    } catch (err) {
      console.error('Failed to load albums', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlbums();
  }, [loadAlbums]);

  // Load files when an album is selected
  const openAlbum = useCallback(async (album: Album) => {
    setSelectedAlbum(album);
    setLoadingAlbumFiles(true);
    try {
      const res = await getAlbum(album.id);
      setAlbumFiles(res.files);
    } catch (err) {
      console.error('Failed to load album files', err);
    } finally {
      setLoadingAlbumFiles(false);
    }
  }, []);

  async function handleCreateAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await createAlbum(newTitle.trim(), newDesc.trim() || undefined);
      setAlbums((prev) => [res.album, ...prev]);
      setShowCreateModal(false);
      setNewTitle('');
      setNewDesc('');
      void openAlbum(res.album);
    } catch (err) {
      console.error('Failed to create album', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteAlbum(albumId: string) {
    if (
      !confirm(
        'Are you sure you want to delete this album? Photos inside will remain in your library.',
      )
    ) {
      return;
    }
    try {
      await deleteAlbum(albumId);
      setAlbums((prev) => prev.filter((a) => a.id !== albumId));
      if (selectedAlbum?.id === albumId) {
        setSelectedAlbum(null);
      }
    } catch (err) {
      console.error('Failed to delete album', err);
    }
  }

  async function handleRenameAlbum(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAlbum || !editTitle.trim()) return;
    try {
      const res = await updateAlbum(editingAlbum.id, { title: editTitle.trim() });
      setAlbums((prev) => prev.map((a) => (a.id === res.album.id ? res.album : a)));
      if (selectedAlbum?.id === editingAlbum.id) {
        setSelectedAlbum(res.album);
      }
      setEditingAlbum(null);
    } catch (err) {
      console.error('Failed to rename album', err);
    }
  }

  async function handleOpenAddPhotos() {
    if (!selectedAlbum) return;
    setShowAddPhotosModal(true);
    setLoadingRecent(true);
    setSelectedPhotoIds(new Set());
    try {
      const res = await listPhotos({ limit: 80 });
      // filter out already in album
      const existingIds = new Set(albumFiles.map((f: FileRecord) => f.id));
      setRecentPhotos(res.files.filter((f) => !existingIds.has(f.id)));
    } catch (err) {
      console.error('Failed to fetch recent photos', err);
    } finally {
      setLoadingRecent(false);
    }
  }

  function togglePhotoSelection(fileId: string) {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }

  async function handleSaveAddPhotos() {
    if (!selectedAlbum || selectedPhotoIds.size === 0) return;
    setAddingPhotos(true);
    try {
      const ids = Array.from(selectedPhotoIds);
      await addItemsToAlbum(selectedAlbum.id, ids);
      setShowAddPhotosModal(false);
      // Reload album files
      void openAlbum(selectedAlbum);
      void loadAlbums();
    } catch (err) {
      console.error('Failed to add photos to album', err);
    } finally {
      setAddingPhotos(false);
    }
  }

  async function handleRemovePhoto(fileId: string) {
    if (!selectedAlbum) return;
    try {
      await removeItemFromAlbum(selectedAlbum.id, fileId);
      setAlbumFiles((prev) => prev.filter((f) => f.id !== fileId));
      void loadAlbums();
    } catch (err) {
      console.error('Failed to remove photo from album', err);
    }
  }

  // -------------------------------------------------------------------------
  // Render Album Detail View
  // -------------------------------------------------------------------------
  if (selectedAlbum) {
    return (
      <div className="flex-1 flex flex-col h-full bg-[var(--ds-bg)] text-white overflow-hidden select-none">
        {/* Album Header Bar */}
        <div className="px-8 py-5 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-raised)]/80 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedAlbum(null)}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 active:scale-95 flex items-center justify-center text-white/80 hover:text-white transition-all border border-white/10"
              title="Back to all albums"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight text-white">
                  {selectedAlbum.title}
                </h1>
                <button
                  onClick={() => {
                    setEditingAlbum(selectedAlbum);
                    setEditTitle(selectedAlbum.title);
                  }}
                  className="text-white/40 hover:text-white transition-colors"
                  title="Rename Album"
                >
                  <Edit2 size={14} />
                </button>
              </div>
              <span className="text-xs text-white/50">
                {albumFiles.length} {albumFiles.length === 1 ? 'item' : 'items'}
                {selectedAlbum.description ? ` • ${selectedAlbum.description}` : ''}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenAddPhotos}
              className="px-4 py-2 rounded-xl bg-brand hover:bg-brand/90 active:scale-95 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-brand/20 transition-all"
            >
              <Plus size={15} />
              Add Photos
            </button>
            <button
              onClick={() => handleDeleteAlbum(selectedAlbum.id)}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 text-white/60 active:scale-95 border border-white/10 transition-all"
              title="Delete Album"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Album Files Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {loadingAlbumFiles ? (
            <div className="flex items-center justify-center h-64 text-white/40 text-sm">
              Loading album photos…
            </div>
          ) : albumFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
                <ImageIcon size={32} />
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="text-base font-semibold text-white">This album is empty</h3>
                <p className="text-xs text-white/50 leading-relaxed">
                  Add photos from your Google Drive library to organize them into this collection.
                </p>
              </div>
              <button
                onClick={handleOpenAddPhotos}
                className="mt-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-medium flex items-center gap-2 shadow-md transition-all"
              >
                <Plus size={16} />
                Add Photos Now
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {albumFiles.map((file, idx) => (
                <div
                  key={file.id}
                  onClick={() => setActiveLightboxIndex(idx)}
                  className="group relative aspect-square rounded-xl overflow-hidden bg-zinc-900 border border-white/5 hover:border-brand/50 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-xl hover:scale-[1.02]"
                >
                  <MediaThumbnail file={file} size={400} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2.5">
                    <span className="text-[11px] font-medium text-white truncate max-w-[80%]">
                      {file.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemovePhoto(file.id);
                      }}
                      className="p-1.5 rounded-lg bg-black/60 hover:bg-rose-500 text-white/80 hover:text-white transition-all"
                      title="Remove from album"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lightbox for album */}
        {activeLightboxIndex !== null && (
          <PhotoLightbox
            files={albumFiles}
            initialIndex={activeLightboxIndex}
            onClose={() => setActiveLightboxIndex(null)}
          />
        )}

        {/* Add Photos Modal */}
        {showAddPhotosModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
            onClick={() => setShowAddPhotosModal(false)}
          >
            <div
              className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-base font-semibold text-white">Select photos to add</h3>
                  <p className="text-xs text-white/50">
                    {selectedPhotoIds.size} {selectedPhotoIds.size === 1 ? 'photo' : 'photos'}{' '}
                    selected
                  </p>
                </div>
                <button
                  onClick={() => setShowAddPhotosModal(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>

              {loadingRecent ? (
                <div className="py-20 flex items-center justify-center text-white/40 text-xs">
                  Loading photos…
                </div>
              ) : recentPhotos.length === 0 ? (
                <div className="py-16 text-center text-white/50 text-xs">
                  All indexed photos are already in this album!
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2.5 overflow-y-auto max-h-[55vh] pr-1">
                  {recentPhotos.map((photo) => {
                    const isSelected = selectedPhotoIds.has(photo.id);
                    return (
                      <div
                        key={photo.id}
                        onClick={() => togglePhotoSelection(photo.id)}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                          isSelected
                            ? 'border-brand ring-2 ring-brand/40 scale-95 shadow-md'
                            : 'border-white/5 hover:border-white/30'
                        }`}
                      >
                        <MediaThumbnail file={photo} size={200} />
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-brand flex items-center justify-center text-white shadow-md">
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  onClick={() => setShowAddPhotosModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAddPhotos}
                  disabled={addingPhotos || selectedPhotoIds.size === 0}
                  className="px-5 py-2 rounded-xl bg-brand hover:bg-brand/90 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-brand/20 transition-all"
                >
                  {addingPhotos ? 'Adding…' : `Add ${selectedPhotoIds.size} Photos`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render All Albums Grid View
  // -------------------------------------------------------------------------
  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--ds-bg)] text-white overflow-hidden select-none">
      {/* Top Bar */}
      <div className="px-8 py-6 border-b border-[var(--ds-border-subtle)] bg-[var(--ds-bg-raised)]/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Albums</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 text-xs font-medium">
              {albums.length}
            </span>
          </div>
          <p className="text-xs text-white/50">
            Create custom photo and video collections saved directly on your device.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 rounded-xl bg-brand hover:bg-brand/90 active:scale-95 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-brand/20 transition-all"
        >
          <FolderPlus size={16} />
          New Album
        </button>
      </div>

      {/* Main Albums Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-white/40 text-sm">
            Loading your albums…
          </div>
        ) : albums.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40">
              <FolderPlus size={32} />
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <h3 className="text-base font-semibold text-white">No albums yet</h3>
              <p className="text-xs text-white/50 leading-relaxed">
                Group your favorite memories, trips, or projects into beautiful OneDrive-style
                albums.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 text-white text-xs font-medium flex items-center gap-2 shadow-md transition-all"
            >
              <Plus size={16} />
              Create First Album
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {/* Create New Album Card */}
            <div
              onClick={() => setShowCreateModal(true)}
              className="group aspect-[4/3] rounded-2xl border border-dashed border-white/15 hover:border-brand/60 bg-white/[0.02] hover:bg-brand/[0.04] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-brand/20 text-white/50 group-hover:text-brand flex items-center justify-center transition-all">
                <Plus size={22} />
              </div>
              <span className="text-xs font-medium text-white/70 group-hover:text-white transition-colors">
                New Album
              </span>
            </div>

            {/* Existing Albums */}
            {albums.map((album) => {
              const coverUrl = album.cover_thumbnail_url
                ? album.cover_thumbnail_url.replace(/=s\d+.*$/, '=s600')
                : null;

              return (
                <div
                  key={album.id}
                  onClick={() => openAlbum(album)}
                  className="group relative flex flex-col rounded-2xl overflow-hidden bg-zinc-900 border border-white/10 hover:border-brand/40 shadow-sm hover:shadow-2xl transition-all duration-200 cursor-pointer"
                >
                  {/* Cover Aspect */}
                  <div className="relative aspect-[4/3] w-full bg-zinc-950 overflow-hidden">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt={album.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950 text-white/20">
                        <ImageIcon size={40} />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity" />

                    {/* Badge top right: item count */}
                    <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-semibold text-white/90 border border-white/10">
                      {album.item_count ?? 0} {album.item_count === 1 ? 'item' : 'items'}
                    </div>

                    {/* Quick action buttons on hover */}
                    <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingAlbum(album);
                          setEditTitle(album.title);
                        }}
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-white/20 text-white/80 hover:text-white transition-all backdrop-blur-md"
                        title="Rename Album"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteAlbum(album.id);
                        }}
                        className="p-1.5 rounded-lg bg-black/60 hover:bg-rose-500 text-white/80 hover:text-white transition-all backdrop-blur-md"
                        title="Delete Album"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    {/* Title & modified date bottom */}
                    <div className="absolute bottom-3 inset-x-3 flex flex-col">
                      <h3 className="text-sm font-semibold text-white truncate drop-shadow-sm">
                        {album.title}
                      </h3>
                      <span className="text-[10px] text-white/60 flex items-center gap-1 mt-0.5">
                        <Clock size={10} />
                        {new Date(album.modified_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Album Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <form
            onSubmit={handleCreateAlbum}
            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Sparkles size={18} className="text-brand" />
                Create New Album
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">Album Title</label>
              <input
                type="text"
                placeholder="e.g. Summer Vacation, Family Trips"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">Description (Optional)</label>
              <textarea
                rows={2}
                placeholder="Add a short note about this album…"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newTitle.trim()}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-brand/20 transition-all"
              >
                {creating ? 'Creating…' : 'Create Album'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {editingAlbum && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
          onClick={() => setEditingAlbum(null)}
        >
          <form
            onSubmit={handleRenameAlbum}
            className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Rename Album</h3>
              <button
                type="button"
                onClick={() => setEditingAlbum(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-white/70">New Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
                required
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setEditingAlbum(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!editTitle.trim()}
                className="px-5 py-2.5 rounded-xl bg-brand hover:bg-brand/90 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-brand/20 transition-all"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
