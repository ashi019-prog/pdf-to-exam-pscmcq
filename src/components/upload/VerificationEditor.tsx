import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  Sigma,
  Lock,
  Save,
  X,
  ListOrdered,
} from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import { OPTION_KEYS, OptionKey, SavedExamPackage } from '../../types/exam';
import { autoFixMalayalamPaste } from '../../utils/shreeMalConverter';

const MATH_SYMBOLS = ['√', '²', '³', 'π', 'θ', '≤', '≥', '±', '×', '÷', '°'];

interface ActiveFieldTarget {
  index: number;
  field: 'text' | OptionKey;
  element: HTMLTextAreaElement | HTMLInputElement;
}

export const VerificationEditor: React.FC = () => {
  const {
    settings,
    questions,
    setPhase,
    setQuestions,
    updateQuestionAt,
    addCustomQuestion,
    deleteQuestionAt,
    startExam,
  } = useExamStore();

  const activeFieldRef = useRef<ActiveFieldTarget | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>('Click any question or option field');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newNumber, setNewNumber] = useState<string>('');
  const [newText, setNewText] = useState<string>('');
  const [newOptions, setNewOptions] = useState<Record<OptionKey, string>>({
    A: '',
    B: '',
    C: '',
    D: '',
  });
  const [newAnswer, setNewAnswer] = useState<OptionKey>('A');

  const totalWarnings = questions.reduce((sum, q) => sum + q.warnings.length, 0);
  const questionsWithWarnings = questions.filter((q) => q.warnings.length > 0).length;

  const handleRenumberSequentially = () => {
    setQuestions(
      questions.map((q, idx) => ({
        ...q,
        number: idx + 1,
      }))
    );
  };

  const openAddModal = () => {
    const maxNum = questions.reduce((max, q) => Math.max(max, q.number), 0);
    setNewNumber(String(maxNum + 1));
    setNewText('');
    setNewOptions({ A: '', B: '', C: '', D: '' });
    setNewAnswer('A');
    setAddModalOpen(true);
  };

  const handleSaveNewQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    addCustomQuestion({
      number: parseInt(newNumber, 10) || undefined,
      text: autoFixMalayalamPaste(newText),
      options: {
        A: autoFixMalayalamPaste(newOptions.A),
        B: autoFixMalayalamPaste(newOptions.B),
        C: autoFixMalayalamPaste(newOptions.C),
        D: autoFixMalayalamPaste(newOptions.D),
      },
      correctOption: newAnswer,
    });
    setAddModalOpen(false);
  };

  const handleSmartPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    currentVal: string,
    onChangeVal: (next: string) => void
  ) => {
    const raw = e.clipboardData.getData('text');
    const fixed = autoFixMalayalamPaste(raw);
    if (fixed !== raw) {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart ?? currentVal.length;
      const end = el.selectionEnd ?? currentVal.length;
      const next = currentVal.slice(0, start) + fixed + currentVal.slice(end);
      onChangeVal(next);
    }
  };

  const insertMathSymbol = (symbol: string) => {
    const target = activeFieldRef.current;
    if (!target) return;

    const q = questions[target.index];
    if (!q) return;

    const el = target.element;
    const currentValue = target.field === 'text' ? q.text : q.options[target.field];
    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const nextValue = currentValue.slice(0, start) + symbol + currentValue.slice(end);

    if (target.field === 'text') {
      updateQuestionAt(target.index, { text: nextValue });
    } else {
      updateQuestionAt(target.index, {
        options: { ...q.options, [target.field]: nextValue },
      });
    }

    requestAnimationFrame(() => {
      el.focus();
      const caret = start + symbol.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const handleSaveExamPack = () => {
    const pkg: SavedExamPackage = {
      version: 1,
      savedAt: new Date().toISOString(),
      settings,
      questions,
    };
    const blob = new Blob([JSON.stringify(pkg, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeSlug =
      settings.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'exam';
    link.download = `${safeSlug}-exam-pack.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
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
                Auto-converts pasted PSC Malayalam
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={questions.length === 0}
              onClick={handleRenumberSequentially}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              title="Fix question numbering to be continuous 1, 2, 3..."
            >
              <ListOrdered className="h-4 w-4" />
              Renumber 1–{questions.length}
            </button>
            <button
              type="button"
              disabled={questions.length === 0}
              onClick={handleSaveExamPack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"
              title="Save extracted questions and answer key to your local drive for future shuffled retakes"
            >
              <Save className="h-4 w-4" />
              Save Exam (.json)
            </button>
            <button
              type="button"
              onClick={openAddModal}
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
        {totalWarnings > 0 ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">
                {totalWarnings} parsing warning{totalWarnings === 1 ? '' : 's'} across{' '}
                {questionsWithWarnings} question{questionsWithWarnings === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Review highlighted cards below to fix missing options or text. Copy-pasting legacy
                PSC Malayalam text automatically converts to Unicode Malayalam.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>
              All {questions.length} questions have complete options and hidden linked answer keys.
              Ready to start!
            </span>
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q, index) => {
            const hasWarnings = q.warnings.length > 0;
            return (
              <div
                key={`${index}-${q.number}`}
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

                  <div className="flex items-center gap-2.5">
                    {q.correctOption ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                        title="Answer key is linked and hidden until you finish the exam"
                      >
                        <Lock className="h-3 w-3" />
                        Answer Key Hidden
                      </span>
                    ) : (
                      <label className="flex items-center gap-2 text-xs font-medium text-amber-800">
                        Set Answer:
                        <select
                          value=""
                          onChange={(e) =>
                            updateQuestionAt(index, {
                              correctOption: (e.target.value || null) as OptionKey | null,
                            })
                          }
                          className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        >
                          <option value="">Select</option>
                          {OPTION_KEYS.map((key) => (
                            <option key={key} value={key}>
                              Option {key}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={() => deleteQuestionAt(index)}
                      title="Delete this question"
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <textarea
                    rows={3}
                    value={q.text}
                    onFocus={(e) => {
                      activeFieldRef.current = {
                        index,
                        field: 'text',
                        element: e.currentTarget,
                      };
                      setActiveLabel(`Editing Q${q.number} stem`);
                    }}
                    onPaste={(e) =>
                      handleSmartPaste(e, q.text, (next) =>
                        updateQuestionAt(index, { text: next })
                      )
                    }
                    onChange={(e) => updateQuestionAt(index, { text: e.target.value })}
                    placeholder="Enter question text (pasting PSC Malayalam auto-converts to Unicode)..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 font-sans text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </div>

                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {OPTION_KEYS.map((key) => {
                    const isEmpty = !q.options[key]?.trim();
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-700">
                          {key}
                        </span>
                        <input
                          type="text"
                          value={q.options[key]}
                          onFocus={(e) => {
                            activeFieldRef.current = {
                              index,
                              field: key,
                              element: e.currentTarget,
                            };
                            setActiveLabel(`Editing Q${q.number} Option ${key}`);
                          }}
                          onPaste={(e) =>
                            handleSmartPaste(e, q.options[key], (next) =>
                              updateQuestionAt(index, {
                                options: { ...q.options, [key]: next },
                              })
                            )
                          }
                          onChange={(e) =>
                            updateQuestionAt(index, {
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

      {addModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveNewQuestion}
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Add Question Manually</h2>
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Question Number
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">
                    Correct Answer
                  </label>
                  <select
                    value={newAnswer}
                    onChange={(e) => setNewAnswer(e.target.value as OptionKey)}
                    className="mt-1 w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-900 focus:border-emerald-500 focus:outline-none"
                  >
                    {OPTION_KEYS.map((key) => (
                      <option key={key} value={key}>
                        Option {key}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600">
                  Question Text (pasting PSC Malayalam converts automatically)
                </label>
                <textarea
                  rows={3}
                  required
                  value={newText}
                  onPaste={(e) => handleSmartPaste(e, newText, setNewText)}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Type or paste the question here..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {OPTION_KEYS.map((key) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-slate-600">
                      Option {key}
                    </label>
                    <input
                      type="text"
                      required
                      value={newOptions[key]}
                      onPaste={(e) =>
                        handleSmartPaste(e, newOptions[key], (next) =>
                          setNewOptions((prev) => ({ ...prev, [key]: next }))
                        )
                      }
                      onChange={(e) =>
                        setNewOptions((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      placeholder={`Enter option ${key}...`}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Add Question
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
