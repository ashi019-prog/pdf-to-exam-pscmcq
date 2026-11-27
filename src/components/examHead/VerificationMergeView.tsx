import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { ExamQuestion, OPTION_KEYS, OptionKey } from '../../types/exam';
import { DuplicateMatch, ExamHead, IncomingVerifiedQuestion } from '../../types/examHead';
import { detectDuplicates } from '../../utils/duplicateDetector';
import {
  appendPaperToExamHead,
  createExamHead,
  listExamHeads,
} from '../../services/examHeadManager';
import { localFolderStorage } from '../../services/localFolderStorage';

interface VerificationMergeViewProps {
  initialQuestions: ExamQuestion[];
  defaultPaperLabel: string;
  initialExamHeadId?: string;
  initialCreatingNew?: boolean;
  initialNewHeadName?: string;
  onMerged: (examHead: ExamHead, addedCount: number) => void;
  onCancel?: () => void;
}

type ViewFilter = 'duplicates' | 'missing-answers' | 'all';

export const VerificationMergeView: React.FC<VerificationMergeViewProps> = ({
  initialQuestions,
  defaultPaperLabel,
  initialExamHeadId,
  initialCreatingNew,
  initialNewHeadName,
  onMerged,
  onCancel,
}) => {
  const [examHeads, setExamHeads] = useState<ExamHead[]>([]);
  const [selectedHeadId, setSelectedHeadId] = useState<string>(initialExamHeadId ?? '');
  const [creatingNew, setCreatingNew] = useState<boolean>(Boolean(initialCreatingNew));
  const [newHeadName, setNewHeadName] = useState<string>(initialNewHeadName ?? '');
  const [paperLabel, setPaperLabel] = useState<string>(defaultPaperLabel);
  const [examYear, setExamYear] = useState<string>(() => {
    const match = defaultPaperLabel.match(/\b(19\d{2}|20\d{2})\b/);
    return match ? match[1] : String(new Date().getFullYear());
  });
  const [viewFilter, setViewFilter] = useState<ViewFilter>('duplicates');

  const [incoming, setIncoming] = useState<IncomingVerifiedQuestion[]>(() =>
    initialQuestions.map((q, idx) => ({
      tempId: `incoming-${idx + 1}-${q.number}`,
      text: q.text,
      options: { ...q.options },
      correctOption: q.correctOption,
      explanation: q.explanation,
      imageDataUrl: q.imageDataUrl,
      table: q.table,
    }))
  );

  // Keep incoming questions synced if initialQuestions changes (e.g., answer key updated)
  useEffect(() => {
    setIncoming(
      initialQuestions.map((q, idx) => ({
        tempId: `incoming-${idx + 1}-${q.number}`,
        text: q.text,
        options: { ...q.options },
        correctOption: q.correctOption,
        explanation: q.explanation,
        imageDataUrl: q.imageDataUrl,
        table: q.table,
      }))
    );
  }, [initialQuestions]);

  const [ignoredDuplicates, setIgnoredDuplicates] = useState<Record<string, boolean>>({});
  const [expandedCompare, setExpandedCompare] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadHeads = async () => {
    const list = await listExamHeads();
    setExamHeads(list);
    if (initialCreatingNew) {
      setCreatingNew(true);
      return;
    }
    if (initialExamHeadId && list.some((h) => h.id === initialExamHeadId)) {
      setSelectedHeadId(initialExamHeadId);
    } else if (list.length > 0 && !selectedHeadId) {
      setSelectedHeadId(list[0].id);
    } else if (list.length === 0) {
      setCreatingNew(true);
    }
  };

  useEffect(() => {
    void loadHeads();
    const unsub = localFolderStorage.subscribe(() => {
      void loadHeads();
    });
    return unsub;
  }, []);

  const selectedHead = useMemo(
    () => examHeads.find((h) => h.id === selectedHeadId) ?? null,
    [examHeads, selectedHeadId]
  );

  const duplicateMap: Record<string, DuplicateMatch> = useMemo(() => {
    const existingPool = creatingNew || !selectedHead ? [] : selectedHead.questions;
    return detectDuplicates(incoming, existingPool);
  }, [incoming, selectedHead, creatingNew]);

  const activeFlaggedIds = useMemo(
    () => Object.keys(duplicateMap).filter((tempId) => !ignoredDuplicates[tempId]),
    [duplicateMap, ignoredDuplicates]
  );

  const missingAnswerQuestions = useMemo(
    () => incoming.filter((q) => q.correctOption === null),
    [incoming]
  );

  // If there are no duplicates but some answers are missing, auto-switch to Missing Answers view
  useEffect(() => {
    if (viewFilter === 'duplicates' && activeFlaggedIds.length === 0 && missingAnswerQuestions.length > 0) {
      setViewFilter('missing-answers');
    }
  }, [activeFlaggedIds.length, missingAnswerQuestions.length, viewFilter]);

  const keyedIncoming = useMemo(
    () =>
      incoming.filter(
        (q) =>
          q.text.trim().length > 0 &&
          q.correctOption !== null &&
          OPTION_KEYS.every((k) => Boolean(q.options[k] && q.options[k].trim()))
      ),
    [incoming]
  );

  const parsedCount = initialQuestions.length;
  const duplicatesRemovedCount = Math.max(0, parsedCount - incoming.length);
  const readyCount = keyedIncoming.length;
  const existingCount = creatingNew || !selectedHead ? 0 : selectedHead.questions.length;
  const projectedTotal = existingCount + readyCount;

  const visibleQuestions = useMemo(() => {
    if (viewFilter === 'all') return incoming;
    if (viewFilter === 'missing-answers') {
      return incoming.filter((q) => q.correctOption === null);
    }
    return incoming.filter((q) => Boolean(duplicateMap[q.tempId] && !ignoredDuplicates[q.tempId]));
  }, [incoming, duplicateMap, ignoredDuplicates, viewFilter]);

  const handleRemoveAllFlagged = () => {
    const flaggedSet = new Set(activeFlaggedIds);
    setIncoming((prev) => prev.filter((q) => !flaggedSet.has(q.tempId)));
  };

  const handleDeleteIncoming = (tempId: string) => {
    setIncoming((prev) => prev.filter((q) => q.tempId !== tempId));
  };

  const handleKeepAnyway = (tempId: string) => {
    setIgnoredDuplicates((prev) => ({ ...prev, [tempId]: true }));
  };

  const handleUpdateIncoming = (
    tempId: string,
    patch: Partial<IncomingVerifiedQuestion>
  ) => {
    setIncoming((prev) =>
      prev.map((q) =>
        q.tempId === tempId
          ? {
              ...q,
              ...patch,
              options: patch.options ? { ...q.options, ...patch.options } : q.options,
            }
          : q
      )
    );
  };

  const handleCreateInlineHead = async () => {
    setError(null);
    if (!newHeadName.trim()) {
      setError('Enter a name for the new Exam Head.');
      return;
    }
    try {
      const created = await createExamHead(newHeadName.trim());
      setExamHeads((prev) => [created, ...prev]);
      setSelectedHeadId(created.id);
      setCreatingNew(false);
      setNewHeadName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Exam Head.');
    }
  };

  const handleAppend = async () => {
    setError(null);
    if (keyedIncoming.length === 0) {
      setError(
        'No questions with answers are ready to append. Select answers for the missing questions below or upload the Answer Key PDF.'
      );
      return;
    }

    setSaving(true);
    try {
      let targetId = selectedHeadId;
      if (creatingNew) {
        if (!newHeadName.trim()) {
          setError('Please enter a name for the new Exam Head.');
          setSaving(false);
          return;
        }
        const created = await createExamHead(newHeadName.trim());
        targetId = created.id;
      }

      if (!targetId) {
        setError('Please select or create a target Exam Head.');
        setSaving(false);
        return;
      }

      const updatedHead = await appendPaperToExamHead(targetId, keyedIncoming, {
        paperLabel: paperLabel.trim() || 'Imported Paper',
        examYear: examYear.trim() || undefined,
        parsedCount,
        duplicatesRemoved: duplicatesRemovedCount,
      });
      onMerged(updatedHead, keyedIncoming.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to append questions.');
    } finally {
      setSaving(false);
    }
  };

  const targetDisplayName = creatingNew
    ? newHeadName.trim() || 'New Exam Head'
    : selectedHead
    ? selectedHead.name
    : 'Exam Head';

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Duplicate Verification &amp; Append
            </h2>
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Target Exam Head</label>
              <button
                type="button"
                onClick={() => setCreatingNew((prev) => !prev)}
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                {creatingNew && examHeads.length > 0 ? 'Choose Existing' : '+ Create New'}
              </button>
            </div>

            {creatingNew ? (
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={newHeadName}
                  onChange={(e) => setNewHeadName(e.target.value)}
                  placeholder="e.g., Village Assistant"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreateInlineHead}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create
                </button>
              </div>
            ) : (
              <select
                value={selectedHeadId}
                onChange={(e) => setSelectedHeadId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              >
                {examHeads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.questions.length} questions)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Paper Batch Label
            </label>
            <input
              type="text"
              value={paperLabel}
              onChange={(e) => setPaperLabel(e.target.value)}
              placeholder="e.g., Prelims Set A"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Exam Year
            </label>
            <input
              type="text"
              maxLength={9}
              value={examYear}
              onChange={(e) => setExamYear(e.target.value)}
              placeholder="e.g., 2026"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Filter & Summary Bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewFilter('duplicates')}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewFilter === 'duplicates'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              Duplicates ({activeFlaggedIds.length})
            </button>

            {missingAnswerQuestions.length > 0 && (
              <button
                type="button"
                onClick={() => setViewFilter('missing-answers')}
                className={`rounded-lg px-3 py-1.5 transition ${
                  viewFilter === 'missing-answers'
                    ? 'bg-amber-600 text-white'
                    : 'border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
              >
                Missing Answers ({missingAnswerQuestions.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewFilter('all')}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              All Questions ({incoming.length})
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
            <span className="text-emerald-700">
              Ready to Save: <strong>{readyCount}</strong> / {incoming.length}
            </span>

            {activeFlaggedIds.length > 0 && (
              <button
                type="button"
                onClick={handleRemoveAllFlagged}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove All Flagged Duplicates ({activeFlaggedIds.length})
              </button>
            )}
          </div>
        </div>

        {missingAnswerQuestions.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {missingAnswerQuestions.length} question
              {missingAnswerQuestions.length === 1 ? '' : 's'} did not match an answer from the
              Answer Key PDF. You can select their answers manually below before appending.
            </span>
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={saving || readyCount === 0}
            onClick={handleAppend}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:bg-slate-300"
          >
            <Save className="h-4 w-4" />
            {saving
              ? 'Appending...'
              : `Append ${readyCount} Questions to ${targetDisplayName} (New Total: ${projectedTotal})`}
          </button>
        </div>
      </div>

      {viewFilter === 'duplicates' && activeFlaggedIds.length === 0 && missingAnswerQuestions.length === 0 ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
          <h3 className="mt-2 text-sm font-bold text-emerald-950">
            No Duplicate Questions Found
          </h3>
          <p className="mt-1 text-xs text-emerald-800">
            All <strong>{readyCount}</strong> questions are unique and their answers were
            automatically fetched from the Answer Key. Click the green button above to append them.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleQuestions.map((q) => {
            const originalIndex = incoming.findIndex((item) => item.tempId === q.tempId);
            const dup = duplicateMap[q.tempId];
            const isFlagged = Boolean(dup && !ignoredDuplicates[q.tempId]);
            const isExpanded = Boolean(expandedCompare[q.tempId]);
            const isMissingAns = q.correctOption === null;

            return (
              <div
                key={q.tempId}
                className={`rounded-xl border bg-white p-4 shadow-sm ${
                  isFlagged
                    ? dup.matchType === 'exact'
                      ? 'border-rose-300 ring-1 ring-rose-200'
                      : 'border-amber-300 ring-1 ring-amber-200'
                    : isMissingAns
                    ? 'border-amber-300 ring-1 ring-amber-100'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 min-w-[2.2rem] items-center justify-center rounded-md bg-slate-900 px-2 text-xs font-bold text-white">
                      #{originalIndex + 1}
                    </span>

                    {isFlagged && dup ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          dup.matchType === 'exact'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {dup.matchType === 'exact'
                          ? 'Exact Duplicate'
                          : dup.matchType === 'intra-batch'
                          ? 'Duplicate in Same PDF'
                          : `${Math.round(dup.similarityScore * 100)}% Similar`}{' '}
                        • {dup.matchedExistingQuestion.paperLabel} (Q
                        {dup.matchedExistingQuestion.poolNumber})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Unique
                      </span>
                    )}

                    {/* Show read-only Key badge if auto-fetched, or answer selector if missing */}
                    {isMissingAns ? (
                      <select
                        value=""
                        onChange={(e) =>
                          handleUpdateIncoming(q.tempId, {
                            correctOption: (e.target.value || null) as OptionKey | null,
                          })
                        }
                        className="rounded-lg border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="">Select Answer (A–D)</option>
                        {OPTION_KEYS.map((key) => (
                          <option key={key} value={key}>
                            Answer: {key}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={q.correctOption ?? ''}
                        onChange={(e) =>
                          handleUpdateIncoming(q.tempId, {
                            correctOption: (e.target.value || null) as OptionKey | null,
                          })
                        }
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-900 focus:border-indigo-500 focus:outline-none"
                      >
                        {OPTION_KEYS.map((key) => (
                          <option key={key} value={key}>
                            Key: {key}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isFlagged && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCompare((prev) => ({
                              ...prev,
                              [q.tempId]: !prev[q.tempId],
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          Compare
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeepAnyway(q.tempId)}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                        >
                          Keep Anyway
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteIncoming(q.tempId)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete / Exclude
                    </button>
                  </div>
                </div>

                {isFlagged && isExpanded && dup && (
                  <div className="mt-3 grid gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-bold text-slate-700">Incoming Question</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-900">{q.text}</p>
                    </div>
                    <div className="border-t border-amber-200 pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                      <p className="font-bold text-amber-900">
                        Existing Stored Question (Pool Q{dup.matchedExistingQuestion.poolNumber} •{' '}
                        {dup.matchedExistingQuestion.paperLabel})
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-800">
                        {dup.matchedExistingQuestion.text}
                      </p>
                      <p className="mt-1 font-semibold text-emerald-700">
                        Stored Answer: Option {dup.matchedExistingQuestion.correctOption}
                      </p>
                    </div>
                  </div>
                )}

                <textarea
                  rows={2}
                  value={q.text}
                  onChange={(e) => handleUpdateIncoming(q.tempId, { text: e.target.value })}
                  className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />

                <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {OPTION_KEYS.map((key) => (
                    <div key={key} className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${
                          q.correctOption === key
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {key}
                      </span>
                      <input
                        type="text"
                        value={q.options[key]}
                        onChange={(e) =>
                          handleUpdateIncoming(q.tempId, {
                            options: { ...q.options, [key]: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
