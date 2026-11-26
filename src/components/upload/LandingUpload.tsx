import React, { useRef, useState } from 'react';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Clock,
  FileCheck2,
  History,
  Languages,
  FolderOpen,
  BookOpen,
} from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
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
import { ExamQuestion, OPTION_KEYS, OptionKey, SavedExamPackage } from '../../types/exam';
import { formatDurationReadable } from '../../utils/scoring';
import { PdfDropzone } from './PdfDropzone';

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

export const LandingUpload: React.FC = () => {
  const {
    settings,
    attemptHistory,
    updateSettings,
    setQuestions,
    setPhase,
    loadSampleExam,
    loadSavedExamPackage,
    clearAttemptHistory,
  } = useExamStore();

  const savedExamInputRef = useRef<HTMLInputElement | null>(null);
  const [savedExamError, setSavedExamError] = useState<string | null>(null);

  const [ocrLanguage, setOcrLanguage] = useState<OcrLanguageOption>('mal+eng');
  const [forceOcr, setForceOcr] = useState<boolean>(false);
  const [bookletCode, setBookletCode] = useState<OptionKey>('A');
  const [autoDetectedBooklet, setAutoDetectedBooklet] = useState<OptionKey | null>(null);

  const [questionFileName, setQuestionFileName] = useState<string | null>(null);
  const [questionProgress, setQuestionProgress] = useState<PdfExtractionProgress | null>(null);
  const [questionStatus, setQuestionStatus] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isParsingQuestions, setIsParsingQuestions] = useState(false);

  const [keyFileName, setKeyFileName] = useState<string | null>(null);
  const [keyProgress, setKeyProgress] = useState<PdfExtractionProgress | null>(null);
  const [keyStatus, setKeyStatus] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isParsingKey, setIsParsingKey] = useState(false);

  const [parsedQuestions, setParsedQuestions] = useState<ExamQuestion[]>([]);
  const [multiBookletKey, setMultiBookletKey] = useState<MultiBookletAnswerKeyResult | null>(null);
  const [parsedAnswerKey, setParsedAnswerKey] = useState<Record<number, OptionKey>>({});

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

      if (extracted.length === 0) {
        setQuestionError(
          'No structured MCQs were detected. Try enabling "Force OCR" for scanned or legacy Malayalam font PDFs.'
        );
      } else {
        const merged = mergeQuestionsWithAnswerKey(extracted, activeKey);
        setParsedQuestions(merged);
        const langBadge = formatLanguageLabel(result.detectedLanguage);
        const bookletBadge = detectedCode ? ` • Booklet Code: ${detectedCode}` : '';
        const ocrNote = result.usedOcr
          ? ` • OCR${result.averageOcrConfidence ? ` ~${result.averageOcrConfidence}%` : ''}`
          : '';
        setQuestionStatus(
          `Extracted ${merged.length} questions • Detected: ${langBadge}${bookletBadge}${ocrNote}`
        );
        if (settings.title === 'Untitled Solo Practice Exam') {
          updateSettings({ title: file.name.replace(/\.pdf$/i, '') });
        }
      }
    } catch (err) {
      setQuestionError(err instanceof Error ? err.message : 'Failed to parse Question Paper PDF.');
    } finally {
      setIsParsingQuestions(false);
      setQuestionProgress(null);
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
      const multi = parseMultiBookletAnswerKey(result.text);
      setMultiBookletKey(multi);

      const keyMap = selectAnswerKeyForBooklet(multi, bookletCode);
      const count = Object.keys(keyMap).length;

      if (count === 0) {
        setKeyError('No answer key entries detected. You can still set answers in verification.');
      } else {
        setParsedAnswerKey(keyMap);
        if (parsedQuestions.length > 0) {
          setParsedQuestions(mergeQuestionsWithAnswerKey(parsedQuestions, keyMap));
        }
        const ocrNote = result.usedOcr ? ' (via OCR)' : '';
        if (multi.isMultiBooklet) {
          setKeyStatus(
            `Matched ${count} answers for Booklet ${bookletCode} (${multi.detectedBooklets.join('/')} booklets detected)${ocrNote}.`
          );
        } else {
          setKeyStatus(`Matched ${count} answer key entries${ocrNote}.`);
        }
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to parse Answer Key PDF.');
    } finally {
      setIsParsingKey(false);
      setKeyProgress(null);
    }
  };

  const handleLoadSavedExamFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : undefined;
    e.target.value = '';
    if (!file) return;
    setSavedExamError(null);

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as SavedExamPackage;
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setSavedExamError('Invalid exam file. Please choose a .json file saved from this app.');
        return;
      }
      loadSavedExamPackage(parsed, true);
    } catch {
      setSavedExamError('Could not read saved exam file. Make sure it is a valid .json file.');
    }
  };

  const handleProceedToVerify = () => {
    const merged = mergeQuestionsWithAnswerKey(parsedQuestions, parsedAnswerKey);
    setQuestions(merged);
    setPhase('verify');
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            100% Client-Side • English &amp; Malayalam (മലയാളം) • Auto-Saved Locally
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            PDF-to-Exam MCQ Practice Studio
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
            Upload a Question Paper PDF and Answer Key PDF (English, Malayalam, or bilingual) to
            launch a timed solo practice test, or load a previously saved exam file for a shuffled
            redo.
          </p>
        </div>

        {/* Language, Booklet Code & OCR Bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Languages className="h-4 w-4 text-indigo-600" />
              <span>PDF / OCR Language:</span>
              <select
                value={ocrLanguage}
                onChange={(e) => setOcrLanguage(e.target.value as OcrLanguageOption)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                <option value="mal+eng">Auto: Malayalam + English (മലയാളം + Eng)</option>
                <option value="mal">Malayalam Only (മലയാളം)</option>
                <option value="eng">English Only</option>
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <BookOpen className="h-4 w-4 text-indigo-600" />
              <span>Booklet Code:</span>
              <select
                value={bookletCode}
                onChange={(e) => applyBookletCode(e.target.value as OptionKey)}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-bold text-indigo-700 focus:border-indigo-500 focus:outline-none"
              >
                {OPTION_KEYS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                    {autoDetectedBooklet === code ? ' (Auto-detected)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={forceOcr}
              onChange={(e) => setForceOcr(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Force OCR</span>
          </label>
        </div>

        {/* Dual PDF Dropzones */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <PdfDropzone
            title="1. Question Paper PDF"
            subtitle="Auto-detects Booklet Alpha Code (A/B/C/D) from Page 1 and skips instructions."
            fileName={questionFileName}
            statusMessage={questionStatus}
            progress={questionProgress}
            error={questionError}
            isProcessing={isParsingQuestions}
            onFileSelect={handleQuestionPdf}
          />
          <PdfDropzone
            title="2. Answer Key PDF"
            subtitle="Supports 4-booklet (A/B/C/D) Kerala PSC keys; answers stay hidden until Results."
            fileName={keyFileName}
            statusMessage={keyStatus}
            progress={keyProgress}
            error={keyError}
            isProcessing={isParsingKey}
            onFileSelect={handleAnswerKeyPdf}
          />
        </div>

        {/* Exam Configuration Card */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Clock className="h-4 w-4 text-indigo-600" />
            Solo Practice Timer Configuration
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-600">Exam Title</label>
              <input
                type="text"
                value={settings.title}
                onChange={(e) => updateSettings({ title: e.target.value })}
                placeholder="e.g., Kerala PSC LDC Mock Test 01"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Global Timer (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={360}
                value={settings.globalDurationMinutes}
                onChange={(e) =>
                  updateSettings({
                    globalDurationMinutes: Math.max(1, parseInt(e.target.value, 10) || 90),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">
                Target Per-Question Time (seconds)
              </label>
              <input
                type="number"
                min={10}
                max={600}
                value={settings.perQuestionDurationSeconds}
                onChange={(e) =>
                  updateSettings({
                    perQuestionDurationSeconds: Math.max(10, parseInt(e.target.value, 10) || 90),
                  })
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <div className="flex items-end">
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Overtime Tracking:</span> Never
                auto-skips; counts upward after 00:00.
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={loadSampleExam}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
            >
              <Sparkles className="h-4 w-4" />
              Load Sample Math &amp; Text Exam
            </button>

            <input
              ref={savedExamInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleLoadSavedExamFile}
            />
            <button
              type="button"
              onClick={() => savedExamInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
            >
              <FolderOpen className="h-4 w-4" />
              Load Saved Exam (.json) — Shuffled Redo
            </button>
          </div>

          <button
            type="button"
            disabled={parsedQuestions.length === 0 || isParsingQuestions || isParsingKey}
            onClick={handleProceedToVerify}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            <FileCheck2 className="h-4 w-4" />
            Verify Extracted Questions ({parsedQuestions.length})
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {savedExamError && (
          <p className="mt-3 text-xs font-medium text-rose-600">{savedExamError}</p>
        )}

        {/* Recent Solo Practice History */}
        {attemptHistory.length > 0 && (
          <div className="mt-10 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <History className="h-4 w-4 text-indigo-600" />
                Recent Solo Practice Attempts ({attemptHistory.length})
              </div>
              <button
                type="button"
                onClick={clearAttemptHistory}
                className="text-xs font-medium text-rose-600 hover:underline"
              >
                Clear History
              </button>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Exam</th>
                    <th className="py-2 pr-3 text-right">Score</th>
                    <th className="py-2 pr-3 text-right">Accuracy</th>
                    <th className="py-2 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attemptHistory.slice(0, 5).map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="whitespace-nowrap py-2 pr-3 text-slate-500">
                        {new Date(attempt.completedAt).toLocaleDateString()}
                      </td>
                      <td className="max-w-xs truncate py-2 pr-3 font-medium text-slate-800">
                        {attempt.examTitle}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono font-bold text-indigo-700">
                        {attempt.finalScore}/{attempt.totalMarks}
                      </td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-mono text-slate-700">
                        {attempt.accuracy}%
                      </td>
                      <td className="whitespace-nowrap py-2 text-right font-mono text-slate-500">
                        {formatDurationReadable(attempt.totalTimeUsedSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scoring Rule Footer */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <span>
            Confirmed Correct: <strong className="text-emerald-700">+1</strong>
          </span>
          <span>•</span>
          <span>
            Confirmed Wrong: <strong className="text-rose-700">-0.33</strong>
          </span>
          <span>•</span>
          <span>
            Skipped / Unconfirmed: <strong className="text-slate-700">0</strong>
          </span>
          <span>•</span>
          <span>Shortcuts: A–D / 1–4, Enter (Confirm), Arrow Keys</span>
        </div>
      </div>
    </div>
  );
};
