import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileJson,
  FileText,
  Languages,
  Layers,
  Share2,
  Shuffle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { ExamQuestion, OPTION_KEYS, OptionKey } from '../../types/exam';
import { ExamHead } from '../../types/examHead';
import { ExamSharePackage, FullBackupPackage } from '../../types/sharePackage';
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
  commitFullBackupImport,
  commitImportedPackage,
  parseImportJsonFile,
} from '../../services/examImportService';
import {
  buildSharePackage,
  downloadFullBackupFile,
  downloadShareFile,
} from '../../services/examShareService';
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

  // Always auto-merge fetched Answer Key with parsed Questions regardless of upload order
  const mergedQuestions = useMemo(() => {
    const activeKey = multiBookletKey
      ? selectAnswerKeyForBooklet(multiBookletKey, bookletCode)
      : parsedAnswerKey;
    if (Object.keys(activeKey).length === 0) return parsedQuestions;
    return mergeQuestionsWithAnswerKey(parsedQuestions, activeKey);
  }, [parsedQuestions, multiBookletKey, bookletCode, parsedAnswerKey]);

  const matchedAnswerCount = useMemo(
    () => mergedQuestions.filter((q) => q.correctOption !== null).length,
    [mergedQuestions]
  );

  const [savedSummary, setSavedSummary] = useState<{
    examHead: ExamHead;
    addedCount: number;
  } | null>(null);

  // JSON Export state
  const [exportHeadId, setExportHeadId] = useState<string>(
    examHeads.length > 0 ? examHeads[0].id : ''
  );
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // JSON Import state (supports both single paper/head AND full backup of all Exam Heads)
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const [jsonDragging, setJsonDragging] = useState<boolean>(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [jsonPackage, setJsonPackage] = useState<ExamSharePackage | null>(null);
  const [jsonBackupPreview, setJsonBackupPreview] = useState<FullBackupPackage | null>(null);
  const [jsonTargetMode, setJsonTargetMode] = useState<'merge-existing' | 'create-new'>(
    'merge-existing'
  );
  const [jsonTargetHeadId, setJsonTargetHeadId] = useState<string>('');
  const [jsonCustomName, setJsonCustomName] = useState<string>('');
  const [jsonPaperLabel, setJsonPaperLabel] = useState<string>('');
  const [jsonExamYear, setJsonExamYear] = useState<string>('');
  const [jsonExcludedIds, setJsonExcludedIds] = useState<Record<string, boolean>>({});
  const [jsonShowNearDupes, setJsonShowNearDupes] = useState<boolean>(false);
  const [jsonImporting, setJsonImporting] = useState<boolean>(false);
  const [jsonSuccess, setJsonSuccess] = useState<{
    examHead: ExamHead;
    addedCount: number;
    skippedDuplicates: number;
  } | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<{
    importedHeadsCount: number;
    totalAddedQuestions: number;
    totalSkippedDuplicates: number;
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

  useEffect(() => {
    if (examHeads.length > 0 && !examHeads.some((h) => h.id === exportHeadId)) {
      setExportHeadId(examHeads[0].id);
    }
  }, [examHeads, exportHeadId]);

  // Live duplicate analysis against whichever existing Exam Head the user selects
  const jsonPreview = useMemo(() => {
    if (!jsonPackage) return null;
    const targetId = jsonTargetMode === 'merge-existing' ? jsonTargetHeadId || null : null;
    return analyzeImportAgainstExisting(jsonPackage, examHeads, targetId);
  }, [jsonPackage, examHeads, jsonTargetMode, jsonTargetHeadId]);

  const totalLibraryQuestions = useMemo(
    () => examHeads.reduce((sum, h) => sum + h.questions.length, 0),
    [examHeads]
  );

  const nonEmptyHeadsCount = useMemo(
    () => examHeads.filter((h) => h.questions.length > 0).length,
    [examHeads]
  );

  const handleExportAllJson = () => {
    setExportError(null);
    setExportStatus(null);
    try {
      const result = downloadFullBackupFile(examHeads);
      setExportStatus(
        `Exported ${result.examHeadCount} Exam Head${result.examHeadCount === 1 ? '' : 's'} (${result.totalQuestions} questions) to ${result.filename}`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export Exam Heads.');
    }
  };

  const handleExportSingleJson = () => {
    setExportError(null);
    setExportStatus(null);
    const target = examHeads.find((h) => h.id === exportHeadId);
    if (!target) {
      setExportError('Select an Exam Head to export.');
      return;
    }
    try {
      const pkg = buildSharePackage(target, { mode: 'full' });
      const filename = downloadShareFile(pkg);
      setExportStatus(
        `Exported "${target.name}" (${pkg.questionCount} questions) to ${filename}`
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export Exam Head.');
    }
  };

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
        isAnswerKey: true,
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
            : 'No answer keys matched automatically. Check that the Answer Key PDF is readable or try Force Scanned OCR.'
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
    setBackupSuccess(null);
    setJsonPackage(null);
    setJsonBackupPreview(null);
    setJsonExcludedIds({});

    try {
      const parsed = await parseImportJsonFile(file);
      if (parsed.kind === 'full-backup') {
        setJsonBackupPreview(parsed.backupData);
        return;
      }

      const pkg = parsed.packageData;
      const autoMatch = analyzeImportAgainstExisting(pkg, examHeads);
      const defaultExistingId =
        autoMatch.existingExamHead?.id ||
        (preselectedExamHeadId && examHeads.some((h) => h.id === preselectedExamHeadId)
          ? preselectedExamHeadId
          : examHeads.length > 0
          ? examHeads[0].id
          : '');

      const defaultBatchLabel =
        pkg.includedPapers.length > 0
          ? pkg.includedPapers.map((p) => p.paperLabel).join(' + ')
          : pkg.examHeadName;
      const detectedYear =
        (pkg.includedPapers.length > 0 && pkg.includedPapers[0].examYear) ||
        ((defaultBatchLabel.match(/\b(19\d{2}|20\d{2})\b/) || [])[1] ?? '');

      setJsonPackage(pkg);
      setJsonTargetHeadId(defaultExistingId);
      setJsonTargetMode(
        autoMatch.existingExamHead || (preselectedExamHeadId && defaultExistingId)
          ? 'merge-existing'
          : examHeads.length > 0
          ? 'merge-existing'
          : 'create-new'
      );
      setJsonCustomName(pkg.examHeadName);
      setJsonPaperLabel(defaultBatchLabel);
      setJsonExamYear(detectedYear);
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
        targetExamHeadId:
          jsonTargetMode === 'merge-existing' ? jsonTargetHeadId || undefined : undefined,
        customExamName: jsonTargetMode === 'create-new' ? jsonCustomName : undefined,
        paperLabelOverride: jsonPaperLabel.trim() || undefined,
        examYearOverride: jsonExamYear.trim() || undefined,
        excludedQuestionIds: Object.keys(jsonExcludedIds).filter((id) => jsonExcludedIds[id]),
      });
      setJsonSuccess({
        examHead: result.examHead,
        addedCount: result.addedCount,
        skippedDuplicates: result.skippedDuplicates,
      });
      setJsonPackage(null);
      onDataChanged();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Failed to import exam file.');
    } finally {
      setJsonImporting(false);
    }
  };

  const handleCommitFullBackup = async () => {
    if (!jsonBackupPreview) return;
    setJsonImporting(true);
    setJsonError(null);
    try {
      const result = await commitFullBackupImport(jsonBackupPreview, examHeads);
      setBackupSuccess({
        importedHeadsCount: result.importedHeadsCount,
        totalAddedQuestions: result.totalAddedQuestions,
        totalSkippedDuplicates: result.totalSkippedDuplicates,
      });
      setJsonBackupPreview(null);
      onDataChanged();
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Failed to import full backup.');
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
          Import / Export .json
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
                      {matchedAnswerCount > 0
                        ? ` • ${matchedAnswerCount} answers auto-fetched from key`
                        : ' • Upload Answer Key PDF to auto-fetch answers'}
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
              initialQuestions={mergedQuestions}
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
        <div className="space-y-6">
          {/* Export Section: All Exam Heads or Single Exam Head as .json */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Export Exam Heads &amp; Questions (.json)
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Download a single <code className="rounded bg-slate-100 px-1">.json</code> backup
                  containing all Exam Heads, paper batches, questions, and answers — or export one
                  specific Exam Head.
                </p>
              </div>

              <button
                type="button"
                disabled={nonEmptyHeadsCount === 0}
                onClick={handleExportAllJson}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
              >
                <Download className="h-4 w-4" />
                Export All Exam Heads ({nonEmptyHeadsCount} Heads • {totalLibraryQuestions} Qs)
              </button>
            </div>

            {examHeads.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="text-xs font-semibold text-slate-700">
                  Or export a single Exam Head:
                </span>
                <select
                  value={exportHeadId}
                  onChange={(e) => setExportHeadId(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  {examHeads.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.questions.length} Qs • {h.importedPapers.length} Batches)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    !exportHeadId ||
                    (examHeads.find((h) => h.id === exportHeadId)?.questions.length ?? 0) === 0
                  }
                  onClick={handleExportSingleJson}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5 text-indigo-600" />
                  Export Selected (.json)
                </button>
              </div>
            )}

            {exportStatus && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{exportStatus}</span>
              </div>
            )}

            {exportError && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{exportError}</span>
              </div>
            )}
          </div>

          {/* Import Section: Single Paper/Batch OR Full Backup (.json) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Import Exam Bank or Full Backup (.json)
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Import a single paper/batch <code className="rounded bg-slate-100 px-1">.json</code>{' '}
                (and pick which Exam Head to add it into) or restore a Full Backup containing all
                Exam Heads. Existing questions and stats are always preserved.
              </p>
            </div>

            {jsonError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{jsonError}</span>
              </div>
            )}

            {backupSuccess ? (
              <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900">
                      Restored {backupSuccess.importedHeadsCount} Exam Head
                      {backupSuccess.importedHeadsCount === 1 ? '' : 's'} from Full Backup
                    </h3>
                    <p className="mt-1 text-xs text-emerald-800">
                      Added <strong>{backupSuccess.totalAddedQuestions}</strong> new questions (
                      {backupSuccess.totalSkippedDuplicates} duplicates safely skipped).
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setBackupSuccess(null)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Import Another File
                </button>
              </div>
            ) : jsonSuccess ? (
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
            ) : jsonBackupPreview ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers className="h-5 w-5 text-indigo-600" />
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Full Backup Package ({jsonBackupPreview.examHeadCount} Exam Heads)
                        </p>
                        <p className="text-xs text-slate-600">
                          {jsonBackupPreview.totalQuestions} total questions • Exported{' '}
                          {new Date(jsonBackupPreview.exportedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 max-h-60 space-y-2 overflow-y-auto">
                    {jsonBackupPreview.examHeads.map((pkg) => {
                      const matchesExisting = examHeads.some(
                        (h) =>
                          h.id === pkg.examHeadId ||
                          h.name.trim().toLowerCase() === pkg.examHeadName.trim().toLowerCase()
                      );
                      return (
                        <div
                          key={pkg.examHeadId}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900">{pkg.examHeadName}</span>
                            <span className="ml-2 text-slate-500">
                              {pkg.questionCount} Qs • {pkg.includedPapers.length} batch
                              {pkg.includedPapers.length === 1 ? '' : 'es'}
                            </span>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              matchesExisting
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {matchesExisting ? 'Merge into Existing' : 'Create New'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setJsonBackupPreview(null)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Choose Different File
                  </button>
                  <button
                    type="button"
                    disabled={jsonImporting}
                    onClick={handleCommitFullBackup}
                    className="rounded-lg bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
                  >
                    {jsonImporting
                      ? 'Importing All...'
                      : `Import All ${jsonBackupPreview.examHeadCount} Exam Heads`}
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
                  Drop any .json Exam Bank or Full Backup file here, or click to browse
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports Single Paper/Batch files, Full Exam Heads, and All-Exam-Heads Backups
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
                          ? 'Paper / Update Pack'
                          : 'Exam Bank'}{' '}
                        • {jsonPreview.packageData.questionCount} questions
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        jsonTargetMode === 'merge-existing' && jsonPreview.existingExamHead
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {jsonTargetMode === 'merge-existing' && jsonPreview.existingExamHead
                        ? `Target: ${jsonPreview.existingExamHead.name} (${jsonPreview.existingExamHead.questions.length} stored)`
                        : 'Creating New Exam Head'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="font-semibold text-slate-500">Will Add</p>
                      <p className="mt-0.5 text-base font-extrabold text-emerald-700">
                        {jsonWillAddCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="font-semibold text-slate-500">Exact Duplicates</p>
                      <p className="mt-0.5 text-base font-extrabold text-slate-700">
                        {jsonPreview.exactDuplicateCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <p className="font-semibold text-slate-500">Near Duplicates</p>
                      <p className="mt-0.5 text-base font-extrabold text-amber-700">
                        {jsonNearDuplicateEntries.length}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Target Exam Head Selector (always available so user can import any paper/batch into any Exam Head) */}
                <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-xs">
                  <p className="font-bold text-slate-900">Choose Destination Exam Head</p>

                  {examHeads.length > 0 && (
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
                        <input
                          type="radio"
                          checked={jsonTargetMode === 'merge-existing'}
                          onChange={() => setJsonTargetMode('merge-existing')}
                        />
                        Add as a paper/batch into an existing Exam Head
                      </label>

                      {jsonTargetMode === 'merge-existing' && (
                        <select
                          value={jsonTargetHeadId}
                          onChange={(e) => {
                            setJsonTargetHeadId(e.target.value);
                            setJsonExcludedIds({});
                          }}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                        >
                          {examHeads.map((h) => (
                            <option key={h.id} value={h.id}>
                              {h.name} ({h.questions.length} stored Qs • {h.importedPapers.length}{' '}
                              batches)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-800">
                      <input
                        type="radio"
                        checked={jsonTargetMode === 'create-new'}
                        onChange={() => {
                          setJsonTargetMode('create-new');
                          setJsonExcludedIds({});
                        }}
                      />
                      Save as a new Exam Head
                    </label>
                    {jsonTargetMode === 'create-new' && (
                      <input
                        type="text"
                        value={jsonCustomName}
                        onChange={(e) => setJsonCustomName(e.target.value)}
                        placeholder="Enter new Exam Head name..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                    )}
                  </div>

                  <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Paper Batch Label
                      </label>
                      <input
                        type="text"
                        value={jsonPaperLabel}
                        onChange={(e) => setJsonPaperLabel(e.target.value)}
                        placeholder="e.g., Prelims Set A"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600">
                        Exam Year
                      </label>
                      <input
                        type="text"
                        maxLength={9}
                        value={jsonExamYear}
                        onChange={(e) => setJsonExamYear(e.target.value)}
                        placeholder="e.g., 2026"
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

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
                    onClick={() => setJsonPackage(null)}
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
                      : `Import & Save (${jsonWillAddCount} New Questions)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
