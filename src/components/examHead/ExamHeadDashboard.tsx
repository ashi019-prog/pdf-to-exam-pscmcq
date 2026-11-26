import React, { useEffect, useState } from 'react';
import {
  Database,
  Shuffle,
  FilePlus2,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
  Share2,
  Upload,
} from 'lucide-react';
import { ExamHead } from '../../types/examHead';
import { deleteQuestionFromExamHead, listExamHeads } from '../../services/examHeadManager';
import { localFolderStorage } from '../../services/localFolderStorage';
import { ExportShareModal } from '../sharing/ExportShareModal';

interface ExamHeadDashboardProps {
  onLaunchMock: (examHeadId: string) => void;
  onAddAnotherPaper: (examHead: ExamHead) => void;
  onOpenImportModal?: () => void;
}

export const ExamHeadDashboard: React.FC<ExamHeadDashboardProps> = ({
  onLaunchMock,
  onAddAnotherPaper,
  onOpenImportModal,
}) => {
  const [examHeads, setExamHeads] = useState<ExamHead[]>([]);
  const [expandedPapers, setExpandedPapers] = useState<Record<string, boolean>>({});
  const [browsingHead, setBrowsingHead] = useState<ExamHead | null>(null);
  const [sharingHead, setSharingHead] = useState<ExamHead | null>(null);

  const refresh = async () => {
    try {
      const list = await listExamHeads();
      setExamHeads(list);
      if (browsingHead) {
        const updated = list.find((h) => h.id === browsingHead.id) ?? null;
        setBrowsingHead(updated);
      }
    } catch {
      // Ignore read errors while folder is disconnected
    }
  };

  useEffect(() => {
    void localFolderStorage.checkStoredFolder().then(() => refresh());
    const unsub = localFolderStorage.subscribe(() => {
      void refresh();
    });
    return unsub;
  }, []);

  const handleDeletePooledQuestion = async (headId: string, questionId: string) => {
    const updated = await deleteQuestionFromExamHead(headId, questionId);
    setBrowsingHead(updated);
    await refresh();
  };

  if (examHeads.length === 0) {
    return null;
  }

  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900">
            Exam Head Question Banks ({examHeads.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-slate-500 sm:inline">
            Unified multi-paper pools • Embedded answer keys
          </span>
          {onOpenImportModal && (
            <button
              type="button"
              onClick={onOpenImportModal}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Exam File
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {examHeads.map((head) => {
          const isPapersOpen = Boolean(expandedPapers[head.id]);
          return (
            <div
              key={head.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{head.name}</h3>
                    <p className="mt-0.5 text-xs text-slate-600">
                      <strong className="text-indigo-700">{head.questions.length}</strong> pooled
                      questions • <strong>{head.importedPapers.length}</strong> imported paper
                      {head.importedPapers.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {new Date(head.updatedAt).toLocaleDateString()}
                  </span>
                </div>

                {head.importedPapers.length > 0 && (
                  <div className="mt-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPapers((prev) => ({
                          ...prev,
                          [head.id]: !prev[head.id],
                        }))
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700"
                    >
                      Paper History ({head.importedPapers.length})
                      {isPapersOpen ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {isPapersOpen && (
                      <ul className="mt-1.5 space-y-1 rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                        {head.importedPapers.map((p) => (
                          <li key={p.paperId} className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-slate-800">
                              {p.paperLabel}
                            </span>
                            <span className="shrink-0 text-slate-500">
                              +{p.addedCount} Qs
                              {p.duplicatesRemoved > 0
                                ? ` (${p.duplicatesRemoved} dupes skipped)`
                                : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={head.questions.length === 0}
                  onClick={() => onLaunchMock(head.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Launch Random Mock Exam
                </button>
                <button
                  type="button"
                  onClick={() => onAddAnotherPaper(head)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Add Paper
                </button>
                <button
                  type="button"
                  disabled={head.questions.length === 0}
                  onClick={() => setSharingHead(head)}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-40"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share / Export
                </button>
                <button
                  type="button"
                  onClick={() => setBrowsingHead(head)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Browse Pool
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {browsingHead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {browsingHead.name} — Question Pool ({browsingHead.questions.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Self-contained questions with embedded verified answers
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBrowsingHead(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
              {browsingHead.questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-900 px-2 py-0.5 font-bold text-white">
                        Q{q.poolNumber}
                      </span>
                      <span className="text-slate-500">{q.paperLabel}</span>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
                        Ans: {q.correctOption}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePooledQuestion(browsingHead.id, q.id)}
                      className="inline-flex items-center gap-1 rounded border border-rose-200 bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">
                    {q.text}
                  </p>
                  <div className="mt-2 grid gap-1 text-slate-700 sm:grid-cols-2">
                    <span>A) {q.options.A}</span>
                    <span>B) {q.options.B}</span>
                    <span>C) {q.options.C}</span>
                    <span>D) {q.options.D}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ExportShareModal
        open={sharingHead !== null}
        examHead={sharingHead}
        onClose={() => setSharingHead(null)}
      />
    </section>
  );
};
