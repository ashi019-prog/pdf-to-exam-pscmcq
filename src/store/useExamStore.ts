import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  AppPhase,
  ExamQuestion,
  ExamSettings,
  OptionKey,
  PracticeAttemptRecord,
  QuestionResponse,
  SavedExamPackage,
  SlateMode,
  SlateStroke,
} from '../types/exam';
import { SAMPLE_EXAM_QUESTIONS, SAMPLE_EXAM_TITLE } from '../data/sampleExam';
import { computeQuestionWarnings } from '../utils/pdfParser';
import { gradeExam, shuffleQuestions } from '../utils/scoring';
import { localFolderStorage } from '../services/localFolderStorage';
import {
  QuestionOutcomeUpdate,
  updateQuestionStatsAfterExam,
} from '../services/examHeadManager';

interface SlateCanvasState {
  strokes: SlateStroke[];
  redoStack: SlateStroke[];
}

interface NewQuestionInput {
  number?: number;
  text: string;
  options: Record<OptionKey, string>;
  correctOption: OptionKey | null;
}

interface ExamStoreState {
  phase: AppPhase;
  activeExamHeadId: string | null;
  settings: ExamSettings;
  questions: ExamQuestion[];
  responses: Record<number, QuestionResponse>;
  currentIndex: number;

  globalRemainingSeconds: number;
  totalTimeUsedSeconds: number;
  examFinishedAt: number | null;

  attemptHistory: PracticeAttemptRecord[];

  slateOpen: boolean;
  slateHeight: number;
  slateMode: SlateMode;
  slateGridVisible: boolean;
  slates: Record<string, SlateCanvasState>;

  setPhase: (phase: AppPhase) => void;
  updateSettings: (partial: Partial<ExamSettings>) => void;
  setQuestions: (questions: ExamQuestion[]) => void;
  updateQuestion: (questionNumber: number, updated: Partial<ExamQuestion>) => void;
  updateQuestionAt: (index: number, updated: Partial<ExamQuestion>) => void;
  addBlankQuestion: () => void;
  addCustomQuestion: (input: NewQuestionInput) => void;
  deleteQuestion: (questionNumber: number) => void;
  deleteQuestionAt: (index: number) => void;
  loadSampleExam: () => void;
  loadSavedExamPackage: (pkg: SavedExamPackage, shuffle: boolean) => void;

  startExam: () => void;
  finishExam: () => void;
  discardActiveExam: () => void;
  retakeExam: (shuffle?: boolean | unknown) => void;
  resetAll: () => void;
  clearAttemptHistory: () => void;

  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;
  selectOption: (option: OptionKey) => void;
  confirmAnswer: () => void;
  markForReview: () => void;
  skipQuestion: () => void;
  clearSelection: () => void;

  tickTimers: () => void;

  setSlateOpen: (open: boolean) => void;
  setSlateHeight: (height: number) => void;
  setSlateMode: (mode: SlateMode) => void;
  toggleSlateGrid: () => void;
  pushSlateStroke: (slateKey: string, stroke: SlateStroke) => void;
  undoSlateStroke: (slateKey: string) => void;
  redoSlateStroke: (slateKey: string) => void;
  clearSlate: (slateKey: string) => void;
}

const DEFAULT_SETTINGS: ExamSettings = {
  title: 'Untitled Solo Practice Exam',
  globalDurationMinutes: 90,
  perQuestionDurationSeconds: 90,
};

function createInitialResponses(questions: ExamQuestion[]): Record<number, QuestionResponse> {
  const responses: Record<number, QuestionResponse> = {};
  questions.forEach((q, idx) => {
    responses[q.number] = {
      questionNumber: q.number,
      selectedOption: null,
      status: idx === 0 ? 'visited' : 'not_visited',
      timeSpentSeconds: 0,
    };
  });
  return responses;
}

function createAttemptRecord(
  title: string,
  examHeadId: string | null,
  questions: ExamQuestion[],
  responses: Record<number, QuestionResponse>,
  totalTimeUsedSeconds: number,
  perQuestionDurationSeconds: number
): PracticeAttemptRecord {
  const scorecard = gradeExam(
    questions,
    responses,
    totalTimeUsedSeconds,
    perQuestionDurationSeconds
  );
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    completedAt: new Date().toISOString(),
    examHeadId: examHeadId ?? undefined,
    examTitle: title,
    finalScore: scorecard.finalScore,
    totalMarks: scorecard.totalMarks,
    totalQuestions: scorecard.totalQuestions,
    percentage: scorecard.percentage,
    accuracy: scorecard.accuracy,
    correctCount: scorecard.correctCount,
    wrongCount: scorecard.wrongCount,
    skippedCount: scorecard.skippedCount,
    negativeMarksDeducted: scorecard.negativeMarksDeducted,
    overtimeCount: scorecard.overtimeCount,
    totalTimeUsedSeconds: scorecard.totalTimeUsedSeconds,
    averageTimePerQuestionSeconds: scorecard.averageTimePerQuestionSeconds,
    perQuestionLimitSeconds: perQuestionDurationSeconds,
    items: scorecard.items,
  };
}

function persistAttemptAndStats(
  record: PracticeAttemptRecord,
  examHeadId: string | null
): void {
  void localFolderStorage.saveAttemptResult(record).catch(() => {});

  if (examHeadId && record.items && record.items.length > 0) {
    const outcomes: QuestionOutcomeUpdate[] = [];
    for (const item of record.items) {
      if (item.sourceQuestionId) {
        outcomes.push({
          questionId: item.sourceQuestionId,
          result: item.outcome,
        });
      }
    }
    if (outcomes.length > 0) {
      void updateQuestionStatsAfterExam(examHeadId, outcomes).catch(() => {});
    }
  }
}

export const useExamStore = create<ExamStoreState>()(
  persist(
    (set, get) => ({
      phase: 'upload',
      activeExamHeadId: null,
      settings: DEFAULT_SETTINGS,
      questions: [],
      responses: {},
      currentIndex: 0,

      globalRemainingSeconds: DEFAULT_SETTINGS.globalDurationMinutes * 60,
      totalTimeUsedSeconds: 0,
      examFinishedAt: null,

      attemptHistory: [],

      slateOpen: false,
      slateHeight: 280,
      slateMode: 'per_question',
      slateGridVisible: true,
      slates: {},

      setPhase: (phase) => set({ phase }),

      updateSettings: (partial) =>
        set((state) => ({
          settings: { ...state.settings, ...partial },
        })),

      setQuestions: (questions) => set({ questions }),

      updateQuestion: (questionNumber, updated) =>
        set((state) => ({
          questions: state.questions.map((q) => {
            if (q.number !== questionNumber) return q;
            const merged: ExamQuestion = {
              ...q,
              ...updated,
              options: updated.options ? { ...q.options, ...updated.options } : q.options,
            };
            merged.warnings = computeQuestionWarnings(
              merged.text,
              merged.options,
              merged.correctOption,
              merged.ocrConfidence
            );
            return merged;
          }),
        })),

      updateQuestionAt: (index, updated) =>
        set((state) => ({
          questions: state.questions.map((q, idx) => {
            if (idx !== index) return q;
            const merged: ExamQuestion = {
              ...q,
              ...updated,
              options: updated.options ? { ...q.options, ...updated.options } : q.options,
            };
            merged.warnings = computeQuestionWarnings(
              merged.text,
              merged.options,
              merged.correctOption,
              merged.ocrConfidence
            );
            return merged;
          }),
        })),

      addBlankQuestion: () =>
        set((state) => {
          const maxNum = state.questions.reduce((max, q) => Math.max(max, q.number), 0);
          const nextNum = maxNum + 1;
          const blank: ExamQuestion = {
            number: nextNum,
            text: '',
            options: { A: '', B: '', C: '', D: '' },
            correctOption: null,
            warnings: computeQuestionWarnings('', { A: '', B: '', C: '', D: '' }, null),
          };
          return { questions: [...state.questions, blank] };
        }),

      addCustomQuestion: (input) =>
        set((state) => {
          const maxNum = state.questions.reduce((max, q) => Math.max(max, q.number), 0);
          const targetNum =
            typeof input.number === 'number' && input.number > 0 ? input.number : maxNum + 1;
          const newQ: ExamQuestion = {
            number: targetNum,
            text: input.text.trim(),
            options: {
              A: input.options.A.trim(),
              B: input.options.B.trim(),
              C: input.options.C.trim(),
              D: input.options.D.trim(),
            },
            correctOption: input.correctOption,
            warnings: computeQuestionWarnings(
              input.text.trim(),
              input.options,
              input.correctOption
            ),
          };
          const combined = [...state.questions, newQ].sort((a, b) => a.number - b.number);
          return { questions: combined };
        }),

      deleteQuestion: (questionNumber) =>
        set((state) => ({
          questions: state.questions.filter((q) => q.number !== questionNumber),
        })),

      deleteQuestionAt: (index) =>
        set((state) => ({
          questions: state.questions.filter((_, idx) => idx !== index),
        })),

      loadSampleExam: () =>
        set((state) => ({
          activeExamHeadId: null,
          settings: {
            ...state.settings,
            title: SAMPLE_EXAM_TITLE,
          },
          questions: SAMPLE_EXAM_QUESTIONS.map((q) => ({
            ...q,
            options: { ...q.options },
            warnings: [...q.warnings],
          })),
          phase: 'verify',
        })),

      loadSavedExamPackage: (pkg, shuffle) => {
        const prepared = shuffle ? shuffleQuestions(pkg.questions) : pkg.questions;
        const normalized = prepared.map((q, idx) => ({
          ...q,
          number: idx + 1,
        }));
        set({
          activeExamHeadId: pkg.examHeadId ?? null,
          settings: { ...DEFAULT_SETTINGS, ...pkg.settings },
          questions: normalized,
          phase: 'exam',
          currentIndex: 0,
          responses: createInitialResponses(normalized),
          globalRemainingSeconds: Math.max(1, pkg.settings.globalDurationMinutes || 90) * 60,
          totalTimeUsedSeconds: 0,
          examFinishedAt: null,
          slateOpen: false,
          slates: {},
        });
      },

      startExam: () => {
        const { questions, settings } = get();
        if (questions.length === 0) return;
        const normalized = questions.map((q, idx) => ({
          ...q,
          number: idx + 1,
        }));
        set({
          phase: 'exam',
          questions: normalized,
          currentIndex: 0,
          responses: createInitialResponses(normalized),
          globalRemainingSeconds: Math.max(1, settings.globalDurationMinutes) * 60,
          totalTimeUsedSeconds: 0,
          examFinishedAt: null,
          slateOpen: false,
          slates: {},
        });
      },

      finishExam: () =>
        set((state) => {
          const record = createAttemptRecord(
            state.settings.title,
            state.activeExamHeadId,
            state.questions,
            state.responses,
            state.totalTimeUsedSeconds,
            state.settings.perQuestionDurationSeconds
          );
          persistAttemptAndStats(record, state.activeExamHeadId);
          return {
            phase: 'results',
            slateOpen: false,
            examFinishedAt: Date.now(),
            attemptHistory: [record, ...state.attemptHistory].slice(0, 50),
          };
        }),

      discardActiveExam: () =>
        set((state) => ({
          phase: 'upload',
          activeExamHeadId: null,
          questions: [],
          responses: {},
          currentIndex: 0,
          globalRemainingSeconds: DEFAULT_SETTINGS.globalDurationMinutes * 60,
          totalTimeUsedSeconds: 0,
          examFinishedAt: null,
          slateOpen: false,
          slates: {},
          attemptHistory: state.attemptHistory,
        })),

      retakeExam: (shuffle = true) => {
        const { questions, settings } = get();
        if (questions.length === 0) return;
        const shouldShuffle = typeof shuffle === 'boolean' ? shuffle : true;
        const nextQuestions = shouldShuffle ? shuffleQuestions(questions) : questions;
        set({
          phase: 'exam',
          questions: nextQuestions,
          currentIndex: 0,
          responses: createInitialResponses(nextQuestions),
          globalRemainingSeconds: Math.max(1, settings.globalDurationMinutes) * 60,
          totalTimeUsedSeconds: 0,
          examFinishedAt: null,
          slateOpen: false,
          slates: {},
        });
      },

      resetAll: () =>
        set((state) => ({
          phase: 'upload',
          activeExamHeadId: null,
          settings: DEFAULT_SETTINGS,
          questions: [],
          responses: {},
          currentIndex: 0,
          globalRemainingSeconds: DEFAULT_SETTINGS.globalDurationMinutes * 60,
          totalTimeUsedSeconds: 0,
          examFinishedAt: null,
          slateOpen: false,
          slates: {},
          attemptHistory: state.attemptHistory,
        })),

      clearAttemptHistory: () => set({ attemptHistory: [] }),

      goToQuestion: (index) =>
        set((state) => {
          if (index < 0 || index >= state.questions.length) return state;
          const targetQ = state.questions[index];
          const existing = state.responses[targetQ.number];
          const updatedResponses = { ...state.responses };

          if (!existing || existing.status === 'not_visited') {
            updatedResponses[targetQ.number] = {
              questionNumber: targetQ.number,
              selectedOption: existing ? existing.selectedOption : null,
              status: 'visited',
              timeSpentSeconds: existing ? existing.timeSpentSeconds : 0,
            };
          }

          return {
            currentIndex: index,
            responses: updatedResponses,
          };
        }),

      nextQuestion: () => {
        const { currentIndex, questions, goToQuestion } = get();
        if (currentIndex < questions.length - 1) {
          goToQuestion(currentIndex + 1);
        }
      },

      prevQuestion: () => {
        const { currentIndex, goToQuestion } = get();
        if (currentIndex > 0) {
          goToQuestion(currentIndex - 1);
        }
      },

      selectOption: (option) =>
        set((state) => {
          const currentQ = state.questions[state.currentIndex];
          if (!currentQ) return state;
          const prev = state.responses[currentQ.number] ?? {
            questionNumber: currentQ.number,
            selectedOption: null,
            status: 'visited',
            timeSpentSeconds: 0,
          };

          return {
            responses: {
              ...state.responses,
              [currentQ.number]: {
                ...prev,
                selectedOption: option,
                status:
                  prev.status === 'skipped' || prev.status === 'not_visited'
                    ? 'visited'
                    : prev.status,
              },
            },
          };
        }),

      confirmAnswer: () =>
        set((state) => {
          const currentQ = state.questions[state.currentIndex];
          if (!currentQ) return state;
          const prev = state.responses[currentQ.number];
          if (!prev || prev.selectedOption === null) return state;

          return {
            responses: {
              ...state.responses,
              [currentQ.number]: {
                ...prev,
                status: 'confirmed',
              },
            },
          };
        }),

      markForReview: () =>
        set((state) => {
          const currentQ = state.questions[state.currentIndex];
          if (!currentQ) return state;
          const prev = state.responses[currentQ.number] ?? {
            questionNumber: currentQ.number,
            selectedOption: null,
            status: 'visited',
            timeSpentSeconds: 0,
          };

          return {
            responses: {
              ...state.responses,
              [currentQ.number]: {
                ...prev,
                status: 'marked_for_review',
              },
            },
          };
        }),

      skipQuestion: () => {
        const state = get();
        const currentQ = state.questions[state.currentIndex];
        if (!currentQ) return;
        const prev = state.responses[currentQ.number] ?? {
          questionNumber: currentQ.number,
          selectedOption: null,
          status: 'visited',
          timeSpentSeconds: 0,
        };

        const hasNext = state.currentIndex < state.questions.length - 1;
        const nextIndex = hasNext ? state.currentIndex + 1 : state.currentIndex;
        const nextQ = state.questions[nextIndex];

        const updatedResponses: Record<number, QuestionResponse> = {
          ...state.responses,
          [currentQ.number]: {
            ...prev,
            selectedOption: null,
            status: 'skipped',
          },
        };

        if (hasNext && nextQ) {
          const nextPrev = updatedResponses[nextQ.number];
          if (!nextPrev || nextPrev.status === 'not_visited') {
            updatedResponses[nextQ.number] = {
              questionNumber: nextQ.number,
              selectedOption: nextPrev ? nextPrev.selectedOption : null,
              status: 'visited',
              timeSpentSeconds: nextPrev ? nextPrev.timeSpentSeconds : 0,
            };
          }
        }

        set({
          responses: updatedResponses,
          currentIndex: nextIndex,
        });
      },

      clearSelection: () =>
        set((state) => {
          const currentQ = state.questions[state.currentIndex];
          if (!currentQ) return state;
          const prev = state.responses[currentQ.number];
          if (!prev) return state;

          return {
            responses: {
              ...state.responses,
              [currentQ.number]: {
                ...prev,
                selectedOption: null,
                status: prev.status === 'marked_for_review' ? 'marked_for_review' : 'visited',
              },
            },
          };
        }),

      tickTimers: () => {
        const state = get();
        if (state.phase !== 'exam') return;

        const nextGlobal = state.globalRemainingSeconds - 1;
        const nextTotalUsed = state.totalTimeUsedSeconds + 1;
        const currentQ = state.questions[state.currentIndex];

        const updatedResponses = { ...state.responses };
        if (currentQ) {
          const prev = updatedResponses[currentQ.number] ?? {
            questionNumber: currentQ.number,
            selectedOption: null,
            status: 'visited',
            timeSpentSeconds: 0,
          };
          updatedResponses[currentQ.number] = {
            ...prev,
            timeSpentSeconds: prev.timeSpentSeconds + 1,
          };
        }

        if (nextGlobal <= 0) {
          const record = createAttemptRecord(
            state.settings.title,
            state.activeExamHeadId,
            state.questions,
            updatedResponses,
            nextTotalUsed,
            state.settings.perQuestionDurationSeconds
          );
          persistAttemptAndStats(record, state.activeExamHeadId);
          set({
            globalRemainingSeconds: 0,
            totalTimeUsedSeconds: nextTotalUsed,
            responses: updatedResponses,
            phase: 'results',
            slateOpen: false,
            examFinishedAt: Date.now(),
            attemptHistory: [record, ...state.attemptHistory].slice(0, 50),
          });
          return;
        }

        set({
          globalRemainingSeconds: nextGlobal,
          totalTimeUsedSeconds: nextTotalUsed,
          responses: updatedResponses,
        });
      },

      setSlateOpen: (open) => set({ slateOpen: open }),

      setSlateHeight: (height) =>
        set({ slateHeight: Math.min(600, Math.max(180, Math.round(height))) }),

      setSlateMode: (mode) => set({ slateMode: mode }),

      toggleSlateGrid: () => set((state) => ({ slateGridVisible: !state.slateGridVisible })),

      pushSlateStroke: (slateKey, stroke) =>
        set((state) => {
          const current = state.slates[slateKey] ?? { strokes: [], redoStack: [] };
          return {
            slates: {
              ...state.slates,
              [slateKey]: {
                strokes: [...current.strokes, stroke],
                redoStack: [],
              },
            },
          };
        }),

      undoSlateStroke: (slateKey) =>
        set((state) => {
          const current = state.slates[slateKey];
          if (!current || current.strokes.length === 0) return state;
          const lastStroke = current.strokes[current.strokes.length - 1];
          return {
            slates: {
              ...state.slates,
              [slateKey]: {
                strokes: current.strokes.slice(0, -1),
                redoStack: [...current.redoStack, lastStroke],
              },
            },
          };
        }),

      redoSlateStroke: (slateKey) =>
        set((state) => {
          const current = state.slates[slateKey];
          if (!current || current.redoStack.length === 0) return state;
          const restored = current.redoStack[current.redoStack.length - 1];
          return {
            slates: {
              ...state.slates,
              [slateKey]: {
                strokes: [...current.strokes, restored],
                redoStack: current.redoStack.slice(0, -1),
              },
            },
          };
        }),

      clearSlate: (slateKey) =>
        set((state) => ({
          slates: {
            ...state.slates,
            [slateKey]: { strokes: [], redoStack: [] },
          },
        })),
    }),
    {
      name: 'pdf-to-exam-solo-practice-v2',
    }
  )
);
