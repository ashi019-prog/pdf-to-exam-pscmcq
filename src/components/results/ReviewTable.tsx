import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  AlertOctagon,
  BookOpen,
  X,
  Save,
  Calculator,
  Info,
} from 'lucide-react';
import { OPTION_KEYS, QuestionReviewItem, ReviewOutcome } from '../../types/exam';
import { buildAnswerDetails, formatTimerMMSS } from '../../utils/scoring';
import { useExamStore } from '../../store/useExamStore';

interface ReviewTableProps {
  items: QuestionReviewItem[];
}

type FilterTab = 'all' | ReviewOutcome | 'overtime';

export const ReviewTable: React.FC<ReviewTableProps> = ({ items }) => {
  const updateQuestion = useExamStore((state) => state.updateQuestion);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedItemNumber, setSelectedItemNumber] = useState<number | null>(null);
  const [draftNote, setDraftNote] = useState<string>('');
  const [noteSavedToast, setNoteSavedToast] = useState<boolean>(false);

  const filtered =
    filter === 'all'
      ? items
      : filter === 'overtime'
      ? items.filter((item) => item.isOvertime)
      : items.filter((item) => item.outcome === filter);

  const selectedItem =
    selectedItemNumber !== null
      ? items.find((i) => i.questionNumber === selectedItemNumber) ?? null
      : null;

  const openDetails = (item: QuestionReviewItem) => {
    setSelectedItemNumber(item.questionNumber);
    setDraftNote(item.explanation ?? '');
    setNoteSavedToast(false);
  };

  const handleSaveNote = () => {
    if (!selectedItem) return;
    updateQuestion(selectedItem.questionNumber, { explanation: draftNote.trim() });
    setNoteSavedToast(true);
    window.setTimeout(() => setNoteSavedToast(false), 2000);
  };

  const tabs: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'correct', label: 'Correct', count: items.filter((i) => i.outcome === 'correct').length },
    { id: 'wrong', label: 'Wrong', count: items.filter((i) => i.outcome === 'wrong').length },
    { id: 'skipped', label: 'Skipped', count: items.filter((i) => i.outcome === 'skipped').length },
    { id: 'overtime', label: 'Overtime', count: items.filter((i) => i.isOvertime).length },
  ];

  const details = selectedItem ? buildAnswerDetails(selectedItem) : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="text-base font-bold text-slate-900">Question-by-Question Review</h2>

        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                filter === tab.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">Q#</th>
              <th className="px-4 py-3">Question</th>
              <th className="px-4 py-3">Your Answer</th>
              <th className="px-4 py-3">Answer Key</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3 text-right">Time</th>
              <th className="px-4 py-3 text-right">Marks</th>
              <th className="px-4 py-3 text-right">Explanation</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-8 text-center text-sm text-slate-500">
                  No questions match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.questionNumber} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-900">
                    Q{item.questionNumber}
                  </td>
                  <td className="max-w-sm px-4 py-3.5 text-slate-700">
                    <p className="line-clamp-2 whitespace-pre-wrap">{item.questionText}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {item.confirmedOption ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                        {item.confirmedOption}
                        {item.options[item.confirmedOption] && (
                          <span className="max-w-[110px] truncate font-normal text-slate-600">
                            — {item.options[item.confirmedOption]}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {item.selectedOption ? `${item.selectedOption} (Unconfirmed)` : 'Skipped'}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {item.correctOption ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {item.correctOption}
                        {item.options[item.correctOption] && (
                          <span className="max-w-[110px] truncate font-normal text-emerald-700">
                            — {item.options[item.correctOption]}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Unset</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5">
                    {item.outcome === 'correct' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Correct
                      </span>
                    )}
                    {item.outcome === 'wrong' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                        <XCircle className="h-3.5 w-3.5" />
                        Wrong
                      </span>
                    )}
                    {item.outcome === 'skipped' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        <MinusCircle className="h-3.5 w-3.5" />
                        Skipped
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right font-mono text-xs">
                    <span className={item.isOvertime ? 'font-bold text-rose-700' : 'text-slate-600'}>
                      {formatTimerMMSS(item.timeSpentSeconds)}
                    </span>
                    {item.isOvertime && (
                      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                        <AlertOctagon className="h-2.5 w-2.5" />+
                        {formatTimerMMSS(item.overtimeSeconds)}
                      </span>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3.5 text-right font-mono font-bold ${
                      item.marksAwarded > 0
                        ? 'text-emerald-700'
                        : item.marksAwarded < 0
                        ? 'text-rose-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.marksAwarded > 0 ? `+${item.marksAwarded}` : item.marksAwarded}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={() => openDetails(item)}
                      className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                        item.outcome === 'correct'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : item.outcome === 'wrong'
                          ? 'border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
                          : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedItem && details && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-lg bg-slate-900 px-2.5 text-sm font-bold text-white">
                  Q{selectedItem.questionNumber}
                </span>
                {selectedItem.outcome === 'correct' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Correct (+1)
                  </span>
                )}
                {selectedItem.outcome === 'wrong' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                    <XCircle className="h-3.5 w-3.5" />
                    Incorrect (-0.33)
                  </span>
                )}
                {selectedItem.outcome === 'skipped' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                    <MinusCircle className="h-3.5 w-3.5" />
                    Skipped / Unconfirmed (0)
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedItemNumber(null)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <p className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-900 sm:text-base">
                {selectedItem.questionText}
              </p>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {OPTION_KEYS.map((key) => {
                  const isCorrectOpt = selectedItem.correctOption === key;
                  const isUserWrongOpt =
                    selectedItem.confirmedOption === key && selectedItem.outcome === 'wrong';

                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
                        isCorrectOpt
                          ? 'border-emerald-400 bg-emerald-50 font-semibold text-emerald-900'
                          : isUserWrongOpt
                          ? 'border-rose-400 bg-rose-50 font-semibold text-rose-900'
                          : 'border-slate-200 bg-slate-50/50 text-slate-700'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded font-bold ${
                          isCorrectOpt
                            ? 'bg-emerald-600 text-white'
                            : isUserWrongOpt
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {key}
                      </span>
                      <span className="flex-1">{selectedItem.options[key] || '—'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className={`mt-4 rounded-xl border p-4 text-xs sm:text-sm ${
                selectedItem.outcome === 'correct'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : selectedItem.outcome === 'wrong'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <p className="font-semibold">Result Analysis</p>
              <p className="mt-1 leading-relaxed">{details.statusSummary}</p>
            </div>

            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-xs text-slate-800 sm:text-sm">
              <div className="flex items-center gap-1.5 font-bold text-indigo-900">
                {details.isMathQuestion ? (
                  <Calculator className="h-4 w-4 text-indigo-600" />
                ) : (
                  <Info className="h-4 w-4 text-indigo-600" />
                )}
                <span>
                  {details.isMathQuestion
                    ? 'How to Solve / Mathematical Method'
                    : 'Answer Explanation & Related Information'}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">
                {details.methodOrGuidance}
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700">
                Add / Edit Your Solution Steps or Revision Note (saved with exam pack):
              </label>
              <textarea
                rows={3}
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                placeholder="Write a formula, shortcut, or related fact here..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 sm:text-sm"
              />
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-700">
                  {noteSavedToast ? 'Note saved to this question!' : ''}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveNote}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Note
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedItemNumber(null)}
                    className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
