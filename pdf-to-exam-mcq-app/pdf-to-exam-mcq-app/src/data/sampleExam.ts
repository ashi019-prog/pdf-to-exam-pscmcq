import { ExamQuestion } from '../types/exam';

export const SAMPLE_EXAM_TITLE = 'Sample Math & Quantitative Aptitude Practice Test';

export const SAMPLE_EXAM_QUESTIONS: ExamQuestion[] = [
  {
    number: 1,
    text: 'Solve for x:\n2x² − 7x + 3 = 0\nWhich pair gives the exact roots?',
    options: {
      A: 'x = 1/2, 3',
      B: 'x = −1/2, 3',
      C: 'x = 1/2, −3',
      D: 'x = 2, 3/2',
    },
    correctOption: 'A',
    warnings: [],
  },
  {
    number: 2,
    text: 'Evaluate the expression:\n√(144) + √(225) − 3²',
    options: {
      A: '16',
      B: '18',
      C: '20',
      D: '24',
    },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 3,
    text: 'If sin θ = 3/5 and 0° < θ < 90°, what is the value of cos θ + tan θ?',
    options: {
      A: '29/20',
      B: '31/20',
      C: '27/20',
      D: '33/20',
    },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 4,
    text: 'A circle has radius r = 7 cm. Taking π ≈ 22/7, find its area (in cm²).',
    options: {
      A: '144 cm²',
      B: '154 cm²',
      C: '164 cm²',
      D: '176 cm²',
    },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 5,
    text: 'A train 180 m long travels at 72 km/h. How many seconds does it take to cross a 220 m platform?',
    options: {
      A: '15 s',
      B: '18 s',
      C: '20 s',
      D: '25 s',
    },
    correctOption: 'C',
    warnings: [],
  },
  {
    number: 6,
    text: 'Which inequality holds for all real numbers x satisfying 3x − 5 ≤ 10?',
    options: {
      A: 'x ≤ 5',
      B: 'x ≥ 5',
      C: 'x ≤ 15',
      D: 'x ≠ 5',
    },
    correctOption: 'A',
    warnings: [],
  },
  {
    number: 7,
    text: 'Find the sum of the first 10 positive integers:\n∑ (k = 1 to 10) k',
    options: {
      A: '45',
      B: '50',
      C: '55',
      D: '60',
    },
    correctOption: 'C',
    warnings: [],
  },
  {
    number: 8,
    text: 'If a³ = 64 and b² = 49 (with b > 0), what is the value of a × b ÷ 2?',
    options: {
      A: '12',
      B: '14',
      C: '16',
      D: '28',
    },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 9,
    text: 'In a right triangle with legs α = 6 cm and β = 8 cm, what is the hypotenuse length?',
    options: {
      A: '9 cm',
      B: '10 cm',
      C: '12 cm',
      D: '14 cm',
    },
    correctOption: 'B',
    warnings: [],
  },
  {
    number: 10,
    text: 'A shopkeeper marks an item 40% above cost price and gives a 20% discount. What is the net profit percentage?',
    options: {
      A: '10%',
      B: '12%',
      C: '15%',
      D: '20%',
    },
    correctOption: 'B',
    warnings: [],
  },
];
