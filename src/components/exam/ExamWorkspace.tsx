import React, { useEffect, useState } from 'react';
import { useExamStore } from '../../store/useExamStore';
import { OptionKey } from '../../types/exam';
import { ExamHeader } from './ExamHeader';
import { QuestionCard } from './QuestionCard';
import { QuestionControls } from './QuestionControls';
import { QuestionPalette } from './QuestionPalette';
import { FinishExamModal } from './FinishExamModal';
import { PaperSlate } from '../slate/PaperSlate';

export const ExamWorkspace: React.FC = () => {
  const {
    questions,
    responses,
    currentIndex,
    slateOpen,
    slateHeight,
    goToQuestion,
    nextQuestion,
    prevQuestion,
    selectOption,
    confirmAnswer,
    markForReview,
    skipQuestion,
    clearSelection,
    tickTimers,
    finishExam,
  } = useExamStore();

  const [paletteOpen, setPaletteOpen] = useState(true);
  const [finishModalOpen, setFinishModalOpen] = useState(false);

  // 1-second interval driving Global countdown & Per-Question countdown/overtime
  useEffect(() => {
    const interval = window.setInterval(() => {
      tickTimers();
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tickTimers]);

  // Keyboard shortcuts: A-D / 1-4 to pick option, Enter to confirm, Left/Right arrows to move
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (finishModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const key = e.key.toUpperCase();
      const optionMap: Record<string, OptionKey> = {
        A: 'A',
        B: 'B',
        C: 'C',
        D: 'D',
        '1': 'A',
        '2': 'B',
        '3': 'C',
        '4': 'D',
      };

      if (optionMap[key]) {
        e.preventDefault();
        selectOption(optionMap[key]);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirmAnswer();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextQuestion();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevQuestion();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishModalOpen, selectOption, confirmAnswer, nextQuestion, prevQuestion]);

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentResponse = responses[currentQuestion.number];
  const hasSelection = (currentResponse?.selectedOption ?? null) !== null;

  const bottomPadding = slateOpen ? slateHeight + 76 : 72;

  return (
    <div className="min-h-screen bg-slate-50" style={{ paddingBottom: `${bottomPadding}px` }}>
      <ExamHeader
        paletteOpen={paletteOpen}
        onTogglePalette={() => setPaletteOpen((prev) => !prev)}
        onRequestFinish={() => setFinishModalOpen(true)}
      />

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-6 sm:px-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <QuestionCard
            question={currentQuestion}
            response={currentResponse}
            onSelectOption={selectOption}
          />

          <QuestionControls
            hasSelection={hasSelection}
            canGoPrev={currentIndex > 0}
            canGoNext={currentIndex < questions.length - 1}
            onConfirm={confirmAnswer}
            onMarkForReview={markForReview}
            onSkip={skipQuestion}
            onClear={clearSelection}
            onPrev={prevQuestion}
            onNext={nextQuestion}
          />
        </div>

        <QuestionPalette
          open={paletteOpen}
          questions={questions}
          responses={responses}
          currentIndex={currentIndex}
          onSelectQuestion={goToQuestion}
          onClose={() => setPaletteOpen(false)}
        />
      </main>

      <PaperSlate currentQuestionNumber={currentQuestion.number} />

      <FinishExamModal
        open={finishModalOpen}
        questions={questions}
        responses={responses}
        onCancel={() => setFinishModalOpen(false)}
        onConfirmFinish={() => {
          setFinishModalOpen(false);
          finishExam();
        }}
      />
    </div>
  );
};
