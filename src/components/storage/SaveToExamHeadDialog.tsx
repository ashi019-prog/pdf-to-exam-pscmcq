import React, { useEffect, useState } from 'react';
import { FolderPlus, FolderCheck, Save, X, AlertCircle } from 'lucide-react';
import { ExamQuestion } from '../../types/exam';
import {
  ExamHeadSummary,
  localFolderStorage,
  slugifyExamHead,
} from '../../services/localFolderStorage';

interface SaveToExamHeadDialogProps {
  open: boolean;
  defaultPaperLabel: string;
  questions: ExamQuestion[];
  onClose: () => void;
  onSaved: (toastMessage: string) => void;
}

export const SaveToExamHeadDialog: React.FC<SaveToExamHeadDialogProps> = ({
  open,
  defaultPaperLabel,
  questions,
  onClose,
  onSaved,
}) => {
  const [examHeads, setExamHeads] = useState<ExamHeadSummary[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [paperLabel, setPaperLabel] = useState<string>(defaultPaperLabel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const snapshot = localFolderStorage.getStatusSnapshot();

  useEffect(() => {
    if (!open) return;
    setPaperLabel(defaultPaperLabel);
    setError(null);
    void localFolderStorage.listExamHeads().then((list) => {
      setExamHeads(list);
      if (list.length > 0) {
        setMode('existing');
        setSelectedSlug(list[0].id);
      } else {
        setMode('new');
        setSelectedSlug('');
      }
    });
  }, [open, defaultPaperLabel]);

  if (!open) return null;

  const handleConnectFirst = async () => {
    try {
      await localFolderStorage.connectFolder();
      const list = await localFolderStorage.listExamHeads();
      setExamHeads(list);
      if (list.length > 0) {
        setMode('existing');
        setSelectedSlug(list[0].id);
      }
    } catch {
      // User cancelled folder picker
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let targetSlug = '';
    let targetTitle = '';

    if (mode === 'existing') {
      const chosen = examHeads.find((h) => h.id === selectedSlug);
      if (!chosen) {
        setError('Please select an existing Exam Head or create a new one.');
        return;
      }
      targetSlug = chosen.id;
      targetTitle = chosen.title;
    } else {
      if (!newTitle.trim()) {
        setError('Please enter a name for the new Exam Head.');
        return;
      }
      targetTitle = newTitle.trim();
      targetSlug = slugifyExamHead(targetTitle);
    }

    setSaving(true);
    try {
      if (localFolderStorage.getStatusSnapshot().status === 'needs-permission') {
        await localFolderStorage.reconnectFolder();
      }
      const res = await localFolderStorage.saveOrAppendExamHead(
        targetSlug,
        targetTitle,
        questions,
        paperLabel
      );
      onSaved(
        `Saved ${res.addedCount} questions to ${res.examHead.title} (Total: ${res.totalQuestions})`
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save Exam Head.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Save to Local Exam Head</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {snapshot.status === 'disconnected' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <span>No local folder linked yet. Link once to save directly to your PC.</span>
              <button
                type="button"
                onClick={handleConnectFirst}
                className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
              >
                Connect Folder
              </button>
            </div>
          )}

          {snapshot.status === 'connected' && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-800">
              <FolderCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Saving silently to <strong>{snapshot.folderName}/exam-heads/</strong>
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              disabled={examHeads.length === 0}
              onClick={() => setMode('existing')}
              className={`rounded-lg py-2 transition ${
                mode === 'existing'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800 disabled:opacity-40'
              }`}
            >
              Append to Existing ({examHeads.length})
            </button>
            <button
              type="button"
              onClick={() => setMode('new')}
              className={`rounded-lg py-2 transition ${
                mode === 'new'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Create New Exam Head
            </button>
          </div>

          {mode === 'existing' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Select Exam Head
              </label>
              <select
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              >
                {examHeads.map((head) => (
                  <option key={head.id} value={head.id}>
                    {head.title} — currently {head.totalQuestions} questions ({head.paperCount}{' '}
                    paper{head.paperCount === 1 ? '' : 's'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                New Exam Head Name
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Village Field Assistant"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
              {newTitle.trim() && (
                <p className="mt-1 text-[11px] text-slate-500">
                  File: <code>exam-heads/{slugifyExamHead(newTitle)}.json</code>
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Paper Label / Year
            </label>
            <input
              type="text"
              value={paperLabel}
              onChange={(e) => setPaperLabel(e.target.value)}
              placeholder="e.g., 2026 Prelims Paper 092/2026-M"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || questions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : `Save ${questions.length} Questions`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
