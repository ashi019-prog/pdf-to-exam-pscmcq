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
import { ExamQuestion, OPTION_KEYS } from '../../types/exam';
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
  const [showAllQuestions, setShowAllQuestions] = useState<boolean>(false);

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

  // Automatically detect duplicates against the selected Exam Head and within the same PDF
  const duplicateMap: Record<string, DuplicateMatch> = useMemo(() => {
    const existingPool = creatingNew || !selectedHead ? [] : selectedHead.questions;
    return detectDuplicates(incoming, existingPool);
  }, [incoming, selectedHead, creatingNew]);

  const activeFlaggedIds = useMemo(
    () => Object.keys(duplicateMap).filter((tempId) => !ignoredDuplicates[tempId]),
    [duplicateMap, ignoredDuplicates]
  );

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

  const unkeyedOrIncompleteCount = incoming.length - keyedIncoming.length;
  const parsedCount = initialQuestions.length;
  const duplicatesRemovedCount = Math.max(0, parsedCount - incoming.length);
  const readyCount = keyedIncoming.length;
  const existingCount = creatingNew || !selectedHead ? 0 : selectedHead.questions.length;
  const projectedTotal = existingCount + readyCount;

  const visibleQuestions = useMemo(() => {
    if (showAllQuestions) return incoming;
    return incoming.filter((q) => Boolean(duplicateMap[q.tempId] && !ignoredDuplicates[q.tempId]));
  }, [incoming, duplicateMap, ignoredDuplicates, showAllQuestions]);

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
        'No questions with auto-fetched answers are ready to append. Please make sure the Answer Key PDF was uploaded in Step 1.'
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
            <span className="text-emerald-700">
              Auto-Keyed Ready: <strong>{readyCount}</strong>
            </span>
            <span className={activeFlaggedIds.length > 0 ? 'text-amber-700' : 'text-emerald-700'}>
              Flagged Duplicates: <strong>{activeFlaggedIds.length}</strong>
            </span>
            {unkeyedOrIncompleteCount > 0 && (
              <span className="text-slate-500">
                Cancelled / Skipped: <strong>{unkeyedOrIncompleteCount}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllQuestions((prev) => !prev)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              {showAllQuestions
                ? `Show Duplicates Only (${activeFlaggedIds.length})`
                : `Inspect All (${incoming.length})`} </button>  {activeFlaggedIds.length > 0 && ( <button type="button" onClick={handleRemoveAllFlagged} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700" > <Trash2 className="h-3.5 w-3.5" /> Remove All Flagged Duplicates ({activeFlaggedIds.length}) </button> )} </div> </div>  {error && ( <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700"> <AlertTriangle className="h-4 w-4 shrink-0" /> <span>{error}</span> </div> )}  <div className="mt-4 flex justify-end"> <button type="button" disabled={saving \vert{}\vert{} readyCount === 0} onClick={handleAppend} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:bg-slate-300" > <Save className="h-4 w-4" /> {saving ? 'Appending...' : `Append ${readyCount} Questions to ${targetDisplayName} (New Total:${projectedTotal})`}
          </button>
        </div>
      </div>

      {!showAllQuestions && activeFlaggedIds.length === 0 ? (
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
                      #{originalIndex + 1}
                    </span>

                    {isFlagged && dup ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ dup.matchType === 'exact' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800' }`} > <AlertTriangle className="h-3.5 w-3.5" /> {dup.matchType === 'exact' ? 'Exact Duplicate' : dup.matchType === 'intra-batch' ? 'Duplicate in Same PDF' : `${Math.round(dup.similarityScore * 100)}% Similar`}{' '}
                        • {dup.matchedExistingQuestion.paperLabel} (Q
                        {dup.matchedExistingQuestion.poolNumber})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Unique
                      </span>
                    )}

                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ q.correctOption ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500' }`} > {q.correctOption ? `Key: ${q.correctOption}` : 'Key: Cancelled / Unmatched'}
                    </span>
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
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs font-bold ${ q.correctOption === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700' }`} > {key} </span> <input type="text" value={q.options[key]} onChange={(e) => handleUpdateIncoming(q.tempId, { options: { ...q.options, [key]: e.target.value }, }) } className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none" /> </div> ))} </div> </div> ); })} </div> )} </div> ); }; ```  ### 2. `src/components/tabs/UploadCreateTab.tsx` (UPDATE — replace entire file) ```tsx import React, { useEffect, useMemo, useRef, useState } from 'react'; import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, FileJson, FileText, Languages, Share2, Shuffle, Sparkles, Upload, } from 'lucide-react'; import { ExamQuestion, OPTION_KEYS, OptionKey } from '../../types/exam'; import { ExamHead } from '../../types/examHead'; import { ImportAnalysisPreview } from '../../types/sharePackage'; import { DetectedLanguage, extractTextFromPdf, mergeQuestionsWithAnswerKey, MultiBookletAnswerKeyResult, OcrLanguageOption, parseMultiBookletAnswerKey, parseQuestionsFromText, PdfExtractionProgress, } from '../../utils/pdfParser'; import { SAMPLE_EXAM_QUESTIONS, SAMPLE_EXAM_TITLE } from '../../data/sampleExam'; import { analyzeImportAgainstExisting, commitImportedPackage, parseAndValidateImportFile, } from '../../services/examImportService'; import { PdfDropzone } from '../upload/PdfDropzone'; import { VerificationMergeView } from '../examHead/VerificationMergeView';  interface UploadCreateTabProps { examHeads: ExamHead[]; preselectedExamHeadId?: string \vert{} null; onDataChanged: () => void; onLaunchMock: (examHeadId: string) => void; onShareExamHead: (examHead: ExamHead, defaultMode: 'full' \vert{} 'update') => void; }  type CreateMode = 'pdf' \vert{} 'import-json'; type PdfStep = 'setup' \vert{} 'verify' \vert{} 'confirmed';  function formatLanguageLabel(lang: DetectedLanguage): string { switch (lang) { case 'malayalam': return 'Malayalam (മലയാളം)'; case 'bilingual': return 'Malayalam + English'; case 'english': return 'English'; default: return 'Unknown'; } }  function selectAnswerKeyForBooklet( multiKey: MultiBookletAnswerKeyResult \vert{} null, bookletCode: OptionKey ): Record<number, OptionKey> { if (!multiKey) return {}; if (multiKey.isMultiBooklet) { const matched = multiKey.byBooklet[bookletCode]; if (matched && Object.keys(matched).length > 0) { return matched; } } return multiKey.fallbackSingleKey; }  export const UploadCreateTab: React.FC<UploadCreateTabProps> = ({ examHeads, preselectedExamHeadId, onDataChanged, onLaunchMock, onShareExamHead, }) => { const [mode, setMode] = useState<CreateMode>('pdf'); const [step, setStep] = useState<PdfStep>('setup');  const [targetType, setTargetType] = useState<'existing' \vert{} 'new'>( examHeads.length > 0 ? 'existing' : 'new' ); const [selectedHeadId, setSelectedHeadId] = useState<string>( preselectedExamHeadId \vert{}\vert{} (examHeads.length > 0 ? examHeads[0].id : '') ); const [newHeadName, setNewHeadName] = useState<string>(''); const [paperLabel, setPaperLabel] = useState<string>('');  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageOption>('mal+eng'); const [forceOcr, setForceOcr] = useState<boolean>(false); const [bookletCode, setBookletCode] = useState<OptionKey>('A'); const [autoDetectedBooklet, setAutoDetectedBooklet] = useState<OptionKey \vert{} null>(null);  const [questionFileName, setQuestionFileName] = useState<string \vert{} null>(null); const [questionProgress, setQuestionProgress] = useState<PdfExtractionProgress \vert{} null>(null); const [questionStatus, setQuestionStatus] = useState<string \vert{} null>(null); const [questionError, setQuestionError] = useState<string \vert{} null>(null); const [isParsingQuestions, setIsParsingQuestions] = useState<boolean>(false);  const [keyFileName, setKeyFileName] = useState<string \vert{} null>(null); const [keyProgress, setKeyProgress] = useState<PdfExtractionProgress \vert{} null>(null); const [keyStatus, setKeyStatus] = useState<string \vert{} null>(null); const [keyError, setKeyError] = useState<string \vert{} null>(null); const [isParsingKey, setIsParsingKey] = useState<boolean>(false);  const [parsedQuestions, setParsedQuestions] = useState<ExamQuestion[]>([]); const [multiBookletKey, setMultiBookletKey] = useState<MultiBookletAnswerKeyResult \vert{} null>(null); const [parsedAnswerKey, setParsedAnswerKey] = useState<Record<number, OptionKey>>({});  // Always auto-merge fetched Answer Key with parsed Questions regardless of upload order const mergedQuestions = useMemo(() => { const activeKey = multiBookletKey ? selectAnswerKeyForBooklet(multiBookletKey, bookletCode) : parsedAnswerKey; if (Object.keys(activeKey).length === 0) return parsedQuestions; return mergeQuestionsWithAnswerKey(parsedQuestions, activeKey); }, [parsedQuestions, multiBookletKey, bookletCode, parsedAnswerKey]);  const matchedAnswerCount = useMemo( () => mergedQuestions.filter((q) => q.correctOption !== null).length, [mergedQuestions] );  const [savedSummary, setSavedSummary] = useState<{ examHead: ExamHead; addedCount: number; } \vert{} null>(null);  const jsonInputRef = useRef<HTMLInputElement \vert{} null>(null); const [jsonDragging, setJsonDragging] = useState<boolean>(false); const [jsonError, setJsonError] = useState<string \vert{} null>(null); const [jsonPreview, setJsonPreview] = useState<ImportAnalysisPreview \vert{} null>(null); const [jsonTargetMode, setJsonTargetMode] = useState<'merge-existing' \vert{} 'create-new'>( 'merge-existing' ); const [jsonCustomName, setJsonCustomName] = useState<string>(''); const [jsonExcludedIds, setJsonExcludedIds] = useState<Record<string, boolean>>({}); const [jsonShowNearDupes, setJsonShowNearDupes] = useState<boolean>(false); const [jsonImporting, setJsonImporting] = useState<boolean>(false); const [jsonSuccess, setJsonSuccess] = useState<{ examHead: ExamHead; addedCount: number; skippedDuplicates: number; } \vert{} null>(null);  useEffect(() => { if (preselectedExamHeadId && examHeads.some((h) => h.id === preselectedExamHeadId)) { setTargetType('existing'); setSelectedHeadId(preselectedExamHeadId); } else if (examHeads.length > 0 && !selectedHeadId) { setSelectedHeadId(examHeads[0].id); } else if (examHeads.length === 0) { setTargetType('new'); } }, [preselectedExamHeadId, examHeads, selectedHeadId]);  const applyBookletCode = ( nextCode: OptionKey, multiKeyOverride?: MultiBookletAnswerKeyResult \vert{} null ) => { setBookletCode(nextCode); const activeMulti = multiKeyOverride !== undefined ? multiKeyOverride : multiBookletKey; if (activeMulti) { const selectedKey = selectAnswerKeyForBooklet(activeMulti, nextCode); setParsedAnswerKey(selectedKey); const count = Object.keys(selectedKey).length; if (parsedQuestions.length > 0) { setParsedQuestions((prev) => mergeQuestionsWithAnswerKey(prev, selectedKey)); } if (activeMulti.isMultiBooklet) { setKeyStatus( `Matched ${count} answers for Booklet ${nextCode} (${activeMulti.detectedBooklets.join('/')} booklets detected).`
        );
      }
    }
  };

  const handleQuestionPdf = async (file: File) => {
    setQuestionFileName(file.name);
    setQuestionError(null);
    setQuestionStatus(null);
    setIsParsingQuestions(true);

    try {
      const result = await extractTextFromPdf(file, setQuestionProgress, {
        ocrLanguage,
        forceOcr,
      });

      const detectedCode = result.bookletAlphaCode ?? null;
      const effectiveBooklet: OptionKey = detectedCode ?? bookletCode;
      if (detectedCode) {
        setAutoDetectedBooklet(detectedCode);
        setBookletCode(detectedCode);
      }

      const activeKey = multiBookletKey
        ? selectAnswerKeyForBooklet(multiBookletKey, effectiveBooklet)
        : parsedAnswerKey;
      if (multiBookletKey) {
        setParsedAnswerKey(activeKey);
        if (multiBookletKey.isMultiBooklet) {
          setKeyStatus(
            `Matched ${Object.keys(activeKey).length} answers for Booklet ${effectiveBooklet} (${multiBookletKey.detectedBooklets.join('/')} booklets detected).`
          );
        }
      }

      const extracted = parseQuestionsFromText(
        result.text,
        result.averageOcrConfidence,
        result.questionImages,
        result.questionTables
      );
      const merged =
        Object.keys(activeKey).length > 0
          ? mergeQuestionsWithAnswerKey(extracted, activeKey)
          : extracted;

      setParsedQuestions(merged);

      if (!paperLabel.trim()) {
        setPaperLabel(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
      }

      const langLabel = formatLanguageLabel(result.detectedLanguage);
      const bookletInfo = detectedCode ? ` • Booklet ${detectedCode}` : '';
      setQuestionStatus(
        merged.length > 0
          ? `Detected ${merged.length} questions (${result.usedOcr ? 'OCR' : 'Digital'} • ${langLabel}${bookletInfo})`
          : `No numbered MCQs detected (${langLabel}). Try enabling Scanned OCR Mode.`
      );
    } catch (err) {
      setQuestionError(
        err instanceof Error ? err.message : 'Failed to read the question paper PDF.'
      );
    } finally {
      setIsParsingQuestions(false);
    }
  };

  const handleAnswerKeyPdf = async (file: File) => {
    setKeyFileName(file.name);
    setKeyError(null);
    setKeyStatus(null);
    setIsParsingKey(true);

    try {
      const result = await extractTextFromPdf(file, setKeyProgress, {
        ocrLanguage,
        forceOcr,
      });

      const multiResult = parseMultiBookletAnswerKey(result.text);
      setMultiBookletKey(multiResult);

      const selectedKey = selectAnswerKeyForBooklet(multiResult, bookletCode);
      setParsedAnswerKey(selectedKey);

      if (parsedQuestions.length > 0) {
        setParsedQuestions((prev) => mergeQuestionsWithAnswerKey(prev, selectedKey));
      }

      const count = Object.keys(selectedKey).length;
      if (multiResult.isMultiBooklet) {
        setKeyStatus(
          `Detected ${multiResult.detectedBooklets.join('/')} booklets • Matched ${count} answers for Booklet ${bookletCode}.` ); } else { setKeyStatus( count > 0 ? `Extracted ${count} answer keys (${result.usedOcr ? 'OCR' : 'Digital'}).` : 'No answer keys matched automatically. Check that the Answer Key PDF is readable or try Force Scanned OCR.' ); } } catch (err) { setKeyError(err instanceof Error ? err.message : 'Failed to read the answer key PDF.'); } finally { setIsParsingKey(false); } };  const handleLoadSamplePaper = () => { setParsedQuestions( SAMPLE_EXAM_QUESTIONS.map((q) => ({ ...q, options: { ...q.options }, warnings: [...q.warnings], })) ); if (!paperLabel.trim()) { setPaperLabel(SAMPLE_EXAM_TITLE); } if (targetType === 'new' && !newHeadName.trim()) { setNewHeadName('Kerala PSC Sample Pool'); } setStep('verify'); };  const handleResetPdfFlow = () => { setStep('setup'); setParsedQuestions([]); setParsedAnswerKey({}); setMultiBookletKey(null); setQuestionFileName(null); setQuestionStatus(null); setQuestionError(null); setKeyFileName(null); setKeyStatus(null); setKeyError(null); setPaperLabel(''); setSavedSummary(null); };  const processJsonFile = async (file: File) => { setJsonError(null); setJsonSuccess(null); try { const pkg = await parseAndValidateImportFile(file); const analysis = analyzeImportAgainstExisting(pkg, examHeads); setJsonPreview(analysis); setJsonTargetMode(analysis.existingExamHead ? 'merge-existing' : 'create-new'); setJsonCustomName(`${pkg.examHeadName} (Copy)`);
      setJsonExcludedIds({});
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Failed to parse JSON exam file.');
    }
  };

  const handleCommitJsonImport = async () => {
    if (!jsonPreview) return;
    setJsonImporting(true);
    setJsonError(null);
    try {
      const result = await commitImportedPackage(jsonPreview, {
        targetMode: jsonTargetMode,
        customExamName: jsonTargetMode === 'create-new' ? jsonCustomName : undefined,
        excludedQuestionIds: Object.keys(jsonExcludedIds).filter((id) => jsonExcludedIds[id]),
      });
      setJsonSuccess({
        examHead: result.examHead,
        addedCount: result.addedCount,
        skippedDuplicates: result.skippedDuplicates,
      });
      setJsonPreview(null);
      onDataChanged();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Failed to import exam file.');
    } finally {
      setJsonImporting(false);
    }
  };

  const jsonNearDuplicateEntries = jsonPreview
    ? jsonPreview.netNewQuestions
        .filter((q) => Boolean(jsonPreview.nearDuplicateMatches[q.id]))
        .map((q) => ({
          question: q,
          match: jsonPreview.nearDuplicateMatches[q.id],
        }))
    : [];

  const jsonExcludedNearCount = jsonNearDuplicateEntries.filter(
    (entry) => jsonExcludedIds[entry.question.id]
  ).length;

  const jsonWillAddCount = jsonPreview
    ? jsonTargetMode === 'create-new'
      ? Math.max(0, jsonPreview.packageData.questions.length - jsonExcludedNearCount)
      : Math.max(0, jsonPreview.netNewQuestions.length - jsonExcludedNearCount)
    : 0;

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMode('pdf')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            mode === 'pdf'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <FileText className="h-4 w-4" />
          Convert PDF Paper
        </button>
        <button
          type="button"
          onClick={() => setMode('import-json')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
            mode === 'import-json'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <FileJson className="h-4 w-4" />
          Import .json Exam File
        </button>
      </div>

      {mode === 'pdf' && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span
              className={`rounded-full px-3 py-1 ${
                step === 'setup'
                  ? 'bg-indigo-600 text-white'
