import React from 'react';
import { X } from 'lucide-react';
import { ExamQuestion, QuestionResponse } from '../../types/exam';

interface QuestionPaletteProps {
  open: boolean;
  questions: ExamQuestion[];
  responses: Record<number, QuestionResponse>;
  currentIndex: number;
  onSelectQuestion: (index: number) => void;
  onClose: () => void;
}

function getButtonColorClass(
  response: QuestionResponse | undefined,
  isCurrent: boolean
): string {
  const ring = isCurrent ? 'ring-2 ring-indigo-600 ring-offset-2' : '';
  const status = response?.status ?? 'not_visited';

  switch (status) {
    case 'confirmed':
      return `bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 ${ring}`;
    case 'marked_for_review':
      return `bg-purple-600 text-white border-purple-600 hover:bg-purple-700 ${ring}`;
    case 'skipped':
      return `bg-amber-400 text-slate-900 border-amber-500 hover:bg-amber-500 ${ring}`;
    case 'visited':
      return `bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200 ${ring}`;
    case 'not_visited':
    default:
      return `bg-white text-slate-700 border-slate-300 hover:bg-slate-50 ${ring}`;
  }
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  open,
  questions,
  responses,
  currentIndex,
  onSelectQuestion,
  onClose,
}) => {
  if (!open) return null;

  let confirmed = 0;
  let review = 0;
  let skipped = 0;
  let notVisited = 0;

  questions.forEach((q) => {
    const status = responses[q.number]?.status ?? 'not_visited';
    if (status === 'confirmed') confirmed += 1;
    else if (status === 'marked_for_review') review += 1;
    else if (status === 'skipped') skipped += 1;
    else if (status === 'not_visited') notVisited += 1;
  });

  return (
    <aside className="w-full shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:w-72">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <h2 className="text-sm font-bold text-slate-900">Question Palette</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close Question Palette"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Numbered Grid */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        {questions.map((q, idx) => {
          const resp = responses[q.number];
          const isCurrent = idx === currentIndex;
          const hasAnswerAndReview =
            resp?.status === 'marked_for_review' && resp.selectedOption !== null;

          return (
            <button
              key={q.number}
              type="button"
              onClick={() => onSelectQuestion(idx)}
              className={`relative flex h-10 items-center justify-center rounded-lg border text-xs font-bold transition ${getButtonColorClass(
                resp,
                isCurrent
              )}`}
              title={`Question ${q.number} (${resp?.status ?? 'not_visited'})`}
            >
              {q.number}
              {hasAnswerAndReview && (
                <span
                  className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-white bg-emerald-400"
                  title="Answered & Marked for Review"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-emerald-600" />
            Confirmed / Answered
          </span>
          <span className="font-semibold text-slate-800">{confirmed}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-purple-600" />
            Marked for Review
          </span>
          <span className="font-semibold text-slate-800">{review}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded bg-amber-400" />
            Skipped
          </span>
          <span className="font-semibold text-slate-800">{skipped}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded border border-slate-300 bg-white" />
            Not Visited
          </span>
          <span className="font-semibold text-slate-800">{notVisited}</span>
        </div>
      </div>
    </aside>
  );
};
