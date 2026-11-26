import React, { useEffect, useMemo, useState } from 'react';
import {
  Share2,
  Download,
  Mail,
  Send,
  MessageCircle,
  ShieldCheck,
  Copy,
  Check,
  X,
  FileJson,
} from 'lucide-react';
import { ExamHead } from '../../types/examHead';
import {
  buildShareMessage,
  buildSharePackage,
  canUseNativeFileShare,
  createJsonFile,
  downloadShareFile,
  estimatePackageSizeKb,
  generateShareFilename,
  ShareChannel,
  shareViaChannel,
  shareViaNativeSheet,
} from '../../services/examShareService';

interface ExportShareModalProps {
  open: boolean;
  examHead: ExamHead | null;
  defaultMode?: 'full' | 'update';
  onClose: () => void;
}

export const ExportShareModal: React.FC<ExportShareModalProps> = ({
  open,
  examHead,
  defaultMode = 'full',
  onClose,
}) => {
  const [mode, setMode] = useState<'full' | 'update'>(defaultMode);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !examHead) return;
    setMode(defaultMode);
    setBanner(null);
    setError(null);
    setCopied(false);

    if (examHead.importedPapers.length > 0) {
      const latestPaper = examHead.importedPapers[examHead.importedPapers.length - 1];
      setSelectedPaperIds([latestPaper.paperId]);
    } else {
      setSelectedPaperIds([]);
    }
  }, [open, examHead, defaultMode]);

  const previewPackage = useMemo(() => {
    if (!examHead || examHead.questions.length === 0) return null;
    try {
      if (mode === 'update' && selectedPaperIds.length === 0) return null;
      return buildSharePackage(examHead, { mode, selectedPaperIds });
    } catch {
      return null;
    }
  }, [examHead, mode, selectedPaperIds]);

  const nativeShareAvailable = useMemo(() => {
    if (!previewPackage) return false;
    try {
      return canUseNativeFileShare(createJsonFile(previewPackage));
    } catch {
      return false;
    }
  }, [previewPackage]);

  if (!open || !examHead) return null;

  const togglePaper = (paperId: string) => {
    setSelectedPaperIds((prev) =>
      prev.includes(paperId) ? prev.filter((id) => id !== paperId) : [...prev, paperId]
    );
  };

  const handleDownloadOnly = () => {
    if (!previewPackage) return;
    setError(null);
    const filename = downloadShareFile(previewPackage);
    setBanner(`Downloaded "${filename}". You can now send it to friends.`);
  };

  const handleNativeShare = async () => {
    if (!previewPackage) return;
    setError(null);
    try {
      const shared = await shareViaNativeSheet(previewPackage);
      if (shared) {
        setBanner(`Shared "${generateShareFilename(previewPackage)}" directly.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open native share sheet.');
    }
  };

  const handleChannelShare = (channel: ShareChannel) => {
    if (!previewPackage) return;
    setError(null);
    const { downloadedFilename } = shareViaChannel(previewPackage, channel);
    const channelLabel =
      channel === 'whatsapp' ? 'WhatsApp' : channel === 'telegram' ? 'Telegram' : 'Email';
    setBanner(
      `Downloaded "${downloadedFilename}". Attach this file in the ${channelLabel} window that just opened.`
    );
  };

  const handleCopyMessage = async () => {
    if (!previewPackage || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const filename = generateShareFilename(previewPackage);
    const msg = buildShareMessage(previewPackage, filename);
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Clipboard copy was blocked by your browser.');
    }
  };

  const previewFilename = previewPackage ? generateShareFilename(previewPackage) : '';
  const previewSizeKb = previewPackage ? estimatePackageSizeKb(previewPackage) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Export &amp; Share Exam Bank</h2>
              <p className="text-xs text-slate-500">{examHead.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Export Scope</label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition ${
                  mode === 'full'
                    ? 'border-indigo-500 bg-indigo-50/60'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  checked={mode === 'full'}
                  onChange={() => setMode('full')}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <p className="font-bold text-slate-900">Full Exam Head</p>
                  <p className="text-slate-500">All {examHead.questions.length} questions</p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-xs transition ${
                  mode === 'update'
                    ? 'border-indigo-500 bg-indigo-50/60'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="exportScope"
                  disabled={examHead.importedPapers.length === 0}
                  checked={mode === 'update'}
                  onChange={() => setMode('update')}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <p className="font-bold text-slate-900">Newly Added / Specific Papers</p>
                  <p className="text-slate-500">Compact update pack for friends</p>
                </div>
              </label>
            </div>
          </div>

          {mode === 'update' && examHead.importedPapers.length > 0 && (
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Select Papers to Include
              </p>
              {examHead.importedPapers.map((paper, idx) => {
                const isLatest = idx === examHead.importedPapers.length - 1;
                return (
                  <label
                    key={paper.paperId}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs"
                  >
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <input
                        type="checkbox"
                        checked={selectedPaperIds.includes(paper.paperId)}
                        onChange={() => togglePaper(paper.paperId)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span>{paper.paperLabel}</span>
                      {isLatest && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                          Latest
                        </span>
                      )}
                    </span>
                    <span className="text-slate-500">{paper.addedCount} Qs</span>
                  </label>
                );
              })}
            </div>
          )}

          {previewPackage ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <FileJson className="h-4 w-4 shrink-0 text-indigo-600" />
                  <span className="break-all font-mono text-[11px]">{previewFilename}</span>
                </div>
                <span className="shrink-0 rounded bg-slate-200 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                  ~{previewSizeKb} KB
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-indigo-700">
                  {previewPackage.questionCount} self-contained questions (with embedded answers)
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <ShieldCheck className="h-3 w-3" />
                  Personal scores stripped for sharing
                </span>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Select at least one paper with questions to export.
            </p>
          )}

          <div className="space-y-2.5">
            {nativeShareAvailable && (
              <button
                type="button"
                disabled={!previewPackage}
                onClick={handleNativeShare}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:bg-slate-300"
              >
                <Share2 className="h-4 w-4" />
                Share File Directly (WhatsApp / Telegram / Mail)
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!previewPackage}
                onClick={handleDownloadOnly}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
              >
                <Download className="h-4 w-4 text-indigo-600" />
                Download .json File
              </button>

              <button
                type="button"
                disabled={!previewPackage}
                onClick={() => handleChannelShare('whatsapp')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
              >
                <MessageCircle className="h-4 w-4" />
                Share via WhatsApp
              </button>

              <button
                type="button"
                disabled={!previewPackage}
                onClick={() => handleChannelShare('telegram')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-sky-600 disabled:bg-slate-300"
              >
                <Send className="h-4 w-4" />
                Share via Telegram
              </button>

              <button
                type="button"
                disabled={!previewPackage}
                onClick={() => handleChannelShare('email')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-semibold text-white hover:bg-slate-900 disabled:bg-slate-300"
              >
                <Mail className="h-4 w-4" />
                Share via Email
              </button>
            </div>
          </div>

          {banner && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-medium">{banner}</p>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Message Copied!' : 'Copy Message Text'}
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
