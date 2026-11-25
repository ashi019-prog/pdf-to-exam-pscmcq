import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  Sigma,
} from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import { OPTION_KEYS, OptionKey } from '../../types/exam';

const MATH_SYMBOLS = ['√', '²', '³', 'π', 'θ', '≤', '≥', '±', '×', '÷', '°'];

interface ActiveFieldTarget {
  questionNumber: number;
  field: 'text' | OptionKey;
  element: HTMLTextAreaElement | HTMLInputElement;
}

export const VerificationEditor: React.FC = () => {
  const {
    settings,
    questions,
    setPhase,
    updateQuestion,
    addBlankQuestion,
    deleteQuestion,
    startExam,
  } = useExamStore();

  const activeFieldRef = useRef<ActiveFieldTarget | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>('Click any question or option field');

  const totalWarnings = questions.reduce((sum, q) => sum + q.warnings.length, 0);
  const questionsWithWarnings = questions.filter((q) => q.warnings.length > 0).length;

  const insertMathSymbol = (symbol: string) => {
    const target = activeFieldRef.current;
    if (!target) return;

    const q = questions.find((item) => item.number === target.questionNumber);
    if (!q) return;

    const el = target.element;
    const currentValue = target.field === 'text' ? q.text : q.options[target.field];
    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const nextValue = currentValue.slice(0, start) + symbol + currentValue.slice(end);

    if (target.field === 'text') {
      updateQuestion(q.number, { text: nextValue });
    } else {
      updateQuestion(q.number, {
        options: { ...q.options, [target.field]: nextValue },
      });
    }

    requestAnimationFrame(() => {
      el.focus();
      const caret = start + symbol.length;
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      {/* Top Sticky Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPhase('upload')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                Pre-Exam Verification &amp; Math Quick-Fix
              </h1>
              <p className="text-xs text-slate-500">
                {settings.title} • {questions.length} question{questions.length === 1 ? '' : 's'} •{' '}
                {settings.globalDurationMinutes} min global / {settings.perQuestionDurationSeconds}s
                target per question
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={addBlankQuestion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-4 w-4" />
              Add Question
            </button>
            <button
              type="button"
              disabled={questions.length === 0}
              onClick={startExam}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Play className="h-4 w-4" />
              Start Exam
            </button>
          </div>
        </div>

        {/* Compact Math Symbol Toolbar */}
        <div className="border-t border-slate-100 bg-slate-50/90">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                <Sigma className="h-3.5 w-3.5 text-indigo-600" />
                Math Quick-Insert:
              </span>
              {MATH_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertMathSymbol(sym)}
                  className="flex h-7 min-w-[2rem] items-center justify-center rounded-md border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                  title={`Insert ${sym}`}
                >
                  {sym}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-medium text-slate-500">{activeLabel}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-6">
        {/* Warning Summary Banner */}
        {totalWarnings > 0 ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">
                {totalWarnings} parsing warning{totalWarnings === 1 ? '' : 's'} across{' '}
                {questionsWithWarnings} question{questionsWithWarnings === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Review highlighted cards below to fill missing options, select unmatched answer
                keys, or fix OCR math symbols using the toolbar above.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              All {questions.length} questions have complete options and matched answer keys. Ready
              to start!
            </span>
          </div>
        )}

        {/* Editable Question List */}
        <div className="space-y-4">
          {questions.map((q) => {
            const hasWarnings = q.warnings.length > 0;
            return (
              <div
                key={q.number}
                className={`rounded-xl border bg-white p-5 shadow-sm transition ${
                  hasWarnings ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md bg-slate-900 px-2 text-xs font-bold text-white">
                      Q{q.number}
                    </span>
                    {q.warnings.map((w, idx) => (
                      <span
                        key={`${w.type}-${idx}`}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {w.message}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                      Answer Key:
                      <select
                        value={q.correctOption ?? ''}
                        onChange={(e) =>
                          updateQuestion(q.number, {
                            correctOption: (e.target.value || null) as OptionKey | null,
                          })
                        }
                        className={`rounded-md border px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 ${
                          q.correctOption
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 focus:ring-emerald-200'
                            : 'border-amber-300 bg-amber-50 text-amber-800 focus:ring-amber-200'
                        }`}
                      >
                        <option value="">Unmatched</option>
                        {OPTION_KEYS.map((key) => (
                          <option key={key} value={key}>
                            Option {key}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      onClick={() => deleteQuestion(q.number)}
                      title="Delete question"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Question Stem */}
                <div className="mt-3">
                  <textarea
                    rows={3}
                    value={q.text}
                    onFocus={(e) => {
                      activeFieldRef.current = {
                        questionNumber: q.number,
                        field: 'text',
                        element: e.currentTarget,
                      };
                      setActiveLabel(`Editing Q${q.number} stem`);
                    }}
                    onChange={(e) => updateQuestion(q.number, { text: e.target.value })}
                    placeholder="Enter question text (line breaks and math symbols preserved)..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-sans text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                {/* Options Grid */}
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {OPTION_KEYS.map((key) => {
                    const isEmpty = !q.options[key]?.trim();
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                            q.correctOption === key
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {key}
                        </span>
                        <input
                          type="text"
                          value={q.options[key]}
                          onFocus={(e) => {
                            activeFieldRef.current = {
                              questionNumber: q.number,
                              field: key,
                              element: e.currentTarget,
                            };
                            setActiveLabel(`Editing Q${q.number} Option ${key}`);
                          }}
                          onChange={(e) =>
                            updateQuestion(q.number, {
                              options: { ...q.options, [key]: e.target.value },
                            })
                          }
                          placeholder={`Option ${key} text...`}
                          className={`w-full rounded-lg border px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
                            isEmpty
                              ? 'border-amber-300 bg-amber-50/40'
                              : 'border-slate-200 bg-white'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};
