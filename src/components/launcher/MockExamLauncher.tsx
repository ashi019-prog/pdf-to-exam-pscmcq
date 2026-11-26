import React, { useEffect, useMemo, useState } from 'react';
import { Shuffle, Play, Clock, Filter, X } from 'lucide-react';
import { ExamHead, PoolFilterMode } from '../../types/examHead';
import { ExamQuestion } from '../../types/exam';
import { listExamHeads } from '../../services/examHeadManager';
import { filterPoolQuestions, generateRandomMockExam } from '../../utils/examGenerator';
import { useExamStore } from '../../store/useExamStore';

interface MockExamLauncherProps {
  open: boolean;
  initialExamHeadId?: string | null;
  onClose: () => void;
}

const PRESET_COUNTS = [25, 50, 100];

export const MockExamLauncher: React.FC<MockExamLauncherProps> = ({
  open,
  initialExamHeadId,
  onClose,
}) => {
  const loadSavedExamPackage = useExamStore((state) => state.loadSavedExamPackage);

  const [examHeads, setExamHeads] = useState<ExamHead[]>([]);
  const [selectedHeadId, setSelectedHeadId] = useState<string>('');
  const [filterMode, setFilterMode] = useState<PoolFilterMode>('all');
  const [selectedPaperId, setSelectedPaperId] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(100);
  const [durationMinutes, setDurationMinutes] = useState<number>(90);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState<number>(90);
  const [randomizeOrder, setRandomizeOrder] = useState<boolean>(true);
  const [shuffleOptions, setShuffleOptions] = useState<boolean>(false);

  useEffect(() => {
    if (!open) return;
    void listExamHeads().then((list) => {
      setExamHeads(list);
      const preferred =
        initialExamHeadId && list.some((h) => h.id === initialExamHeadId)
          ? initialExamHeadId
          : list.length > 0
          ? list[0].id
          : '';
      setSelectedHeadId(preferred);
    });
  }, [open, initialExamHeadId]);

  const selectedHead = useMemo(
    () => examHeads.find((h) => h.id === selectedHeadId) ?? null,
    [examHeads, selectedHeadId]
  );

  useEffect(() => {
    if (selectedHead && selectedHead.importedPapers.length > 0 && !selectedPaperId) {
      setSelectedPaperId(selectedHead.importedPapers[0].paperId);
    }
  }, [selectedHead, selectedPaperId]);

  const availablePool = useMemo(() => {
    if (!selectedHead) return [];
    return filterPoolQuestions(selectedHead.questions, filterMode, selectedPaperId);
  }, [selectedHead, filterMode, selectedPaperId]);

  if (!open) return null;

  const effectiveCount = Math.min(Math.max(1, questionCount), availablePool.length);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHead || availablePool.length === 0) return;

    const session = generateRandomMockExam(selectedHead, {
      questionCount: effectiveCount,
      filterMode,
      selectedPaperId: filterMode === 'by-paper' ? selectedPaperId : undefined,
      randomizeOrder,
      shuffleOptions,
      examDurationMinutes: durationMinutes,
      perQuestionSeconds,
    });

    const examQuestions: ExamQuestion[] = session.questions.map((q) => ({
      number: q.number,
      text: q.text,
      options: q.options,
      correctOption: q.correctOption,
      explanation: q.explanation,
      imageDataUrl: q.imageDataUrl,
      table: q.table,
      warnings: [],
    }));

    loadSavedExamPackage(
      {
        version: 1,
        savedAt: session.createdAt,
        settings: {
          title: session.examName,
          globalDurationMinutes: session.durationMinutes,
          perQuestionDurationSeconds: session.perQuestionSeconds,
        },
        questions: examQuestions,
      },
      false
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Random Mock Exam Launcher</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleStart} className="space-y-4 p-5">
          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Select Exam Head (Exam Name)
            </label>
            <select
              value={selectedHeadId}
              onChange={(e) => setSelectedHeadId(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              {examHeads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} — {h.questions.length} pooled questions
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Filter className="h-3.5 w-3.5 text-indigo-600" />
                Question Pool Filter
              </label>
              <span className="text-xs font-semibold text-emerald-700">
                {availablePool.length} available
              </span>
            </div>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as PoolFilterMode)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
            >
              <option value="all">All Questions (Random)</option>
              <option value="unattempted">Unattempted Only</option>
              <option value="previously-wrong">Previously Wrong</option>
              <option value="by-paper">Specific Imported Paper</option>
            </select>

            {filterMode === 'by-paper' && selectedHead && (
              <select
                value={selectedPaperId}
                onChange={(e) => setSelectedPaperId(e.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-none"
              >
                {selectedHead.importedPapers.map((p) => (
                  <option key={p.paperId} value={p.paperId}>
                    {p.paperLabel} ({p.addedCount} questions)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700">
              Number of Questions
            </label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {PRESET_COUNTS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuestionCount(preset)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    questionCount === preset
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {preset}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setQuestionCount(availablePool.length || 100)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  questionCount === availablePool.length && availablePool.length > 0
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                Max ({availablePool.length})
              </button>
              <input
                type="number"
                min={1}
                max={Math.max(1, availablePool.length)}
                value={questionCount}
                onChange={(e) => setQuestionCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                <Clock className="h-3.5 w-3.5 text-indigo-600" />
                Global Timer (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={360}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, parseInt(e.target.value, 10) || 90))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Per-Question Target (seconds)
              </label>
              <input
                type="number"
                min={10}
                max={600}
                value={perQuestionSeconds}
                onChange={(e) =>
                  setPerQuestionSeconds(Math.max(10, parseInt(e.target.value, 10) || 90))
                }
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-700">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={randomizeOrder}
                onChange={(e) => setRandomizeOrder(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>Randomize Question Order (Fisher-Yates)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={shuffleOptions}
                onChange={(e) => setShuffleOptions(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>Shuffle Option Order (A–D) per session</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedHead || availablePool.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
            >
              <Play className="h-4 w-4" />
              Start Random Mock Exam ({effectiveCount} Qs)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
