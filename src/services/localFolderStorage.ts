import { ExamQuestion, OptionKey, PracticeAttemptRecord, QuestionTableData } from '../types/exam';

export interface ImportedPaperMeta {
  paperId: string;
  paperLabel: string;
  importedAt: string;
  questionCount: number;
}

export interface ExamHeadQuestion {
  id: string;
  number: number; // Sequential across the entire Exam Head (1..N)
  paperId: string;
  paperLabel: string;
  text: string;
  options: Record<OptionKey, string>;
  correctOption: OptionKey;
  explanation?: string;
  imageDataUrl?: string;
  table?: QuestionTableData;
  stats?: {
    timesAttempted: number;
    timesCorrect: number;
    lastAttemptedAt?: string;
  };
}

export interface ExamHeadFile {
  id: string;
  title: string; // e.g., "Village Assistant"
  createdAt: string;
  updatedAt: string;
  importedPapers: ImportedPaperMeta[];
  questions: ExamHeadQuestion[];
}

export interface ExamHeadSummary {
  id: string;
  title: string;
  totalQuestions: number;
  paperCount: number;
  lastUpdated: string;
}

export interface FullBackupBundle {
  version: 1;
  exportedAt: string;
  examHeads: ExamHeadFile[];
  attemptHistory: PracticeAttemptRecord[];
}

export type FolderConnectionStatus =
  | 'disconnected'
  | 'needs-permission'
  | 'connected'
  | 'fallback';

export interface StorageStatusSnapshot {
  status: FolderConnectionStatus;
  folderName: string | null;
  supported: boolean;
}

interface WritableStreamLike {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableStreamLike>;
}

interface DirectoryHandleLike {
  kind: 'directory';
  name: string;
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<DirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileHandleLike>;
  values: () => AsyncIterableIterator<FileHandleLike | DirectoryHandleLike>;
  removeEntry?: (name: string) => Promise<void>;
}

type CapacitorDirectory = 'DOCUMENTS' | 'DATA';

interface CapacitorFilesystemPlugin {
  mkdir: (opts: {
    path: string;
    directory: CapacitorDirectory;
    recursive?: boolean;
  }) => Promise<void>;
  readdir: (opts: {
    path: string;
    directory: CapacitorDirectory;
  }) => Promise<{ files: Array<{ name: string; type?: string }> }>;
  readFile: (opts: {
    path: string;
    directory: CapacitorDirectory;
    encoding: 'utf8';
  }) => Promise<{ data: string }>;
  writeFile: (opts: {
    path: string;
    directory: CapacitorDirectory;
    data: string;
    encoding: 'utf8';
    recursive?: boolean;
  }) => Promise<void>;
  deleteFile?: (opts: {
    path: string;
    directory: CapacitorDirectory;
  }) => Promise<void>;
}

interface WindowWithNativeStorage extends Window {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
  }) => Promise<DirectoryHandleLike>;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      Filesystem?: CapacitorFilesystemPlugin;
    };
  };
}

const DB_NAME = 'exam-platform-db';
const DB_VERSION = 1;
const STORE_HANDLES = 'handles';
const STORE_EXAM_HEADS = 'exam-heads';
const STORE_ATTEMPTS = 'attempt-history';
const ROOT_HANDLE_KEY = 'rootDirHandle';
const RESULTS_KEY = 'results';
const CAP_ROOT_FOLDER = 'PSC-Exam-Studio';
const CAP_EXAM_HEADS_DIR = `${CAP_ROOT_FOLDER}/exam-heads`;
const CAP_ATTEMPTS_DIR = `${CAP_ROOT_FOLDER}/attempt-history`;

export function slugifyExamHead(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0D00-\u0D7F]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `exam-head-${Date.now()}`;
}

function getCapacitorFs(): CapacitorFilesystemPlugin | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as WindowWithNativeStorage).Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
  return cap.Plugins && cap.Plugins.Filesystem ? cap.Plugins.Filesystem : null;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(STORE_EXAM_HEADS)) {
        db.createObjectStore(STORE_EXAM_HEADS);
      }
      if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
        db.createObjectStore(STORE_ATTEMPTS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

async function idbGet<T>(storeName: string, key: string): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed.'));
  });
}

async function idbSet<T>(storeName: string, key: string, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB put failed.'));
  });
}

async function idbDelete(storeName: string, key: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed.'));
  });
}

async function idbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB getAll failed.'));
  });
}

class LocalStorageEngine {
  private rootHandle: DirectoryHandleLike | null = null;
  private capDirectory: CapacitorDirectory | null = null;
  private status: FolderConnectionStatus = 'disconnected';
  private folderName: string | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    if (!this.isSupported()) {
      this.status = 'fallback';
    }
  }

  public isSupported(): boolean {
    if (getCapacitorFs() !== null) return true;
    return (
      typeof window !== 'undefined' &&
      typeof (window as WindowWithNativeStorage).showDirectoryPicker === 'function'
    );
  }

  public getStatusSnapshot(): StorageStatusSnapshot {
    return {
      status: this.status,
      folderName: this.folderName,
      supported: this.isSupported(),
    };
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  private async ensureCapacitorFolders(): Promise<CapacitorDirectory | null> {
    const fs = getCapacitorFs();
    if (!fs) return null;

    if (this.capDirectory) {
      return this.capDirectory;
    }

    const candidates: CapacitorDirectory[] = ['DOCUMENTS', 'DATA'];
    for (const dir of candidates) {
      try {
        await fs.mkdir({ path: CAP_EXAM_HEADS_DIR, directory: dir, recursive: true });
        await fs.mkdir({ path: CAP_ATTEMPTS_DIR, directory: dir, recursive: true });
        this.capDirectory = dir;
        this.folderName =
          dir === 'DOCUMENTS' ? `Documents/${CAP_ROOT_FOLDER}` : `App Storage/${CAP_ROOT_FOLDER}`;
        this.status = 'connected';
        return dir;
      } catch {
        // Try next directory candidate
      }
    }

    this.capDirectory = null;
    this.status = 'fallback';
    this.folderName = null;
    return null;
  }

  private async capReadJson<T>(relativePath: string): Promise<T | null> {
    const fs = getCapacitorFs();
    const dir = await this.ensureCapacitorFolders();
    if (!fs || !dir) return null;
    try {
      const res = await fs.readFile({ path: relativePath, directory: dir, encoding: 'utf8' });
      if (!res.data || !res.data.trim()) return null;
      return JSON.parse(res.data) as T;
    } catch {
      return null;
    }
  }

  private async capWriteJson<T>(relativePath: string, data: T): Promise<void> {
    const fs = getCapacitorFs();
    const dir = await this.ensureCapacitorFolders();
    if (!fs || !dir) return;
    await fs.writeFile({
      path: relativePath,
      directory: dir,
      data: JSON.stringify(data, null, 2),
      encoding: 'utf8',
      recursive: true,
    });
  }

  private async capListExamHeadJsonFiles(): Promise<unknown[]> {
    const fs = getCapacitorFs();
    const dir = await this.ensureCapacitorFolders();
    if (!fs || !dir) return [];
    try {
      const listing = await fs.readdir({ path: CAP_EXAM_HEADS_DIR, directory: dir });
      const results: unknown[] = [];
      for (const entry of listing.files) {
        if (entry.name.toLowerCase().endsWith('.json')) {
          const parsed = await this.capReadJson<unknown>(`${CAP_EXAM_HEADS_DIR}/${entry.name}`);
          if (parsed && typeof parsed === 'object') {
            results.push(parsed);
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }

  private async ensureSubfolders(dirHandle: DirectoryHandleLike): Promise<{
    examHeadsDir: DirectoryHandleLike;
    attemptHistoryDir: DirectoryHandleLike;
  }> {
    const examHeadsDir = await dirHandle.getDirectoryHandle('exam-heads', { create: true });
    const attemptHistoryDir = await dirHandle.getDirectoryHandle('attempt-history', {
      create: true,
    });
    return { examHeadsDir, attemptHistoryDir };
  }

  public async connectFolder(): Promise<StorageStatusSnapshot> {
    if (getCapacitorFs() !== null) {
      await this.ensureCapacitorFolders();
      this.notify();
      return this.getStatusSnapshot();
    }

    if (!this.isSupported()) {
      this.status = 'fallback';
      this.folderName = null;
      this.notify();
      return this.getStatusSnapshot();
    }

    const picker = (window as WindowWithNativeStorage).showDirectoryPicker;
    if (!picker) {
      this.status = 'fallback';
      this.notify();
      return this.getStatusSnapshot();
    }

    const handle = await picker({ id: 'exam-bank-root', mode: 'readwrite' });
    await this.ensureSubfolders(handle);
    await idbSet(STORE_HANDLES, ROOT_HANDLE_KEY, handle);

    this.rootHandle = handle;
    this.folderName = handle.name;
    this.status = 'connected';
    this.notify();
    return this.getStatusSnapshot();
  }

  public async checkStoredFolder(): Promise<StorageStatusSnapshot> {
    if (getCapacitorFs() !== null) {
      await this.ensureCapacitorFolders();
      this.notify();
      return this.getStatusSnapshot();
    }

    if (!this.isSupported()) {
      this.status = 'fallback';
      this.folderName = null;
      this.notify();
      return this.getStatusSnapshot();
    }

    try {
      const savedHandle = await idbGet<DirectoryHandleLike>(STORE_HANDLES, ROOT_HANDLE_KEY);
      if (!savedHandle) {
        this.rootHandle = null;
        this.folderName = null;
        this.status = 'disconnected';
        this.notify();
        return this.getStatusSnapshot();
      }

      this.rootHandle = savedHandle;
      this.folderName = savedHandle.name;

      const perm = savedHandle.queryPermission
        ? await savedHandle.queryPermission({ mode: 'readwrite' })
        : 'prompt';

      if (perm === 'granted') {
        await this.ensureSubfolders(savedHandle);
        this.status = 'connected';
      } else {
        this.status = 'needs-permission';
      }
    } catch {
      this.status = 'disconnected';
    }

    this.notify();
    return this.getStatusSnapshot();
  }

  public async reconnectFolder(): Promise<StorageStatusSnapshot> {
    if (getCapacitorFs() !== null) {
      await this.ensureCapacitorFolders();
      this.notify();
      return this.getStatusSnapshot();
    }

    if (!this.isSupported()) {
      this.status = 'fallback';
      this.notify();
      return this.getStatusSnapshot();
    }

    if (!this.rootHandle) {
      const saved = await idbGet<DirectoryHandleLike>(STORE_HANDLES, ROOT_HANDLE_KEY);
      if (!saved) {
        return this.connectFolder();
      }
      this.rootHandle = saved;
      this.folderName = saved.name;
    }

    const perm = this.rootHandle.requestPermission
      ? await this.rootHandle.requestPermission({ mode: 'readwrite' })
      : 'denied';

    if (perm === 'granted') {
      await this.ensureSubfolders(this.rootHandle);
      this.status = 'connected';
    } else {
      this.status = 'needs-permission';
    }

    this.notify();
    return this.getStatusSnapshot();
  }

  private async readJsonFile<T>(
    dir: DirectoryHandleLike,
    fileName: string
  ): Promise<T | null> {
    try {
      const fileHandle = await dir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const raw = await file.text();
      if (!raw.trim()) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeJsonFile<T>(
    dir: DirectoryHandleLike,
    fileName: string,
    data: T
  ): Promise<void> {
    const fileHandle = await dir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  public async listExamHeads(): Promise<ExamHeadSummary[]> {
    const files = await this.getAllExamHeadFiles();
    return files
      .map((f) => ({
        id: f.id,
        title: f.title,
        totalQuestions: f.questions.length,
        paperCount: f.importedPapers.length,
        lastUpdated: f.updatedAt,
      }))
      .sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
  }

  public async getAllExamHeadFiles(): Promise<ExamHeadFile[]> {
    if (getCapacitorFs() !== null) {
      const raw = await this.capListExamHeadJsonFiles();
      return raw.filter((item): item is ExamHeadFile => {
        const rec = item as Partial<ExamHeadFile>;
        return Boolean(rec && rec.id && Array.isArray(rec.questions));
      });
    }

    if (this.status === 'connected' && this.rootHandle) {
      const { examHeadsDir } = await this.ensureSubfolders(this.rootHandle);
      const results: ExamHeadFile[] = [];
      for await (const entry of examHeadsDir.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
          try {
            const file = await entry.getFile();
            const parsed = JSON.parse(await file.text()) as ExamHeadFile;
            if (parsed && parsed.id && Array.isArray(parsed.questions)) {
              results.push(parsed);
            }
          } catch {
            // Skip malformed JSON files
          }
        }
      }
      return results;
    }

    return idbGetAll<ExamHeadFile>(STORE_EXAM_HEADS);
  }

  public async readExamHeadRaw(examHeadSlug: string): Promise<unknown | null> {
    if (getCapacitorFs() !== null) {
      return this.capReadJson<unknown>(`${CAP_EXAM_HEADS_DIR}/${examHeadSlug}.json`);
    }
    if (this.status === 'connected' && this.rootHandle) {
      const { examHeadsDir } = await this.ensureSubfolders(this.rootHandle);
      return this.readJsonFile<unknown>(examHeadsDir, `${examHeadSlug}.json`);
    }
    const stored = await idbGet<unknown>(STORE_EXAM_HEADS, examHeadSlug);
    return stored ?? null;
  }

  public async writeExamHeadRaw(examHeadSlug: string, data: unknown): Promise<void> {
    if (getCapacitorFs() !== null) {
      await this.capWriteJson(`${CAP_EXAM_HEADS_DIR}/${examHeadSlug}.json`, data);
      await idbSet(STORE_EXAM_HEADS, examHeadSlug, data).catch(() => {});
    } else if (this.status === 'connected' && this.rootHandle) {
      const { examHeadsDir } = await this.ensureSubfolders(this.rootHandle);
      await this.writeJsonFile(examHeadsDir, `${examHeadSlug}.json`, data);
    } else {
      await idbSet(STORE_EXAM_HEADS, examHeadSlug, data);
    }
    this.notify();
  }

  public async deleteExamHead(examHeadSlug: string): Promise<void> {
    const fs = getCapacitorFs();
    if (fs) {
      const dir = await this.ensureCapacitorFolders();
      if (dir && fs.deleteFile) {
        await fs
          .deleteFile({ path: `${CAP_EXAM_HEADS_DIR}/${examHeadSlug}.json`, directory: dir })
          .catch(() => {});
      }
      await idbDelete(STORE_EXAM_HEADS, examHeadSlug).catch(() => {});
    } else if (this.status === 'connected' && this.rootHandle) {
      const { examHeadsDir } = await this.ensureSubfolders(this.rootHandle);
      if (examHeadsDir.removeEntry) {
        await examHeadsDir.removeEntry(`${examHeadSlug}.json`).catch(() => {});
      }
    } else {
      await idbDelete(STORE_EXAM_HEADS, examHeadSlug);
    }
    this.notify();
  }

  public async listExamHeadsRaw(): Promise<unknown[]> {
    if (getCapacitorFs() !== null) {
      return this.capListExamHeadJsonFiles();
    }
    if (this.status === 'connected' && this.rootHandle) {
      const { examHeadsDir } = await this.ensureSubfolders(this.rootHandle);
      const results: unknown[] = [];
      for await (const entry of examHeadsDir.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
          try {
            const file = await entry.getFile();
            const parsed = JSON.parse(await file.text()) as unknown;
            if (parsed && typeof parsed === 'object') {
              results.push(parsed);
            }
          } catch {
            // Skip malformed JSON files
          }
        }
      }
      return results;
    }
    return idbGetAll<unknown>(STORE_EXAM_HEADS);
  }

  public async getExamHead(examHeadSlug: string): Promise<ExamHeadFile | null> {
    if (getCapacitorFs() !== null) {
      return this.capReadJson<ExamHeadFile>(`${CAP_EXAM_HEADS_DIR}/${examHeadSlug}.json`);
    }
    if (this.status === 'connected' && this.rootHandle) {
      const { examHeadsDir } = await this.ensureSubfolders(this.rootHandle);
      return this.readJsonFile<ExamHeadFile>(examHeadsDir, `${examHeadSlug}.json`);
    }
    const stored = await idbGet<ExamHeadFile>(STORE_EXAM_HEADS, examHeadSlug);
    return stored ?? null;
  }

  public async saveOrAppendExamHead(
    examHeadSlug: string,
    examHeadTitle: string,
    newQuestions: ExamQuestion[],
    paperLabel: string
  ): Promise<{ examHead: ExamHeadFile; addedCount: number; totalQuestions: number }> {
    const now = new Date().toISOString();
    const paperId = `paper-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existing = await this.getExamHead(examHeadSlug);

    const startNumber = existing ? existing.questions.length + 1 : 1;
    const formattedNew: ExamHeadQuestion[] = newQuestions.map((q, idx) => ({
      id: `${examHeadSlug}-${paperId}-q${idx + 1}`,
      number: startNumber + idx,
      paperId,
      paperLabel: paperLabel.trim() || 'Imported Paper',
      text: q.text,
      options: q.options,
      correctOption: q.correctOption ?? 'A',
      explanation: q.explanation,
      imageDataUrl: q.imageDataUrl,
      table: q.table,
    }));

    const paperMeta: ImportedPaperMeta = {
      paperId,
      paperLabel: paperLabel.trim() || 'Imported Paper',
      importedAt: now,
      questionCount: formattedNew.length,
    };

    const updatedFile: ExamHeadFile = existing
      ? {
          ...existing,
          title: existing.title || examHeadTitle.trim() || examHeadSlug,
          updatedAt: now,
          importedPapers: [...existing.importedPapers, paperMeta],
          questions: [...existing.questions, ...formattedNew],
        }
      : {
          id: examHeadSlug,
          title: examHeadTitle.trim() || examHeadSlug,
          createdAt: now,
          updatedAt: now,
          importedPapers: [paperMeta],
          questions: formattedNew,
        };

    await this.writeExamHeadRaw(examHeadSlug, updatedFile);

    return {
      examHead: updatedFile,
      addedCount: formattedNew.length,
      totalQuestions: updatedFile.questions.length,
    };
  }

  public async deleteQuestionFromExamHead(
    examHeadSlug: string,
    questionId: string
  ): Promise<ExamHeadFile | null> {
    const existing = await this.getExamHead(examHeadSlug);
    if (!existing) return null;

    const filtered = existing.questions
      .filter((q) => q.id !== questionId)
      .map((q, idx) => ({ ...q, number: idx + 1 }));

    const updated: ExamHeadFile = {
      ...existing,
      updatedAt: new Date().toISOString(),
      questions: filtered,
    };

    await this.writeExamHeadRaw(examHeadSlug, updated);
    return updated;
  }

  public async updateQuestionInExamHead(
    examHeadSlug: string,
    questionId: string,
    patch: Partial<ExamHeadQuestion>
  ): Promise<ExamHeadFile | null> {
    const existing = await this.getExamHead(examHeadSlug);
    if (!existing) return null;

    const updatedQuestions = existing.questions.map((q) =>
      q.id === questionId ? { ...q, ...patch, id: q.id, number: q.number } : q
    );

    const updated: ExamHeadFile = {
      ...existing,
      updatedAt: new Date().toISOString(),
      questions: updatedQuestions,
    };

    await this.writeExamHeadRaw(examHeadSlug, updated);
    return updated;
  }

  public async listAttemptResults(): Promise<PracticeAttemptRecord[]> {
    if (getCapacitorFs() !== null) {
      const data = await this.capReadJson<PracticeAttemptRecord[]>(
        `${CAP_ATTEMPTS_DIR}/results.json`
      );
      return Array.isArray(data) ? data : [];
    }
    if (this.status === 'connected' && this.rootHandle) {
      const { attemptHistoryDir } = await this.ensureSubfolders(this.rootHandle);
      const data = await this.readJsonFile<PracticeAttemptRecord[]>(
        attemptHistoryDir,
        'results.json'
      );
      return Array.isArray(data) ? data : [];
    }
    const stored = await idbGet<PracticeAttemptRecord[]>(STORE_ATTEMPTS, RESULTS_KEY);
    return Array.isArray(stored) ? stored : [];
  }

  public async saveAttemptResult(resultSummary: PracticeAttemptRecord): Promise<void> {
    const current = await this.listAttemptResults();
    const updated = [resultSummary, ...current].slice(0, 200);

    if (getCapacitorFs() !== null) {
      await this.capWriteJson(`${CAP_ATTEMPTS_DIR}/results.json`, updated);
      await idbSet(STORE_ATTEMPTS, RESULTS_KEY, updated).catch(() => {});
    } else if (this.status === 'connected' && this.rootHandle) {
      const { attemptHistoryDir } = await this.ensureSubfolders(this.rootHandle);
      await this.writeJsonFile(attemptHistoryDir, 'results.json', updated);
    } else {
      await idbSet(STORE_ATTEMPTS, RESULTS_KEY, updated);
    }

    this.notify();
  }

  public async exportFullBackup(): Promise<FullBackupBundle> {
    const [examHeads, attemptHistory] = await Promise.all([
      this.getAllExamHeadFiles(),
      this.listAttemptResults(),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      examHeads,
      attemptHistory,
    };
  }

  public async restoreFullBackup(bundle: FullBackupBundle): Promise<number> {
    if (!bundle || !Array.isArray(bundle.examHeads)) {
      throw new Error('Invalid backup JSON format.');
    }

    let restoredHeads = 0;
    for (const head of bundle.examHeads) {
      if (!head.id || !Array.isArray(head.questions)) continue;
      await this.writeExamHeadRaw(head.id, head);
      restoredHeads += 1;
    }

    if (Array.isArray(bundle.attemptHistory) && bundle.attemptHistory.length > 0) {
      if (getCapacitorFs() !== null) {
        await this.capWriteJson(`${CAP_ATTEMPTS_DIR}/results.json`, bundle.attemptHistory);
        await idbSet(STORE_ATTEMPTS, RESULTS_KEY, bundle.attemptHistory).catch(() => {});
      } else if (this.status === 'connected' && this.rootHandle) {
        const { attemptHistoryDir } = await this.ensureSubfolders(this.rootHandle);
        await this.writeJsonFile(attemptHistoryDir, 'results.json', bundle.attemptHistory);
      } else {
        await idbSet(STORE_ATTEMPTS, RESULTS_KEY, bundle.attemptHistory);
      }
    }

    this.notify();
    return restoredHeads;
  }
}

export const localFolderStorage = new LocalStorageEngine();
