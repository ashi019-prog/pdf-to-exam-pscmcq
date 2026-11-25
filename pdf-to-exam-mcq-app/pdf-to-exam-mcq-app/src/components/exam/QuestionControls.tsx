import React from 'react';
import {
  CheckCircle2,
  Bookmark,
  SkipForward,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface QuestionControlsProps {
  hasSelection: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onConfirm: () => void;
  onMarkForReview: () => void;
  onSkip: () => void;
  onClear: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export const QuestionControls: React.FC<QuestionControlsProps> = ({
  hasSelection,
  canGoPrev,
  canGoNext,
  onConfirm,
  onMarkForReview,
  onSkip,
  onClear,
  onPrev,
  onNext,
}) => {
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {/* Primary Exam Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!hasSelection}
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:text-sm"
        >
          <CheckCircle2 className="h-4 w-4" />
          Confirm Answer
        </button>

        <button
          type="button"
          onClick={onMarkForReview}
          className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3.5 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100 sm:text-sm"
        >
          <Bookmark className="h-4 w-4" />
          Mark for Review
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 sm:text-sm"
        >
          <SkipForward className="h-4 w-4" />
          Skip Question
        </button>

        <button
          type="button"
          disabled={!hasSelection}
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear Selection
        </button>
      </div>

      {/* Navigation Arrows */}
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3 sm:border-t-0 sm:pt-0">
        <button
          type="button"
          disabled={!canGoPrev}
          onClick={onPrev}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={onNext}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
