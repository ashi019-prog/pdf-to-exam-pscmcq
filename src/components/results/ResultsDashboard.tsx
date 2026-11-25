import React, { useMemo } from 'react';
import {
  Award,
  Download,
  FileJson,
  RotateCcw,
  Upload,
  CheckCircle2,
  XCircle,
  MinusCircle,
  TrendingDown,
  Clock,
  Target,
  AlertOctagon,
  Gauge,
  History,
  Trash2,
  Save,
  Shuffle,
} from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import { SavedExamPackage } from '../../types/exam';
import {
  buildResultsCsv,
  formatDurationReadable,
  formatTimerMMSS,
  gradeExam,
} from '../../utils/scoring';
import { ReviewTable } from './ReviewTable';

export const ResultsDashboard: React.FC = () => {
  const {
    settings,
    questions,
    responses,
    totalTimeUsedSeconds,
    attemptHistory,
    retakeExam,
    resetAll,
    clearAttemptHistory,
  } = useExamStore();

  const scorecard = useMemo(
    () =>
      gradeExam(
        questions,
        responses,
        totalTimeUsedSeconds,
        settings.perQuestionDurationSeconds
      ),
    [questions, responses, totalTimeUsedSeconds, settings.perQuestionDurationSeconds]
  );

  const safeSlug =
    settings.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'exam';

  const triggerDownload = (content: string, mimeType: string, filename: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveExamPack = () => {
    const pkg: SavedExamPackage = {
      version: 1,
      savedAt: new Date().toISOString(),
      settings,
      questions,
    };
    triggerDownload(
      JSON.stringify(pkg, null, 2),
      'application/json;charset=utf-8;',
      `${safeSlug}-exam-pack.json`
    );
  };

  const handleExportCsv = () => {
    const csv = buildResultsCsv(scorecard, settings.title);
    triggerDownload(csv, 'text/csv;charset=utf-8;', `${safeSlug}-scorecard.csv`);
  };

  const handleExportJson = () => {
    const payload = {
      examTitle: settings.title,
      exportedAt: new Date().toISOString(),
      scorecard,
    };
    triggerDownload(
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8;',
      `${safeSlug}-scorecard.json`
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <Award className="h-3.5 w-3.5" />
              Solo Practice Scorecard &amp; Answer Key
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">{settings.title}</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              Confirmed Correct (+1) • Confirmed Wrong (-0.33) • Skipped / Unconfirmed (0)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSaveExamPack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 sm:text-sm"
              title="Save questions, answer key, and notes to your computer for future shuffled redos"
            >
              <Save className="h-4 w-4" />
              Save Exam (.json)
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 sm:text-sm"
            >
              <FileJson className="h-4 w-4" />
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => retakeExam(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 sm:text-sm"
            >
              <Shuffle className="h-4 w-4" />
              Redo Exam (Shuffled)
            </button>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:text-sm"
            >
              <Upload className="h-4 w-4" />
              New PDFs
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-600 p-5 text-white shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-100">
              Final Score
            </p>
            <p className="mt-2 font-mono text-2xl font-bold sm:text-3xl">
              {scorecard.finalScore}{' '}
              <span className="text-base font-normal text-indigo-200">
                / {scorecard.totalMarks}
              </span>
            </p>
            <p className="mt-1 text-xs text-indigo-100">Max Score: {scorecard.totalMarks}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Percentage
            </p>
            <p className="mt-2 font-mono text-2xl font-bold text-slate-900 sm:text-3xl">
              {scorecard.percentage}%
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {scorecard.attemptedCount} of {scorecard.totalQuestions} confirmed
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Accuracy
              </p>
              <Target className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-slate-900 sm:text-3xl">
              {scorecard.accuracy}%
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {scorecard.correctCount} / {scorecard.attemptedCount} confirmed
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Total Time
              </p>
              <Clock className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-slate-900 sm:text-3xl">
              {formatDurationReadable(scorecard.totalTimeUsedSeconds)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Allowed: {settings.globalDurationMinutes}m 00s
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Avg Time / Q
              </p>
              <Gauge className="h-4 w-4 text-slate-600" />
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-slate-900 sm:text-3xl">
              {formatTimerMMSS(scorecard.averageTimePerQuestionSeconds)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Target: {formatTimerMMSS(settings.perQuestionDurationSeconds)}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="text-xs font-medium text-emerald-800">Correct (+1)</p>
              <p className="text-xl font-bold text-emerald-900">{scorecard.correctCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <XCircle className="h-6 w-6 shrink-0 text-rose-600" />
            <div>
              <p className="text-xs font-medium text-rose-800">Wrong (-0.33)</p>
              <p className="text-xl font-bold text-rose-900">{scorecard.wrongCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <MinusCircle className="h-6 w-6 shrink-0 text-slate-500" />
            <div>
              <p className="text-xs font-medium text-slate-600">Skipped (0)</p>
              <p className="text-xl font-bold text-slate-900">{scorecard.skippedCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <TrendingDown className="h-6 w-6 shrink-0 text-amber-700" />
            <div>
              <p className="text-xs font-medium text-amber-800">Negative Deducted</p>
              <p className="font-mono text-xl font-bold text-amber-900">
                -{scorecard.negativeMarksDeducted}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-white p-4">
            <AlertOctagon className="h-6 w-6 shrink-0 text-rose-600" />
            <div>
              <p className="text-xs font-medium text-rose-800">Overtime Questions</p>
              <p className="text-xl font-bold text-rose-900">{scorecard.overtimeCount}</p>
            </div>
          </div>
        </div>

        <ReviewTable items={scorecard.items} />

        {attemptHistory.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                <History className="h-4 w-4 text-indigo-600" />
                Solo Practice Attempt History ({attemptHistory.length})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => retakeExam(false)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Redo in Original Order
                </button>
                <button
                  type="button"
                  onClick={clearAttemptHistory}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear History
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Exam Name</th>
                    <th className="py-2 pr-4 text-right">Score</th>
                    <th className="py-2 pr-4 text-right">Accuracy</th>
                    <th className="py-2 pr-4 text-right">Overtime Qs</th>
                    <th className="py-2 text-right">Time Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attemptHistory.map((attempt) => (
                    <tr key={attempt.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500">
                        {new Date(attempt.completedAt).toLocaleString()}
                      </td>
                      <td className="max-w-xs truncate py-2.5 pr-4 font-medium text-slate-800">
                        {attempt.examTitle}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono font-bold text-indigo-700">
                        {attempt.finalScore} / {attempt.totalMarks} ({attempt.percentage}%)
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono text-slate-700">
                        {attempt.accuracy}%
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-right font-mono text-rose-700">
                        {attempt.overtimeCount}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right font-mono text-slate-600">
                        {formatDurationReadable(attempt.totalTimeUsedSeconds)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
