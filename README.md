# PDF-to-Exam MCQ Practice Studio (GitHub Pages Ready)

A 100% client-side, zero-backend React 18 + Vite + TypeScript single-page application (SPA) built for **solo exam practice** and static hosting on **GitHub Pages**. Upload a **Question Paper PDF** and **Answer Key PDF** (digital or scanned math/text), verify & quick-fix OCR math symbols, and practice under timed exam conditions with overtime tracking, a bottom white **Paper Slate**, and exact negative marking (`+1`, `-0.33`, `0`).

## Features

- **GitHub Pages Ready:** Uses `base: './'`, state-driven navigation (no `BrowserRouter` 404s on refresh), local Vite `?url` worker bundling for `pdfjs-dist` (zero external CDN), and an automated `.github/workflows/deploy.yml` workflow.
- **Dual PDF & OCR Engine:** Coordinate-aware `pdfjs-dist` extraction supporting single-column and two-column layouts, with automatic `tesseract.js` (WebAssembly) OCR fallback at 2.5x canvas scale for scanned PDFs while preserving line breaks and Unicode math symbols (`√`, `π`, `²`, `³`, `≤`, `≥`, `≠`, `±`, `×`, `÷`, `θ`, `α`, `β`, `Δ`, `∑`, `∫`).
- **Pre-Exam Verification & Math Quick-Fix Editor:** Editable question list with parsing warnings, a sticky **Math Symbol Toolbar** (`√`, `²`, `³`, `π`, `θ`, `≤`, `≥`, `±`, `×`, `÷`, `°`), and a **"Load Sample Math & Text Exam"** button (10 mixed math/text MCQs).
- **Dual-Timer System + Overtime Tracking:**
  - **Global Timer (`90:00` default):** Green (`>30:00`), Amber (`30:00–10:01`), Red pulsing (`≤10:00`), auto-submits at `00:00`.
  - **Per-Question Timer (`01:30` default):** Green (`01:30–00:46`), Amber (`00:45–00:16`), Red pulsing (`00:15–00:00`), then switches to a live red **`OVERTIME +00:01`** upward counter without locking or auto-skipping.
- **Exam Controls & Keyboard Shortcuts:** Confirm Answer (`Enter`), Select Option (`A–D` or `1–4`), Navigate (`←` / `→`), Mark for Review, Skip Question, Clear Selection, and Collapsible Color-Coded Question Navigator Palette.
- **Bottom White Paper Slate:** Docked, vertically resizable HTML5 `<canvas>` using Pointer Events (mouse, touch, stylus), high-DPI rendering, **Blank Paper** vs. **Faint Math Grid**, Black/Blue/Red ink, Fine/Medium/Thick strokes, Eraser, Undo/Redo, Clear Board, and **Per-Question** vs. **Shared** sheet modes.
- **Solo Practice Scorecard & Local History:** Strict confirmed-answer grading (`+1` / `-0.33` / `0`) safely rounded to 2 decimal places, Avg Time/Question, Overtime count, filterable Review Table (`All`, `Correct`, `Wrong`, `Skipped`, `Overtime`), CSV & JSON export, and persisted `localStorage` attempt history.

## Repository Structure

```text
pdf-to-exam-mcq-app/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.js
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── types/
│   │   └── exam.ts
│   ├── data/
│   │   └── sampleExam.ts
│   ├── store/
│   │   └── useExamStore.ts
│   ├── utils/
│   │   ├── pdfParser.ts
│   │   └── scoring.ts
│   └── components/
│       ├── upload/
│       │   ├── LandingUpload.tsx
│       │   ├── PdfDropzone.tsx
│       │   └── VerificationEditor.tsx
│       ├── exam/
│       │   ├── ExamHeader.tsx
│       │   ├── ExamWorkspace.tsx
│       │   ├── FinishExamModal.tsx
│       │   ├── QuestionCard.tsx
│       │   ├── QuestionControls.tsx
│       │   └── QuestionPalette.tsx
│       ├── slate/
│       │   └── PaperSlate.tsx
│       └── results/
│           ├── ResultsDashboard.tsx
│           └── ReviewTable.tsx
└── tests/
    ├── pdfParser.test.ts
    └── scoring.test.ts
```

## Local Development

Prerequisites: **Node.js 18+** (Node 20 recommended) and **npm 9+**.

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Run Vitest unit tests
npm test

# Type-check and build production bundle
npm run build
```

## Automated GitHub Pages Deployment

This repository includes `.github/workflows/deploy.yml` for zero-config static deployment:

1. Push the repository to GitHub on the `main` branch.
2. Open your repository on GitHub and go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. Every push to `main` automatically runs `npm ci`, `npm test`, `npm run build`, and deploys `./dist` to `https://<username>.github.io/<repo-name>/`.
