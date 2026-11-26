import React, { useRef, useState } from 'react';
import {
  Upload,
  CheckCircle2,
  AlertTriangle,
  Shuffle,
  X,
  FileJson,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ExamHead } from '../../types/examHead';
import { ImportAnalysisPreview } from '../../types/sharePackage';
import { listExamHeads } from '../../services/examHeadManager';
import {
  analyzeImportAgainstExisting,
  commitImportedPackage,
  parseAndValidateImportFile,
} from '../../services/examImportService';

interface ImportExamModalProps {
  open: boolean;
  onClose: () => void;
  onImportedAndLaunch?: (examHeadId: string) => void;
}

export const ImportExamModal: React.FC<ImportExamModalProps> = ({
  open,
  onClose,
  onImportedAndLaunch,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportAnalysisPreview | null>(null);
  const [targetMode, setTargetMode] = useState<'merge-existing' | 'create-new'>('merge-existing');
  const [customExamName, setCustomExamName] = useState('');
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>({});
  const [showNearDupes, setShowNearDupes] = useState(false);
  const [importing, setImporting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    examHead: ExamHead;
    addedCount: number;
    skippedDuplicates: number;
  } | null>(null);

  if (!open) return null;

  const resetState = () => {
    setError(null);
    setPreview(null);
    setTargetMode('merge-existing');
    setCustomExamName('');
    setExcludedIds({});
    setShowNearDupes(false);
    setSuccessInfo(null);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    setError(null);
    setSuccessInfo(null);
    try {
      const pkg = await parseAndValidateImportFile(file);
      const existingHeads = await listExamHeads();
      const analysis = analyzeImportAgainstExisting(pkg, existingHeads);
      setPreview(analysis);
      setTargetMode(analysis.existingExamHead ? 'merge-existing' : 'create-new');
      setCustomExamName(`${pkg.examHeadName} (Copy)`);
      setExcludedIds({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read exam file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : undefined;
    e.target.value = '';
    if (file) {
      void processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files ? e.dataTransfer.files[0] : undefined;
    if (file) {
      void processFile(file);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const excludedList = Object.keys(excludedIds).filter((id) => excludedIds[id]);
      const result = await commitImportedPackage(preview, {
        targetMode,
        customExamName: targetMode === 'create-new' ? customExamName : undefined,
        excludedQuestionIds: excludedList,
      });
      setSuccessInfo(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save imported exam.');
    } finally {
      setImporting(false);
    }
  };

  const nearDupeEntries = preview ? Object.entries(preview.nearDuplicateMatches) : [];
  const excludedCount = Object.keys(excludedIds).filter((id) => excludedIds[id]).length;
  const effectiveAddCount = preview
    ? targetMode === 'merge-existing' && preview.existingExamHead
      ? Math.max(0, preview.netNewQuestions.length - excludedCount)
      : Math.max(0, preview.totalIncoming - excludedCount)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Import Exam File (.json)</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {successInfo ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Imported {successInfo.addedCount} new question
                  {successInfo.addedCount === 1 ? '' : 's'} into {successInfo.examHead.name}
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Total pooled questions: <strong>{successInfo.examHead.questions.length}</strong>
                  {successInfo.skippedDuplicates > 0
                    ? ` • ${successInfo.skippedDuplicates} duplicate(s) skipped`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {onImportedAndLaunch && (
                  <button
                    type="button"
                    onClick={() => {
                      const id = successInfo.examHead.id;
                      handleClose();
                      onImportedAndLaunch(id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    <Shuffle className="h-4 w-4" />
                    Launch Random Mock Exam Now
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          ) : !preview ? (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleFileChange}
              />
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
                  dragging
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40'
                }`}
              >
                <FileJson className="h-10 w-10 text-indigo-500" />
                <p className="mt-3 text-sm font-bold text-slate-900">
                  Drop a shared Exam Bank .json file here
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Works immediately with files received via WhatsApp, Telegram, or Email — no folder
                  setup required.
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white">
                  <Upload className="h-3.5 w-3.5" />
                  Choose .json File
                </span>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-slate-900">
                    {preview.packageData.examHeadName}
                  </span>
                  <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                    {preview.packageData.exportType === 'update' ? 'Update Pack' : 'Full Bank'}
                  </span>
                </div>
                <p className="mt-1 text-slate-600">
                  Incoming: <strong>{preview.totalIncoming} questions</strong> • Papers:{' '}
                  {preview.packageData.includedPapers.map((p) => p.paperLabel).join(', ')}
                </p>
              </div>

              {preview.existingExamHead && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900">
                    Found existing <strong>&ldquo;{preview.existingExamHead.name}&rdquo;</strong> (
                    {preview.existingExamHead.questions.length} questions).{' '}
                    <strong>{effectiveAddCount} new questions</strong> will be added •{' '}
                    <strong>{preview.exactDuplicateCount} already-owned duplicates</strong>{' '}
                    auto-skipped • Your past scores stay safe.
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setTargetMode('merge-existing')}
                      className={`rounded-lg border px-3 py-2 ${
                        targetMode === 'merge-existing'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      Merge into Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetMode('create-new')}
                      className={`rounded-lg border px-3 py-2 ${
                        targetMode === 'create-new'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      Save as Separate Exam Head
                    </button>
                  </div>

                  {targetMode === 'create-new' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Separate Exam Head Name
                      </label>
                      <input
                        type="text"
                        value={customExamName}
                        onChange={(e) => setCustomExamName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  )}

                  {targetMode === 'merge-existing' && nearDupeEntries.length > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setShowNearDupes((prev) => !prev)}
                        className="flex w-full items-center justify-between font-semibold text-amber-900"
                      >
                        <span>
                          {nearDupeEntries.length} near-duplicate question
                          {nearDupeEntries.length === 1 ? '' : 's'} detected (review optional)
                        </span>
                        {showNearDupes ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>

                      {showNearDupes && (
                        <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                          {nearDupeEntries.map(([qId, match]) => {
                            const incomingQ = preview.netNewQuestions.find((q) => q.id === qId);
                            if (!incomingQ) return null;
                            const isExcluded = Boolean(excludedIds[qId]);
                            return (
                              <div
                                key={qId}
                                className="rounded-lg border border-amber-200 bg-white p-2.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-amber-800">
                                    {Math.round(match.similarityScore * 100)}% similar to Q
                                    {match.matchedExistingQuestion.poolNumber}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExcludedIds((prev) => ({
                                        ...prev,
                                        [qId]: !prev[qId],
                                      }))
                                    }
                                    className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                                      isExcluded
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-rose-100 text-rose-700'
                                    }`}
                                  >
                                    {isExcluded ? 'Excluded (Undo)' : 'Exclude'}
                                  </button>
                                </div>
                                <p className="mt-1 line-clamp-2 text-slate-800">{incomingQ.text}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={resetState}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  Choose Different File
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleCommit}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {importing ? 'Importing...' : `Import ${effectiveAddCount} Question(s)`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
