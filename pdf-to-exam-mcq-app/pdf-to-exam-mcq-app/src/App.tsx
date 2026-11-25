import React from 'react';
import { useExamStore } from './store/useExamStore';
import { LandingUpload } from './components/upload/LandingUpload';
import { VerificationEditor } from './components/upload/VerificationEditor';
import { ExamWorkspace } from './components/exam/ExamWorkspace';
import { ResultsDashboard } from './components/results/ResultsDashboard';

export const App: React.FC = () => {
  const phase = useExamStore((state) => state.phase);

  switch (phase) {
    case 'verify':
      return <VerificationEditor />;
    case 'exam':
      return <ExamWorkspace />;
    case 'results':
      return <ResultsDashboard />;
    case 'upload':
    default:
      return <LandingUpload />;
  }
};

export default App;
