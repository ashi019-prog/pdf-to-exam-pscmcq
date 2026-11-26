import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileJson,
  FileText,
  Languages,
  Share2,
  Shuffle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ExamQuestion, OPTION_KEYS, OptionKey } from '../../types/exam';
import { ExamHead } from '../../types/examHead';
import { ImportAnalysisPreview } from '../../types/sharePackage';
import {
  DetectedLanguage,
  extractTextFromPdf,
  mergeQuestionsWithAnswerKey,
  MultiBookletAnswerKeyResult,
  OcrLanguageOption,
  parseMultiBookletAnswerKey,
  parseQuestionsFromText,
  PdfExtractionProgress,
} from '../../utils/pdfParser';
import { SAMPLE_EXAM_QUESTIONS, SAMPLE_EXAM_TITLE } from '../../data/sampleExam';
import {
  analyzeImportAgainstExisting,
  commitImportedPackage,
  parseAndValidateImportFile,
} from '../../services/examImportService';
import { PdfDropzone } from '../upload/PdfDropzone';
import { VerificationMergeView } from '../examHead/VerificationMergeView';

interface UploadCreateTabProps {
  examHeads: ExamHead[];
  preselectedExamHeadId?: string | null;
  onDataChanged: () => void;
  onLaunchMock: (examHeadId: string) => void;
  onShareExamHead: (examHead: ExamHead, defaultMode: 'full' | 'update') => void;
}

type CreateMode = 'pdf' | 'import-json';
type PdfStep = 'setup' | 'verify' | 'confirmed';

function formatLanguageLabel(lang: DetectedLanguage): string {
  switch (lang) {
    case 'malayalam':
      return 'Malayalam (മലയാളം)';
    case 'bilingual':
      return 'Malayalam + English';
    case 'english':
      return 'English';
    default:
      return 'Unknown';
  }
}

function selectAnswerKeyForBooklet(
  multiKey: MultiBookletAnswerKeyResult | null,
  bookletCode: OptionKey
): Record<number, OptionKey> {
  if (!multiKey) return {};
  if (multiKey.isMultiBooklet) {
    const matched = multiKey.byBooklet[bookletCode];
    if (matched && Object.keys(matched).length > 0) {
      return matched;
    }
  }
  return multiKey.fallbackSingleKey;
}

export const UploadCreateTab: React.FC<UploadCreateTabProps> = ({
  examHeads,
  preselectedExamHeadId,
  onDataChanged,
  onLaunchMock,
  onShareExamHead,
}) => {
  const [mode, setMode] = useState<CreateMode>('pdf');
  const [step, setStep] = useState<PdfStep>('setup');

  const [targetType, setTargetType] = useState<'existing' | 'new'>(
    examHeads.length > 0 ? 'existing' : 'new'
  );
  const [selectedHeadId, setSelectedHeadId] = useState<string>(
    preselectedExamHeadId || (examHeads.length > 0 ? examHeads[0].id : '')
  );
  const [newHeadName, setNewHeadName] = useState<string>('');
  const [paperLabel, setPaperLabel] = useState<string>('');

  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageOption>('mal+eng');
  const [forceOcr, setForceOcr] = useState<boolean>(false);
  const [bookletCode, setBookletCode] = useState<OptionKey>('A');
  const [autoDetectedBooklet, setAutoDetectedBooklet] = useState<OptionKey | null>(null);

  const [questionFileName, setQuestionFileName] = useState<string | null>(null);
  const [questionProgress, setQuestionProgress] = useState<PdfExtractionProgress | null>(null);
  const [questionStatus, setQuestionStatus] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isParsingQuestions, setIsParsingQuestions] = useState<boolean>(false);

  const [keyFileName, setKeyFileName] = useState<string | null>(null);
  const [keyProgress, setKeyProgress] = useState<PdfExtractionProgress | null>(null);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isParsingKey, setIsParsingKey] = useState<boolean>(false);

  const [parsedQuestions, setParsedQuestions] = useState<ExamQuestion[]>([]);
  const [multiBookletKey, setMultiBookletKey] = useState<MultiBookletAnswerKeyResult | null>(null);
  const [parsedAnswerKey, setParsedAnswerKey] = useState<Record<number, OptionKey>>({});

  const [savedSummary, setSavedSummary] = useState<{
    examHead: ExamHead;
    addedCount: number;
  } | null>(null);

  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const [jsonDragging, setJsonDragging] = useState<boolean>(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonPreview, setJsonPreview] = useState<ImportAnalysisPreview | null>(null);
  const [jsonTargetMode, setJsonTargetMode] = useState<'merge-existing' | 'create-new'>(
    'merge-existing'
  );
  const [jsonCustomName, setJsonCustomName] = useState<string>('');
  const [jsonExcludedIds, setJsonExcludedIds] = useState<Record<string, boolean>>({});
  const [jsonShowNearDupes, setJsonShowNearDupes] = useState<boolean>(false);
  const [jsonImporting, setJsonImporting] = useState<boolean>(false);
  const [jsonSuccess, setJsonSuccess] = useState<{
    examHead: ExamHead;
    addedCount: number;
    skippedDuplicates: number;
  } | null>(null);

  useEffect(() => {
    if (preselectedExamHeadId && examHeads.some((h) => h.id === preselectedExamHeadId)) {
      setTargetType('existing');
      setSelectedHeadId(preselectedExamHeadId);
    } else if (examHeads.length > 0 && !selectedHeadId) {
      setSelectedHeadId(examHeads[0].id);
    } else if (examHeads.length === 0) {
      setTargetType('new');
    }
  }, [preselectedExamHeadId, examHeads, selectedHeadId]);

  const applyBookletCode = (
    nextCode: OptionKey,
    multiKeyOverride?: MultiBookletAnswerKeyResult | null
  ) => {
    setBookletCode(nextCode);
    const activeMulti = multiKeyOverride !== undefined ? multiKeyOverride : multiBookletKey;
    if (activeMulti) {
      const selectedKey = selectAnswerKeyForBooklet(activeMulti, nextCode);
      setParsedAnswerKey(selectedKey);
      const count = Object.keys(selectedKey).length;
      if (parsedQuestions.length > 0) {
        setParsedQuestions((prev) => mergeQuestionsWithAnswerKey(prev, selectedKey));
      }
      if (activeMulti.isMultiBooklet) {
        setKeyStatus(
          `Matched ${count} answers for Booklet ${nextCode} (${activeMulti.detectedBooklets.join('/')} booklets detected).`
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
          `Detected ${multiResult.detectedBooklets.join('/')} booklets • Matched ${count} answers for Booklet ${bookletCode}.`
        );
      } else {
        setKeyStatus(
          count > 0
            ? `Extracted ${count} answer keys (${result.usedOcr ? 'OCR' : 'Digital'}).`
            : 'No answer keys matched automatically. You can set them in Step 2.'
        );
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to read the answer key PDF.');
    } finally {
      setIsParsingKey(false);
    }
  };

  const handleLoadSamplePaper = () => {
    setParsedQuestions(
      SAMPLE_EXAM_QUESTIONS.map((q) => ({
        ...q,
        options: { ...q.options },
        warnings: [...q.warnings],
      }))
    );
    if (!paperLabel.trim()) {
      setPaperLabel(SAMPLE_EXAM_TITLE);
    }
    if (targetType === 'new' && !newHeadName.trim()) {
      setNewHeadName('Kerala PSC Sample Pool');
    }
    setStep('verify');
  };

  const handleResetPdfFlow = () => {
    setStep('setup');
    setParsedQuestions([]);
    setParsedAnswerKey({});
    setMultiBookletKey(null);
    setQuestionFileName(null);
    setQuestionStatus(null);
    setQuestionError(null);
    setKeyFileName(null);
    setKeyStatus(null);
    setKeyError(null);
    setPaperLabel('');
    setSavedSummary(null);
  };

  const processJsonFile = async (file: File) => {
    setJsonError(null);
    setJsonSuccess(null);
    try {
      const pkg = await parseAndValidateImportFile(file);
      const analysis = analyzeImportAgainstExisting(pkg, examHeads);
      setJsonPreview(analysis);
      setJsonTargetMode(analysis.existingExamHead ? 'merge-existing' : 'create-new');
      setJsonCustomName(`${pkg.examHeadName} (Copy)`);
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
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              1. Setup &amp; Upload PDFs
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`rounded-full px-3 py-1 ${
                step === 'verify'
                  ? 'bg-indigo-600 text-white'
                  : step === 'confirmed'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              2. Duplicate Check &amp; Verify
            </span>
            <span className="text-slate-300">→</span>
            <span
              className={`rounded-full px-3 py-1 ${
                step === 'confirmed'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              3. Saved &amp; Ready
            </span>
          </div>

          {step === 'setup' && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-slate-900">
                    Step 1 — Exam Head &amp; Paper Setup
                  </h2>
                  <button
                    type="button"
                    onClick={handleLoadSamplePaper}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Load Sample Math &amp; Text Paper
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        Target Exam Head
                      </label>
                      {examHeads.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setTargetType((prev) => (prev === 'existing' ? 'new' : 'existing'))
                          }
                          className="text-xs font-semibold text-indigo-600 hover:underline"
                        >
                          {targetType === 'existing'
                            ? '+ Create New Exam Head'
                            : 'Add to Existing Exam Head'}
                        </button>
                      )}
                    </div>

                    {targetType === 'existing' && examHeads.length > 0 ? (
                      <select
                        value={selectedHeadId}
                        onChange={(e) => setSelectedHeadId(e.target.value)}
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                      >
                        {examHeads.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name} ({h.questions.length} pooled Qs)
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={newHeadName}
                        onChange={(e) => setNewHeadName(e.target.value)}
                        placeholder="e.g., Village Assistant"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
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

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                      <Languages className="h-4 w-4 text-indigo-600" />
                      OCR Language:
                    </span>
                    <select
                      value={ocrLanguage}
                      onChange={(e) => setOcrLanguage(e.target.value as OcrLanguageOption)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800"
                    >
                      <option value="mal+eng">Malayalam + English</option>
                      <option value="mal">Malayalam Only</option>
                      <option value="eng">English Only</option>
                    </select>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={forceOcr}
                        onChange={(e) => setForceOcr(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                      />
                      Force Scanned OCR
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-700">Booklet Code:</span>
                    <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                      {OPTION_KEYS.map((code) => (
                        <button
                          key={code}
                          type="button"
                          onClick={() => applyBookletCode(code)}
                          className={`rounded-md px-2.5 py-0.5 text-xs font-bold transition ${
                            bookletCode === code
                              ? 'bg-indigo-600 text-white'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                    {autoDetectedBooklet && (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        (Auto: {autoDetectedBooklet})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <PdfDropzone
                  title="Question Paper PDF"
                  subtitle="Digital or scanned Malayalam / English PDF (auto-detects booklet code & tables)"
                  fileName={questionFileName}
                  statusMessage={questionStatus}
                  progress={questionProgress}
                  error={questionError}
                  isProcessing={isParsingQuestions}
                  onFileSelect={handleQuestionPdf}
                />
                <PdfDropzone
                  title="Answer Key PDF"
                  subtitle="Supports single-booklet or 4-booklet (A/B/C/D) Kerala PSC answer key tables"
                  fileName={keyFileName}
                  statusMessage={keyStatus}
                  progress={keyProgress}
                  error={keyError}
                  isProcessing={isParsingKey}
                  onFileSelect={handleAnswerKeyPdf}
                />
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                <div className="text-xs text-slate-600">
                  {parsedQuestions.length > 0 ? (
                    <span className="font-semibold text-emerald-700">
                      Ready: {parsedQuestions.length} parsed question
                      {parsedQuestions.length === 1 ? '' : 's'}
                      {Object.keys(parsedAnswerKey).length > 0
                        ? ` • ${Object.keys(parsedAnswerKey).length} answer keys matched`
                        : ''}
                    </span>
                  ) : (
                    <span>Upload a Question Paper PDF (or load the sample paper) to continue.</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={parsedQuestions.length === 0 || isParsingQuestions || isParsingKey}
                  onClick={() => setStep('verify')}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
                >
                  Continue to Duplicate Check
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {step === 'verify' && (
            <VerificationMergeView
              initialQuestions={parsedQuestions}
              defaultPaperLabel={paperLabel || questionFileName || 'Imported Paper'}
              initialExamHeadId={targetType === 'existing' ? selectedHeadId : undefined}
              initialCreatingNew={targetType === 'new'}
              initialNewHeadName={targetType === 'new' ? newHeadName : undefined}
              onMerged={(updatedHead, addedCount) => {
                setSavedSummary({ examHead: updatedHead, addedCount });
                setStep('confirmed');
                onDataChanged();
              }}
              onCancel={() => setStep('setup')}
            />
          )}

          {step === 'confirmed' && savedSummary && (
            <div className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Added {savedSummary.addedCount} new questions to {savedSummary.examHead.name} —
                    Total Pool: {savedSummary.examHead.questions.length}
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Every question and embedded official answer key was appended non-destructively
                    to your saved Exam Head bank.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onLaunchMock(savedSummary.examHead.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  <Shuffle className="h-4 w-4" />
                  Launch Random Mock Exam
                </button>
                <button
                  type="button"
                  onClick={() => onShareExamHead(savedSummary.examHead, 'update')}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <Share2 className="h-4 w-4" />
                  Share Update via WhatsApp / Telegram / Email
                </button>
                <button
                  type="button"
                  onClick={handleResetPdfFlow}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Upload Another Paper
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'import-json' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Import Shared Exam Bank (.json)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Import a full Exam Head or newly added update pack shared via WhatsApp, Telegram, or
              Email. Existing questions and your personal stats are always preserved.
            </p>
          </div>

          {jsonError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}

          {jsonSuccess ? (
            <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-emerald-900">
                    Imported {jsonSuccess.addedCount} new questions into &ldquo;
                    {jsonSuccess.examHead.name}&rdquo;
                  </h3>
                  <p className="mt-1 text-xs text-emerald-800">
                    Total pool is now <strong>{jsonSuccess.examHead.questions.length}</strong>{' '}
                    questions ({jsonSuccess.skippedDuplicates} duplicates safely skipped).
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onLaunchMock(jsonSuccess.examHead.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Launch Random Mock Now
                </button>
                <button
                  type="button"
                  onClick={() => setJsonSuccess(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Import Another File
                </button>
              </div>
            </div>
          ) : !jsonPreview ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setJsonDragging(true);
              }}
              onDragLeave={() => setJsonDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setJsonDragging(false);
                const file = e.dataTransfer.files ? e.dataTransfer.files[0] : undefined;
                if (file) void processJsonFile(file);
              }}
              onClick={() => jsonInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  jsonInputRef.current?.click();
                }
              }}
              className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition ${
                jsonDragging
                  ? 'border-indigo-500 bg-indigo-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-slate-50'
              }`}
            >
              <input
                ref={jsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files ? e.target.files[0] : undefined;
                  e.target.value = '';
                  if (file) void processJsonFile(file);
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <Upload className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">
                Drop a shared .json Exam Bank file here, or click to browse
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Supports both Full Exam Head exports and Newly Added Update Packs
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {jsonPreview.packageData.examHeadName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {jsonPreview.packageData.exportType === 'update'
                        ? 'Update Pack'
                        : 'Full Exam Head'}{' '}
                      • {jsonPreview.packageData.questionCount} questions
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      jsonPreview.existingExamHead
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {jsonPreview.existingExamHead
                      ? `Matches Existing (${jsonPreview.existingExamHead.questions.length} stored)`
                      : 'New Exam Head'}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                    <p className="font-semibold text-slate-500">Will Add</p>
                    <p className="mt-0.5 text-base font-extrabold text-emerald-700">
                      {jsonWillAddCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                    <p className="font-semibold text-slate-500">Exact Duplicates</p>
                    <p className="mt-0.5 text-base font-extrabold text-slate-700">
                      {jsonPreview.exactDuplicateCount}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white p-2.5 border border-slate-200">
                    <p className="font-semibold text-slate-500">Near Duplicates</p>
                    <p className="mt-0.5 text-base font-extrabold text-amber-700">
                      {jsonNearDuplicateEntries.length}
                    </p>
                  </div>
                </div>
              </div>

              {jsonPreview.existingExamHead && (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3.5 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
                    <input
                      type="radio"
                      checked={jsonTargetMode === 'merge-existing'}
                      onChange={() => setJsonTargetMode('merge-existing')}
                    />
                    Merge into existing &ldquo;{jsonPreview.existingExamHead.name}&rdquo;
                    (non-destructive)
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
                    <input
                      type="radio"
                      checked={jsonTargetMode === 'create-new'}
                      onChange={() => setJsonTargetMode('create-new')}
                    />
                    Save as a separate new Exam Head
                  </label>
                  {jsonTargetMode === 'create-new' && (
                    <input
                      type="text"
                      value={jsonCustomName}
                      onChange={(e) => setJsonCustomName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                    />
                  )}
                </div>
              )}

              {jsonNearDuplicateEntries.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setJsonShowNearDupes((prev) => !prev)}
                    className="flex w-full items-center justify-between font-semibold text-amber-900"
                  >
                    <span>
                      Review {jsonNearDuplicateEntries.length} Near-Duplicate Question(s)
                    </span>
                    {jsonShowNearDupes ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {jsonShowNearDupes && (
                    <div className="mt-2.5 space-y-2">
                      {jsonNearDuplicateEntries.map((entry) => (
                        <label
                          key={entry.question.id}
                          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-white p-2"
                        >
                          <input
                            type="checkbox"
                            checked={!jsonExcludedIds[entry.question.id]}
                            onChange={(e) =>
                              setJsonExcludedIds((prev) => ({
                                ...prev,
                                [entry.question.id]: !e.target.checked,
                              }))
                            }
                            className="mt-0.5"
                          />
                          <div>
                            <p className="font-semibold text-slate-800">{entry.question.text}</p>
                            <p className="mt-0.5 text-[11px] text-amber-700">
                              {Math.round(entry.match.similarityScore * 100)}% similar to Pool Q
                              {entry.match.matchedExistingQuestion.poolNumber}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setJsonPreview(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Choose Different File
                </button>
                <button
                  type="button"
                  disabled={jsonImporting}
                  onClick={handleCommitJsonImport}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                >
                  {jsonImporting
                    ? 'Importing...'
                    : `Import & Merge (${jsonWillAddCount} New Questions)`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
