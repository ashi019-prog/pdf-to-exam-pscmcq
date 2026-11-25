import React, { useRef, useState } from 'react';
import { FileText, Upload, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { PdfExtractionProgress } from '../../utils/pdfParser';

interface PdfDropzoneProps {
  title: string;
  subtitle: string;
  fileName: string | null;
  statusMessage: string | null;
  progress: PdfExtractionProgress | null;
  error: string | null;
  isProcessing: boolean;
  onFileSelect: (file: File) => void;
}

export const PdfDropzone: React.FC<PdfDropzoneProps> = ({
  title,
  subtitle,
  fileName,
  statusMessage,
  progress,
  error,
  isProcessing,
  onFileSelect,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const progressPercent =
    progress && progress.totalPages > 0
      ? Math.round((progress.currentPage / progress.totalPages) * 100)
      : 0;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !isProcessing && inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isProcessing) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer select-none ${
        isDragging
          ? 'border-indigo-500 bg-indigo-50/70'
          : fileName && !error
          ? 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-400'
          : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50/70'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <div
        className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${
          isProcessing
            ? 'bg-indigo-100 text-indigo-600'
            : fileName && !error
            ? 'bg-emerald-100 text-emerald-600'
            : 'bg-slate-100 text-slate-600'
        }`}
      >
        {isProcessing ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : fileName && !error ? (
          <CheckCircle2 className="h-6 w-6" />
        ) : (
          <Upload className="h-6 w-6" />
        )}
      </div>

      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-slate-500">{subtitle}</p>

      {fileName && !isProcessing && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          <FileText className="h-3.5 w-3.5 text-slate-500" />
          <span className="max-w-[200px] truncate">{fileName}</span>
        </div>
      )}

      {isProcessing && progress && (
        <div className="mt-4 w-full max-w-xs">
          <p className="text-xs font-medium text-indigo-700">{progress.message}</p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all duration-200"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {statusMessage && !isProcessing && !error && (
        <p className="mt-2 text-xs font-medium text-emerald-700">{statusMessage}</p>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};
