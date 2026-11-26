import React, { useEffect, useRef, useState } from 'react';
import {
  Folder,
  FolderCheck,
  FolderSync,
  HardDrive,
  ChevronDown,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';
import {
  FullBackupBundle,
  localFolderStorage,
  StorageStatusSnapshot,
} from '../../services/localFolderStorage';

interface FolderStatusBadgeProps {
  onStatusToast?: (message: string) => void;
}

export const FolderStatusBadge: React.FC<FolderStatusBadgeProps> = ({ onStatusToast }) => {
  const [snapshot, setSnapshot] = useState<StorageStatusSnapshot>(() =>
    localFolderStorage.getStatusSnapshot()
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void localFolderStorage.checkStoredFolder().then(setSnapshot);
    const unsub = localFolderStorage.subscribe(() => {
      setSnapshot(localFolderStorage.getStatusSnapshot());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const next = await localFolderStorage.connectFolder();
      setSnapshot(next);
      setMenuOpen(false);
      if (next.status === 'connected' && onStatusToast) {
        onStatusToast(`Connected to folder "${next.folderName}" — Auto-Sync On.`);
      }
    } catch {
      // User cancelled directory picker
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = async () => {
    setBusy(true);
    try {
      const next = await localFolderStorage.reconnectFolder();
      setSnapshot(next);
      if (next.status === 'connected' && onStatusToast) {
        onStatusToast(`Reconnected folder "${next.folderName}".`);
      }
    } catch {
      // Permission denied or cancelled
    } finally {
      setBusy(false);
    }
  };

  const handleExportBackup = async () => {
    setMenuOpen(false);
    try {
      const bundle = await localFolderStorage.exportFullBackup();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `exam-bank-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (onStatusToast) {
        onStatusToast(`Exported ${bundle.examHeads.length} Exam Head(s) to backup JSON.`);
      }
    } catch {
      if (onStatusToast) {
        onStatusToast('Could not export backup JSON.');
      }
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : undefined;
    e.target.value = '';
    setMenuOpen(false);
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as FullBackupBundle;
      const count = await localFolderStorage.restoreFullBackup(parsed);
      if (onStatusToast) {
        onStatusToast(`Restored ${count} Exam Head(s) from backup.`);
      }
    } catch {
      if (onStatusToast) {
        onStatusToast('Invalid backup JSON file.');
      }
    }
  };

  return (
    <div ref={menuRef} className="relative inline-flex items-center">
      <input
        ref={restoreInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleRestoreBackup}
      />

      {snapshot.status === 'disconnected' && (
        <button
          type="button"
          disabled={busy}
          onClick={handleConnect}
          className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
        >
          <Folder className="h-3.5 w-3.5" />
          Connect Local Folder
        </button>
      )}

      {snapshot.status === 'needs-permission' && (
        <button
          type="button"
          disabled={busy}
          onClick={handleReconnect}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
        >
          <FolderSync className="h-3.5 w-3.5" />
          Reconnect {snapshot.folderName || 'Folder'}
        </button>
      )}

      {snapshot.status === 'connected' && (
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
        >
          <FolderCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span>Folder: {snapshot.folderName} • Auto-Sync On</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {snapshot.status === 'fallback' && (
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          <HardDrive className="h-3.5 w-3.5 text-slate-500" />
          <span>Browser Storage Mode</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      )}

      {menuOpen && (snapshot.status === 'connected' || snapshot.status === 'fallback') && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg">
          {snapshot.status === 'connected' && (
            <button
              type="button"
              onClick={handleConnect}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
              Switch Folder
            </button>
          )}
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5 text-emerald-600" />
            Export Full Backup (.json)
          </button>
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Upload className="h-3.5 w-3.5 text-amber-600" />
            Restore Backup (.json)
          </button>
        </div>
      )}
    </div>
  );
};
