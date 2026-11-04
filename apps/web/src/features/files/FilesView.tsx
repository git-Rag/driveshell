import { useState } from 'react';
import {
  Folder,
  FileText,
  FileCode,
  FileSpreadsheet,
  Image as ImageIcon,
  MoreVertical,
  ArrowUpDown,
  Search,
  Upload,
  FolderPlus,
  HardDrive,
  Share2,
} from 'lucide-react';

export function FilesView() {
  const [search, setSearch] = useState('');

  const mockFiles = [
    {
      id: '1',
      name: 'Camera Uploads',
      type: 'folder',
      modified: 'Nov 4, 2026',
      size: '24.8 GB',
      sharing: 'Private',
      icon: Folder,
      color: 'text-amber-400',
    },
    {
      id: '2',
      name: 'Documents & Receipts',
      type: 'folder',
      modified: 'Nov 1, 2026',
      size: '1.2 GB',
      sharing: 'Private',
      icon: Folder,
      color: 'text-amber-400',
    },
    {
      id: '3',
      name: 'Design Assets',
      type: 'folder',
      modified: 'Oct 28, 2026',
      size: '8.4 GB',
      sharing: 'Shared (3)',
      icon: Folder,
      color: 'text-blue-400',
    },
    {
      id: '4',
      name: 'Annual_Financial_Summary_2026.xlsx',
      type: 'sheet',
      modified: 'Today, 11:30 AM',
      size: '340 KB',
      sharing: 'Private',
      icon: FileSpreadsheet,
      color: 'text-emerald-400',
    },
    {
      id: '5',
      name: 'Project_Specification_v2.pdf',
      type: 'doc',
      modified: 'Yesterday, 4:10 PM',
      size: '2.8 MB',
      sharing: 'Shared (1)',
      icon: FileText,
      color: 'text-rose-400',
    },
    {
      id: '6',
      name: 'driveshell-config.json',
      type: 'code',
      modified: 'Nov 3, 2026',
      size: '12 KB',
      sharing: 'Private',
      icon: FileCode,
      color: 'text-violet-400',
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-ds-bg text-ds-text-primary">
      {/* Action Toolbar */}
      <div className="sticky top-0 z-20 glass border-b border-ds-border px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            disabled
            className="btn-primary opacity-60 cursor-not-allowed flex items-center gap-1.5 text-xs py-1.5 px-3"
            title="Write operations will be enabled in Phase 5"
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
          <div className="flex items-center gap-2 bg-ds-bg-elevated px-3 py-1 rounded-lg border border-ds-border/60 text-xs text-ds-text-muted">
            <HardDrive size={13} className="text-brand" />
            <span>SQLite Metadata Index</span>
          </div>
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ds-text-primary">All Files</h2>
            <p className="text-xs text-ds-text-muted mt-0.5">
              Phase 5 Files View — reads metadata directly from local SQLite database
            </p>
          </div>
        </div>

        {/* Clean Table */}
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
                <th className="py-3 px-4">Sharing</th>
                <th className="py-3 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ds-border/50">
              {mockFiles.map((file) => {
                const Icon = file.icon;
                return (
                  <tr
                    key={file.id}
                    className="hover:bg-ds-bg-hover transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <Icon size={18} className={file.color} />
                    </td>
                    <td className="py-3 px-4 font-medium text-ds-text-primary">{file.name}</td>
                    <td className="py-3 px-4 text-ds-text-muted">{file.modified}</td>
                    <td className="py-3 px-4 font-mono text-ds-text-muted">{file.size}</td>
                    <td className="py-3 px-4 text-ds-text-secondary">
                      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-ds-bg-elevated border border-ds-border/60">
                        {file.sharing.includes('Shared') && (
                          <Share2 size={10} className="text-brand" />
                        )}
                        {file.sharing}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button className="text-ds-text-muted hover:text-ds-text-primary p-1 rounded hover:bg-ds-bg-elevated">
                        <MoreVertical size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
