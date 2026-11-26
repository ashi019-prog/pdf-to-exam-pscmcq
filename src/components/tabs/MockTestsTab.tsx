import React, { useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  FilePlus2,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { ExamResult, OPTION_KEYS, OptionKey } from '../../types/exam';
import { ExamHead, PooledQuestion } from '../../types/examHead';
import {
  deleteExamHead,
  deleteQuestionFromExamHead,
  renameExamHead,
  updateQuestionInExamHead,
} from '../../services/examHeadManager';

interface MockTestsTabProps {
  examHeads: ExamHead[];
  attempts: ExamResult[];
  onLaunchMock: (examHeadId: string) => void;
  onAddPaperToHead: (examHeadId?: string) => void;
  onShareExamHead: (examHead: ExamHead, mode: 'full' | 'update') => void;
  onDataChanged: () => void;
}

type SortMode = 'recent' | 'questions' | 'name';

function getLastAttemptForHead(head: ExamHead, attempts: ExamResult[]): ExamResult | null {
  const matching = attempts
    .filter(
      (a) =>
        a.examHeadId === head.id ||
        a.examTitle.trim().toLowerCase() === head.name.trim().toLowerCase()
    )
    .sort((a, b) => (Date.parse(b.completedAt) || 0) - (Date.parse(a.completedAt) || 0));
  return matching.length > 0 ? matching[0] : null;
}

export const MockTestsTab: React.FC<MockTestsTabProps> = ({
  examHeads,
  attempts,
  onLaunchMock,
  onAddPaperToHead,
  onShareExamHead,
  onDataChanged,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [confirmDeleteHeadId, setConfirmDeleteHeadId] = useState<string | null>(null);
  const [deletingHeadId, setDeletingHeadId] = useState<string | null>(null);
  const [renamingHeadId, setRenamingHeadId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>('');
  const [savingRename, setSavingRename] = useState<boolean>(false);

  const [managingHeadId, setManagingHeadId] = useState<string | null>(null);
  const [poolSearch, setPoolSearch] = useState<string>('');
  const [paperFilter, setPaperFilter] = useState<string>('all');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    text: string;
    options: Record<OptionKey, string>;
    correctOption: OptionKey;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredHeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = examHeads.filter((head) => {
      if (!q) return true;
      if (head.name.toLowerCase().includes(q)) return true;
      return head.importedPapers.some((p) => p.paperLabel.toLowerCase().includes(q));
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'questions') {
        return b.questions.length - a.questions.length;
      }
      if (sortMode === 'name') {
        return a.name.localeCompare(b.name);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [examHeads, searchQuery, sortMode]);

  const managingHead = useMemo(
    () => examHeads.find((h) => h.id === managingHeadId) ?? null,
    [examHeads, managingHeadId]
  );

  const drawerQuestions = useMemo(() => {
    if (!managingHead) return [];
    const q = poolSearch.trim().toLowerCase();
    return managingHead.questions.filter((item) => {
      if (paperFilter !== 'all' && item.paperId !== paperFilter) return false;
      if (!q) return true;
      return (
        item.text.toLowerCase().includes(q) ||
        item.paperLabel.toLowerCase().includes(q) ||
        `q${item.poolNumber}`.includes(q)
      );
    });
  }, [managingHead, poolSearch, paperFilter]);

  const startEditing = (question: PooledQuestion) => {
    setEditingQuestionId(question.id);
    setEditDraft({
      text: question.text,
      options: { ...question.options },
      correctOption: question.correctOption,
    });
  };

  const handleSaveEdit = async (headId: string, questionId: string) => {
    if (!editDraft || !editDraft.text.trim()) return;
    setBusyId(questionId);
    try {
      await updateQuestionInExamHead(headId, questionId, {
        text: editDraft.text.trim(),
        options: editDraft.options,
        correctOption: editDraft.correctOption,
      });
      setEditingQuestionId(null);
      setEditDraft(null);
      onDataChanged();
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteQuestion = async (headId: string, questionId: string) => {
    setBusyId(questionId);
    try {
      await deleteQuestionFromExamHead(headId, questionId);
      if (editingQuestionId === questionId) {
        setEditingQuestionId(null);
        setEditDraft(null);
      }
      onDataChanged();
    } finally {
      setBusyId(null);
    }
  };

  const handleRenameExamHead = async (headId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    setSavingRename(true);
    try {
      await renameExamHead(headId, trimmed);
      setRenamingHeadId(null);
      setRenameDraft('');
      onDataChanged();
    } finally {
      setSavingRename(false);
    }
  };

  const handleDeleteExamHead = async (headId: string) => {
    setDeletingHeadId(headId);
    try {
      await deleteExamHead(headId);
      setConfirmDeleteHeadId(null);
      if (managingHeadId === headId) {
        setManagingHeadId(null);
      }
      onDataChanged();
    } finally {
      setDeletingHeadId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Exam Heads or paper labels..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none"
          >
            <option value="recent">Sort: Recently Updated</option>
            <option value="questions">Sort: Most Questions</option>
            <option value="name">Sort: Name (A–Z)</option>
          </select>
        </div>

        <button
          type="button"
          onClick={() => onAddPaperToHead(undefined)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Add New Exam Head / Paper
        </button>
      </div>

      {filteredHeads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-900">
            {examHeads.length === 0 ? 'No Exam Heads created yet' : 'No matching Exam Heads'}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {examHeads.length === 0
              ? 'Upload your first PDF paper or import a shared .json bank to start pooling questions.'
              : 'Try a different search keyword.'}
          </p>
          {examHeads.length === 0 && (
            <button
              type="button"
              onClick={() => onAddPaperToHead(undefined)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              <FilePlus2 className="h-4 w-4" />
              Upload First Paper
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredHeads.map((head) => {
            const total = head.questions.length;
            let correctMastered = 0;
            let needsRevision = 0;
            let unattempted = 0;

            for (const q of head.questions) {
              if (!q.stats || q.stats.timesAttempted === 0) {
                unattempted += 1;
              } else if (q.stats.lastResult === 'wrong') {
                needsRevision += 1;
              } else {
                correctMastered += 1;
              }
            }

            const correctPct = total > 0 ? (correctMastered / total) * 100 : 0;
            const wrongPct = total > 0 ? (needsRevision / total) * 100 : 0;
            const unattemptedPct = total > 0 ? Math.max(0, 100 - correctPct - wrongPct) : 100;

            const lastAttempt = getLastAttemptForHead(head, attempts);

            return (
              <div
                key={head.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    {renamingHeadId === head.id ? (
                      <div className="flex flex-1 items-center gap-1.5">
                        <input
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleRenameExamHead(head.id);
                            } else if (e.key === 'Escape') {
                              setRenamingHeadId(null);
                              setRenameDraft('');
                            }
                          }}
                          autoFocus
                          className="w-full rounded-lg border border-indigo-400 px-2.5 py-1 text-sm font-bold text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingRename || !renameDraft.trim()}
                          onClick={() => void handleRenameExamHead(head.id)}
                          title="Save Name"
                          className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:bg-slate-300"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingHeadId(null);
                            setRenameDraft('');
                          }}
                          title="Cancel"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-base font-bold text-slate-900 leading-snug">
                          {head.name}
                        </h3>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingHeadId(head.id);
                            setRenameDraft(head.name);
                          }}
                          title="Rename Exam Head"
                          className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                      {total} Qs
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-600">
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5">
                      <Layers className="h-3 w-3 text-slate-500" />
                      {head.importedPapers.length} Paper
                      {head.importedPapers.length === 1 ? '' : 's'}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span>
                      Updated {new Date(head.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                      <span>Pool Mastery</span>
                      <span>
                        {correctMastered} ok • {needsRevision} wrong • {unattempted} new
                      </span>
                    </div>
                    <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${correctPct}%` }}
                        title={`Correct: ${correctMastered}`}
                      />
                      <div
                        className="bg-rose-500"
                        style={{ width: `${wrongPct}%` }}
                        title={`Needs Revision: ${needsRevision}`}
                      />
                      <div
                        className="bg-slate-300"
                        style={{ width: `${unattemptedPct}%` }}
                        title={`Unattempted: ${unattempted}`}
                      />
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {lastAttempt ? (
                      <div className="flex items-center justify-between">
                        <span>
                          Last test:{' '}
                          <strong className="text-slate-800">
                            {new Date(lastAttempt.completedAt).toLocaleDateString()}
                          </strong>
                        </span>
                        <span className="font-bold text-indigo-700">
                          {lastAttempt.finalScore}/{lastAttempt.totalMarks} (
                          {lastAttempt.percentage}%)
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-500">Not attempted yet</span>
                    )}
                  </div>
                </div>

                <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    disabled={total === 0}
                    onClick={() => onLaunchMock(head.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
                  >
                    <Shuffle className="h-4 w-4" />
                    Launch Random Mock
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => onAddPaperToHead(head.id)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-3.5 w-3.5 text-indigo-600" />
                      Add Paper
                    </button>
                    <button
                      type="button"
                      disabled={total === 0}
                      onClick={() => onShareExamHead(head, 'full')}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <Share2 className="h-3.5 w-3.5 text-emerald-600" />
                      Share
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setManagingHeadId(head.id);
                        setPoolSearch('');
                        setPaperFilter('all');
                        setEditingQuestionId(null);
                        setEditDraft(null);
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-slate-600" />
                      Manage
                    </button>
                  </div>

                  {confirmDeleteHeadId === head.id ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px]">
                      <span className="font-semibold text-rose-800">Delete this Exam Head?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={deletingHeadId === head.id}
                          onClick={() => void handleDeleteExamHead(head.id)}
                          className="rounded-md bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700 disabled:bg-rose-300"
                        >
                          {deletingHeadId === head.id ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteHeadId(null)}
                          className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteHeadId(head.id)}
                      className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-rose-100 bg-rose-50/50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove Exam Head
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {managingHead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Manage Pool — {managingHead.name}
                </h3>
                <p className="text-xs text-slate-500">
                  {managingHead.questions.length} stored questions •{' '}
                  {managingHead.importedPapers.length} merged papers
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManagingHeadId(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 border-b border-slate-100 bg-slate-50 px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaperFilter('all')}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                    paperFilter === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  All Papers ({managingHead.questions.length})
                </button>
                {managingHead.importedPapers.map((p) => (
                  <button
                    key={p.paperId}
                    type="button"
                    onClick={() => setPaperFilter(p.paperId)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                      paperFilter === p.paperId
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {p.paperLabel} ({p.addedCount})
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="Search questions by text or number..."
                  className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {drawerQuestions.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-500">
                  No questions match this filter.
                </p>
              ) : (
                drawerQuestions.map((q) => {
                  const isEditing = editingQuestionId === q.id && editDraft !== null;
                  const isBusy = busyId === q.id;

                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                            Q{q.poolNumber}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            {q.paperLabel}
                          </span>
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                            Key: {q.correctOption}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSaveEdit(managingHead.id, q.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingQuestionId(null);
                                  setEditDraft(null);
                                }}
                                className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditing(q)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Edit3 className="h-3 w-3" />
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleDeleteQuestion(managingHead.id, q.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </div>

                      {isEditing && editDraft ? (
                        <div className="mt-3 space-y-2.5">
                          <textarea
                            rows={2}
                            value={editDraft.text}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, text: e.target.value })
                            }
                            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                          />
                          <div className="grid gap-2 sm:grid-cols-2">
                            {OPTION_KEYS.map((key) => (
                              <div key={key} className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-600">{key})</span>
                                <input
                                  type="text"
                                  value={editDraft.options[key]}
                                  onChange={(e) =>
                                    setEditDraft({
                                      ...editDraft,
                                      options: { ...editDraft.options, [key]: e.target.value },
                                    })
                                  }
                                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-900"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-700">Correct Option:</span>
                            <select
                              value={editDraft.correctOption}
                              onChange={(e) =>
                                setEditDraft({
                                  ...editDraft,
                                  correctOption: e.target.value as OptionKey,
                                })
                              }
                              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800"
                            >
                              {OPTION_KEYS.map((key) => (
                                <option key={key} value={key}>
                                  {key}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 whitespace-pre-wrap text-xs font-medium text-slate-900">
                            {q.text}
                          </p>
                          <div className="mt-2 grid gap-1.5 text-[11px] sm:grid-cols-2">
                            {OPTION_KEYS.map((key) => (
                              <div
                                key={key}
                                className={`rounded-lg border px-2.5 py-1 ${
                                  q.correctOption === key
                                    ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-900'
                                    : 'border-slate-100 bg-slate-50 text-slate-700'
                                }`}
                              >
                                <span className="font-bold">{key})</span> {q.options[key]}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
