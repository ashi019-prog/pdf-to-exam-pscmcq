import React from 'react';
import { ExamQuestion, OPTION_KEYS, OptionKey, QuestionResponse } from '../../types/exam';

interface QuestionCardProps {
  question: ExamQuestion;
  response: QuestionResponse | undefined;
  onSelectOption: (option: OptionKey) => void;
}

function getStatusBadge(response: QuestionResponse | undefined): {
  label: string;
  className: string;
} {
  const status = response?.status ?? 'not_visited';
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmed',
        className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'marked_for_review':
      return {
        label: response?.selectedOption ? 'Answered & Marked for Review' : 'Marked for Review',
        className: 'bg-purple-100 text-purple-800 border-purple-200',
      };
    case 'skipped':
      return {
        label: 'Skipped',
        className: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    default:
      return {
        label: response?.selectedOption ? 'Selected (Press Confirm or Enter)' : 'Unanswered',
        className: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  response,
  onSelectOption,
}) => {
  const badge = getStatusBadge(response);
  const selected = response?.selectedOption ?? null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      {/* Question Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg bg-indigo-600 px-2.5 text-sm font-bold text-white">
            Q{question.number}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>

        <span className="text-xs text-slate-400">
          Marking: <strong className="text-emerald-600">+1</strong> /{' '}
          <strong className="text-rose-600">-0.33</strong> /{' '}
          <strong className="text-slate-600">0</strong>
        </span>
      </div>

      {/* Question Stem with whitespace-pre-wrap & readable math typography */}
      <div className="mt-5 whitespace-pre-wrap break-words text-base font-medium leading-relaxed tracking-normal text-slate-900 sm:text-lg">
        {question.text}
      </div>

      {/* Option Cards */}
      <div className="mt-6 space-y-3">
        {OPTION_KEYS.map((key, idx) => {
          const isSelected = selected === key;
          const optionText = question.options[key] || '(Empty option)';

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectOption(key)}
              className={`group flex w-full items-center gap-3.5 rounded-xl border-2 px-4 py-3.5 text-left transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/70 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition ${
                  isSelected
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                }`}
              >
                {key}
              </span>
              <span className="flex-1 whitespace-pre-wrap text-sm font-medium text-slate-800 sm:text-base">
                {optionText}
              </span>
              <span className="hidden text-xs font-mono text-slate-400 sm:inline">
                [{key} / {idx + 1}]
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
