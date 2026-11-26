import React, { useMemo, useState } from 'react';
import {
  Activity,
  Award,
  Clock,
  FilePlus2,
  FolderOpen,
  Layers,
  Play,
  Shuffle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
} from 'lucide-react';
import { ExamResult } from '../../types/exam';
import { ExamHead } from '../../types/examHead';
import {
  computeExamHeadReadiness,
  computeGlobalAnalytics,
  computeScoreTrendSeries,
  computeTimeDisciplineMetrics,
  filterAttemptsByExamHead,
  ScoreTrendPoint,
} from '../../utils/analyticsEngine';
import { formatDurationReadable, formatTimerMMSS } from '../../utils/scoring';

interface HomeAnalyticsTabProps {
  examHeads: ExamHead[];
  attempts: ExamResult[];
  onLaunchMock: (examHeadId?: string) => void;
  onNavigateCreate: () => void;
  onNavigateResults: () => void;
  onOpenImportModal: () => void;
  onTrySampleExam: () => void;
}

export const HomeAnalyticsTab: React.FC<HomeAnalyticsTabProps> = ({
  examHeads,
  attempts,
  onLaunchMock,
  onNavigateCreate,
  onNavigateResults,
  onOpenImportModal,
  onTrySampleExam,
}) => {
  const [filterHeadId, setFilterHeadId] = useState<string>('all');
  const [hoveredPoint, setHoveredPoint] = useState<ScoreTrendPoint | null>(null);

  const scopedAttempts = useMemo(
    () => filterAttemptsByExamHead(attempts, examHeads, filterHeadId),
    [attempts, examHeads, filterHeadId]
  );

  const summary = useMemo(
    () => computeGlobalAnalytics(attempts, examHeads, filterHeadId),
    [attempts, examHeads, filterHeadId]
  );

  const trendSeries = useMemo(() => computeScoreTrendSeries(scopedAttempts, 15), [scopedAttempts]);

  const timeMetrics = useMemo(
    () => computeTimeDisciplineMetrics(scopedAttempts, 90),
    [scopedAttempts]
  );

  const readinessRows = useMemo(
    () => computeExamHeadReadiness(examHeads, attempts),
    [examHeads, attempts]
  );

  const totalAnswers = summary.totalCorrect + summary.totalWrong + summary.totalSkipped;
  const correctPct = totalAnswers > 0 ? Math.round((summary.totalCorrect / totalAnswers) * 100) : 0;
  const wrongPct = totalAnswers > 0 ? Math.round((summary.totalWrong / totalAnswers) * 100) : 0;
  const skippedPct = totalAnswers > 0 ? Math.max(0, 100 - correctPct - wrongPct) : 0;

  const donutRadius = 56;
  const donutCirc = 2 * Math.PI * donutRadius;
  const correctArc = totalAnswers > 0 ? (summary.totalCorrect / totalAnswers) * donutCirc : 0;
  const wrongArc = totalAnswers > 0 ? (summary.totalWrong / totalAnswers) * donutCirc : 0;
  const skippedArc = totalAnswers > 0 ? (summary.totalSkipped / totalAnswers) * donutCirc : 0;

  const chartW = 560;
  const chartH = 210;
  const padL = 36;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const getX = (index: number, count: number): number => {
    if (count <= 1) return padL + plotW / 2;
    return padL + (index / (count - 1)) * plotW;
  };

  const getY = (pct: number): number => {
    const clamped = Math.max(0, Math.min(100, pct));
    return padT + plotH - (clamped / 100) * plotH;
  };

  const scorePath = trendSeries
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx, trendSeries.length)} ${getY(pt.scorePercent)}`)
    .join(' ');

  const accuracyPath = trendSeries
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx, trendSeries.length)} ${getY(pt.accuracyPercent)}`)
    .join(' ');

  const scoreAreaPath =
    trendSeries.length > 0
      ? `${scorePath} L ${getX(trendSeries.length - 1, trendSeries.length)} ${padT + plotH} L ${getX(
          0,
          trendSeries.length
        )} ${padT + plotH} Z`
      : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={examHeads.length === 0}
            onClick={() => onLaunchMock(filterHeadId !== 'all' ? filterHeadId : undefined)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
          >
            <Shuffle className="h-4 w-4" />
            Start Random Mock
          </button>
          <button
            type="button"
            onClick={onNavigateCreate}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FilePlus2 className="h-4 w-4 text-indigo-600" />
            Upload New Paper
          </button>
          {attempts.length > 0 && (
            <button
              type="button"
              onClick={onNavigateResults}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Award className="h-4 w-4 text-emerald-600" />
              View Latest Result
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="analytics-head-filter" className="text-xs font-semibold text-slate-500">
            Scope:
          </label>
          <select
            id="analytics-head-filter"
            value={filterHeadId}
            onChange={(e) => setFilterHeadId(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">All Exams ({examHeads.length})</option>
            {examHeads.map((head) => (
              <option key={head.id} value={head.id}>
                {head.name} ({head.questions.length} Qs)
              </option>
            ))}
          </select>
        </div>
      </div>

      {attempts.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Welcome to Your Solo Exam Practice Hub
            </span>
            <h2 className="mt-3 text-xl font-bold text-slate-900">
              No mock test attempts recorded yet
            </h2>
            <p className="mt-1.5 text-sm text-slate-600">
              Upload a Kerala PSC PDF question paper and answer key, import a friend&apos;s shared{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">.json</code> exam bank, or
              try the built-in sample exam to unlock live score trends and accuracy analytics.
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={onNavigateCreate}
              className="flex flex-col items-start rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <FilePlus2 className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">Upload First PDF Paper</p>
              <p className="mt-1 text-xs text-slate-500">
                Convert Malayalam or English question papers + multi-booklet keys into reusable pools.
              </p>
            </button>

            <button
              type="button"
              onClick={onOpenImportModal}
              className="flex flex-col items-start rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <Upload className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">Import Shared .json File</p>
              <p className="mt-1 text-xs text-slate-500">
                Load an Exam Head or update pack received via WhatsApp, Telegram, or Email.
              </p>
            </button>

            <button
              type="button"
              onClick={onTrySampleExam}
              className="flex flex-col items-start rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Play className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-900">Try Sample Exam</p>
              <p className="mt-1 text-xs text-slate-500">
                Test the 90:00 timer, 01:30 overtime tracker, Paper Slate, and instant scorecard now.
              </p>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Mock Tests
                </span>
                <Activity className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900">{summary.totalAttempts}</p>
              <p className="mt-1 text-xs font-medium text-emerald-700">
                +{summary.attemptsThisWeek} in the last 7 days
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Avg Score &amp; Accuracy
                </span>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900">
                {summary.averageScorePercent.toFixed(1)}%
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Overall Accuracy:{' '}
                <span className="font-bold text-emerald-700">
                  {summary.overallAccuracy.toFixed(1)}%
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Question Pool
                </span>
                <Layers className="h-4 w-4 text-indigo-600" />
              </div>
              <p className="mt-2 text-3xl font-extrabold text-slate-900">
                {summary.totalQuestionPool}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Across {summary.totalExamHeads} Exam Head{summary.totalExamHeads === 1 ? '' : 's'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Negative Marking Impact
                </span>
                <TrendingDown className="h-4 w-4 text-rose-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-xl font-extrabold text-emerald-600">
                  +{summary.totalMarksGained.toFixed(0)}
                </span>
                <span className="text-xs text-slate-400">vs</span>
                <span className="text-xl font-extrabold text-rose-600">
                  -{summary.totalMarksLost.toFixed(2)}
                </span>
              </div>
              <p className="mt-1 text-xs font-medium text-slate-600">
                Net Cumulative:{' '}
                <span className="font-bold text-slate-900">
                  {summary.netMarksAcrossAttempts.toFixed(2)}
                </span>{' '}
                marks
              </p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-12">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Score &amp; Accuracy Trend (Last {trendSeries.length} Attempts)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hover any point to inspect net marks and time taken
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 text-indigo-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                    Net Score %
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Accuracy %
                  </span>
                </div>
              </div>

              {trendSeries.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-200 py-12 text-center text-xs text-slate-500">
                  No attempts match the selected Exam Head filter yet.
                </div>
              ) : (
                <div className="relative mt-4">
                  <svg
                    viewBox={`0 0 ${chartW} ${chartH}`}
                    className="h-56 w-full overflow-visible"
                    role="img"
                    aria-label="Score and Accuracy Trend Chart"
                  >
                    <defs>
                      <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.18" />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.01" />
                      </linearGradient>
                    </defs>

                    {[0, 25, 50, 75, 100].map((tick) => {
                      const y = getY(tick);
                      return (
                        <g key={tick}>
                          <line
                            x1={padL}
                            y1={y}
                            x2={chartW - padR}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeDasharray={tick === 0 ? undefined : '3 3'}
                          />
                          <text
                            x={padL - 6}
                            y={y + 4}
                            textAnchor="end"
                            className="fill-slate-400 text-[10px]"
                          >
                            {tick}%
                          </text>
                        </g>
                      );
                    })}

                    {scoreAreaPath && <path d={scoreAreaPath} fill="url(#scoreAreaGrad)" />}
                    {accuracyPath && (
                      <path
                        d={accuracyPath}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                    )}
                    {scorePath && (
                      <path d={scorePath} fill="none" stroke="#4f46e5" strokeWidth="2.5" />
                    )}

                    {trendSeries.map((pt, idx) => {
                      const cx = getX(idx, trendSeries.length);
                      const cyScore = getY(pt.scorePercent);
                      const cyAcc = getY(pt.accuracyPercent);
                      const isActive = hoveredPoint && hoveredPoint.attemptId === pt.attemptId;

                      return (
                        <g
                          key={pt.attemptId}
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          className="cursor-pointer"
                        >
                          <circle
                            cx={cx}
                            cy={cyAcc}
                            r={isActive ? 5 : 3.5}
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                          <circle
                            cx={cx}
                            cy={cyScore}
                            r={isActive ? 6 : 4}
                            fill="#4f46e5"
                            stroke="#ffffff"
                            strokeWidth="1.5"
                          />
                          <text
                            x={cx}
                            y={chartH - 6}
                            textAnchor="middle"
                            className="fill-slate-500 text-[10px]"
                          >
                            {pt.dateLabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {hoveredPoint && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3.5 py-2 text-xs">
                      <span className="font-bold text-slate-900">
                        {hoveredPoint.examTitle} ({hoveredPoint.dateLabel})
                      </span>
                      <div className="flex flex-wrap items-center gap-3 font-semibold">
                        <span className="text-indigo-700">
                          Net: {hoveredPoint.finalScore}/{hoveredPoint.totalMarks} (
                          {hoveredPoint.scorePercent}%)
                        </span>
                        <span className="text-emerald-700">
                          Acc: {hoveredPoint.accuracyPercent}%
                        </span>
                        <span className="text-slate-600">
                          Time: {formatDurationReadable(hoveredPoint.totalTimeUsedSeconds)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5 lg:col-span-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">Answer Distribution</h3>
                <div className="mt-4 flex flex-wrap items-center justify-around gap-4">
                  <div className="relative h-36 w-36">
                    <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
                      <circle
                        cx="70"
                        cy="70"
                        r={donutRadius}
                        fill="none"
                        stroke="#f1f5f9"
                        strokeWidth="16"
                      />
                      {totalAnswers > 0 && (
                        <>
                          <circle
                            cx="70"
                            cy="70"
                            r={donutRadius}
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="16"
                            strokeDasharray={`${correctArc} ${donutCirc}`}
                            strokeDashoffset={0}
                          />
                          <circle
                            cx="70"
                            cy="70"
                            r={donutRadius}
                            fill="none"
                            stroke="#e11d48"
                            strokeWidth="16"
                            strokeDasharray={`${wrongArc} ${donutCirc}`}
                            strokeDashoffset={-correctArc}
                          />
                          <circle
                            cx="70"
                            cy="70"
                            r={donutRadius}
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="16"
                            strokeDasharray={`${skippedArc} ${donutCirc}`}
                            strokeDashoffset={-(correctArc + wrongArc)}
                          />
                        </>
                      )}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-lg font-extrabold text-slate-900">{totalAnswers}</span>
                      <span className="text-[10px] font-semibold uppercase text-slate-500">
                        Total Qs
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                        Correct
                      </span>
                      <span className="font-bold text-slate-900">
                        {summary.totalCorrect} ({correctPct}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />
                        Wrong
                      </span>
                      <span className="font-bold text-slate-900">
                        {summary.totalWrong} ({wrongPct}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                        <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                        Skipped
                      </span>
                      <span className="font-bold text-slate-900">
                        {summary.totalSkipped} ({skippedPct}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">Time Discipline</h3>
                  <Clock
                    className={`h-4 w-4 ${
                      timeMetrics.isWithinBenchmark ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">Avg / Question</p>
                    <p
                      className={`mt-1 text-xl font-extrabold ${
                        timeMetrics.isWithinBenchmark ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatTimerMMSS(timeMetrics.averageSecondsPerQuestion)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Target: 01:30 (90s)</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold text-slate-500">Overtime Rate</p>
                    <p
                      className={`mt-1 text-xl font-extrabold ${
                        timeMetrics.overtimePercent <= 15
                          ? 'text-emerald-700'
                          : timeMetrics.overtimePercent <= 30
                          ? 'text-amber-600'
                          : 'text-rose-700'
                      }`}
                    >
                      {timeMetrics.overtimePercent.toFixed(1)}%
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {timeMetrics.totalOvertimeQuestions} of {timeMetrics.totalQuestionsEvaluated}{' '}
                      Qs
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Exam Head Readiness Summary</h3>
          </div>
          <span className="text-xs font-medium text-slate-500">
            {readinessRows.length} Exam Head{readinessRows.length === 1 ? '' : 's'}
          </span>
        </div>

        {readinessRows.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">
            No Exam Heads saved yet. Create one in <strong>Upload &amp; Create</strong> or import a
            shared <code className="rounded bg-slate-100 px-1 py-0.5">.json</code> bank.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Exam Head</th>
                  <th className="px-4 py-3">Pool &amp; Attempted Coverage</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-4 py-3">Best / Avg Score</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readinessRows.map((row) => (
                  <tr key={row.examHeadId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{row.examHeadName}</p>
                      <p className="text-[11px] text-slate-500">
                        {row.paperCount} merged paper{row.paperCount === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>
                          {row.attemptedQuestions} / {row.totalQuestions} attempted
                        </span>
                        <span>{row.coveragePercent.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-36 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-indigo-600"
                          style={{ width: `${Math.min(100, row.coveragePercent)}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-semibold text-slate-800">
                      {row.attemptsCount}
                    </td>
                    <td className="px-4 py-3.5">
                      {row.bestScorePercent !== null && row.averageScorePercent !== null ? (
                        <span className="font-semibold text-slate-900">
                          <span className="text-emerald-700">
                            {row.bestScorePercent.toFixed(1)}%
                          </span>{' '}
                          <span className="text-slate-400">/</span>{' '}
                          {row.averageScorePercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">Not attempted</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        disabled={row.totalQuestions === 0}
                        onClick={() => onLaunchMock(row.examHeadId)}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-slate-300"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Launch Mock
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
