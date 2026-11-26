import React from 'react';
import { Clock, Timer, Flag, PanelRightOpen, PanelRightClose, AlertOctagon } from 'lucide-react';
import { useExamStore } from '../../store/useExamStore';
import { TimerTone } from '../../types/exam';
import {
  formatTimerMMSS,
  getGlobalTimerTone,
  getQuestionTimerState,
} from '../../utils/scoring';

interface ExamHeaderProps {
  paletteOpen: boolean;
  onTogglePalette: () => void;
  onRequestFinish: () => void;
}

function getToneClasses(tone: TimerTone): string {
  switch (tone) {
    case 'red':
      return 'border-rose-300 bg-rose-50 text-rose-700 animate-pulse';
    case 'amber':
      return 'border-amber-300 bg-amber-50 text-amber-800';
    case 'green':
    default:
      return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  }
}

export const ExamHeader: React.FC<ExamHeaderProps> = ({
  paletteOpen,
  onTogglePalette,
  onRequestFinish,
}) => {
  const { settings, questions, currentIndex, globalRemainingSeconds, responses } = useExamStore();

  const currentQuestion = questions[currentIndex];
  const cumulativeSpent = currentQuestion
    ? responses[currentQuestion.number]?.timeSpentSeconds ?? 0
    : 0;

  const globalTone = getGlobalTimerTone(globalRemainingSeconds);
  const questionTimer = getQuestionTimerState(
    cumulativeSpent,
    settings.perQuestionDurationSeconds
  );

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">
            {settings.title}
          </h1>
          <p className="text-xs font-medium text-slate-500">
            Question <span className="font-semibold text-slate-800">{currentIndex + 1}</span> of{' '}
            <span className="font-semibold text-slate-800">{questions.length}</span>
            <span className="mx-2 text-slate-300">|</span>
            Spent on Q{currentQuestion?.number ?? currentIndex + 1}:{' '}
            <span className="font-mono text-slate-700">{formatTimerMMSS(cumulativeSpent)}</span>
            <span className="mx-2 text-slate-300">|</span>
            <span className="font-semibold text-emerald-600">+1</span> Correct •{' '}
            <span className="font-semibold text-rose-600">-0.33</span> Wrong •{' '}
            <span className="font-semibold text-slate-600">0</span> Skipped
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${getToneClasses(
              globalTone
            )}`}
            title="Global Exam Timer"
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exam:</span>
            <span className="font-mono text-sm tracking-tight">
              {formatTimerMMSS(globalRemainingSeconds)}
            </span>
          </div>

          {questionTimer.isOvertime ? (
            <div
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm animate-pulse"
              title="Per-Question Overtime Counter"
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              <span>OVERTIME</span>
              <span className="font-mono text-sm tracking-tight">
                +{formatTimerMMSS(questionTimer.overtimeSeconds)}
              </span>
            </div>
          ) : (
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${getToneClasses(
                questionTimer.tone
              )}`}
              title="Per-Question Timer"
            >
              <Timer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Q-Timer:</span>
              <span className="font-mono text-sm tracking-tight">
                {formatTimerMMSS(questionTimer.remainingSeconds)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTogglePalette}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Toggle Question Navigator Palette"
          >
            {paletteOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
            <span className="hidden md:inline">Palette</span>
          </button>

          <button
            type="button"
            onClick={onRequestFinish}
            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 sm:text-sm"
          >
            <Flag className="h-3.5 w-3.5" />
            Finish Exam
          </button>
        </div>
      </div>
    </header>
  );
};
