import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  FilePlus2,
  GraduationCap,
  Play,
  Trash2,
} from 'lucide-react';
import { ExamQuestion, ExamResult } from '../../types/exam';
import { ExamHead } from '../../types/examHead';
import { useExamStore } from '../../store/useExamStore';
import { listExamHeads } from '../../services/examHeadManager';
import { localFolderStorage } from '../../services/localFolderStorage';
import { FolderStatusBadge } from '../storage/FolderStatusBadge';
import { ExamWorkspace } from '../exam/ExamWorkspace';
import { MockExamLauncher } from '../launcher/MockExamLauncher';
import { HomeAnalyticsTab } from '../tabs/HomeAnalyticsTab';
import { UploadCreateTab } from '../tabs/UploadCreateTab';
import { MockTestsTab } from '../tabs/MockTestsTab';
import { LatestResultsTab } from '../tabs/LatestResultsTab';
import { SAMPLE_EXAM_QUESTIONS, SAMPLE_EXAM_TITLE } from '../../data/sampleExam';

export type NavTabId = 'home' | 'create' | 'mock-tests' | 'results';

const TAB_HASHES: Record<NavTabId, string> = {
  home: '#home',
  create: '#create',
  'mock-tests': '#mock-tests',
  results: '#results',
};

const TAB_TITLES: Record<NavTabId, string> = {
  home: 'Home — Exam Analytics',
  create: 'Upload & Exam Creation',
  'mock-tests': 'Mock Tests — Exam Heads',
  results: 'Latest Exam Results',
};

function parseHashToTab(hash: string): NavTabId {
  const cleaned = hash.replace(/^#/, '').trim().toLowerCase();
  if (cleaned === 'create') return 'create';
  if (cleaned === 'mock-tests') return 'mock-tests';
  if (cleaned === 'results') return 'results';
  return 'home';
}

function mergeAttemptLists(
  storageAttempts: ExamResult[],
  storeAttempts: ExamResult[]
): ExamResult[] {
  const byId = new Map<string, ExamResult>();
  for (const item of storageAttempts) {
    byId.set(item.id, item);
  }
  for (const item of storeAttempts) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(b.completedAt) || 0) - (Date.parse(a.completedAt) || 0)
  );
}

export const AppShell: React.FC = () => {
  const phase = useExamStore((state) => state.phase);
  const settings = useExamStore((state) => state.settings);
  const questions = useExamStore((state) => state.questions);
  const storeAttempts = useExamStore((state) => state.attemptHistory);
  const loadSavedExamPackage = useExamStore((state) => state.loadSavedExamPackage);
  const discardActiveExam = useExamStore((state) => state.discardActiveExam);

  const [activeTab, setActiveTab] = useState<NavTabId>(() =>
    typeof window !== 'undefined' ? parseHashToTab(window.location.hash) : 'home'
  );
  const [inExamFullscreen, setInExamFullscreen] = useState<boolean>(false);
  const [examHeads, setExamHeads] = useState<ExamHead[]>([]);
  const [storageAttempts, setStorageAttempts] = useState<ExamResult[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cross-tab preselection & launcher modal state
  const [launcherOpen, setLauncherOpen] = useState<boolean>(false);
  const [launcherHeadId, setLauncherHeadId] = useState<string | null>(null);
  const [preselectedCreateHeadId, setPreselectedCreateHeadId] = useState<string | null>(null);
  const [preselectedCreateMode, setPreselectedCreateMode] = useState<'pdf' | 'import-json'>('pdf');

  const prevPhaseRef = useRef(phase);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 4000);
  }, []);

  const navigateTab = useCallback((tab: NavTabId) => {
    setActiveTab(tab);
    const targetHash = TAB_HASHES[tab];
    if (typeof window !== 'undefined' && window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      const [heads, attempts] = await Promise.all([
        listExamHeads(),
        localFolderStorage.listAttemptResults(),
      ]);
      setExamHeads(heads);
      setStorageAttempts(attempts);
    } catch {
      // Fallback gracefully when storage is unavailable
    }
  }, []);

  // Sync URL hash changes (GitHub Pages safe)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.location.hash) {
      window.location.hash = '#home';
    }
    const handleHashChange = () => {
      setActiveTab(parseHashToTab(window.location.hash));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Load Exam Heads & attempt history + subscribe to storage updates
  useEffect(() => {
    void localFolderStorage.checkStoredFolder().then(() => {
      void refreshData();
    });
    const unsub = localFolderStorage.subscribe(() => {
      void refreshData();
    });
    return unsub;
  }, [refreshData]);

  // Watch phase transitions: entering 'exam' opens fullscreen; finishing 'exam' -> 'results' navigates to Tab 4
  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    if (prevPhase !== 'exam' && phase === 'exam') {
      setInExamFullscreen(true);
    } else if (prevPhase === 'exam' && phase === 'results') {
      setInExamFullscreen(false);
      navigateTab('results');
      void refreshData();
    } else if (phase !== 'exam') {
      setInExamFullscreen(false);
    }
  }, [phase, navigateTab, refreshData]);

  const mergedAttempts = useMemo(
    () => mergeAttemptLists(storageAttempts, storeAttempts),
    [storageAttempts, storeAttempts]
  );

  const hasUnfinishedExam = phase === 'exam' && questions.length > 0 && !inExamFullscreen;

  const handleOpenLauncher = (examHeadId?: string) => {
    setLauncherHeadId(examHeadId ?? null);
    setLauncherOpen(true);
  };

  const handleTrySampleExam = () => {
    loadSavedExamPackage(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        settings: {
          title: SAMPLE_EXAM_TITLE,
          globalDurationMinutes: 90,
          perQuestionDurationSeconds: 90,
        },
        questions: SAMPLE_EXAM_QUESTIONS.map((q) => ({
          ...q,
          options: { ...q.options },
          warnings: [...q.warnings],
        })),
      },
      false
    );
    setInExamFullscreen(true);
  };

  const handleStartTargetedPractice = (
    title: string,
    practiceQuestions: ExamQuestion[],
    examHeadId?: string
  ) => {
    if (practiceQuestions.length === 0) return;
    loadSavedExamPackage(
      {
        version: 1,
        savedAt: new Date().toISOString(),
        examHeadId,
        settings: {
          title,
          globalDurationMinutes: Math.max(10, Math.ceil((practiceQuestions.length * 90) / 60)),
          perQuestionDurationSeconds: 90,
        },
        questions: practiceQuestions,
      },
      false
    );
    setInExamFullscreen(true);
  };

  // Distraction-Free Full-Screen Active Exam Mode
  if (phase === 'exam' && inExamFullscreen && questions.length > 0) {
    return <ExamWorkspace />;
  }

  const navItems: Array<{
    id: NavTabId;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      id: 'home',
      label: 'Home Analytics',
      shortLabel: 'Home',
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      id: 'create',
      label: 'Upload & Create',
      shortLabel: 'Create',
      icon: <FilePlus2 className="h-4 w-4" />,
    },
    {
      id: 'mock-tests',
      label: 'Mock Tests',
      shortLabel: 'Mocks',
      icon: <BookOpen className="h-4 w-4" />,
      badge: examHeads.length > 0 ? examHeads.length : undefined,
    },
    {
      id: 'results',
      label: 'Latest Results',
      shortLabel: 'Results',
      icon: <Award className="h-4 w-4" />,
      badge: mergedAttempts.length > 0 ? mergedAttempts.length : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Desktop Fixed Left Sidebar (240px wide, >= 1024px) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold text-slate-900">PSC Exam Studio</p>
            <p className="truncate text-[11px] font-medium text-slate-500">Solo Practice Hub</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateTab(item.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={isActive ? 'text-indigo-600' : 'text-slate-400'}>
                    {item.icon}
                  </span>
                  {item.label}
                </span>
                {item.badge !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isActive
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex min-h-screen flex-col pb-20 lg:pb-0 lg:pl-60">
        {/* Slim Top Utility Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white lg:hidden">
              <GraduationCap className="h-4 w-4" />
            </div>
            <h1 className="truncate text-sm font-extrabold text-slate-900 sm:text-base">
              {TAB_TITLES[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <FolderStatusBadge onStatusToast={showToast} />
          </div>
        </header>

        {/* Resume Active Exam Amber Banner */}
        {hasUnfinishedExam && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  You have an unfinished <strong>{settings.title}</strong> mock test
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInExamFullscreen(true)}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  Resume Exam
                </button>
                <button
                  type="button"
                  onClick={discardActiveExam}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="mx-auto mt-3 w-full max-w-6xl px-4 sm:px-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 shadow-sm">
              {toastMessage}
            </div>
          </div>
        )}

        {/* Active Tab View */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          {activeTab === 'home' && (
            <HomeAnalyticsTab
              examHeads={examHeads}
              attempts={mergedAttempts}
              onLaunchMock={handleOpenLauncher}
              onNavigateCreate={() => {
                setPreselectedCreateMode('pdf');
                navigateTab('create');
              }}
              onNavigateResults={() => navigateTab('results')}
              onTrySampleExam={handleTrySampleExam}
            />
          )}

          {activeTab === 'create' && (
            <UploadCreateTab
              examHeads={examHeads}
              preselectedExamHeadId={preselectedCreateHeadId}
              initialMode={preselectedCreateMode}
              onDataChanged={() => {
                void refreshData();
              }}
              onLaunchMock={(headId) => handleOpenLauncher(headId)}
            />
          )}

          {activeTab === 'mock-tests' && (
            <MockTestsTab
              examHeads={examHeads}
              attempts={mergedAttempts}
              onLaunchMock={(headId) => handleOpenLauncher(headId)}
              onAddPaperToHead={(headId) => {
                setPreselectedCreateHeadId(headId ?? null);
                setPreselectedCreateMode('pdf');
                navigateTab('create');
              }}
              onImportToHead={(headId) => {
                setPreselectedCreateHeadId(headId);
                setPreselectedCreateMode('import-json');
                navigateTab('create');
              }}
              onDataChanged={() => {
                void refreshData();
              }}
            />
          )}

          {activeTab === 'results' && (
            <LatestResultsTab
              attempts={mergedAttempts}
              onLaunchMock={handleOpenLauncher}
              onStartTargetedPractice={handleStartTargetedPractice}
            />
          )}
        </main>
      </div>

      {/* Mobile / Tablet Fixed Bottom Navigation Bar (< 1024px) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white lg:hidden">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigateTab(item.id)}
              className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-semibold ${
                isActive ? 'text-indigo-600' : 'text-slate-500'
              }`}
            >
              <span className="relative">
                {item.icon}
                {item.badge !== undefined && (
                  <span className="absolute -right-2.5 -top-1.5 rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                )}
              </span>
              <span>{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Shared Modals */}
      <MockExamLauncher
        open={launcherOpen}
        initialExamHeadId={launcherHeadId}
        onClose={() => setLauncherOpen(false)}
      />
    </div>
  );
};
