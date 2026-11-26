import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Download,
  History,
  MinusCircle,
  RotateCcw,
  Shuffle,
  Target,
  XCircle,
} from 'lucide-react';
import {
  ExamQuestion,
  ExamResult,
  ExamScorecard,
  OPTION_KEYS,
  QuestionReviewItem,
} from '../../types/exam';
import {
  buildResultsCsv,
  formatDurationReadable,
  formatTimerMMSS,
  roundScore,
  WRONG_MARK,
} from '../../utils/scoring';

interface LatestResultsTabProps {
  attempts: ExamResult[];
  onLaunchMock: (examHeadId?: string) => void;
  onStartTargetedPractice: (
    title: string,
    questions: ExamQuestion[],
    examHeadId?: string
  ) => void;
}

type ReviewFilter = 'all' | 'correct' | 'wrong' | 'skipped' | 'overtime';

function convertReviewItemToQuestion(item: QuestionReviewItem, index: number): ExamQuestion {
  return {
    number: index + 1,
    text: item.questionText,
    options: { ...item.options },
    correctOption: item.correctOption,
    explanation: item.explanation,
    imageDataUrl: item.imageDataUrl,
    table: item.table,
    paperLabel: item.paperLabel,
    sourceQuestionId: item.sourceQuestionId,
    warnings: [],
  };
}

export const LatestResultsTab: React.FC<LatestResultsTabProps> = ({
  attempts,
  onLaunchMock,
  onStartTargetedPractice,
}) => {
  const [selectedAttemptId, setSelectedAttemptId] = useState<string>(
    attempts.length > 0 ? attempts[0].id : ''
  );
  const [filter, setFilter] = useState<ReviewFilter>('all');

  useEffect(() => {
    if (attempts.length === 0) {
      setSelectedAttemptId('');
      return;
    }
    if (!attempts.some((a) => a.id === selectedAttemptId)) {
      setSelectedAttemptId(attempts[0].id);
    }
  }, [attempts, selectedAttemptId]);

  const activeAttempt = useMemo(
    () => attempts.find((a) => a.id === selectedAttemptId) ?? attempts[0] ?? null,
    [attempts, selectedAttemptId]
  );

  const reviewItems = activeAttempt && Array.isArray(activeAttempt.items) ? activeAttempt.items : [];

  const filteredItems = useMemo(() => {
    return reviewItems.filter((item) => {
      if (filter === 'correct') return item.outcome === 'correct';
      if (filter === 'wrong') return item.outcome === 'wrong';
      if (filter === 'skipped') return item.outcome === 'skipped';
      if (filter === 'overtime') return item.isOvertime;
      return true;
    });
  }, [reviewItems, filter]);

  if (!activeAttempt) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
        <Award className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-base font-bold text-slate-900">No Exam Results Yet</h3>
        <p className="mt-1 text-xs text-slate-500">
          Finish a mock test to view your exact +1 / -0.33 scorecard, overtime breakdown, and
          question-by-question review here.
        </p>
        <button
          type="button"
          onClick={() => onLaunchMock(undefined)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
        >
          <Shuffle className="h-4 w-4" />
          Launch Random Mock
        </button>
      </div>
    );
  }

  const totalQs =
    activeAttempt.totalQuestions ??
    activeAttempt.correctCount + activeAttempt.wrongCount + activeAttempt.skippedCount;
  const negativeDeducted =
    activeAttempt.negativeMarksDeducted !== undefined
      ? activeAttempt.negativeMarksDeducted
      : roundScore(activeAttempt.wrongCount * Math.abs(WRONG_MARK));
  const avgSec =
    activeAttempt.averageTimePerQuestionSeconds !== undefined
      ? activeAttempt.averageTimePerQuestionSeconds
      : totalQs > 0
      ? Math.round(activeAttempt.totalTimeUsedSeconds / totalQs)
      : 0;
  const missedItems = reviewItems.filter(
    (item) => item.outcome === 'wrong' || item.outcome === 'skipped'
  );

  const performanceBadge =
    activeAttempt.percentage >= 75
      ? { label: 'Strong Performance', cls: 'bg-emerald-100 text-emerald-800' }
      : activeAttempt.percentage >= 50
      ? { label: 'Good Progress', cls: 'bg-indigo-100 text-indigo-800' }
      : { label: 'Needs Revision', cls: 'bg-amber-100 text-amber-800' };

  const handlePracticeMissed = () => {
    if (missedItems.length === 0) return;
    const questions = missedItems.map((item, idx) => convertReviewItemToQuestion(item, idx));
    onStartTargetedPractice(
      `${activeAttempt.examTitle} (Wrong & Skipped Revision)`,
      questions,
      activeAttempt.examHeadId
    );
  };

  const handleRetakeSame = () => {
    if (reviewItems.length === 0) return;
    const questions = reviewItems.map((item, idx) => convertReviewItemToQuestion(item, idx));
    onStartTargetedPractice(activeAttempt.examTitle, questions, activeAttempt.examHeadId);
  };

  const handleExportCsv = () => {
    const scorecard: ExamScorecard = {
      finalScore: activeAttempt.finalScore,
      totalMarks: activeAttempt.totalMarks,
      percentage: activeAttempt.percentage,
      accuracy: activeAttempt.accuracy,
      totalQuestions: totalQs,
      attemptedCount: activeAttempt.correctCount + activeAttempt.wrongCount,
      correctCount: activeAttempt.correctCount,
      wrongCount: activeAttempt.wrongCount,
      skippedCount: activeAttempt.skippedCount,
      negativeMarksDeducted: negativeDeducted,
      overtimeCount: activeAttempt.overtimeCount,
      totalTimeUsedSeconds: activeAttempt.totalTimeUsedSeconds,
      averageTimePerQuestionSeconds: avgSec,
      items: reviewItems,
    };

    const csv = buildResultsCsv(scorecard, activeAttempt.examTitle);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeAttempt.examTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-scorecard.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filterTabs: Array<{ id: ReviewFilter; label: string; count: number }> = [
    { id: 'all', label: 'All', count: reviewItems.length },
    { id: 'correct', label: 'Correct (+1)', count: activeAttempt.correctCount },
    { id: 'wrong', label: 'Wrong (-0.33)', count: activeAttempt.wrongCount },
    { id: 'skipped', label: 'Skipped (0)', count: activeAttempt.skippedCount },
    { id: 'overtime', label: 'Overtime (> 01:30)', count: activeAttempt.overtimeCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <History className="h-4 w-4 text-indigo-600" />
          <span>Past Attempts ({attempts.length})</span>
        </div>

        <select
          value={activeAttempt.id}
          onChange={(e) => {
            setSelectedAttemptId(e.target.value);
            setFilter('all');
          }}
          className="max-w-md flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none sm:flex-initial sm:min-w-[280px]"
        >
          {attempts.map((a, idx) => (
            <option key={a.id} value={a.id}>
              {idx === 0 ? '[Latest] ' : ''}
              {a.examTitle} — {a.finalScore}/{a.totalMarks} ({a.percentage}%) •{' '}
              {new Date(a.completedAt).toLocaleDateString()}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900">{activeAttempt.examTitle}</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${performanceBadge.cls}`}
              >
                {performanceBadge.label}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Completed {new Date(activeAttempt.completedAt).toLocaleString()} • Time Used:{' '}
              <strong className="text-slate-700">
                {formatDurationReadable(activeAttempt.totalTimeUsedSeconds)}
              </strong>
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">
              Final Net Score
            </p>
            <p className="mt-1 text-2xl font-extrabold text-indigo-950">
              {activeAttempt.finalScore.toFixed(2)}
              <span className="text-sm font-semibold text-indigo-600">
                {' '}
                / {activeAttempt.totalMarks}
              </span>
            </p>
            <p className="mt-0.5 text-xs font-semibold text-indigo-700">
              {activeAttempt.percentage.toFixed(2)}%
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
              Correct (+1)
            </p>
            <p className="mt-1 text-2xl font-extrabold text-emerald-900">
              {activeAttempt.correctCount}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-emerald-700">
              +{activeAttempt.correctCount.toFixed(2)} marks
            </p>
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-rose-700">
              Wrong (-0.33)
            </p>
            <p className="mt-1 text-2xl font-extrabold text-rose-900">
              {activeAttempt.wrongCount}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-rose-700">
              -{negativeDeducted.toFixed(2)} penalty
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Skipped (0)
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {activeAttempt.skippedCount}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">0.00 marks</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Accuracy &amp; Speed
            </p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">
              {activeAttempt.accuracy.toFixed(1)}%
            </p>
            <p className="mt-0.5 text-xs font-semibold text-slate-600">
              {formatTimerMMSS(avgSec)}/Q •{' '}
              <span className={activeAttempt.overtimeCount > 0 ? 'text-rose-600' : ''}>
                {activeAttempt.overtimeCount} OT
              </span>
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={missedItems.length === 0}
            onClick={handlePracticeMissed}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400"
          >
            <Target className="h-4 w-4" />
            Practice Wrong &amp; Skipped Only ({missedItems.length})
          </button>

          <button
            type="button"
            onClick={() => onLaunchMock(activeAttempt.examHeadId)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <Shuffle className="h-4 w-4" />
            Launch New Random Mock
          </button>

          <button
            type="button"
            disabled={reviewItems.length === 0}
            onClick={handleRetakeSame}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Retake Exact Same Test
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export Scorecard (CSV)
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                filter === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {reviewItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
            Detailed question-by-question breakdown is available for exams completed after this
            update.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
            No questions match this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const marksLabel =
                item.marksAwarded > 0
                  ? '+1.00'
                  : item.marksAwarded < 0
                  ? item.marksAwarded.toFixed(2)
                  : '0.00';

              return (
                <div
                  key={item.questionNumber}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 min-w-[2.4rem] items-center justify-center rounded-lg bg-slate-900 px-2 text-xs font-bold text-white">
                        Q{item.questionNumber}
                      </span>
                      {item.paperLabel && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          {item.paperLabel}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold">
                      {item.outcome === 'correct' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Correct ({marksLabel})
                        </span>
                      )}
                      {item.outcome === 'wrong' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-rose-800">
                          <XCircle className="h-3.5 w-3.5" />
                          Wrong ({marksLabel})
                        </span>
                      )}
                      {item.outcome === 'skipped' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700">
                          <MinusCircle className="h-3.5 w-3.5" />
                          Skipped ({marksLabel})
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-900">
                    {item.questionText}
                  </p>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {OPTION_KEYS.map((key) => {
                      const isCorrectKey = item.correctOption === key;
                      const isWrongSelection =
                        item.outcome === 'wrong' && item.confirmedOption === key;

                      let boxCls = 'border-slate-200 bg-slate-50 text-slate-700';
                      if (isCorrectKey) {
                        boxCls =
                          'border-emerald-400 bg-emerald-50 font-semibold text-emerald-950 ring-1 ring-emerald-200';
                      } else if (isWrongSelection) {
                        boxCls =
                          'border-rose-400 bg-rose-50 font-semibold text-rose-950 ring-1 ring-rose-200';
                      }

                      return (
                        <div
                          key={key}
                          className={`flex items-start justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${boxCls}`}
                        >
                          <div>
                            <span className="font-bold">{key})</span> {item.options[key] || '—'}
                          </div>
                          {isCorrectKey && (
                            <span className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              Answer Key
                            </span>
                          )}
                          {isWrongSelection && (
                            <span className="shrink-0 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              Your Pick
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-4">
                      <span>
                        Your Answer:{' '}
                        <strong className="text-slate-900">
                          {item.confirmedOption ?? 'Skipped'}
                        </strong>
                      </span>
                      <span>
                        Correct Answer:{' '}
                        <strong className="text-emerald-700">
                          {item.correctOption ?? 'N/A'}
                        </strong>
                      </span>
                      <span>
                        Marks:{' '}
                        <strong
                          className={
                            item.marksAwarded > 0
                              ? 'text-emerald-700'
                              : item.marksAwarded < 0
                              ? 'text-rose-700'
                              : 'text-slate-700'
                          }
                        >
                          {marksLabel}
                        </strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {formatTimerMMSS(item.timeSpentSeconds)}
                      </span>
                      {item.isOvertime && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                          OVERTIME +{formatTimerMMSS(item.overtimeSeconds)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
