import React, { useState } from 'react';
import { Sparkles, ArrowRight, ShieldCheck, Clock, FileCheck2, History } from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import {
  extractTextFromPdf,
  mergeQuestionsWithAnswerKey,
  parseAnswerKeyFromText,
  parseQuestionsFromText,
  PdfExtractionProgress,
} from '../../utils/pdfParser';
import { ExamQuestion, OptionKey } from '../../types/exam';
import { formatDurationReadable } from '../../utils/scoring';
import { PdfDropzone } from './PdfDropzone';

export const LandingUpload: React.FC = () => {
  const {
    settings,
    attemptHistory,
    updateSettings,
    setQuestions,
    setPhase,
    loadSampleExam,
    clearAttemptHistory,
  } = useExamStore();

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
  const [parsedAnswerKey, setParsedAnswerKey] = useState<Record<number, OptionKey>>({});

  const handleQuestionPdf = async (file: File) => {
    setQuestionFileName(file.name);
    setQuestionError(null);
    setQuestionStatus(null);
    setIsParsingQuestions(true);

    try {
      const result = await extractTextFromPdf(file, setQuestionProgress);
      const extracted = parseQuestionsFromText(result.text, result.averageOcrConfidence);

      if (extracted.length === 0) {
        setQuestionError(
          'No structured MCQs were detected. Try another PDF or add questions manually in verification.'
        );
      } else {
        const merged = mergeQuestionsWithAnswerKey(extracted, parsedAnswerKey);
        setParsedQuestions(merged);
        const ocrNote = result.usedOcr
          ? ` (OCR${result.averageOcrConfidence ? ` ~${result.averageOcrConfidence}%` : ''})`
          : '';
        setQuestionStatus(
          `Extracted ${merged.length} questions from ${result.pageCount} page(s)${ocrNote}.`
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
      const result = await extractTextFromPdf(file, setKeyProgress);
      const keyMap = parseAnswerKeyFromText(result.text);
      const count = Object.keys(keyMap).length;

      if (count === 0) {
        setKeyError('No answer key entries detected. You can still set answers in verification.');
      } else {
        setParsedAnswerKey(keyMap);
        if (parsedQuestions.length > 0) {
          setParsedQuestions(mergeQuestionsWithAnswerKey(parsedQuestions, keyMap));
        }
        const ocrNote = result.usedOcr ? ' (via OCR)' : '';
        setKeyStatus(`Matched ${count} answer key entries${ocrNote}.`);
      }
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to parse Answer Key PDF.');
    } finally {
      setIsParsingKey(false);
      setKeyProgress(null);
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
            100% Client-Side • GitHub Pages Ready • Auto-Saved Locally
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            PDF-to-Exam MCQ Practice Studio
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">
            Upload a Question Paper PDF and Answer Key PDF (digital or scanned math/text) to launch
            a timed solo practice test with overtime tracking, a white Paper Slate, and exact
            negative marking.
          </p>
        </div>

        {/* Dual PDF Dropzones */}
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <PdfDropzone
            title="1. Question Paper PDF"
            subtitle="Supports single/two-column digital PDFs and scanned math PDFs via auto-OCR."
            fileName={questionFileName}
            statusMessage={questionStatus}
            progress={questionProgress}
            error={questionError}
            isProcessing={isParsingQuestions}
            onFileSelect={handleQuestionPdf}
          />
          <PdfDropzone
            title="2. Answer Key PDF"
            subtitle="Extracts question → answer mappings from lists, columns, or grid tables."
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
                placeholder="e.g., Quantitative Aptitude Mock 01"
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
        <div className="mt-6 flex flex-col items-center justify-between gap-3 sm:flex-row">
          <button
            type="button"
            onClick={loadSampleExam}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 sm:w-auto"
          >
            <Sparkles className="h-4 w-4" />
            Load Sample Math &amp; Text Exam
          </button>

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
