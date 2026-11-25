import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { ExamQuestion, QuestionResponse } from '../../types/exam';

interface FinishExamModalProps {
  open: boolean;
  questions: ExamQuestion[];
  responses: Record<number, QuestionResponse>;
  onCancel: () => void;
  onConfirmFinish: () => void;
}

export const FinishExamModal: React.FC<FinishExamModalProps> = ({
  open,
  questions,
  responses,
  onCancel,
  onConfirmFinish,
}) => {
  if (!open) return null;

  let confirmedCount = 0;
  let reviewCount = 0;
  let skippedCount = 0;
  let unvisitedCount = 0;
  let unconfirmedSelectedCount = 0;

  questions.forEach((q) => {
    const resp = responses[q.number];
    const status = resp?.status ?? 'not_visited';
    switch (status) {
      case 'confirmed':
        confirmedCount += 1;
        break;
      case 'marked_for_review':
        reviewCount += 1;
        if (resp?.selectedOption) unconfirmedSelectedCount += 1;
        break;
      case 'skipped':
        skippedCount += 1;
        break;
      case 'not_visited':
        unvisitedCount += 1;
        break;
      default:
        if (resp?.selectedOption) unconfirmedSelectedCount += 1;
        break;
    }
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-exam-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 id="finish-exam-title" className="text-base font-bold text-slate-900">
                Finish &amp; Submit Exam?
              </h2>
              <p className="text-xs text-slate-500">
                Review your question summary before grading.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-700">Confirmed</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">{confirmedCount}</p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
            <p className="text-xs font-medium text-purple-700">Marked for Review</p>
            <p className="mt-1 text-xl font-bold text-purple-900">{reviewCount}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-medium text-amber-800">Skipped</p>
            <p className="mt-1 text-xl font-bold text-amber-900">{skippedCount}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">Unvisited</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{unvisitedCount}</p>
          </div>
        </div>

        {unconfirmedSelectedCount > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
            Note: {unconfirmedSelectedCount} question
            {unconfirmedSelectedCount === 1 ? ' has' : 's have'} a selected option that has not been
            confirmed. Only <strong>Confirmed</strong> answers receive +1 / -0.33; unconfirmed
            answers score 0.
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Continue Exam
          </button>
          <button
            type="button"
            onClick={onConfirmFinish}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700"
          >
            <CheckCircle2 className="h-4 w-4" />
            Submit &amp; View Scorecard
          </button>
        </div>
      </div>
    </div>
  );
};
