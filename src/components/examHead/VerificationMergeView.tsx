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

const MATH_SYMBOLS = ['×', '÷', '±', '√', '²', '³', 'π', '≤', '≥', '≠', '°', '₹', '½', '¼', '¾', '/'];

interface FocusedField {
  tempId: string;
  field: 'text' | OptionKey;
}

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
  const [focusedField, setFocusedField] = useState<FocusedField | null>(null);

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

  const parsedCount = initialQuestions.length;
  const duplicatesRemovedCount = Math.max(0, parsedCount - incoming.length);
  const readyCount = incoming.length;
  const existingCount = creatingNew || !selectedHead ? 0 : selectedHead.questions.length;
  const projectedTotal = existingCount + readyCount;

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

  const handleInsertSymbol = (symbol: string) => {
    if (!focusedField) return;
    setIncoming((prev) =>
      prev.map((q) => {
        if (q.tempId !== focusedField.tempId) return q;
        if (focusedField.field === 'text') {
          return { ...q, text: `${q.text}${symbol}` };
        }
        const key = focusedField.field;
        return {
          ...q,
          options: {
            ...q.options,
            [key]: `${q.options[key]}${symbol}`,
          },
        };
      })
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
    if (incoming.length === 0) {
      setError('No questions remaining to append.');
      return;
    }

    const missingAnswerIdx = incoming.findIndex((q) => !q.correctOption);
    if (missingAnswerIdx !== -1) {
      setError(`Question #${missingAnswerIdx + 1} is missing a verified correct answer (A–D).`);
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

      const updatedHead = await appendPaperToExamHead(targetId, incoming, {
        paperLabel: paperLabel.trim() || 'Imported Paper',
        parsedCount,
        duplicatesRemoved: duplicatesRemovedCount,
      });
      onMerged(updatedHead, incoming.length);
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
              Duplicate Check &amp; Append to Exam Head
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

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              Paper Label / Year
            </label>
            <input
              type="text"
              value={paperLabel}
              onChange={(e) => setPaperLabel(e.target.value)}
              placeholder="e.g., 2024 Prelims Set A"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
            <span className="text-slate-700">
              Parsed: <strong className="text-slate-900">{parsedCount}</strong>
            </span>
            <span className={activeFlaggedIds.length > 0 ? 'text-amber-700' : 'text-emerald-700'}>
              Flagged Duplicates: <strong>{activeFlaggedIds.length}</strong>
            </span>
            <span className="text-indigo-700">
              Ready to Append: <strong>{readyCount}</strong>
            </span>
          </div>

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

        <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Math Symbols:
          </span>
          {MATH_SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleInsertSymbol(sym)}
              title={
                focusedField
                  ? `Insert ${sym}`
                  : 'Click inside any question or option field first'
              }
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              {sym}
            </button>
          ))}
        </div>

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
              : `Append ${readyCount} New Questions to ${targetDisplayName} (New Total: ${projectedTotal})`}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {incoming.map((q, idx) => {
          const dup = duplicateMap[q.tempId];
          const isFlagged = Boolean(dup && !ignoredDuplicates[q.tempId]);
          const isExpanded = Boolean(expandedCompare[q.tempId]);

          return (
            <div
              key={q.tempId}
              className={`rounded-xl border bg-white p-4 shadow-sm ${
                isFlagged
                  ? dup.matchType === 'exact'
                    ? 'border-rose-300 ring-1 ring-rose-200'
                    : 'border-amber-300 ring-1 ring-amber-200'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-7 min-w-[2.2rem] items-center justify-center rounded-md bg-slate-900 px-2 text-xs font-bold text-white">
                    #{idx + 1}
                  </span>

                  {isFlagged && dup && (
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
                  )}

                  {!isFlagged && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Unique
                    </span>
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

                  <select
                    value={q.correctOption ?? ''}
                    onChange={(e) =>
                      handleUpdateIncoming(q.tempId, {
                        correctOption: (e.target.value || null) as OptionKey | null,
                      })
                    }
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900"
                  >
                    <option value="">Ans?</option>
                    {OPTION_KEYS.map((key) => (
                      <option key={key} value={key}>
                        Ans: {key}
                      </option>
                    ))}
                  </select>

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
                onFocus={() => setFocusedField({ tempId: q.tempId, field: 'text' })}
                onChange={(e) => handleUpdateIncoming(q.tempId, { text: e.target.value })}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              />

              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                {OPTION_KEYS.map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-700">
                      {key}
                    </span>
                    <input
                      type="text"
                      value={q.options[key]}
                      onFocus={() => setFocusedField({ tempId: q.tempId, field: key })}
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
    </div>
  );
};
