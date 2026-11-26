import { OPTION_KEYS, OptionKey } from '../types/exam';
import {
  ActiveExamSession,
  ExamHead,
  MockLaunchConfig,
  PooledQuestion,
  PoolFilterMode,
  SessionQuestion,
} from '../types/examHead';

export function fisherYatesShuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

export function filterPoolQuestions(
  questions: readonly PooledQuestion[],
  filterMode: PoolFilterMode,
  selectedPaperId?: string
): PooledQuestion[] {
  switch (filterMode) {
    case 'unattempted':
      return questions.filter((q) => (q.stats ? q.stats.timesAttempted === 0 : true));
    case 'previously-wrong':
      return questions.filter((q) => q.stats && q.stats.lastResult === 'wrong');
    case 'by-paper':
      return selectedPaperId
        ? questions.filter((q) => q.paperId === selectedPaperId)
        : [...questions];
    case 'all':
    default:
      return [...questions];
  }
}

function shuffleQuestionOptions(
  options: Record<OptionKey, string>,
  correctOption: OptionKey
): { options: Record<OptionKey, string>; correctOption: OptionKey } {
  const shuffledKeys = fisherYatesShuffle(OPTION_KEYS);
  const newOptions: Record<OptionKey, string> = { A: '', B: '', C: '', D: '' };
  let newCorrect: OptionKey = correctOption;

  OPTION_KEYS.forEach((targetKey, idx) => {
    const sourceKey = shuffledKeys[idx];
    newOptions[targetKey] = options[sourceKey];
    if (sourceKey === correctOption) {
      newCorrect = targetKey;
    }
  });

  return { options: newOptions, correctOption: newCorrect };
}

export function generateRandomMockExam(
  examHead: ExamHead,
  config: MockLaunchConfig
): ActiveExamSession {
  const filtered = filterPoolQuestions(
    examHead.questions,
    config.filterMode,
    config.selectedPaperId
  );

  const shouldRandomize = config.randomizeOrder !== false;
  const orderedPool = shouldRandomize ? fisherYatesShuffle(filtered) : [...filtered];
  const safeCount = Math.max(0, Math.min(config.questionCount, orderedPool.length));
  const selected = orderedPool.slice(0, safeCount);

  const sessionQuestions: SessionQuestion[] = selected.map((q, idx) => {
    const clonedOptions: Record<OptionKey, string> = {
      A: q.options.A,
      B: q.options.B,
      C: q.options.C,
      D: q.options.D,
    };

    const resolvedOptions = config.shuffleOptions
      ? shuffleQuestionOptions(clonedOptions, q.correctOption)
      : { options: clonedOptions, correctOption: q.correctOption };

    return {
      id: q.id,
      sourcePoolNumber: q.poolNumber,
      number: idx + 1,
      paperId: q.paperId,
      paperLabel: q.paperLabel,
      text: q.text,
      options: resolvedOptions.options,
      correctOption: resolvedOptions.correctOption,
      explanation: q.explanation,
      imageDataUrl: q.imageDataUrl,
      table: q.table,
    };
  });

  return {
    sessionId: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    examHeadId: examHead.id,
    examName: examHead.name,
    createdAt: new Date().toISOString(),
    durationMinutes: Math.max(1, config.examDurationMinutes || 90),
    perQuestionSeconds: Math.max(10, config.perQuestionSeconds || 90),
    questions: sessionQuestions,
  };
}
