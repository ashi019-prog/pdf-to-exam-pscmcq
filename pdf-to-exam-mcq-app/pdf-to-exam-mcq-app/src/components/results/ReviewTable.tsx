import React, { useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, AlertOctagon } from 'lucide-react';
import { QuestionReviewItem, ReviewOutcome } from '../../types/exam';
import { formatTimerMMSS } from '../../utils/scoring';

interface ReviewTableProps {
  items: QuestionReviewItem[];
}

type FilterTab = 'all' | ReviewOutcome | 'overtime';

export const ReviewTable: React.FC<ReviewTableProps> = ({ items }) => {
  const [filter, setFilter] = useState<FilterTab>('all');

  const filtered =
    filter === 'all'
      ? items
      : filter === 'overtime'
      ? items.filter((item) => item.isOvertime)
      : items.filter((item) => item.outcome === filter);

  const tabs: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'correct', label: 'Correct', count: items.filter((i) => i.outcome === 'correct').length },
    { id: 'wrong', label: 'Wrong', count: items.filter((i) => i.outcome === 'wrong').length },
    { id: 'skipped', label: 'Skipped', count: items.filter((i) => i.outcome === 'skipped').length },
    { id: 'overtime', label: 'Overtime', count: items.filter((i) => i.isOvertime).length },
  ];

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
              <th className="px-5 py-3">Q#</th>
              <th className="px-5 py-3">Question</th>
              <th className="px-5 py-3">Your Answer</th>
              <th className="px-5 py-3">Answer Key</th>
              <th className="px-5 py-3">Outcome</th>
              <th className="px-5 py-3 text-right">Time Spent</th>
              <th className="px-5 py-3 text-right">Marks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-500">
                  No questions match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((item) => (
                <tr key={item.questionNumber} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-5 py-3.5 font-bold text-slate-900">
                    Q{item.questionNumber}
                  </td>
                  <td className="max-w-md px-5 py-3.5 text-slate-700">
                    <p className="line-clamp-2 whitespace-pre-wrap">{item.questionText}</p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
                    {item.confirmedOption ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-800">
                        {item.confirmedOption}
                        {item.options[item.confirmedOption] && (
                          <span className="max-w-[120px] truncate font-normal text-slate-600">
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
                  <td className="whitespace-nowrap px-5 py-3.5">
                    {item.correctOption ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        {item.correctOption}
                        {item.options[item.correctOption] && (
                          <span className="max-w-[120px] truncate font-normal text-emerald-700">
                            — {item.options[item.correctOption]}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Unset</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5">
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
                  <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-xs">
                    <span className={item.isOvertime ? 'font-bold text-rose-700' : 'text-slate-600'}>
                      {formatTimerMMSS(item.timeSpentSeconds)}
                    </span>
                    {item.isOvertime && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                        <AlertOctagon className="h-2.5 w-2.5" />+
                        {formatTimerMMSS(item.overtimeSeconds)}
                      </span>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-5 py-3.5 text-right font-mono font-bold ${
                      item.marksAwarded > 0
                        ? 'text-emerald-700'
                        : item.marksAwarded < 0
                        ? 'text-rose-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {item.marksAwarded > 0 ? `+${item.marksAwarded}` : item.marksAwarded}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
